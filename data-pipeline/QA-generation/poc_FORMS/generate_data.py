"""
poc_FORMS — Q&A Generator (3-Pass) for 8 Core IRS Forms
=========================================================
Makes THREE Claude calls per form for deep, field-level coverage:

  Pass 1 — Field-by-field  : What is Box 1? What does Line 7a represent?
  Pass 2 — Procedural      : Who files? Deadlines? Penalties? How to correct?
  Pass 3 — Relationships   : How does this form connect to 1040/other forms?

Target: ~150 Q&A pairs per form (~1200 total for 8 forms).

Output: data.jsonl — one JSON object per form:
{
  "formName": "W-2",
  "qa": [{"question": "...", "answer": "..."}, ...]
}

Setup:
    export ANTHROPIC_API_KEY=sk-ant-...
    uv run python setup_forms.py   ← run this first!

Usage:
    cd poc_FORMS
    uv run python generate_data.py
    uv run python generate_data.py --resume
"""

import os
import re
import json
import time
import argparse
import sys
import pymupdf4llm
import fitz
import anthropic


# =============================================================================
# Target form keys — must match subfolder names created by setup_forms.py
# =============================================================================

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


# =============================================================================
# Helpers
# =============================================================================

def load_dotenv(path=".env"):
    """Load .env from current dir or parent dir."""
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


def extract_one_pdf(pdf_path: str, max_chars: int = 6000) -> str:
    """Extract text from a single PDF, capped at max_chars."""
    try:
        md = pymupdf4llm.to_markdown(
            pdf_path,
            header=False,
            footer=False,
            hdr_info=False,
            ignore_code=True,
            use_ocr=False,
        )
        return md[:max_chars]
    except Exception as e:
        print(f"    pymupdf4llm failed for {os.path.basename(pdf_path)}, using fitz: {e}")
        doc = fitz.open(pdf_path)
        text = "".join(page.get_text() + "\n" for page in doc)
        doc.close()
        return text[:max_chars]


def extract_form_pdfs(form_dir: str, total_max_chars: int = 18000) -> tuple[str, list[str]]:
    """
    Extract and concatenate text from all PDFs in a form's subfolder.
    Returns (combined_text, list_of_filenames_used).
    Budget is split evenly across PDFs, capped at total_max_chars combined.
    """
    pdf_files = sorted(f for f in os.listdir(form_dir) if f.lower().endswith(".pdf"))
    if not pdf_files:
        return "", []

    per_pdf_budget = total_max_chars // len(pdf_files)
    sections = []
    used = []

    for fname in pdf_files:
        path = os.path.join(form_dir, fname)
        text = extract_one_pdf(path, max_chars=per_pdf_budget)
        if text.strip():
            sections.append(f"=== {fname} ===\n{text}")
            used.append(fname)

    combined = "\n\n".join(sections)
    if len(combined) > total_max_chars:
        combined = combined[:total_max_chars] + "\n\n[Document truncated...]"
    return combined, used


# =============================================================================
# 3-Pass prompts
# =============================================================================

PASS1_SYSTEM = """\
You are an IRS tax document expert generating field-level Q&A training data.

FOCUS: Field-by-field coverage of {form_name}.
Generate exactly 50 Q&A pairs that cover EVERY box, line, or field in {form_name}.

RULES:
1. Every question MUST name "{form_name}" explicitly — never say "this form" or "it".
2. One question per box/line/field. Examples:
   - "What is reported in Box 1 of {form_name}?"
   - "What does Line 7a on {form_name} represent?"
   - "What should be entered in the Recipient TIN field on {form_name}?"
   - "What does a blank Box 12 on {form_name} indicate?"
3. Answers must be based ONLY on the document. Be specific and precise.
4. If the form has fewer than 50 distinct fields, generate multiple angles per field
   (e.g. "What is Box 1?", "When is Box 1 left blank?", "What types of income go in Box 1?").

OUTPUT FORMAT — return ONLY a raw JSON array, no markdown fences, no extra text:
[
  {{"question": "...", "answer": "..."}},
  {{"question": "...", "answer": "..."}}
]"""

PASS2_SYSTEM = """\
You are an IRS tax document expert generating procedural Q&A training data.

FOCUS: Rules, deadlines, penalties, errors, and corrections for {form_name}.
Generate exactly 50 Q&A pairs covering the procedural aspects of {form_name}.

RULES:
1. Every question MUST name "{form_name}" explicitly.
2. Cover ALL of these areas:
   - Who must file / issue {form_name}?
   - Who receives {form_name}?
   - What are the filing deadlines for {form_name}? (paper vs. electronic)
   - What are the penalties for late or incorrect {form_name}?
   - How do you correct an error on {form_name}?
   - How many copies of {form_name} are required and for whom?
   - What are common mistakes made on {form_name}?
   - What happens if a recipient does not receive {form_name}?
3. Answers must be based ONLY on the document.

OUTPUT FORMAT — return ONLY a raw JSON array, no markdown fences, no extra text:
[
  {{"question": "...", "answer": "..."}},
  {{"question": "...", "answer": "..."}}
]"""

PASS3_SYSTEM = """\
You are an IRS tax document expert generating cross-form relationship Q&A training data.

FOCUS: How {form_name} connects to other IRS forms, schedules, and tax concepts.
Generate exactly 50 Q&A pairs covering downstream use and relationships of {form_name}.

RULES:
1. Every question MUST name "{form_name}" explicitly.
2. Cover ALL of these areas:
   - How does data from {form_name} flow into Form 1040 (which specific lines)?
   - How does {form_name} relate to Schedule A, B, C, D, or E?
   - What other forms are triggered by or depend on {form_name}?
   - What is the difference between {form_name} and similar forms?
   - How does withholding reported on {form_name} appear on Form 1040?
   - What tax credits or deductions are connected to {form_name}?
   - When would a taxpayer need BOTH {form_name} and another specific form?
3. If a relationship is not in the document, briefly note it is not covered.

OUTPUT FORMAT — return ONLY a raw JSON array, no markdown fences, no extra text:
[
  {{"question": "...", "answer": "..."}},
  {{"question": "...", "answer": "..."}}
]"""

PASSES = [
    ("Pass 1 — Fields",        PASS1_SYSTEM, 50),
    ("Pass 2 — Procedural",    PASS2_SYSTEM, 50),
    ("Pass 3 — Relationships", PASS3_SYSTEM, 50),
]


def _rewrite_form_in_jsonl(output_path: str, form_key: str, all_pairs: list):
    """Insert or replace a form's line in data.jsonl."""
    new_line = json.dumps({"formName": form_key, "qa": all_pairs}, ensure_ascii=False)
    if not os.path.exists(output_path):
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(new_line + "\n")
        return

    lines = []
    replaced = False
    with open(output_path, encoding="utf-8") as f:
        for line in f:
            stripped = line.strip()
            if not stripped:
                continue
            try:
                obj = json.loads(stripped)
                if obj.get("formName") == form_key:
                    lines.append(new_line + "\n")
                    replaced = True
                    continue
            except json.JSONDecodeError:
                pass
            lines.append(line if line.endswith("\n") else line + "\n")

    if not replaced:
        lines.append(new_line + "\n")

    with open(output_path, "w", encoding="utf-8") as f:
        f.writelines(lines)


def call_claude(client, form_name: str, md_content: str, system_template: str,
                target_count: int, model: str) -> tuple:
    system = system_template.replace("{form_name}", form_name)
    user_msg = (
        f"Generate {target_count} Q&A pairs for {form_name}.\n\n"
        f"DOCUMENT CONTENT:\n{md_content}"
    )
    response = client.messages.create(
        model=model,
        max_tokens=8192,
        system=system,
        messages=[{"role": "user", "content": user_msg}],
    )
    raw     = response.content[0].text
    in_tok  = response.usage.input_tokens
    out_tok = response.usage.output_tokens
    stop    = response.stop_reason
    return raw, in_tok, out_tok, stop


def parse_qa(raw: str, form_name: str) -> list:
    raw = re.sub(r"```(?:json)?", "", raw).strip()
    try:
        start = raw.index("[")
        end   = raw.rindex("]") + 1
        pairs = json.loads(raw[start:end])
    except (ValueError, json.JSONDecodeError) as e:
        # Output was cut off — recover all complete {...} objects individually
        print(f"    WARN: full array parse failed ({e}) — attempting partial recovery", flush=True)
        pairs = []
        for m in re.finditer(r'\{[^{}]+\}', raw, re.DOTALL):
            try:
                obj = json.loads(m.group())
                if "question" in obj and "answer" in obj:
                    pairs.append(obj)
            except json.JSONDecodeError:
                continue
        if pairs:
            print(f"    Recovered {len(pairs)} pairs from partial output", flush=True)
        else:
            print("    WARN: 0 pairs recovered", flush=True)
            return []

    cleaned = []
    seen = set()
    for item in pairs:
        if not isinstance(item, dict):
            continue
        q = item.get("question", "").strip()
        a = item.get("answer", "").strip()
        if not q or not a:
            continue
        if form_name.lower() not in q.lower():
            q = f"{q.rstrip('?')} (related to {form_name})?"
        if q.lower() not in seen:
            seen.add(q.lower())
            cleaned.append({"question": q, "answer": a})

    return cleaned


# =============================================================================
# Main
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="poc_FORMS Q&A Generator (3-pass)")
    parser.add_argument(
        "--pdfs_dir",
        default=os.path.join(os.path.dirname(__file__), "pdfs"),
        help="Per-form PDF subfolders from setup_forms.py (default: ./pdfs)"
    )
    parser.add_argument("--output",    default="data.jsonl",       help="Output JSONL file")
    parser.add_argument("--model",     default="claude-haiku-4-5", help="Claude model to use")
    parser.add_argument("--max_chars", type=int, default=18000,    help="Max combined chars per form")
    # --resume is kept for backward compat but cache is always active (based on data.jsonl content)
    parser.add_argument("--resume",    action="store_true",        help="(Deprecated) Cache is always active based on data.jsonl content")
    args = parser.parse_args()

    load_dotenv()

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY not set.  export ANTHROPIC_API_KEY=sk-ant-...")
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    print(f"Verifying API key ({args.model})...", flush=True)
    try:
        client.messages.create(
            model=args.model, max_tokens=10,
            messages=[{"role": "user", "content": "hi"}]
        )
        print("  OK\n", flush=True)
    except Exception as e:
        print(f"  ERROR: {e}")
        sys.exit(1)

    pdfs_dir      = os.path.abspath(args.pdfs_dir)
    output_path   = os.path.join(os.path.dirname(__file__), args.output)
    cache_path    = os.path.join(os.path.dirname(__file__), "pass_cache.json")

    if not os.path.isdir(pdfs_dir):
        print(f"ERROR: PDF subfolders not found at {pdfs_dir}")
        print("  Run: uv run python setup_forms.py")
        sys.exit(1)

    # ── Pass-level cache ─────────────────────────────────────────────────────
    # pass_cache structure: { formName: { pass_label: [qa_pairs] } }
    # A pass is considered done if it has >= 1 pair in the cache.
    pass_cache: dict = {}
    if os.path.exists(cache_path):
        with open(cache_path, encoding="utf-8") as f:
            pass_cache = json.load(f)
        print("Pass cache loaded:")
        for form, passes in pass_cache.items():
            summary = ", ".join(f"{p}: {len(q)} pairs" for p, q in passes.items() if q)
            print(f"  {form}: {summary}")
        print()

    def save_cache():
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(pass_cache, f, ensure_ascii=False, indent=2)

    # ── Rebuild data.jsonl from cache for any fully-cached forms ─────────────
    # Forms are "complete" when all 3 passes are cached with >0 pairs each.
    pass_labels = [label for label, _, _ in PASSES]
    complete_forms = {
        form for form, passes in pass_cache.items()
        if all(passes.get(lbl) for lbl in pass_labels)
    }

    # Rewrite data.jsonl from cache (idempotent — keeps it consistent with cache)
    existing_in_file = set()
    if os.path.exists(output_path):
        with open(output_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        existing_in_file.add(json.loads(line).get("formName", ""))
                    except json.JSONDecodeError:
                        pass

    # Write any complete forms not yet in data.jsonl
    with open(output_path, "a", encoding="utf-8") as out_f:
        for form_key in complete_forms - existing_in_file:
            all_pairs = []
            for lbl in pass_labels:
                all_pairs.extend(pass_cache[form_key].get(lbl, []))
            out_f.write(json.dumps({"formName": form_key, "qa": all_pairs}, ensure_ascii=False) + "\n")
            print(f"  Written from cache → {form_key} ({len(all_pairs)} pairs)")

    # ── Build todo list (forms or passes still missing) ──────────────────────
    todo = []
    for form_key in FORM_KEYS:
        form_dir = os.path.join(pdfs_dir, form_key)
        if not os.path.isdir(form_dir):
            print(f"  MISSING folder: {form_dir}  (run setup_forms.py)")
            continue
        cached_passes = pass_cache.get(form_key, {})
        missing_passes = [
            (lbl, sys_tmpl, cnt)
            for lbl, sys_tmpl, cnt in PASSES
            if not cached_passes.get(lbl)  # not cached or 0 pairs
        ]
        if not missing_passes:
            print(f"  SKIP (all passes cached): {form_key}")
            continue
        todo.append((form_key, form_dir, missing_passes))

    print(f"\nWill process {len(todo)} form(s) with {args.model}")
    print(f"Output → {output_path}\n")

    total_pairs   = 0
    total_in_tok  = 0
    total_out_tok = 0
    failed        = []
    start_time    = time.time()

    for seq, (form_key, form_dir, missing_passes) in enumerate(todo, start=1):
        print(f"\n{'='*60}", flush=True)
        print(f"[{seq}/{len(todo)}] {form_key}", flush=True)
        cached_passes = pass_cache.get(form_key, {})
        cached_summary = ", ".join(
            f"{lbl}: {len(cached_passes[lbl])} pairs"
            for lbl in pass_labels if cached_passes.get(lbl)
        )
        if cached_summary:
            print(f"  Already cached : {cached_summary}", flush=True)
        print(f"  Passes needed  : {[lbl for lbl, _, _ in missing_passes]}", flush=True)
        print(f"{'='*60}", flush=True)

        # Extract all PDFs once
        t0 = time.time()
        md, used_files = extract_form_pdfs(form_dir, total_max_chars=args.max_chars)
        print(f"  PDFs       : {used_files}", flush=True)
        print(f"  Extracted  : {len(md):,} chars in {time.time()-t0:.1f}s", flush=True)

        if len(md.strip()) < 100:
            print("  SKIP       : too little text", flush=True)
            failed.append((form_key, "too little text"))
            continue

        if form_key not in pass_cache:
            pass_cache[form_key] = {}

        form_failed = False

        for pass_label, system_template, target_count in missing_passes:
            print(f"\n  [{pass_label}]", flush=True)
            try:
                t0 = time.time()
                raw, in_tok, out_tok, stop = call_claude(
                    client, form_key, md, system_template, target_count, args.model
                )
                total_in_tok  += in_tok
                total_out_tok += out_tok
                cost = (total_in_tok / 1_000_000 * 0.80) + (total_out_tok / 1_000_000 * 4.00)

                print(f"    LLM done : {time.time()-t0:.1f}s | in={in_tok} out={out_tok} stop={stop}", flush=True)
                if stop == "max_tokens":
                    print("    WARNING  : max_tokens hit", flush=True)

                pairs = parse_qa(raw, form_key)

                # Save to cache immediately (even partial results)
                pass_cache[form_key][pass_label] = pairs
                save_cache()

                running = sum(len(v) for v in pass_cache[form_key].values())
                print(f"    Parsed   : {len(pairs)} pairs (running: {running}) | cost ~${cost:.4f}", flush=True)

                time.sleep(1)

            except anthropic.RateLimitError as e:
                print(f"    RATE LIMIT: sleeping 60s... ({e})", flush=True)
                time.sleep(60)
                try:
                    raw, in_tok, out_tok, stop = call_claude(
                        client, form_key, md, system_template, target_count, args.model
                    )
                    total_in_tok  += in_tok
                    total_out_tok += out_tok
                    pairs = parse_qa(raw, form_key)
                    pass_cache[form_key][pass_label] = pairs
                    save_cache()
                    print(f"    Retry OK : {len(pairs)} pairs", flush=True)
                except Exception as e2:
                    print(f"    ERROR    : retry failed: {e2}", flush=True)
                    failed.append((form_key, f"{pass_label} retry failed: {e2}"))
                    form_failed = True
                    break
            except Exception as e:
                print(f"    ERROR    : {e}", flush=True)
                failed.append((form_key, f"{pass_label}: {e}"))
                form_failed = True
                break

        # Combine all passes from cache and write/update data.jsonl
        all_pairs = []
        for lbl in pass_labels:
            all_pairs.extend(pass_cache[form_key].get(lbl, []))

        if all_pairs:
            # Rewrite data.jsonl: replace the line for this form if it exists
            _rewrite_form_in_jsonl(output_path, form_key, all_pairs)
            total_pairs += len(all_pairs)

        print(f"\n  TOTAL for {form_key}: {len(all_pairs)} Q&A pairs", flush=True)

    elapsed    = time.time() - start_time
    final_cost = (total_in_tok / 1_000_000 * 0.80) + (total_out_tok / 1_000_000 * 4.00)

    print(f"\n{'='*60}")
    print("DONE")
    print(f"  Forms processed : {len(todo) - len(failed)}/{len(todo)}")
    print(f"  Total Q&A pairs : {total_pairs}")
    print(f"  Avg per form    : {total_pairs // max(len(todo), 1)}")
    print(f"  Output          : {output_path}")
    print(f"  Cache           : {cache_path}")
    print(f"  Time            : {elapsed:.1f}s ({elapsed/60:.1f} min)")
    print(f"  Tokens          : {total_in_tok:,} in / {total_out_tok:,} out")
    print(f"  Estimated cost  : ~${final_cost:.4f}")
    if failed:
        print(f"  Failed ({len(failed)}):")
        for name, reason in failed:
            print(f"    - {name}: {reason}")
    print("=" * 60)


if __name__ == "__main__":
    main()
