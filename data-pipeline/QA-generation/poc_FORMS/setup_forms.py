"""
poc_FORMS / setup_forms.py
===========================
Step 1: Ask Claude to identify which of the 1421 IRS PDFs belong to each
        of the 8 target forms. Then copy those PDFs into per-form subfolders:

    poc_FORMS/
      pdfs/
        W-2/          ← fw2.pdf, fw2c.pdf, iw2w3.pdf, ...
        1099-MISC/    ← f1099msc.pdf, i109495b.pdf, ...
        1099-NEC/     ← f1099nec.pdf, ...
        ...

Usage:
    cd poc_FORMS
    uv run python setup_forms.py --pdf_dir ../irs_pdfs
"""

import os
import sys
import json
import shutil
import argparse
import anthropic


FORM_KEYS = [
    "W-2",
    "1099-MISC",
    "1099-NEC",
    "1099-INT",
    "1099-DIV",
    "1040",
    "Schedule-A",
    "Schedule-B",
]

MAPPING_PROMPT = """\
You are an IRS document expert. Below is the full list of IRS PDF filenames (without the .pdf extension).

Your job: for each of the 8 target forms, identify ALL filenames that are directly related to it.
This includes:
- The form itself
- Official instructions for the form
- Corrected versions of the form
- Supplemental schedules that are PART of or FILED WITH that form
- Any filing-related transmittal forms

The 8 target form keys are:
  W-2         → Form W-2 (Wage and Tax Statement)
  1099-MISC   → Form 1099-MISC (Miscellaneous Income)
  1099-NEC    → Form 1099-NEC (Nonemployee Compensation)
  1099-INT    → Form 1099-INT (Interest Income)
  1099-DIV    → Form 1099-DIV (Dividends and Distributions)
  1040        → Form 1040 (U.S. Individual Income Tax Return) — include general instructions only, NOT schedules
  Schedule-A  → Schedule A (Itemized Deductions for Form 1040)
  Schedule-B  → Schedule B (Interest and Ordinary Dividends for Form 1040)

IRS filename conventions:
  f<number>   → the form itself (e.g. fw2 = Form W-2, f1040 = Form 1040)
  i<number>   → instructions for that form (e.g. iw2w3 = instructions for W-2 & W-3)
  p<number>   → IRS publication (include ONLY if it is an official guide for that specific form)

IMPORTANT:
- Do NOT cross-assign. A PDF belongs to AT MOST ONE form key.
- If a PDF doesn't clearly belong to any of the 8 forms, omit it (use key "none").
- Return ONLY a raw JSON object, no markdown fences, no extra text.

Format:
{
  "W-2":       ["fw2", "fw2c", "fw3", "iw2w3"],
  "1099-MISC": ["f1099msc", ...],
  "1099-NEC":  ["f1099nec", ...],
  "1099-INT":  ["f1099int", ...],
  "1099-DIV":  ["f1099div", ...],
  "1040":      ["f1040", "i1040gi", ...],
  "Schedule-A":["f1040sa", ...],
  "Schedule-B":["f1040sb", ...]
}

Full list of available PDF filenames (without .pdf):
{filenames}
"""


def load_dotenv(path=".env"):
    for candidate in [path, os.path.join("..", path)]:
        if os.path.exists(candidate):
            with open(candidate) as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, _, value = line.partition("=")
                    os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
            return


def ask_claude_for_mapping(client, filenames: list[str], model: str) -> dict:
    """Send the full filename list to Claude and get back a form→filenames mapping."""
    filenames_text = "\n".join(filenames)
    prompt = MAPPING_PROMPT.replace("{filenames}", filenames_text)

    print(f"  Sending {len(filenames)} filenames to Claude for mapping...", flush=True)
    response = client.messages.create(
        model=model,
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = response.content[0].text.strip()
    in_tok  = response.usage.input_tokens
    out_tok = response.usage.output_tokens
    print(f"  Claude responded | in={in_tok} out={out_tok}", flush=True)

    # Strip markdown fences if present
    import re
    raw = re.sub(r"```(?:json)?", "", raw).strip()

    try:
        mapping = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"\nERROR: Could not parse Claude's response as JSON: {e}")
        print("Raw response:\n", raw[:2000])
        sys.exit(1)

    return mapping


def main():
    parser = argparse.ArgumentParser(description="Identify and copy PDFs for 8 target forms")
    parser.add_argument("--pdf_dir", default=os.path.join(os.path.dirname(__file__), "..", "irs_pdfs"),
                        help="Path to folder with all IRS PDFs (default: ../irs_pdfs)")
    parser.add_argument("--out_dir", default=os.path.join(os.path.dirname(__file__), "pdfs"),
                        help="Output folder for per-form PDF subfolders (default: ./pdfs)")
    parser.add_argument("--model",   default="claude-haiku-4-5", help="Claude model to use")
    parser.add_argument("--mapping_cache", default="form_mapping.json",
                        help="Cache the mapping result here to avoid re-calling Claude")
    args = parser.parse_args()

    load_dotenv()

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY not set.")
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    pdf_dir = os.path.abspath(args.pdf_dir)
    out_dir = os.path.abspath(args.out_dir)
    cache_path = os.path.join(os.path.dirname(__file__), args.mapping_cache)

    # ── Step 1: Get mapping (from cache or Claude) ──────────────────────────
    if os.path.exists(cache_path):
        print(f"Loading cached mapping from {cache_path}")
        with open(cache_path) as f:
            mapping = json.load(f)
    else:
        print("Step 1: Asking Claude to map PDFs to forms...")
        all_pdfs = sorted(
            os.path.splitext(f)[0]
            for f in os.listdir(pdf_dir)
            if f.lower().endswith(".pdf")
        )
        print(f"  Found {len(all_pdfs)} PDFs in {pdf_dir}")

        mapping = ask_claude_for_mapping(client, all_pdfs, args.model)

        with open(cache_path, "w") as f:
            json.dump(mapping, f, indent=2)
        print(f"  Mapping saved to {cache_path}")

    # ── Step 2: Show mapping summary ────────────────────────────────────────
    print("\nMapping summary:")
    for key in FORM_KEYS:
        files = mapping.get(key, [])
        print(f"  {key:15s} → {len(files)} PDFs: {', '.join(files)}")

    # ── Step 3: Copy PDFs into per-form subfolders ──────────────────────────
    print(f"\nStep 2: Copying PDFs into {out_dir}/ ...")
    os.makedirs(out_dir, exist_ok=True)

    total_copied  = 0
    total_missing = 0

    for form_key in FORM_KEYS:
        form_dir = os.path.join(out_dir, form_key)
        os.makedirs(form_dir, exist_ok=True)

        filenames = mapping.get(form_key, [])
        copied  = 0
        missing = []

        for stem in filenames:
            src = os.path.join(pdf_dir, stem + ".pdf")
            dst = os.path.join(form_dir, stem + ".pdf")
            if os.path.exists(src):
                shutil.copy2(src, dst)
                copied += 1
            else:
                missing.append(stem)

        total_copied  += copied
        total_missing += len(missing)

        status = f"✓ {copied} copied"
        if missing:
            status += f"  ✗ {len(missing)} missing: {', '.join(missing)}"
        print(f"  {form_key:15s} → {status}")

    print(f"\nDone. {total_copied} PDFs copied, {total_missing} not found on disk.")
    print(f"Per-form PDF folders are ready in: {out_dir}/")
    print("\nNext step:")
    print("  uv run python generate_data.py")


if __name__ == "__main__":
    main()
