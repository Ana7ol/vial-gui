# Quantum Keycode Reference

Vial GUI includes a searchable in-app reference at `About -> Quantum keycode guide...` and a public `quantum.html` guide beside the web configurator. Both are generated from the same keycode definitions used by the Quantum tab, so labels, QMK IDs, aliases, feature requirements, and hover tooltips stay aligned.

## How to read the Quantum tab

| Group | What it is for |
| --- | --- |
| Boot and EEPROM | Reboot, bootloader, and EEPROM reset actions. Use with care because some actions restart or reset the keyboard. |
| Modifier wrappers | One-shot modifiers, modifier wrappers like `LCTL(kc)`, and mod-taps like `LCTL_T(kc)`. |
| Magic keys | Runtime toggles for swapping Control/Caps, Control/GUI, Alt/GUI, Escape/Grave, Backslash/Backspace, GUI enablement, NKRO, and split-hand EEPROM settings. |
| Audio, clicky, music | QMK audio and clicky controls when the firmware includes those features. |
| Haptic | Haptic enablement, mode, buzz, continuous strength, and dwell controls when haptic support is compiled in. |
| Auto Shift | Runtime controls for Auto Shift timeout and enablement. |
| Combos | Runtime combo enable, disable, and toggle keys. |
| Caps Word and Repeat | Modern QMK/Vial keys for Caps Word, repeat key, and alternate repeat where firmware support exists. |

## Corne v4 notes

Most Corne v4 builds will care most about:

- `QK_BOOT`: put the board into bootloader mode for flashing.
- `QK_REBOOT`: reboot without entering the bootloader.
- `QK_CLEAR_EEPROM`: reset persistent keyboard storage. This can clear Vial changes.
- `MAGIC_EE_HANDS_LEFT` and `MAGIC_EE_HANDS_RIGHT`: set left/right identity for split builds using EE_HANDS.
- `QK_LAYER_LOCK`: lock the active layer, if firmware exposes the feature.
- `QK_REPEAT_KEY` and `QK_ALT_REPEAT_KEY`: repeat the last key or its alternate, if firmware exposes repeat support.

For a full per-button list, use the in-app dialog. It includes every Quantum tab key that this build exposes.
