"""
IRS PDF → Q&A Generator (Claude Haiku, last N PDFs)
=====================================================
Processes PDFs in REVERSE order (last 421 of 1421).
Uses Claude claude-haiku-4-5 via Anthropic API.
Writes to a separate output file for later merging.

Setup:
    export ANTHROPIC_API_KEY=sk-ant-...
    uv add anthropic

Usage:
    uv run python generate_qa_claude.py --pdf_dir ./irs_pdfs --output train_claude.jsonl --count 421
"""

import os
import re
import json
import time
import argparse
import pymupdf4llm
import fitz

import anthropic


def load_dotenv(path=".env"):
    """Load key=value pairs from a .env file into os.environ."""
    if not os.path.exists(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_dotenv()


# =============================================================================
# Shared helpers (same logic as generate_qa.py)
# =============================================================================

def extract_form_name(pdf_path: str, filename: str) -> str:
    doc = fitz.open(pdf_path)
    meta = doc.metadata
    title = meta.get("title", "").strip() if meta else ""
    first_page_text = doc[0].get_text()[:1000] if len(doc) > 0 else ""
    doc.close()

    form_patterns = [
        r"(Form\s+\d{1,5}[A-Za-z\-]*(?:\s*\([A-Za-z\s]+\))?)",
        r"(Schedule\s+[A-Z][A-Za-z\-]*(?:\s*\([A-Za-z\s]+\))?)",
        r"(Publication\s+\d+[A-Za-z]*)",
        r"(Instructions\s+for\s+Form\s+\d+[A-Za-z\-]*)",
    ]

    for pattern in form_patterns:
        match = re.search(pattern, first_page_text, re.IGNORECASE)
        if match:
            return match.group(1).strip()

    if title:
        for pattern in form_patterns:
            match = re.search(pattern, title, re.IGNORECASE)
            if match:
                return match.group(1).strip()
        if len(title) < 100:
            return title

    base = os.path.splitext(filename)[0]
    m = re.match(r"^f(\d+)([a-z]*)$", base, re.IGNORECASE)
    if m:
        return f"Form {m.group(1)}{m.group(2).upper()}"
    m = re.match(r"^i(\d+)([a-z]*)$", base, re.IGNORECASE)
    if m:
        return f"Instructions for Form {m.group(1)}{m.group(2).upper()}"
    return base.replace("_", " ").replace("-", " ").title()


def extract_pdf_markdown(pdf_path: str, max_chars: int = 12000) -> str:
    try:
        md_text = pymupdf4llm.to_markdown(
            pdf_path,
            header=False,
            footer=False,
            hdr_info=False,
            ignore_code=True,
            use_ocr=False,
        )
        if len(md_text) > max_chars:
            md_text = md_text[:max_chars] + "\n\n[Document truncated...]"
        return md_text
    except Exception as e:
        print(f"  pymupdf4llm failed, falling back to fitz: {e}")
        doc = fitz.open(pdf_path)
        text = "".join(page.get_text() + "\n" for page in doc)
        doc.close()
        return text[:max_chars]


# =============================================================================
# Claude Haiku Q&A generation
# =============================================================================

SYSTEM_PROMPT = """You are an expert at reading IRS tax documents and generating high-quality question-answer training data.

CRITICAL RULE — READ THIS FIRST:
Every single question MUST contain the exact form name "{form_name}".
NO EXCEPTIONS. If a question does not name "{form_name}" explicitly, it is WRONG.

BAD example (rejected):  "What is the filing deadline?"
GOOD example (required): "What is the filing deadline for {form_name}?"

RULES:
1. Every question MUST include "{form_name}" by name — not "this form", not "the publication", not "it"
2. Generate exactly 35 diverse Q&A pairs
3. Mix these question types:
   - Factual: "What is the filing deadline for {form_name}?"
   - Procedural: "How do I complete Part II of {form_name}?"
   - Eligibility: "Who is required to file {form_name}?"
   - Field-specific: "What should I enter on Line 7 of {form_name}?"
   - Definition: "What does {form_name} consider as qualified expenses?"
4. Answers must be accurate based ONLY on the document content
5. Keep answers concise but complete (2-4 sentences typical)
6. Do NOT invent information not in the document

OUTPUT FORMAT:
Return ONLY valid JSONL. One JSON object per line, no extra text before or after.
Each line must be exactly this format:
{{"messages": [{{"role": "system", "content": "You are an IRS tax documentation expert."}}, {{"role": "user", "content": "question naming {form_name} here"}}, {{"role": "assistant", "content": "answer here"}}]}}"""


def generate_qa_claude(client: anthropic.Anthropic, form_name: str, md_content: str, model: str) -> tuple[str, int, int]:
    """
    Call Claude and return (content, input_tokens, output_tokens).
    """
    system = SYSTEM_PROMPT.replace("{form_name}", form_name)
    user_msg = f"Generate Q&A training pairs from this IRS document about {form_name}:\n\n{md_content}"

    response = client.messages.create(
        model=model,
        max_tokens=4096,
        system=system,
        messages=[{"role": "user", "content": user_msg}],
    )

    content = response.content[0].text
    input_tokens = response.usage.input_tokens
    output_tokens = response.usage.output_tokens
    stop_reason = response.stop_reason
    return content, input_tokens, output_tokens, stop_reason


# =============================================================================
# Parse and validate Q&A output (same logic as generate_qa.py)
# =============================================================================

def parse_qa_output(raw_output: str, form_name: str) -> list:
    valid_pairs = []
    for line in raw_output.strip().split("\n"):
        line = line.strip()
        if not line or not line.startswith("{"):
            continue
        try:
            obj = json.loads(line)
            if "messages" not in obj:
                continue
            msgs = obj["messages"]
            if len(msgs) < 2:
                continue
            user_msg = next((m for m in msgs if m.get("role") == "user"), None)
            if not user_msg:
                continue
            if form_name.lower() not in user_msg["content"].lower():
                # Inject form name naturally into the question rather than a clunky prefix
                q = user_msg["content"].rstrip("?")
                user_msg["content"] = f"According to {form_name}, {q[0].lower() + q[1:]}?"
            if not any(m.get("role") == "system" for m in msgs):
                msgs.insert(0, {"role": "system", "content": "You are an IRS tax documentation expert."})
            valid_pairs.append(obj)
        except json.JSONDecodeError:
            try:
                start = line.index("{")
                end = line.rindex("}") + 1
                obj = json.loads(line[start:end])
                if "messages" in obj:
                    valid_pairs.append(obj)
            except (ValueError, json.JSONDecodeError):
                continue
    return valid_pairs


# =============================================================================
# Main pipeline
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="IRS PDF → Q&A Generator (Claude Haiku)")
    parser.add_argument("--pdf_dir", default="./irs_pdfs", help="Folder with IRS PDFs")
    parser.add_argument("--output", default="train_claude.jsonl", help="Output JSONL file (separate from Ollama output)")
    parser.add_argument("--model", default="claude-haiku-4-5", help="Claude model name")
    parser.add_argument("--count", type=int, default=421, help="Number of PDFs to process (taken from the END of sorted list)")
    parser.add_argument("--max_chars", type=int, default=12000, help="Max chars to extract per PDF")
    parser.add_argument("--resume", action="store_true", help="Skip already processed files")
    args = parser.parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY environment variable not set.")
        print("  export ANTHROPIC_API_KEY=sk-ant-...")
        return

    client = anthropic.Anthropic(api_key=api_key)

    # Verify API key works with a tiny test
    print(f"Verifying Anthropic API key...", flush=True)
    try:
        test = client.messages.create(
            model=args.model,
            max_tokens=10,
            messages=[{"role": "user", "content": "hi"}],
        )
        print(f"  OK: {args.model} is reachable", flush=True)
    except Exception as e:
        print(f"  ERROR: {e}")
        return

    # Get PDF list sorted, then take the LAST --count files
    all_pdfs = sorted([f for f in os.listdir(args.pdf_dir) if f.lower().endswith(".pdf")])
    pdf_files = all_pdfs[-args.count:]
    print(f"Found {len(all_pdfs)} total PDFs, processing last {len(pdf_files)} in REVERSE order")
    pdf_files = list(reversed(pdf_files))  # start from the very last

    # Resume support
    processed = set()
    if args.resume and os.path.exists(args.output + ".progress"):
        with open(args.output + ".progress") as f:
            processed = set(line.strip() for line in f)
        print(f"Resuming: {len(processed)} files already done, {len(pdf_files)-len(processed)} remaining")

    todo = [(i + 1, fn) for i, fn in enumerate(pdf_files) if fn not in processed]
    print(f"Processing {len(todo)} PDFs with {args.model}...\n", flush=True)

    total_pairs = 0
    total_input_tokens = 0
    total_output_tokens = 0
    failed = []
    start_time = time.time()

    with open(args.output, "a") as out_file, \
         open(args.output + ".progress", "a") as progress_file:

        for seq, (list_idx, filename) in enumerate(todo):
            pdf_path = os.path.join(args.pdf_dir, filename)
            file_start = time.time()
            print(f"[{list_idx}/{len(pdf_files)}] {filename}", flush=True)

            # Extract form name
            form_name = extract_form_name(pdf_path, filename)
            print(f"  Form name  : {form_name}", flush=True)

            # Extract markdown
            t0 = time.time()
            md_content = extract_pdf_markdown(pdf_path, max_chars=args.max_chars)
            extract_secs = time.time() - t0
            truncated = " (truncated)" if "[Document truncated...]" in md_content else ""
            print(f"  Extracted  : {len(md_content):,} chars in {extract_secs:.1f}s{truncated}", flush=True)

            if len(md_content.strip()) < 100:
                print(f"  SKIP       : too little text", flush=True)
                failed.append((filename, "too little text"))
                continue

            # Generate Q&A via Claude
            try:
                print(f"  LLM call   : model={args.model} ...", flush=True)
                t0 = time.time()
                raw_output, in_tok, out_tok, stop_reason = generate_qa_claude(client, form_name, md_content, args.model)
                llm_secs = time.time() - t0

                total_input_tokens += in_tok
                total_output_tokens += out_tok
                # Rough cost: haiku is $0.80/M input, $4.00/M output
                cost_so_far = (total_input_tokens / 1_000_000 * 0.80) + (total_output_tokens / 1_000_000 * 4.00)

                print(f"  LLM done   : {llm_secs:.1f}s | in={in_tok} out={out_tok} stop={stop_reason}", flush=True)
                if stop_reason == "max_tokens":
                    print(f"  WARNING    : output cut off — max_tokens hit", flush=True)

                # Parse
                pairs = parse_qa_output(raw_output, form_name)

                if not pairs:
                    print(f"  WARN       : 0 valid pairs parsed", flush=True)
                    failed.append((filename, "no valid pairs parsed"))
                    continue

                # Write
                for pair in pairs:
                    out_file.write(json.dumps(pair, ensure_ascii=False) + "\n")
                out_file.flush()
                progress_file.write(filename + "\n")
                progress_file.flush()

                total_pairs += len(pairs)
                file_secs = time.time() - file_start
                elapsed = time.time() - start_time
                done = seq + 1
                rate = done / elapsed * 60
                remaining = len(todo) - done
                eta_min = remaining / (rate / 60) / 60 if rate > 0 else 0
                print(
                    f"  Result     : {len(pairs)} pairs | {file_secs:.1f}s | "
                    f"cumulative {total_pairs} pairs | {rate:.1f} files/min | "
                    f"ETA ~{eta_min:.0f}min | cost so far ~${cost_so_far:.3f}",
                    flush=True,
                )

            except anthropic.RateLimitError as e:
                wait = 60
                print(f"  RATE LIMIT : waiting {wait}s then retrying... ({e})", flush=True)
                time.sleep(wait)
                failed.append((filename, f"rate limit: {e}"))
            except Exception as e:
                print(f"  ERROR      : {e}", flush=True)
                failed.append((filename, str(e)))

            print("", flush=True)

    # Summary
    elapsed = time.time() - start_time
    final_cost = (total_input_tokens / 1_000_000 * 0.80) + (total_output_tokens / 1_000_000 * 4.00)
    print("=" * 60)
    print(f"DONE")
    print(f"  PDFs processed : {len(todo) - len(failed)}/{len(todo)}")
    print(f"  Total Q&A pairs: {total_pairs}")
    print(f"  Output file    : {args.output}")
    print(f"  Time           : {elapsed/60:.1f} minutes")
    print(f"  Tokens used    : {total_input_tokens:,} input / {total_output_tokens:,} output")
    print(f"  Estimated cost : ~${final_cost:.3f}")
    print(f"  Failed         : {len(failed)}")
    if failed:
        for fname, reason in failed[:20]:
            print(f"    - {fname}: {reason}")
    print("=" * 60)

    if failed:
        with open("failed_pdfs_claude.json", "w") as f:
            json.dump(failed, f, indent=2)
        print(f"Failed list saved to failed_pdfs_claude.json")


if __name__ == "__main__":
    main()
