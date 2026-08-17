# SPDX-License-Identifier: GPL-2.0-or-later
import unittest

from protocol.dummy_keyboard import DummyKeyboard
from keycodes.keycodes import Keycode, recreate_keyboard_keycodes
from macro.macro_action import ActionTap, ActionDown, ActionText, ActionExactText, ActionDelay, ActionUp
from macro.macro_key import KeyDown, KeyTap, KeyUp, KeyString
from macro.macro_optimizer import macro_optimize, remove_repeats, replace_with_tap, replace_with_string
from macro.text_encoder import GERMAN_TEXT_MAP, MacroTextEncodingError, compile_text, decode_keycodes, \
    stroke, stroke_keycodes

KC_A = Keycode.find_by_qmk_id("KC_A")
KC_B = Keycode.find_by_qmk_id("KC_B")
KC_C = Keycode.find_by_qmk_id("KC_C")

CMB_TOG = Keycode.find_by_qmk_id("CMB_TOG")


class TestMacro(unittest.TestCase):

    def test_remove_repeats(self):
        self.assertEqual(remove_repeats([KeyDown(KC_A), KeyDown(KC_A)]), [KeyDown(KC_A)])
        self.assertEqual(remove_repeats([KeyDown(KC_A), KeyDown(KC_B), KeyDown(KC_B), KeyDown(KC_C), KeyDown(KC_C)]),
                         [KeyDown(KC_A), KeyDown(KC_B), KeyDown(KC_C)])

        # don't remove repeated taps
        self.assertEqual(remove_repeats([KeyTap(KC_A), KeyTap(KC_A)]), [KeyTap(KC_A), KeyTap(KC_A)])

    def test_replace_tap(self):
        self.assertEqual(replace_with_tap([KeyDown(KC_A)]), [KeyDown(KC_A)])
        self.assertEqual(replace_with_tap([KeyDown(KC_A), KeyUp(KC_A)]), [KeyTap(KC_A)])
        self.assertEqual(replace_with_tap([KeyUp(KC_A), KeyDown(KC_A)]), [KeyUp(KC_A), KeyDown(KC_A)])

    def test_replace_string(self):
        self.assertEqual(replace_with_string([KeyTap(KC_A), KeyTap(KC_B)]), [KeyString("ab")])

    def test_macro_optimize_can_keep_taps(self):
        self.assertEqual(macro_optimize([KeyDown(KC_A), KeyUp(KC_A), KeyDown(KC_B), KeyUp(KC_B)],
                                        use_strings=False),
                         [KeyTap(KC_A), KeyTap(KC_B)])

    def test_german_exact_text_shell_punctuation(self):
        self.assertEqual(GERMAN_TEXT_MAP["-"], stroke("KC_SLASH"))
        self.assertEqual(GERMAN_TEXT_MAP[">"], stroke("KC_NONUS_BSLASH", ("KC_LSHIFT",)))
        self.assertEqual(GERMAN_TEXT_MAP["%"], stroke("KC_5", ("KC_LSHIFT",)))
        self.assertEqual(GERMAN_TEXT_MAP["\\"], stroke("KC_MINUS", ("KC_RALT",)))
        self.assertEqual(GERMAN_TEXT_MAP["'"], stroke("KC_NONUS_HASH", ("KC_LSHIFT",)))

        bash = r"printf -v date '%(%Y-%m-%d)T\n' -1"
        powershell = "Get-Date 'dd.MM.yyyy'"
        self.assertEqual(len(compile_text(bash)), len(bash))
        self.assertEqual(len(compile_text(powershell)), len(powershell))

    def test_german_exact_text_decodes_literal_symbols(self):
        self.assertEqual(decode_keycodes(["RALT(KC_NONUS_BSLASH)"]), "|")
        self.assertEqual(decode_keycodes(["RALT(KC_MINUS)"]), "\\")
        self.assertEqual(decode_keycodes(["KC_SLASH", "LSFT(KC_NONUS_BSLASH)"]), "->")

    def test_german_exact_text_codec_round_trip(self):
        text = "".join(character for character in GERMAN_TEXT_MAP if character != "\r")
        keycodes = []
        for text_stroke in compile_text(text):
            keycodes.extend(stroke_keycodes(text_stroke))
        self.assertEqual(decode_keycodes(keycodes), text)

    def test_german_exact_text_serializes_signs_not_us_positions(self):
        kb = DummyKeyboard(None)
        kb.vial_protocol = 5

        macro = ActionExactText("- >")
        self.assertEqual(kb.macro_deserialize(macro.serialize(kb.vial_protocol)), [ActionExactText("- >")])

    def test_german_exact_text_survives_keyboard_reload(self):
        kb = DummyKeyboard(None)
        kb.vial_protocol = 5
        text = "printf -v date '%(%Y-%m-%d)T\\n' -1 | sed 's/-/>/'"
        data = kb.macro_serialize([ActionExactText(text)])
        self.assertEqual(kb.macro_deserialize(data), [ActionExactText(text)])

    def test_german_exact_text_rejects_unrepresentable_character(self):
        with self.assertRaises(MacroTextEncodingError):
            compile_text("hello\u2603")

    def test_serialize_v1(self):
        kb = DummyKeyboard(None)
        kb.vial_protocol = 1
        data = kb.macro_serialize([ActionText("Hello"), ActionTap(["KC_A", "KC_B", "KC_C"]), ActionText("World"),
                                   ActionDown(["KC_C", "KC_B", "KC_A"])])
        self.assertEqual(data, b"Hello\x01\x04\x01\x05\x01\x06World\x02\x06\x02\x05\x02\x04")

    def test_deserialize_v1(self):
        kb = DummyKeyboard(None)
        kb.vial_protocol = 1
        macro = kb.macro_deserialize(b"Hello\x01\x04\x01\x05\x01\x06World\x02\x06\x02\x05\x02\x04")
        self.assertEqual(macro, [ActionText("Hello"), ActionTap(["KC_A", "KC_B", "KC_C"]), ActionText("World"),
                                 ActionDown(["KC_C", "KC_B", "KC_A"])])

    def test_serialize_v2(self):
        kb = DummyKeyboard(None)
        kb.vial_protocol = 2
        data = kb.macro_serialize([ActionText("Hello"), ActionTap(["KC_A", "KC_B", "KC_C"]), ActionText("World"),
                                   ActionDown(["KC_C", "KC_B", "KC_A"]), ActionDelay(1000)])
        self.assertEqual(data, b"Hello\x01\x01\x04\x01\x01\x05\x01\x01\x06World\x01\x02\x06\x01\x02\x05\x01\x02\x04"
                               b"\x01\x04\xEC\x04")
        data = kb.macro_serialize([ActionText("Hello"), ActionTap(["KC_A", "KC_B", "KC_C"]), ActionText("World"),
                                   ActionDown(["KC_C", "KC_B", "KC_A"]), ActionDelay(0)])
        self.assertEqual(data, b"Hello\x01\x01\x04\x01\x01\x05\x01\x01\x06World\x01\x02\x06\x01\x02\x05\x01\x02\x04"
                               b"\x01\x04\x01\x01")
        data = kb.macro_serialize([ActionText("Hello"), ActionTap(["KC_A", "KC_B", "KC_C"]), ActionText("World"),
                                   ActionDown(["KC_C", "KC_B", "KC_A"]), ActionDelay(1)])
        self.assertEqual(data, b"Hello\x01\x01\x04\x01\x01\x05\x01\x01\x06World\x01\x02\x06\x01\x02\x05\x01\x02\x04"
                               b"\x01\x04\x02\x01")
        data = kb.macro_serialize([ActionText("Hello"), ActionTap(["KC_A", "KC_B", "KC_C"]), ActionText("World"),
                                   ActionDown(["KC_C", "KC_B", "KC_A"]), ActionDelay(256)])
        self.assertEqual(data, b"Hello\x01\x01\x04\x01\x01\x05\x01\x01\x06World\x01\x02\x06\x01\x02\x05\x01\x02\x04"
                               b"\x01\x04\x02\x02")

    def test_deserialize_v2(self):
        kb = DummyKeyboard(None)
        kb.vial_protocol = 2
        macro = kb.macro_deserialize(b"Hello\x01\x01\x04\x01\x01\x05\x01\x01\x06World\x01\x02\x06\x01\x02\x05"
                                     b"\x01\x02\x04\x01\x04\xEC\x04")
        self.assertEqual(macro, [ActionText("Hello"), ActionTap(["KC_A", "KC_B", "KC_C"]), ActionText("World"),
                                 ActionDown(["KC_C", "KC_B", "KC_A"]), ActionDelay(1000)])
        macro = kb.macro_deserialize(b"Hello\x01\x01\x04\x01\x01\x05\x01\x01\x06World\x01\x02\x06\x01\x02\x05"
                                     b"\x01\x02\x04\x01\x04\x01\x01")
        self.assertEqual(macro, [ActionText("Hello"), ActionTap(["KC_A", "KC_B", "KC_C"]), ActionText("World"),
                                 ActionDown(["KC_C", "KC_B", "KC_A"]), ActionDelay(0)])
        macro = kb.macro_deserialize(b"Hello\x01\x01\x04\x01\x01\x05\x01\x01\x06World\x01\x02\x06\x01\x02\x05"
                                     b"\x01\x02\x04\x01\x04\x02\x01")
        self.assertEqual(macro, [ActionText("Hello"), ActionTap(["KC_A", "KC_B", "KC_C"]), ActionText("World"),
                                 ActionDown(["KC_C", "KC_B", "KC_A"]), ActionDelay(1)])
        macro = kb.macro_deserialize(b"Hello\x01\x01\x04\x01\x01\x05\x01\x01\x06World\x01\x02\x06\x01\x02\x05"
                                     b"\x01\x02\x04\x01\x04\x02\x02")
        self.assertEqual(macro, [ActionText("Hello"), ActionTap(["KC_A", "KC_B", "KC_C"]), ActionText("World"),
                                 ActionDown(["KC_C", "KC_B", "KC_A"]), ActionDelay(256)])

    def test_save(self):
        down = ActionDown(["KC_A", "KC_B", "CMB_TOG"])
        self.assertEqual(down.save(), ["down", "KC_A", "KC_B", "CMB_TOG"])
        tap = ActionTap(["CMB_TOG", "KC_B", "KC_A"])
        self.assertEqual(tap.save(), ["tap", "CMB_TOG", "KC_B", "KC_A"])
        text = ActionText("Hello world")
        self.assertEqual(text.save(), ["text", "Hello world"])
        exact_text = ActionExactText("printf -v date")
        self.assertEqual(exact_text.save(), ["exact-text", "German (QWERTZ)", "printf -v date"])
        delay = ActionDelay(123)
        self.assertEqual(delay.save(), ["delay", 123])

    def test_restore(self):
        down = ActionDown()
        down.restore(["down", "KC_A", "KC_B", "CMB_TOG"])
        self.assertEqual(down, ActionDown(["KC_A", "KC_B", "CMB_TOG"]))
        tap = ActionTap()
        tap.restore(["tap", "CMB_TOG", "KC_B", "KC_A"])
        self.assertEqual(tap, ActionTap(["CMB_TOG", "KC_B", "KC_A"]))
        text = ActionText()
        text.restore(["text", "Hello world"])
        self.assertEqual(text, ActionText("Hello world"))
        exact_text = ActionExactText()
        exact_text.restore(["exact-text", "German (QWERTZ)", "Get-Date 'dd.MM.yyyy'"])
        self.assertEqual(exact_text, ActionExactText("Get-Date 'dd.MM.yyyy'"))
        delay = ActionDelay()
        delay.restore(["delay", 123])
        self.assertEqual(delay, ActionDelay(123))

    def test_twobyte_keycodes(self):
        kb = DummyKeyboard(None)
        kb.vial_protocol = 2
        # TODO remove once keycodes are properly owned by the Keyboard object
        kb.tap_dance_count = 0
        recreate_keyboard_keycodes(kb)

        data = kb.macro_serialize([ActionTap(["CMB_TOG", "KC_A"])])
        self.assertEqual(data, b"\x01\x05\xF9\x5C\x01\x01\x04")
        data = kb.macro_serialize([ActionDown(["CMB_TOG", "KC_A"])])
        self.assertEqual(data, b"\x01\x06\xF9\x5C\x01\x02\x04")
        data = kb.macro_serialize([ActionUp(["CMB_TOG", "KC_A"])])
        self.assertEqual(data, b"\x01\x07\xF9\x5C\x01\x03\x04")

        macro = kb.macro_deserialize(b"\x01\x05\xF9\x5C\x01\x01\x04")
        self.assertEqual(macro, [ActionTap(["CMB_TOG", "KC_A"])])
        macro = kb.macro_deserialize(b"\x01\x06\xF9\x5C\x01\x02\x04")
        self.assertEqual(macro, [ActionDown(["CMB_TOG", "KC_A"])])
        macro = kb.macro_deserialize(b"\x01\x07\xF9\x5C\x01\x03\x04")
        self.assertEqual(macro, [ActionUp(["CMB_TOG", "KC_A"])])

    def test_twobyte_with_zeroes(self):
        kb = DummyKeyboard(None)
        kb.vial_protocol = 2
        data = kb.macro_serialize([ActionTap([Keycode.serialize(0xA000), Keycode.serialize(0xB100), Keycode.serialize(0xC200)])])
        self.assertEqual(data, b"\x01\x05\xA0\xFF\x01\x05\xB1\xFF\x01\x05\xC2\xFF")

        macro = kb.macro_deserialize(b"\x01\x05\xC2\xFF\x01\x05\xB1\xFF\x01\x05\xA0\xFF")
        self.assertEqual(macro, [ActionTap([Keycode.serialize(0xC200), Keycode.serialize(0xB100), Keycode.serialize(0xA000)])])
