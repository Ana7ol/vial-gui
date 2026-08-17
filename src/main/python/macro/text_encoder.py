# coding: utf-8
# SPDX-License-Identifier: GPL-2.0-or-later
from collections import namedtuple


GERMAN_TEXT_LAYOUT = "German (QWERTZ)"

TextStroke = namedtuple("TextStroke", ["modifiers", "keycode", "trailing_keycodes"])


class MacroTextEncodingError(ValueError):

    def __init__(self, character, position, layout):
        self.character = character
        self.position = position
        self.layout = layout
        super().__init__("{} cannot type {} at character {}".format(layout, repr(character), position + 1))


def stroke(keycode, modifiers=(), trailing_keycodes=()):
    return TextStroke(tuple(modifiers), keycode, tuple(trailing_keycodes))


GERMAN_TEXT_MAP = {
    " ": stroke("KC_SPACE"),
    "\t": stroke("KC_TAB"),
    "\n": stroke("KC_ENTER"),
    "\r": stroke("KC_ENTER"),
    "!": stroke("KC_1", ("KC_LSHIFT",)),
    '"': stroke("KC_2", ("KC_LSHIFT",)),
    "#": stroke("KC_NONUS_HASH"),
    "$": stroke("KC_4", ("KC_LSHIFT",)),
    "%": stroke("KC_5", ("KC_LSHIFT",)),
    "&": stroke("KC_6", ("KC_LSHIFT",)),
    "'": stroke("KC_NONUS_HASH", ("KC_LSHIFT",)),
    "(": stroke("KC_8", ("KC_LSHIFT",)),
    ")": stroke("KC_9", ("KC_LSHIFT",)),
    "*": stroke("KC_RBRACKET", ("KC_LSHIFT",)),
    "+": stroke("KC_RBRACKET"),
    ",": stroke("KC_COMMA"),
    "-": stroke("KC_SLASH"),
    ".": stroke("KC_DOT"),
    "/": stroke("KC_7", ("KC_LSHIFT",)),
    ":": stroke("KC_DOT", ("KC_LSHIFT",)),
    ";": stroke("KC_COMMA", ("KC_LSHIFT",)),
    "<": stroke("KC_NONUS_BSLASH"),
    "=": stroke("KC_0", ("KC_LSHIFT",)),
    ">": stroke("KC_NONUS_BSLASH", ("KC_LSHIFT",)),
    "?": stroke("KC_MINUS", ("KC_LSHIFT",)),
    "@": stroke("KC_Q", ("KC_RALT",)),
    "[": stroke("KC_8", ("KC_RALT",)),
    "\\": stroke("KC_MINUS", ("KC_RALT",)),
    "]": stroke("KC_9", ("KC_RALT",)),
    "^": stroke("KC_GRAVE", trailing_keycodes=("KC_SPACE",)),
    "_": stroke("KC_SLASH", ("KC_LSHIFT",)),
    "`": stroke("KC_EQUAL", ("KC_LSHIFT",), ("KC_SPACE",)),
    "{": stroke("KC_7", ("KC_RALT",)),
    "|": stroke("KC_NONUS_BSLASH", ("KC_RALT",)),
    "}": stroke("KC_0", ("KC_RALT",)),
    "~": stroke("KC_RBRACKET", ("KC_RALT",), ("KC_SPACE",)),
    "ä": stroke("KC_QUOTE"),
    "ö": stroke("KC_SCOLON"),
    "ü": stroke("KC_LBRACKET"),
    "ß": stroke("KC_MINUS"),
    "Ä": stroke("KC_QUOTE", ("KC_LSHIFT",)),
    "Ö": stroke("KC_SCOLON", ("KC_LSHIFT",)),
    "Ü": stroke("KC_LBRACKET", ("KC_LSHIFT",)),
    "€": stroke("KC_E", ("KC_RALT",)),
    "µ": stroke("KC_M", ("KC_RALT",)),
    "°": stroke("KC_GRAVE", ("KC_LSHIFT",)),
    "§": stroke("KC_3", ("KC_LSHIFT",)),
    "´": stroke("KC_EQUAL", trailing_keycodes=("KC_SPACE",)),
}

for number in "0123456789":
    GERMAN_TEXT_MAP[number] = stroke("KC_{}".format(number))

for character in "abcdefghijklmnopqrstuvwxyz":
    physical_character = {"y": "z", "z": "y"}.get(character, character)
    keycode = "KC_{}".format(physical_character.upper())
    GERMAN_TEXT_MAP[character] = stroke(keycode)
    GERMAN_TEXT_MAP[character.upper()] = stroke(keycode, ("KC_LSHIFT",))


def compile_text(text, layout=GERMAN_TEXT_LAYOUT):
    if layout != GERMAN_TEXT_LAYOUT:
        raise ValueError("Unsupported exact-text layout: {}".format(layout))

    text = text.replace("\r\n", "\n")
    out = []
    for position, character in enumerate(text):
        if character not in GERMAN_TEXT_MAP:
            raise MacroTextEncodingError(character, position, layout)
        out.append(GERMAN_TEXT_MAP[character])
    return out


def stroke_keycodes(text_stroke):
    """Return the QMK keycodes used by protocol-v5 macros for one character."""
    keycode = text_stroke.keycode
    if text_stroke.modifiers:
        wrappers = {
            "KC_LSHIFT": "LSFT({})",
            "KC_RALT": "RALT({})",
        }
        if len(text_stroke.modifiers) != 1 or text_stroke.modifiers[0] not in wrappers:
            return None
        keycode = wrappers[text_stroke.modifiers[0]].format(keycode)
    return (keycode,) + text_stroke.trailing_keycodes


def _german_keycode_sequences():
    sequences = {}
    for character, text_stroke in GERMAN_TEXT_MAP.items():
        sequence = stroke_keycodes(text_stroke)
        if sequence is not None:
            # Newline and carriage return share KC_ENTER. Prefer the normalized newline.
            sequences.setdefault(sequence, character)
    return sorted(sequences.items(), key=lambda item: len(item[0]), reverse=True)


GERMAN_KEYCODE_SEQUENCES = _german_keycode_sequences()


def decode_keycodes(keycodes, layout=GERMAN_TEXT_LAYOUT):
    """Decode German protocol-v5 tap keycodes back into literal text."""
    if layout != GERMAN_TEXT_LAYOUT:
        raise ValueError("Unsupported exact-text layout: {}".format(layout))

    keycodes = tuple(keycodes)
    text = []
    position = 0
    while position < len(keycodes):
        for sequence, character in GERMAN_KEYCODE_SEQUENCES:
            if keycodes[position:position + len(sequence)] == sequence:
                text.append(character)
                position += len(sequence)
                break
        else:
            return None
    return "".join(text)
