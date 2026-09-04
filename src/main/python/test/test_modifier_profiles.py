# SPDX-License-Identifier: GPL-2.0-or-later

import unittest

from editor.modifier_profiles import CONTROL_GUI_SWAP_MASK, CUSTOM_PROFILE, MACOS_PROFILE, \
    WINDOWS_LINUX_PROFILE, detect_modifier_profile, modifier_profile_value


class TestModifierProfiles(unittest.TestCase):

    def test_macos_sets_both_control_gui_bits_and_preserves_every_other_flag(self):
        original = 0xA5A5008F
        result = modifier_profile_value(original, MACOS_PROFILE)
        self.assertEqual(result & CONTROL_GUI_SWAP_MASK, CONTROL_GUI_SWAP_MASK)
        self.assertEqual(result & ~CONTROL_GUI_SWAP_MASK, original & ~CONTROL_GUI_SWAP_MASK)

    def test_windows_clears_only_control_gui_bits(self):
        original = 0x55AA03FF
        result = modifier_profile_value(original, WINDOWS_LINUX_PROFILE)
        self.assertEqual(result & CONTROL_GUI_SWAP_MASK, 0)
        self.assertEqual(result & ~CONTROL_GUI_SWAP_MASK, original & ~CONTROL_GUI_SWAP_MASK)

    def test_presets_are_idempotent(self):
        value = 0x81
        macos = modifier_profile_value(value, MACOS_PROFILE)
        self.assertEqual(modifier_profile_value(macos, MACOS_PROFILE), macos)
        windows = modifier_profile_value(macos, WINDOWS_LINUX_PROFILE)
        self.assertEqual(modifier_profile_value(windows, WINDOWS_LINUX_PROFILE), windows)

    def test_profile_detection_handles_partial_custom_swap(self):
        self.assertEqual(detect_modifier_profile(0), WINDOWS_LINUX_PROFILE)
        self.assertEqual(detect_modifier_profile(CONTROL_GUI_SWAP_MASK), MACOS_PROFILE)
        self.assertEqual(detect_modifier_profile(1 << 8), CUSTOM_PROFILE)

    def test_unknown_profile_is_rejected(self):
        with self.assertRaises(ValueError):
            modifier_profile_value(0, "amiga")


if __name__ == "__main__":
    unittest.main()
