# SPDX-License-Identifier: GPL-2.0-or-later
import html

from PyQt5.QtWidgets import QDialog, QDialogButtonBox, QLineEdit, QTextBrowser, QVBoxLayout

from keycodes.keycodes import KEYCODES_BOOT, KEYCODES_MODIFIERS, KEYCODES_QUANTUM


def quantum_sections():
    groups = [
        ("Keyboard behavior and split hand", []),
        ("Audio and music", []),
        ("Haptic feedback", []),
        ("Auto Shift", []),
        ("Combos", []),
        ("Typing helpers", []),
    ]
    for keycode in KEYCODES_QUANTUM:
        if keycode.qmk_id.startswith("MAGIC_"):
            groups[0][1].append(keycode)
        elif keycode.qmk_id.startswith(("AU_", "CLICKY_", "MU_")):
            groups[1][1].append(keycode)
        elif keycode.qmk_id.startswith("HPT_"):
            groups[2][1].append(keycode)
        elif keycode.qmk_id.startswith("KC_AS"):
            groups[3][1].append(keycode)
        elif keycode.qmk_id.startswith("CMB_"):
            groups[4][1].append(keycode)
        else:
            groups[5][1].append(keycode)

    return [
        ("Boot and persistent storage", KEYCODES_BOOT),
        ("One-shot modifiers and wrappers", KEYCODES_MODIFIERS),
    ] + groups


class KeycodeReference(QDialog):

    def __init__(self):
        super().__init__()

        self.setWindowTitle("Quantum keycode guide")
        self.setMinimumSize(820, 620)

        self.search = QLineEdit()
        self.search.setPlaceholderText("Search by name, QMK ID, alias, or purpose")
        self.search.setClearButtonEnabled(True)
        self.search.textChanged.connect(self.refresh)

        self.browser = QTextBrowser()
        self.browser.setOpenExternalLinks(True)

        self.button_box = QDialogButtonBox(QDialogButtonBox.Close)
        self.button_box.rejected.connect(self.reject)

        layout = QVBoxLayout()
        layout.addWidget(self.search)
        layout.addWidget(self.browser, 1)
        layout.addWidget(self.button_box)
        self.setLayout(layout)

        self.refresh()

    @staticmethod
    def matches(keycode, query):
        values = [keycode.qmk_id, keycode.label, keycode.tooltip or ""] + keycode.alias
        return not query or query in " ".join(values).lower()

    @staticmethod
    def keycode_html(keycode):
        aliases = [alias for alias in keycode.alias if alias != keycode.qmk_id]
        description = keycode.tooltip or "Use this QMK keycode exactly as named."
        details = []
        if aliases:
            details.append("Aliases: {}".format(", ".join(aliases)))
        if keycode.requires_feature:
            details.append("Requires firmware feature: {}".format(keycode.requires_feature))
        detail_html = "<br><small>{}</small>".format(html.escape(" | ".join(details))) if details else ""
        return (
            '<tr><td><code>{}</code></td><td><strong>{}</strong><br>{}{}</td></tr>'.format(
                html.escape(keycode.qmk_id),
                html.escape(keycode.label.replace("\n", " ")),
                html.escape(description),
                detail_html,
            )
        )

    def reference_html(self, query):
        sections = []
        result_count = 0
        for title, keycodes in quantum_sections():
            matches = [keycode for keycode in keycodes if self.matches(keycode, query)]
            if not matches:
                continue
            result_count += len(matches)
            rows = "".join(self.keycode_html(keycode) for keycode in matches)
            sections.append("<h2>{}</h2><table>{}</table>".format(html.escape(title), rows))

        if not result_count:
            sections.append("<p>No Quantum keycodes match this search.</p>")

        header = """
            <style>
                body { color: #eef2ef; background: #171a18; font-size: 14px; }
                h1 { color: #a6edbd; font-size: 24px; margin-bottom: 6px; }
                h2 { color: #a6edbd; font-size: 17px; margin-top: 24px; }
                p { color: #b7c0ba; line-height: 1.45; }
                table { width: 100%; border-collapse: collapse; }
                td { padding: 10px; border-bottom: 1px solid #3a413c; vertical-align: top; }
                td:first-child { width: 38%; }
                code { color: #a6edbd; font-family: monospace; }
                small { color: #9ca69f; }
            </style>
            <h1>Quantum keycode guide</h1>
            <p>Every entry below matches a button exposed by this build. Hovering a Quantum button shows the same
            QMK ID and purpose. Keys only work when the connected firmware includes their QMK feature.</p>
        """
        return header + "".join(sections)

    def refresh(self):
        self.browser.setHtml(self.reference_html(self.search.text().strip().lower()))
