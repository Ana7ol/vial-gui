# SPDX-License-Identifier: GPL-2.0-or-later

"""Small, side-effect-free helpers for the QMK modifier profile presets."""

WINDOWS_LINUX_PROFILE = "windows_linux"
MACOS_PROFILE = "macos"
CUSTOM_PROFILE = "custom"

LEFT_CONTROL_GUI_SWAP = 1 << 8
RIGHT_CONTROL_GUI_SWAP = 1 << 9
CONTROL_GUI_SWAP_MASK = LEFT_CONTROL_GUI_SWAP | RIGHT_CONTROL_GUI_SWAP


def modifier_profile_value(current_value, profile):
    """Return qsid 21 with only the Control/GUI swap bits changed."""

    if profile == MACOS_PROFILE:
        return current_value | CONTROL_GUI_SWAP_MASK
    if profile == WINDOWS_LINUX_PROFILE:
        return current_value & ~CONTROL_GUI_SWAP_MASK
    raise ValueError("unknown modifier profile: {}".format(profile))


def detect_modifier_profile(value):
    """Describe the two Control/GUI bits without inspecting other Magic flags."""

    swap_bits = value & CONTROL_GUI_SWAP_MASK
    if swap_bits == CONTROL_GUI_SWAP_MASK:
        return MACOS_PROFILE
    if swap_bits == 0:
        return WINDOWS_LINUX_PROFILE
    return CUSTOM_PROFILE
