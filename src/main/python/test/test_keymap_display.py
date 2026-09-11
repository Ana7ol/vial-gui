# SPDX-License-Identifier: GPL-2.0-or-later
import unittest

from keymap import german
from keymaps import DEFAULT_KEYMAP_NAME, KEYMAP_CHARACTER_KEYCODES, KEYMAP_SELECTION_OVERRIDES
from util import KeycodeDisplay


class TestKeycodeDisplay(unittest.TestCase):

    def tearDown(self):
        KeycodeDisplay.set_keymap_override(
            german.keymap,
            DEFAULT_KEYMAP_NAME,
            KEYMAP_SELECTION_OVERRIDES[DEFAULT_KEYMAP_NAME],
            KEYMAP_CHARACTER_KEYCODES[DEFAULT_KEYMAP_NAME],
        )

    def test_default_keymap_is_german(self):
        self.assertEqual(DEFAULT_KEYMAP_NAME, "German (QWERTZ)")

    def test_recorder_alias_respects_selected_keymap(self):
        KeycodeDisplay.set_keymap_override(german.keymap)

        self.assertEqual(KeycodeDisplay.find_by_recorder_alias("y").qmk_id, "KC_Z")
        self.assertEqual(KeycodeDisplay.find_by_recorder_alias("z").qmk_id, "KC_Y")

    def test_recorder_alias_falls_back_to_qwerty(self):
        KeycodeDisplay.set_keymap_override({})

        self.assertEqual(KeycodeDisplay.find_by_recorder_alias("y").qmk_id, "KC_Y")
        self.assertEqual(KeycodeDisplay.find_by_recorder_alias("z").qmk_id, "KC_Z")

    def test_german_logical_symbols_use_german_physical_keys(self):
        KeycodeDisplay.set_keymap_override(
            german.keymap,
            DEFAULT_KEYMAP_NAME,
            KEYMAP_SELECTION_OVERRIDES[DEFAULT_KEYMAP_NAME],
            KEYMAP_CHARACTER_KEYCODES[DEFAULT_KEYMAP_NAME],
        )

        self.assertEqual(KeycodeDisplay.resolve_selection("KC_LCBR"), "RALT(KC_7)")
        self.assertEqual(KeycodeDisplay.resolve_selection("KC_RCBR"), "RALT(KC_0)")
        self.assertEqual(KeycodeDisplay.resolve_selection("KC_PIPE"), "RALT(KC_NONUS_BSLASH)")
        self.assertIn(("'", "LSFT(KC_NONUS_HASH)"), KeycodeDisplay.character_keycodes)
