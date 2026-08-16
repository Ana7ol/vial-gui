# SPDX-License-Identifier: GPL-2.0-or-later
import struct

from keycodes.keycodes import Keycode
from protocol.constants import VIAL_PROTOCOL_ADVANCED_MACROS, VIAL_PROTOCOL_EXT_MACROS
from macro.text_encoder import GERMAN_TEXT_LAYOUT, compile_text

SS_QMK_PREFIX = 1

SS_TAP_CODE = 1
SS_DOWN_CODE = 2
SS_UP_CODE = 3
SS_DELAY_CODE = 4
VIAL_MACRO_EXT_TAP = 5
VIAL_MACRO_EXT_DOWN = 6
VIAL_MACRO_EXT_UP = 7


class BasicAction:

    tag = "unknown"

    def save(self):
        return [self.tag]

    def restore(self, act):
        if self.tag != act[0]:
            raise RuntimeError("cannot restore {}: expected tag={} got tag={}".format(
                self, self.tag, act[0]
            ))

    def __eq__(self, other):
        return self.tag == other.tag


class ActionText(BasicAction):

    tag = "text"

    def __init__(self, text=""):
        super().__init__()
        self.text = text

    def serialize(self, vial_protocol):
        return self.text.encode("utf-8")

    def save(self):
        return super().save() + [self.text]

    def restore(self, act):
        super().restore(act)
        self.text = act[1]

    def __eq__(self, other):
        return super().__eq__(other) and self.text == other.text

    def __repr__(self):
        return "{}<{}>".format(self.tag, self.text)


class ActionSequence(BasicAction):

    tag = "unknown-sequence"

    def __init__(self, sequence=None):
        super().__init__()
        if sequence is None:
            sequence = []
        self.sequence = sequence

    def serialize_prefix(self, kc):
        raise NotImplementedError

    def serialize(self, vial_protocol):
        out = b""
        for kc in self.sequence:
            if vial_protocol >= VIAL_PROTOCOL_ADVANCED_MACROS:
                out += struct.pack("B", SS_QMK_PREFIX)
            kc = Keycode.deserialize(kc)
            out += self.serialize_prefix(kc)
            if kc < 256:
                out += struct.pack("B", kc)
            else:
                # see decode_keycode() in qmk
                if kc % 256 == 0:
                    kc = 0xFF00 | (kc >> 8)
                out += struct.pack("<H", kc)
        return out

    def save(self):
        out = super().save()
        for kc in self.sequence:
            out.append(kc)
        return out

    def restore(self, act):
        super().restore(act)
        for kc in act[1:]:
            self.sequence.append(kc)

    def __eq__(self, other):
        return super().__eq__(other) and self.sequence == other.sequence

    def __repr__(self):
        return "{}<{}>".format(self.tag, self.sequence)


class ActionDown(ActionSequence):

    tag = "down"

    def serialize_prefix(self, kc):
        if kc >= 256:
            return b"\x06"
        return b"\x02"


class ActionUp(ActionSequence):

    tag = "up"

    def serialize_prefix(self, kc):
        if kc >= 256:
            return b"\x07"
        return b"\x03"


class ActionTap(ActionSequence):

    tag = "tap"

    def serialize_prefix(self, kc):
        if kc >= 256:
            return b"\x05"
        return b"\x01"


class ActionDelay(BasicAction):

    tag = "delay"

    def __init__(self, delay=0):
        super().__init__()
        self.delay = delay

    def serialize(self, vial_protocol):
        if vial_protocol < VIAL_PROTOCOL_ADVANCED_MACROS:
            raise RuntimeError("ActionDelay can only be used with vial_protocol>=2")
        delay = self.delay
        return struct.pack("BBBB", SS_QMK_PREFIX, SS_DELAY_CODE, (delay % 255) + 1, (delay // 255) + 1)

    def save(self):
        return super().save() + [self.delay]

    def restore(self, act):
        super().restore(act)
        self.delay = act[1]

    def __eq__(self, other):
        return super().__eq__(other) and self.delay == other.delay


class ActionExactText(BasicAction):

    tag = "exact-text"

    def __init__(self, text="", layout=GERMAN_TEXT_LAYOUT):
        super().__init__()
        self.text = text
        self.layout = layout

    @staticmethod
    def _modified_keycode(modifier, keycode):
        masks = {
            "KC_LSHIFT": "LSFT({})",
            "KC_RALT": "RALT({})",
        }
        return masks[modifier].format(keycode)

    def serialize(self, vial_protocol):
        out = b""
        for text_stroke in compile_text(self.text, self.layout):
            if len(text_stroke.modifiers) == 1 and vial_protocol >= VIAL_PROTOCOL_EXT_MACROS:
                modified = self._modified_keycode(text_stroke.modifiers[0], text_stroke.keycode)
                out += ActionTap([modified]).serialize(vial_protocol)
            else:
                if text_stroke.modifiers:
                    out += ActionDown(list(text_stroke.modifiers)).serialize(vial_protocol)
                out += ActionTap([text_stroke.keycode]).serialize(vial_protocol)
                if text_stroke.modifiers:
                    out += ActionUp(list(reversed(text_stroke.modifiers))).serialize(vial_protocol)

            if text_stroke.trailing_keycodes:
                out += ActionTap(list(text_stroke.trailing_keycodes)).serialize(vial_protocol)
        return out

    def save(self):
        return super().save() + [self.layout, self.text]

    def restore(self, act):
        super().restore(act)
        self.layout = act[1]
        self.text = act[2]

    def __eq__(self, other):
        return super().__eq__(other) and self.text == other.text and self.layout == other.layout

    def __repr__(self):
        return "{}<{}, {}>".format(self.tag, self.layout, self.text)
