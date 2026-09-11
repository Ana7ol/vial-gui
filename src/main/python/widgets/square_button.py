# SPDX-License-Identifier: GPL-2.0-or-later

from PyQt5.QtCore import QRect, QSize, Qt
from PyQt5.QtWidgets import QPushButton, QLabel, QHBoxLayout, QStyle, QStyleOptionButton

class SquareButton(QPushButton):

    def __init__(self, parent=None):
        super().__init__(parent)

        self.scale = 1.2
        self.label = None
        self.word_wrap = False
        self.text = ""

    def setRelSize(self, ratio):
        self.scale = ratio
        self.updateGeometry()

    def setWordWrap(self, state):
        self.word_wrap = state
        self.setText(self.text)

    def sizeHint(self):
        size = int(round(self.fontMetrics().height() * self.scale))
        hint = super().sizeHint().expandedTo(QSize(size, size))
        if not self.word_wrap:
            # Older Qt styles can size by text advance and miss glyph overhang.
            # Check the actual content area after the style applies its padding.
            option = QStyleOptionButton()
            self.initStyleOption(option)
            option.rect = QRect(0, 0, hint.width(), hint.height())
            content = self.style().subElementRect(QStyle.SE_PushButtonContents, option, self)
            metrics = self.fontMetrics()
            lines = option.text.split("\n")
            text_width = max(metrics.boundingRect(line).width() for line in lines)
            text_height = metrics.height() * len(lines)
            hint += QSize(max(0, text_width - content.width()),
                          max(0, text_height - content.height()))
        return hint

    def minimumSizeHint(self):
        return self.sizeHint()

    # Override setText to facilitate automatic word wrapping
    def setText(self, text):
        self.text = text
        if self.word_wrap:
            super().setText("")
            if self.label is None:
                self.label = QLabel(text, self)
                self.label.setWordWrap(True)
                self.label.setAlignment(Qt.AlignCenter)
                layout = QHBoxLayout(self)
                layout.setContentsMargins(0, 0, 0, 0)
                layout.addWidget(self.label,0,Qt.AlignCenter)
            else:
                self.label.setText(text)
        else:
            if self.label is not None:
                self.label.hide()
                self.label.deleteLater()
            super().setText(text)
