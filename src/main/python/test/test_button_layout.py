import pytest

from PyQt5.QtWidgets import QWidget, QApplication, QStyleOptionButton, QStyle

from themes import CORNE_WEB_STYLESHEET
from widgets.flowlayout import FlowLayout
from widgets.square_button import SquareButton


@pytest.mark.parametrize("point_size, italic", [(10, False), (10, True), (14, False), (18, True)])
def test_styled_key_buttons_fit_labels_and_wrap_with_gaps(qtbot, point_size, italic):
    app = QApplication.instance()
    previous = app.styleSheet()
    app.setStyleSheet(CORNE_WEB_STYLESHEET)
    try:
        widget = QWidget()
        qtbot.addWidget(widget)
        layout = FlowLayout(widget, margin=10)
        buttons = []
        for title in ["Layer 5", "Backspace", "RGB\nToggle", "Right Alt", "Print Screen"]:
            button = SquareButton()
            font = button.font()
            font.setPointSize(point_size)
            font.setItalic(italic)
            button.setFont(font)
            button.setText(title)
            layout.addWidget(button)
            buttons.append(button)
        widget.resize(260, 300)
        widget.show()
        qtbot.wait(50)
        for button in buttons:
            option = QStyleOptionButton()
            button.initStyleOption(option)
            content = button.style().subElementRect(QStyle.SE_PushButtonContents, option, button)
            lines = button.text.split("\n")
            assert content.width() >= max(button.fontMetrics().boundingRect(line).width() for line in lines)
            assert content.height() >= button.fontMetrics().height() * len(lines)
            assert button.x() >= 10
            assert button.x() + button.width() <= widget.width() - 10
        for first, second in zip(buttons, buttons[1:]):
            if first.y() == second.y():
                assert second.x() - first.geometry().right() - 1 >= 6
            else:
                assert second.y() - first.geometry().bottom() - 1 >= 6
        assert buttons[-1].y() > buttons[0].y()
        buttons[1].hide()
        layout.setGeometry(widget.rect())
        assert not buttons[0].geometry().intersects(buttons[2].geometry())
    finally:
        app.setStyleSheet(previous)
