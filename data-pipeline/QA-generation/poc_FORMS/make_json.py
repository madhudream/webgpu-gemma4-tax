"""
make_json.py
============
Converts data.jsonl → data.json

Output format (matches existing data.json structure):
{
  "data": [
    {"formName": "W-2",       "qa": [{"question": "...", "answer": "..."}, ...]},
    {"formName": "1099-MISC", "qa": [...]},
    ...
  ]
}

Usage:
    cd poc_FORMS
    uv run python make_json.py
    uv run python make_json.py --src pass_cache.json   ← use cache instead
"""

import os
import json
import argparse

PASS_LABELS = [
    "Pass 1 — Fields",
    "Pass 2 — Procedural",
    "Pass 3 — Relationships",
]


def load_from_jsonl(path: str) -> dict:
    result = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                name = obj.get("formName", "")
                qa   = obj.get("qa", [])
                if name:
                    result[name] = qa
            except json.JSONDecodeError as e:
                print(f"  WARN: skipping bad line: {e}")
    return result


def load_from_cache(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        cache = json.load(f)
    result = {}
    for form_name, passes in cache.items():
        all_pairs = []
        for label in PASS_LABELS:
            all_pairs.extend(passes.get(label, []))
        result[form_name] = all_pairs
    return result


def main():
    parser = argparse.ArgumentParser(description="Convert data.jsonl → data.json")
    parser.add_argument("--src",  default="data.jsonl",  help="Source file: data.jsonl or pass_cache.json")
    parser.add_argument("--out",  default="data.json",   help="Output file (default: data.json)")
    args = parser.parse_args()

    src_path = os.path.join(os.path.dirname(__file__), args.src)
    out_path = os.path.join(os.path.dirname(__file__), args.out)

    if not os.path.exists(src_path):
        print(f"ERROR: {src_path} not found.")
        return

    print(f"Reading from: {src_path}")

    if args.src.endswith(".json") and not args.src.endswith(".jsonl"):
        data = load_from_cache(src_path)
    else:
        data = load_from_jsonl(src_path)

    print(f"Forms loaded: {list(data.keys())}")
    for name, pairs in data.items():
        print(f"  {name}: {len(pairs)} Q&A pairs")

    output = {"data": [{"formName": name, "qa": pairs} for name, pairs in data.items()]}

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    total = sum(len(v) for v in data.values())
    print(f"\nWritten to: {out_path}")
    print(f"Total Q&A pairs: {total} across {len(data)} forms")


if __name__ == "__main__":
    main()
