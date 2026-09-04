# Corne v4 German/Vial Tuning

This fork defaults Vial GUI to the German QWERTZ display map. That changes how Vial labels and records keys, but the keyboard still sends USB HID key usages. The host operating system layout decides the final character. On a German OS layout, assigning visible `Y` means storing `KC_Z`; assigning visible `Z` means storing `KC_Y`.

## Windows and macOS modifiers

Open **QMK Settings → Magic → OS modifier profile** after connecting the
keyboard. Select **Windows / Linux** or **macOS**, then choose **Save**.

The macOS preset swaps Control and GUI on both sides, so the Corne's Control
home-row holds act as Command. USB Alt is already Option on macOS and is left
unchanged. Existing GUI positions become Control. The preset changes only
QMK's persistent modifier flags; it does not rewrite layers or private macro
text. Windows Run or PowerShell macros remain Windows-specific because there
is no safe automatic macOS translation for their commands.

## Exact German macros

For commands and scripts, add an `Exact text (German)` macro action. It
compiles letters, numbers, punctuation, German characters, whitespace, Shift,
and AltGr combinations into explicit key taps. For example, `-` becomes the
German minus key (`KC_SLASH`), `>` becomes Shift plus the ISO `<` key, and `\`
becomes AltGr plus the German `ß` key. This prevents the firmware's US
send-string table from changing shell syntax after the German OS layout
interprets it.

`Raw text (QMK/US)` remains available for compatibility with existing macros.
Use it only when the host layout and firmware send-string table are known to
match.

Normal USB keyboard HID reports do not carry Unicode characters. For
predictable output, keep the macro target and host input layout aligned. Exact
German text intentionally targets a German host layout.

## Corne v4 target

Corne v4 appears in QMK/Vial trees under CRKBD names such as `crkbd/rev4`, `crkbd/rev4_0/standard`, `crkbd/rev4_0/mini`, `crkbd/rev4_1/standard`, or `crkbd/rev4_1/mini`, depending on the firmware tree. Put the capacity settings below in the Vial keymap's `config.h`, for example:

```text
keyboards/crkbd/rev4_1/standard/keymaps/vial/config.h
```

If your tree uses a different CRKBD v4 folder, keep the same `keymaps/vial/config.h` idea and adjust the path.

## More layers, macros, and dynamic entries

Vial GUI does not invent these limits. It reads them from the keyboard firmware:

- Layer buttons come from `DYNAMIC_KEYMAP_LAYER_COUNT`.
- Macro tabs come from `DYNAMIC_KEYMAP_MACRO_COUNT` and the available macro EEPROM memory.
- Tap Dance, Combo, Key Override, and Alt Repeat tabs come from the Vial dynamic entry counts.

A practical Corne v4 starting point:

```c
#pragma once

#define DYNAMIC_KEYMAP_LAYER_COUNT 8
#define DYNAMIC_KEYMAP_MACRO_COUNT 32

#define VIAL_TAP_DANCE_ENTRIES 16
#define VIAL_COMBO_ENTRIES 32
#define VIAL_KEY_OVERRIDE_ENTRIES 16
#define VIAL_ALT_REPEAT_KEY_ENTRIES 8
```

For a larger RP2040 build you can try higher values, but check the firmware build output and the About Keyboard dialog after flashing. More layers consume dynamic keymap storage, which can reduce macro memory if the backing store is tight.

Optional, only if your Vial/QMK tree supports these settings and you know the MCU has the storage:

```c
#define DYNAMIC_KEYMAP_MACRO_EEPROM_SIZE 2048
```

## Feature switches

In the same keymap folder, `rules.mk` controls which features are compiled in. A feature can have entry slots in `config.h` and still be unavailable if it is disabled here.

```make
VIA_ENABLE = yes
VIAL_ENABLE = yes
TAP_DANCE_ENABLE = yes
COMBO_ENABLE = yes
KEY_OVERRIDE_ENABLE = yes
QMK_SETTINGS = yes
```

## Suggested layer plan for Corne v4

Eight layers is a comfortable German Corne v4 target:

| Layer | Purpose |
| --- | --- |
| 0 | German base layer |
| 1 | Navigation and editing |
| 2 | Numbers and symbols |
| 3 | Function keys and system keys |
| 4 | Mouse/media/RGB |
| 5 | Macros |
| 6 | Gaming or app-specific overrides |
| 7 | Spare/recovery layer |

Use `MO(n)` for hold-to-access layers, `LT(n, kc)` for tap/hold thumb keys, and `TO(n)` only when you intentionally want to leave the current layer stack.

## References

- Vial documents that dynamic layer, macro, tap dance, and combo limits are compile-time firmware settings: https://get.vial.today/docs/firmware-size.html
- Vial's layer manual calls out that layer count is adjusted at firmware compile time, not in the GUI: https://get.vial.today/manual/layers.html
- QMK documents a maximum of 32 keymap layers: https://docs.qmk.fm/keymap
- Corne v4 firmware variants are documented in the Corne project firmware guide: https://github.com/foostan/crkbd
