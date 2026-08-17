#!/usr/bin/env python3
"""Export Quantum keycode definitions without importing the GUI dependencies."""
import argparse
import ast
import json
from pathlib import Path


LISTS = {
    "KEYCODES_BOOT": "Boot and persistent storage",
    "KEYCODES_MODIFIERS": "One-shot modifiers and wrappers",
    "KEYCODES_QUANTUM": None,
}


def quantum_group(qmk_id):
    if qmk_id.startswith("MAGIC_"):
        return "Keyboard behavior and split hand"
    if qmk_id.startswith(("AU_", "CLICKY_", "MU_")):
        return "Audio and music"
    if qmk_id.startswith("HPT_"):
        return "Haptic feedback"
    if qmk_id.startswith("KC_AS"):
        return "Auto Shift"
    if qmk_id.startswith("CMB_"):
        return "Combos"
    return "Typing helpers"


def literal(node, default=None):
    if node is None:
        return default
    return ast.literal_eval(node)


def keycode_from_call(call, default_group):
    if not isinstance(call, ast.Call) or not isinstance(call.func, ast.Name) or call.func.id != "K":
        return None

    values = {keyword.arg: literal(keyword.value) for keyword in call.keywords}
    qmk_id = literal(call.args[0])
    label = literal(call.args[1]).replace("\n", " ")
    description = literal(call.args[2], "") if len(call.args) > 2 else ""
    aliases = values.get("alias", [])
    return {
        "group": default_group or quantum_group(qmk_id),
        "qmk_id": qmk_id,
        "label": label,
        "description": description or "Use this QMK keycode exactly as named.",
        "aliases": aliases,
        "requires_feature": values.get("requires_feature"),
    }


def extract(source):
    tree = ast.parse(source.read_text(encoding="utf-8"), filename=str(source))
    entries = []
    for node in tree.body:
        if not isinstance(node, ast.Assign) or len(node.targets) != 1 or not isinstance(node.targets[0], ast.Name):
            continue
        name = node.targets[0].id
        if name not in LISTS or not isinstance(node.value, ast.List):
            continue
        for element in node.value.elts:
            entry = keycode_from_call(element, LISTS[name])
            if entry:
                entries.append(entry)
    return entries


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    payload = json.dumps(extract(args.source), ensure_ascii=False, indent=2)
    args.output.write_text("window.QUANTUM_KEYCODES = {};\n".format(payload), encoding="utf-8")


if __name__ == "__main__":
    main()
