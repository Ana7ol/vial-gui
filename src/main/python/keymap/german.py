# coding: utf-8

keymap = {
    "KC_GRAVE": "°\n^",
    "KC_2": '"\n2',
    "KC_3": "§\n3",
    "KC_6": "&\n6",
    "KC_7": "/\n7",
    "KC_8": "(\n8",
    "KC_9": ")\n9",
    "KC_0": "=\n0",
    "KC_MINUS": "?\nß",
    "KC_EQUAL": "`\n´",
    "KC_Y": "Z",
    "KC_LBRACKET": "Ü",
    "KC_RBRACKET": "*\n+",
    "KC_SCOLON": "Ö",
    "KC_QUOTE": "Ä",
    "KC_NONUS_HASH": "'\n#",
    "KC_NONUS_BSLASH": ">\n<",
    "KC_Z": "Y",
    "KC_COMMA": ";\n,",
    "KC_DOT": ":\n.",
    "KC_SLASH": "_\n-",
}

# QMK's convenience keycodes (KC_AT, KC_LCBR, and friends) are based on a
# US host layout.  When German is selected, translate those logical symbols
# to the physical German key combination before writing them to the keyboard.
selection_overrides = {
    "KC_TILD": "RALT(KC_RBRACKET)",
    "KC_EXLM": "LSFT(KC_1)",
    "KC_AT": "RALT(KC_Q)",
    "KC_HASH": "KC_NONUS_HASH",
    "KC_DLR": "LSFT(KC_4)",
    "KC_PERC": "LSFT(KC_5)",
    "KC_CIRC": "KC_GRAVE",
    "KC_AMPR": "LSFT(KC_6)",
    "KC_ASTR": "LSFT(KC_RBRACKET)",
    "KC_LPRN": "LSFT(KC_8)",
    "KC_RPRN": "LSFT(KC_9)",
    "KC_UNDS": "LSFT(KC_SLASH)",
    "KC_PLUS": "KC_RBRACKET",
    "KC_LCBR": "RALT(KC_7)",
    "KC_RCBR": "RALT(KC_0)",
    "KC_LT": "KC_NONUS_BSLASH",
    "KC_GT": "LSFT(KC_NONUS_BSLASH)",
    "KC_COLN": "LSFT(KC_DOT)",
    "KC_PIPE": "RALT(KC_NONUS_BSLASH)",
    "KC_QUES": "LSFT(KC_MINUS)",
    "KC_DQUO": "LSFT(KC_2)",
}

# These characters have no separate logical button in Vial's US-oriented
# Basic/ISO palettes once the physical keys are relabelled for German.
character_keycodes = [
    ("'", "LSFT(KC_NONUS_HASH)"),
    ("[", "RALT(KC_8)"),
    ("]", "RALT(KC_9)"),
    ("{", "RALT(KC_7)"),
    ("}", "RALT(KC_0)"),
    ("\\", "RALT(KC_MINUS)"),
    ("|", "RALT(KC_NONUS_BSLASH)"),
    ("@", "RALT(KC_Q)"),
    ("€", "RALT(KC_E)"),
    ("/", "LSFT(KC_7)"),
    ("=", "LSFT(KC_0)"),
    ("-", "KC_SLASH"),
    (";", "LSFT(KC_COMMA)"),
]
