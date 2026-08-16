# SPDX-License-Identifier: GPL-2.0-or-later
from PyQt5.QtGui import QFont
from PyQt5.QtWidgets import QDialog, QDialogButtonBox, QVBoxLayout, QPlainTextEdit

from keycodes.keycodes import KEYCODES_BOOT, KEYCODES_MODIFIERS, KEYCODES_QUANTUM


class KeycodeReference(QDialog):

    def __init__(self):
        super().__init__()

        self.setWindowTitle("Quantum keycode reference")

        font = QFont("monospace")
        font.setStyleHint(QFont.TypeWriter)

        self.textarea = QPlainTextEdit()
        self.textarea.setReadOnly(True)
        self.textarea.setFont(font)
        self.textarea.setPlainText(self.reference_text())

        self.buttonBox = QDialogButtonBox(QDialogButtonBox.Ok)
        self.buttonBox.accepted.connect(self.accept)
        self.buttonBox.rejected.connect(self.reject)

        layout = QVBoxLayout()
        layout.addWidget(self.textarea)
        layout.addWidget(self.buttonBox)
        self.setLayout(layout)

    def reference_text(self):
        sections = [
            ("Boot and EEPROM", KEYCODES_BOOT),
            ("Modifiers and mod-tap wrappers", KEYCODES_MODIFIERS),
            ("Quantum", KEYCODES_QUANTUM),
        ]

        lines = [
            "Quantum tab keycode reference",
            "",
            "Aliases are alternate QMK names that Vial accepts in the Any keycode dialog.",
            "",
        ]
        for title, keycodes in sections:
            lines.append(title)
            lines.append("=" * len(title))
            for keycode in keycodes:
                lines.append("{} - {}".format(keycode.qmk_id, keycode.tooltip or keycode.label.replace("\n", " ")))
                aliases = [alias for alias in keycode.alias if alias != keycode.qmk_id]
                if aliases:
                    lines.append("  aliases: {}".format(", ".join(aliases)))
            lines.append("")

        return "\n".join(lines)
