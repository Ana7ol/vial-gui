# SPDX-License-Identifier: GPL-2.0-or-later
import json
from collections import defaultdict

from PyQt5 import QtCore
from PyQt5.QtCore import pyqtSignal, QObject
from PyQt5.QtWidgets import QVBoxLayout, QCheckBox, QGridLayout, QLabel, QWidget, QSizePolicy, QTabWidget, QSpinBox, \
    QHBoxLayout, QPushButton, QMessageBox

from editor.basic_editor import BasicEditor
from editor.modifier_profiles import CUSTOM_PROFILE, MACOS_PROFILE, WINDOWS_LINUX_PROFILE, \
    detect_modifier_profile, modifier_profile_value
from protocol.constants import VIAL_PROTOCOL_QMK_SETTINGS
from util import tr
from vial_device import VialKeyboard


class GenericOption(QObject):

    changed = pyqtSignal()

    def __init__(self, option, container):
        super().__init__()

        self.row = container.rowCount()
        self.option = option
        self.qsid = self.option["qsid"]
        self.container = container

        self.lbl = QLabel(option["title"])
        self.container.addWidget(self.lbl, self.row, 0)

    def reload(self, keyboard):
        return keyboard.settings.get(self.qsid)

    def delete(self):
        self.lbl.hide()
        self.lbl.deleteLater()

    def on_change(self):
        self.changed.emit()


class BooleanOption(GenericOption):

    def __init__(self, option, container):
        super().__init__(option, container)

        self.qsid_bit = self.option.get("bit", 0)

        self.checkbox = QCheckBox()
        self.checkbox.stateChanged.connect(self.on_change)
        self.container.addWidget(self.checkbox, self.row, 1)

    def reload(self, keyboard):
        value = super().reload(keyboard)
        checked = value & (1 << self.qsid_bit)

        self.checkbox.blockSignals(True)
        self.checkbox.setChecked(checked != 0)
        self.checkbox.blockSignals(False)

    def value(self):
        checked = int(self.checkbox.isChecked())
        return checked << self.qsid_bit

    def delete(self):
        super().delete()
        self.checkbox.hide()
        self.checkbox.deleteLater()


class IntegerOption(GenericOption):

    def __init__(self, option, container):
        super().__init__(option, container)

        self.spinbox = QSpinBox()
        self.spinbox.setMinimum(option["min"])
        self.spinbox.setMaximum(option["max"])
        self.spinbox.valueChanged.connect(self.on_change)
        self.container.addWidget(self.spinbox, self.row, 1)

    def reload(self, keyboard):
        value = super().reload(keyboard)
        self.spinbox.blockSignals(True)
        self.spinbox.setValue(value)
        self.spinbox.blockSignals(False)

    def value(self):
        return self.spinbox.value()

    def delete(self):
        super().delete()
        self.spinbox.hide()
        self.spinbox.deleteLater()


class QmkSettings(BasicEditor):

    MAGIC_QSID = 21

    def __init__(self):
        super().__init__()
        self.keyboard = None
        self.btn_profile_windows = None
        self.btn_profile_macos = None
        self.lbl_profile_status = None

        self.tabs_widget = QTabWidget()
        self.addWidget(self.tabs_widget)
        buttons = QHBoxLayout()
        buttons.addStretch()
        self.btn_save = QPushButton(tr("QmkSettings", "Save"))
        self.btn_save.clicked.connect(self.save_settings)
        buttons.addWidget(self.btn_save)
        self.btn_undo = QPushButton(tr("QmkSettings", "Undo"))
        self.btn_undo.clicked.connect(self.reload_settings)
        buttons.addWidget(self.btn_undo)
        btn_reset = QPushButton(tr("QmkSettings", "Reset"))
        btn_reset.clicked.connect(self.reset_settings)
        buttons.addWidget(btn_reset)
        self.addLayout(buttons)

        self.tabs = []
        self.misc_widgets = []

    def add_modifier_profile_controls(self, container):
        title = QLabel(tr("QmkSettings", "OS modifier profile"))
        title.setObjectName("sectionTitle")
        container.addWidget(title, container.rowCount(), 0, 1, 2)

        explanation = QLabel(tr(
            "QmkSettings",
            "macOS changes both Control positions to Command. Alt is already Option on a Mac. "
            "This includes Control home-row holds; macro contents stay unchanged because Windows commands "
            "do not have a safe one-to-one macOS translation."
        ))
        explanation.setWordWrap(True)
        explanation.setMaximumWidth(560)
        container.addWidget(explanation, container.rowCount(), 0, 1, 2)

        buttons = QHBoxLayout()
        self.btn_profile_windows = QPushButton(tr("QmkSettings", "Windows / Linux"))
        self.btn_profile_macos = QPushButton(tr("QmkSettings", "macOS"))
        for button in (self.btn_profile_windows, self.btn_profile_macos):
            button.setObjectName("osProfileButton")
            button.setCheckable(True)
            buttons.addWidget(button)
        buttons.addStretch()
        self.btn_profile_windows.clicked.connect(
            lambda _checked=False: self.stage_modifier_profile(WINDOWS_LINUX_PROFILE))
        self.btn_profile_macos.clicked.connect(
            lambda _checked=False: self.stage_modifier_profile(MACOS_PROFILE))
        container.addLayout(buttons, container.rowCount(), 0, 1, 2)

        self.lbl_profile_status = QLabel()
        self.lbl_profile_status.setWordWrap(True)
        container.addWidget(self.lbl_profile_status, container.rowCount(), 0, 1, 2)

        divider = QLabel(tr("QmkSettings", "Advanced Magic options"))
        divider.setObjectName("sectionTitle")
        container.addWidget(divider, container.rowCount(), 0, 1, 2)

    def stage_modifier_profile(self, profile):
        current_value = self.prepare_settings().get(
            self.MAGIC_QSID, self.keyboard.settings.get(self.MAGIC_QSID, 0))
        target_value = modifier_profile_value(current_value, profile)

        for tab in self.tabs:
            for option in tab:
                if isinstance(option, BooleanOption) and option.qsid == self.MAGIC_QSID:
                    option.checkbox.blockSignals(True)
                    option.checkbox.setChecked(bool(target_value & (1 << option.qsid_bit)))
                    option.checkbox.blockSignals(False)

        self.on_change()

    def update_modifier_profile_status(self, qsid_values):
        if self.lbl_profile_status is None or self.MAGIC_QSID not in qsid_values:
            return

        value = qsid_values[self.MAGIC_QSID]
        profile = detect_modifier_profile(value)
        saved_value = self.keyboard.settings.get(self.MAGIC_QSID, 0)
        pending = value != saved_value

        self.btn_profile_windows.blockSignals(True)
        self.btn_profile_macos.blockSignals(True)
        self.btn_profile_windows.setChecked(profile == WINDOWS_LINUX_PROFILE)
        self.btn_profile_macos.setChecked(profile == MACOS_PROFILE)
        self.btn_profile_windows.blockSignals(False)
        self.btn_profile_macos.blockSignals(False)

        if profile == MACOS_PROFILE:
            message = tr("QmkSettings", "macOS: Control positions send Command; Alt sends Option; GUI positions send Control.")
        elif profile == WINDOWS_LINUX_PROFILE:
            message = tr("QmkSettings", "Windows / Linux: Control, Alt, and GUI keep their standard meanings.")
        elif profile == CUSTOM_PROFILE:
            message = tr("QmkSettings", "Custom: the left and right Control/GUI swap settings do not match.")
        else:
            message = ""

        if pending:
            message += " " + tr("QmkSettings", "Choose Save to write this profile to the keyboard.")
        else:
            message += " " + tr("QmkSettings", "Saved on the keyboard.")
        self.lbl_profile_status.setText(message)

    def populate_tab(self, tab, container):
        options = []
        for field in tab["fields"]:
            if field["qsid"] not in self.keyboard.supported_settings:
                continue
            if field["type"] == "boolean":
                opt = BooleanOption(field, container)
                options.append(opt)
                opt.changed.connect(self.on_change)
            elif field["type"] == "integer":
                opt = IntegerOption(field, container)
                options.append(opt)
                opt.changed.connect(self.on_change)
            else:
                raise RuntimeError("unsupported field type: {}".format(field))
        return options

    def recreate_gui(self):
        # delete old GUI
        for tab in self.tabs:
            for field in tab:
                field.delete()
        self.tabs.clear()
        for w in self.misc_widgets:
            w.hide()
            w.deleteLater()
        self.misc_widgets.clear()
        while self.tabs_widget.count() > 0:
            self.tabs_widget.removeTab(0)
        self.btn_profile_windows = None
        self.btn_profile_macos = None
        self.lbl_profile_status = None

        # create new GUI
        for tab in self.settings_defs["tabs"]:
            # don't bother creating tabs that would be empty - i.e. at least one qsid in a tab should be supported
            use_tab = False
            for field in tab["fields"]:
                if field["qsid"] in self.keyboard.supported_settings:
                    use_tab = True
                    break
            if not use_tab:
                continue

            w = QWidget()
            w.setSizePolicy(QSizePolicy.Maximum, QSizePolicy.Maximum)
            container = QGridLayout()
            w.setLayout(container)
            if tab["name"] == "Magic" and self.MAGIC_QSID in self.keyboard.supported_settings:
                self.add_modifier_profile_controls(container)
            l = QVBoxLayout()
            l.addWidget(w)
            l.setAlignment(w, QtCore.Qt.AlignHCenter)
            w2 = QWidget()
            w2.setLayout(l)
            self.misc_widgets += [w, w2]
            self.tabs_widget.addTab(w2, tab["name"])
            self.tabs.append(self.populate_tab(tab, container))

    def reload_settings(self):
        self.keyboard.reload_settings()
        self.recreate_gui()

        for tab in self.tabs:
            for field in tab:
                field.reload(self.keyboard)

        self.on_change()

    def on_change(self):
        changed = False
        qsid_values = self.prepare_settings()

        for x, tab in enumerate(self.tabs):
            tab_changed = False
            for opt in tab:
                if qsid_values[opt.qsid] != self.keyboard.settings[opt.qsid]:
                    changed = True
                    tab_changed = True
            title = self.tabs_widget.tabText(x).rstrip("*")
            if tab_changed:
                self.tabs_widget.setTabText(x, title + "*")
            else:
                self.tabs_widget.setTabText(x, title)

        self.btn_save.setEnabled(changed)
        self.btn_undo.setEnabled(changed)
        self.update_modifier_profile_status(qsid_values)

    def rebuild(self, device):
        super().rebuild(device)
        if self.valid():
            self.keyboard = device.keyboard
            self.reload_settings()

    def prepare_settings(self):
        qsid_values = defaultdict(int)
        for tab in self.tabs:
            for field in tab:
                qsid_values[field.qsid] |= field.value()
        return qsid_values

    def save_settings(self):
        qsid_values = self.prepare_settings()
        for qsid, value in qsid_values.items():
            self.keyboard.qmk_settings_set(qsid, value)
        self.on_change()

    def reset_settings(self):
        if QMessageBox.question(self.widget(), "",
                                tr("QmkSettings", "Reset all settings to default values?"),
                                QMessageBox.Yes | QMessageBox.No) == QMessageBox.Yes:
            self.keyboard.qmk_settings_reset()
            self.reload_settings()

    def valid(self):
        return isinstance(self.device, VialKeyboard) and \
               (self.device.keyboard and self.device.keyboard.vial_protocol >= VIAL_PROTOCOL_QMK_SETTINGS
                and len(self.device.keyboard.supported_settings))

    @classmethod
    def initialize(cls, appctx):
        cls.qsid_fields = defaultdict(list)
        with open(appctx.get_resource("qmk_settings.json"), "r") as inf:
            cls.settings_defs = json.load(inf)
        for tab in cls.settings_defs["tabs"]:
            for field in tab["fields"]:
                cls.qsid_fields[field["qsid"]].append(field)

    @classmethod
    def is_qsid_supported(cls, qsid):
        """ Return whether this qsid is supported by the settings editor """
        return qsid in cls.qsid_fields

    @classmethod
    def qsid_serialize(cls, qsid, data):
        """ Serialize from internal representation into binary that can be sent to the firmware """
        fields = cls.qsid_fields[qsid]
        if fields[0]["type"] == "boolean":
            assert isinstance(data, int)
            return data.to_bytes(fields[0].get("width", 1), byteorder="little")
        elif fields[0]["type"] == "integer":
            assert isinstance(data, int)
            assert len(fields) == 1
            return data.to_bytes(fields[0]["width"], byteorder="little")

    @classmethod
    def qsid_deserialize(cls, qsid, data):
        """ Deserialize from binary received from firmware into internal representation """
        fields = cls.qsid_fields[qsid]
        if fields[0]["type"] == "boolean":
            return int.from_bytes(data[0:fields[0].get("width", 1)], byteorder="little")
        elif fields[0]["type"] == "integer":
            assert len(fields) == 1
            return int.from_bytes(data[0:fields[0]["width"]], byteorder="little")
        else:
            raise RuntimeError("unsupported field")
