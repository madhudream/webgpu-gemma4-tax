"""
bootstrap_cache.py
==================
One-time script to build pass_cache.json from existing data.jsonl.

Uses the known pair counts from the previous run to split existing Q&A pairs
back into the correct pass buckets. Failed passes (0 pairs) are left empty
so generate_data.py will only call Claude for the missing ones.

Run once:
    cd poc_FORMS
    uv run python bootstrap_cache.py
"""

import os
import json

# ── Known pass results from the previous run ─────────────────────────────────
# Format: { formName: [P1_count, P2_count, P3_count] }
# Use 0 for passes that failed (will be re-called by generate_data.py).
KNOWN_COUNTS = {
    "W-2":       [46, 51, 0],   # P3 failed → will re-call P3 only
    "1099-MISC": [49,  0, 0],   # P2+P3 failed → will re-call P2, P3
    "1099-NEC":  [49, 50, 0],   # P3 failed → will re-call P3 only
    "1099-INT":  [53, 48, 0],   # P3 failed → will re-call P3 only
    "1099-DIV":  [49,  0, 0],   # P2+P3 failed → will re-call P2, P3
    # 1040 was interrupted before writing — no data in jsonl, all passes needed
    # Schedule-A, Schedule-B: never started — all passes needed
}

PASS_LABELS = [
    "Pass 1 — Fields",
    "Pass 2 — Procedural",
    "Pass 3 — Relationships",
]

DATA_JSONL  = os.path.join(os.path.dirname(__file__), "data.jsonl")
CACHE_PATH  = os.path.join(os.path.dirname(__file__), "pass_cache.json")


def main():
    # Read data.jsonl into a dict: formName → list of Q&A pairs
    forms_data = {}
    with open(DATA_JSONL, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                name = obj.get("formName", "")
                qa   = obj.get("qa", [])
                if name and qa:
                    forms_data[name] = qa
            except json.JSONDecodeError:
                continue

    print(f"Found {len(forms_data)} form(s) in data.jsonl:")
    for name, pairs in forms_data.items():
        print(f"  {name}: {len(pairs)} total pairs")

    pass_cache = {}

    for form_name, qa_pairs in forms_data.items():
        counts = KNOWN_COUNTS.get(form_name)
        if counts is None:
            print(f"  WARNING: no known count for {form_name} — skipping")
            continue

        pass_cache[form_name] = {}
        offset = 0
        for i, (label, count) in enumerate(zip(PASS_LABELS, counts)):
            if count > 0:
                chunk = qa_pairs[offset : offset + count]
                pass_cache[form_name][label] = chunk
                offset += count
                print(f"  {form_name} / {label}: {len(chunk)} pairs cached")
            else:
                pass_cache[form_name][label] = []
                print(f"  {form_name} / {label}: 0 pairs (WILL RE-CALL)")

    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(pass_cache, f, ensure_ascii=False, indent=2)

    print(f"\npass_cache.json written to {CACHE_PATH}")
    print("\nSummary of passes that will be called by generate_data.py:")
    for form_name, passes in pass_cache.items():
        missing = [lbl for lbl in PASS_LABELS if not passes.get(lbl)]
        if missing:
            print(f"  {form_name}: {missing}")
        else:
            print(f"  {form_name}: ALL DONE")

    # Forms not in data.jsonl at all — all passes will be called fresh
    all_form_keys = ["W-2","1099-MISC","1099-NEC","1099-INT","1099-DIV","1040","Schedule-A","Schedule-B"]
    not_started = [f for f in all_form_keys if f not in pass_cache]
    if not_started:
        print(f"\nForms not in cache (all 3 passes will run): {not_started}")


if __name__ == "__main__":
    main()
