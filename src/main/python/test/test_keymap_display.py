# SPDX-License-Identifier: GPL-2.0-or-later
import unittest

from keymap import german
from keymaps import DEFAULT_KEYMAP_NAME
from util import KeycodeDisplay


class TestKeycodeDisplay(unittest.TestCase):

    def tearDown(self):
        KeycodeDisplay.set_keymap_override(german.keymap)

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
