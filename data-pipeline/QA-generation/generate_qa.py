"""
IRS PDF → Q&A Generator (Local, Zero Cost)
============================================
Uses pymupdf4llm to extract PDFs as markdown
Uses Ollama qwen3:32b to generate Q&A pairs
Embeds form name in every question

Setup:
    pip install pymupdf4llm openai
    ollama pull qwen3:32b

Usage:
    python generate_qa.py --pdf_dir ./irs_pdfs --output train.jsonl
"""

import os
import re
import json
import time
import argparse
import threading
import pymupdf4llm
import fitz  # pymupdf — used for form name extraction from first page

from openai import OpenAI
from concurrent.futures import ThreadPoolExecutor, as_completed


# =============================================================================
# STEP 1: Extract form name from PDF
# =============================================================================

def extract_form_name(pdf_path: str, filename: str) -> str:
    """
    Try to get the IRS form name from:
    1. First page text (look for "Form XXXX" or "Schedule X" pattern)
    2. PDF metadata title
    3. Fall back to filename
    """
    doc = fitz.open(pdf_path)

    # Try PDF metadata first
    meta = doc.metadata
    title = meta.get("title", "").strip() if meta else ""

    # Get first page text (just first 500 chars is enough)
    first_page_text = ""
    if len(doc) > 0:
        first_page_text = doc[0].get_text()[:1000]
    doc.close()

    # Pattern 1: "Form 1040" or "Form 1040-SR" or "Schedule C"
    form_patterns = [
        r"(Form\s+\d{1,5}[A-Za-z\-]*(?:\s*\([A-Za-z\s]+\))?)",  # Form 1040, Form 1040-SR, Form 8829(Rev...)
        r"(Schedule\s+[A-Z][A-Za-z\-]*(?:\s*\([A-Za-z\s]+\))?)",  # Schedule C, Schedule K-1
        r"(Publication\s+\d+[A-Za-z]*)",                           # Publication 17, Publication 334
        r"(Instructions\s+for\s+Form\s+\d+[A-Za-z\-]*)",          # Instructions for Form 1040
    ]

    for pattern in form_patterns:
        match = re.search(pattern, first_page_text, re.IGNORECASE)
        if match:
            return match.group(1).strip()

    # Pattern 2: Check metadata title
    if title:
        for pattern in form_patterns:
            match = re.search(pattern, title, re.IGNORECASE)
            if match:
                return match.group(1).strip()
        # If title exists but no pattern match, use title as-is
        if len(title) < 100:
            return title

    # Pattern 3: Derive from filename
    # e.g., "f1040.pdf" → "Form 1040", "i1040sc.pdf" → "Instructions Form 1040 Schedule C"
    base = os.path.splitext(filename)[0]
    # Common IRS filename patterns
    fname_match = re.match(r"^f(\d+)([a-z]*)$", base, re.IGNORECASE)
    if fname_match:
        return f"Form {fname_match.group(1)}{fname_match.group(2).upper()}"

    fname_match = re.match(r"^i(\d+)([a-z]*)$", base, re.IGNORECASE)
    if fname_match:
        return f"Instructions for Form {fname_match.group(1)}{fname_match.group(2).upper()}"

    # Last resort: clean up filename
    return base.replace("_", " ").replace("-", " ").title()


# =============================================================================
# STEP 2: Extract PDF content as markdown
# =============================================================================

def extract_pdf_markdown(pdf_path: str, max_chars: int = 12000) -> str:
    """
    Extract PDF content as LLM-ready markdown using pymupdf4llm.
    Strips headers/footers, keeps tables and structure.
    Truncates to max_chars to fit in context window.
    """
    try:
        md_text = pymupdf4llm.to_markdown(
            pdf_path,
            header=False,       # skip repetitive page headers
            footer=False,       # skip page footers/numbers
            hdr_info=False,     # skip slow full-doc font-size scan; IRS PDFs gain nothing from auto markdown headers
            ignore_code=True,   # don't wrap IRS line numbers / field codes in code blocks
            use_ocr=False,      # IRS PDFs are native digital — Tesseract OCR is never needed and adds minutes per file
        )
        # Trim to fit context window (qwen3:32b has 32K context)
        # Leave room for system prompt + output
        if len(md_text) > max_chars:
            md_text = md_text[:max_chars] + "\n\n[Document truncated...]"
        return md_text
    except Exception as e:
        print(f"  pymupdf4llm failed, falling back to fitz: {e}")
        # Fallback to basic fitz extraction
        doc = fitz.open(pdf_path)
        text = ""
        for page in doc:
            text += page.get_text() + "\n"
        doc.close()
        return text[:max_chars]


# =============================================================================
# STEP 3: Generate Q&A pairs using Ollama
# =============================================================================

SYSTEM_PROMPT = """You are an expert at reading IRS tax documents and generating high-quality question-answer training data.

RULES:
1. Every question MUST include the form name "{form_name}" so the Q&A is tied to that specific form
2. Generate exactly 35 diverse Q&A pairs
3. Mix these question types:
   - Factual: "What is the filing deadline for {form_name}?"
   - Procedural: "How do I complete Part II of {form_name}?"
   - Eligibility: "Who is required to file {form_name}?"
   - Field-specific: "What should I enter on Line 7 of {form_name}?"
   - Definition: "What does '{form_name}' consider as qualified expenses?"
4. Answers must be accurate based ONLY on the document content
5. Keep answers concise but complete (2-4 sentences typical)
6. Do NOT invent information not in the document

OUTPUT FORMAT:
Return ONLY valid JSONL. One JSON object per line, no extra text before or after.
Each line must be exactly this format:
{{"messages": [{{"role": "system", "content": "You are an IRS tax documentation expert."}}, {{"role": "user", "content": "question about {form_name} here"}}, {{"role": "assistant", "content": "answer here"}}]}}"""


def generate_qa_pairs(client: OpenAI, form_name: str, md_content: str, model: str) -> tuple[str, str, int, int]:
    """Send PDF markdown to Ollama and get Q&A pairs back.
    Returns (content, finish_reason, prompt_tokens, completion_tokens).
    """
    prompt = SYSTEM_PROMPT.replace("{form_name}", form_name)
    user_msg = f"Generate Q&A training pairs from this IRS document about {form_name}:\n\n{md_content}"

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": user_msg},
        ],
        max_tokens=4096,
        temperature=0.7,
    )

    content = response.choices[0].message.content
    finish_reason = response.choices[0].finish_reason
    prompt_tokens = response.usage.prompt_tokens if response.usage else 0
    completion_tokens = response.usage.completion_tokens if response.usage else 0
    return content, finish_reason, prompt_tokens, completion_tokens


# =============================================================================
# STEP 4: Parse and validate Q&A output
# =============================================================================

def parse_qa_output(raw_output: str, form_name: str) -> list:
    """
    Parse the LLM output into valid JSONL lines.
    Handles messy output: extracts valid JSON lines, skips junk.
    """
    valid_pairs = []

    # Try to find JSON objects line by line
    for line in raw_output.strip().split("\n"):
        line = line.strip()
        if not line or not line.startswith("{"):
            continue

        try:
            obj = json.loads(line)

            # Validate structure
            if "messages" not in obj:
                continue
            msgs = obj["messages"]
            if len(msgs) < 2:
                continue

            # Check that form name appears in the user question
            user_msg = next((m for m in msgs if m.get("role") == "user"), None)
            if not user_msg:
                continue

            # Add form name if model forgot to include it
            if form_name.lower() not in user_msg["content"].lower():
                user_msg["content"] = f"Regarding {form_name}: {user_msg['content']}"

            # Ensure system message exists
            has_system = any(m.get("role") == "system" for m in msgs)
            if not has_system:
                msgs.insert(0, {"role": "system", "content": "You are an IRS tax documentation expert."})

            valid_pairs.append(obj)

        except json.JSONDecodeError:
            # Try to extract JSON from within the line
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
# STEP 5: Per-file worker (runs in thread)
# =============================================================================

def process_one_pdf(
    index: int,
    total: int,
    filename: str,
    args,
    client: OpenAI,
    print_lock: threading.Lock,
    write_lock: threading.Lock,
    out_file,
    progress_file,
    counters: dict,
) -> tuple[int, str | None]:
    """
    Process a single PDF: extract → generate → parse → write.
    Returns (pairs_count, error_reason) where error_reason is None on success.
    Logs are buffered and printed atomically so parallel workers don't interleave.
    """
    pdf_path = os.path.join(args.pdf_dir, filename)
    log = []  # buffer all log lines for this file
    file_start = time.time()

    log.append(f"[{index}/{total}] {filename}")

    # --- Extract form name ---
    form_name = extract_form_name(pdf_path, filename)
    log.append(f"  Form name  : {form_name}")

    # --- Extract markdown ---
    t0 = time.time()
    md_content = extract_pdf_markdown(pdf_path, max_chars=args.max_chars)
    extract_secs = time.time() - t0
    truncated = " (truncated)" if "[Document truncated...]" in md_content else ""
    log.append(f"  Extracted  : {len(md_content):,} chars in {extract_secs:.1f}s{truncated}")

    if len(md_content.strip()) < 100:
        log.append(f"  SKIP — too little text extracted")
        with print_lock:
            print("\n".join(log), flush=True)
        return 0, "too little text"

    # --- Generate Q&A ---
    try:
        prompt = SYSTEM_PROMPT.replace("{form_name}", form_name)
        user_msg = f"Generate Q&A training pairs from this IRS document about {form_name}:\n\n{md_content}"
        log.append(f"  LLM call   : model={args.model} prompt_chars={len(prompt)+len(user_msg):,}")

        t0 = time.time()
        raw_output, finish_reason, ptok, ctok = generate_qa_pairs(client, form_name, md_content, args.model)
        llm_secs = time.time() - t0

        log.append(f"  LLM done   : {llm_secs:.1f}s | prompt_tokens={ptok} completion_tokens={ctok} finish={finish_reason}")
        if finish_reason == "length":
            log.append(f"  WARNING    : output cut off — max_tokens hit, some pairs may be missing")

        # --- Parse and validate ---
        pairs = parse_qa_output(raw_output, form_name)

        if not pairs:
            log.append(f"  WARN       : 0 valid pairs parsed from LLM output")
            with print_lock:
                print("\n".join(log), flush=True)
            return 0, "no valid pairs parsed"

        # --- Write valid pairs (locked to avoid interleaved writes) ---
        with write_lock:
            for pair in pairs:
                out_file.write(json.dumps(pair, ensure_ascii=False) + "\n")
            out_file.flush()
            progress_file.write(filename + "\n")
            progress_file.flush()
            counters["total_pairs"] += len(pairs)
            counters["done"] += 1
            snapshot_pairs = counters["total_pairs"]
            snapshot_done = counters["done"]

        file_secs = time.time() - file_start
        elapsed = time.time() - counters["start_time"]
        rate = snapshot_done / elapsed * 60
        remaining = total - index
        eta_min = remaining / (rate / 60) / 60 if rate > 0 else 0
        log.append(
            f"  Result     : {len(pairs)} pairs | {file_secs:.1f}s | "
            f"cumulative {snapshot_pairs} pairs | {rate:.1f} files/min | ETA ~{eta_min:.0f}min"
        )
        with print_lock:
            print("\n".join(log), flush=True)
        return len(pairs), None

    except Exception as e:
        log.append(f"  ERROR      : {e}")
        with print_lock:
            print("\n".join(log), flush=True)
        return 0, str(e)


# =============================================================================
# STEP 6: Main pipeline
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="IRS PDF → Q&A Generator")
    parser.add_argument("--pdf_dir", default="./irs_pdfs", help="Folder with IRS PDFs")
    parser.add_argument("--output", default="train.jsonl", help="Output JSONL file")
    parser.add_argument("--model", default="qwen3:8b", help="Ollama model name")
    parser.add_argument("--max_chars", type=int, default=12000, help="Max chars to extract per PDF")
    parser.add_argument("--workers", type=int, default=2, help="Parallel workers (2 for 8b, 1 for 32b)")
    parser.add_argument("--resume", action="store_true", help="Skip already processed files")
    args = parser.parse_args()

    # Each worker gets its own OpenAI client (thread-safe: separate TCP connections)
    def make_client():
        return OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")

    probe = make_client()
    print(f"Connecting to Ollama at http://localhost:11434 (model: {args.model}, workers: {args.workers})...", flush=True)
    try:
        models = probe.models.list()
        available = [m.id for m in models.data]
        print(f"  Available models: {available}", flush=True)
        if args.model not in available:
            print(f"  WARNING: '{args.model}' not found — run: ollama pull {args.model}", flush=True)
        else:
            print(f"  OK: '{args.model}' is ready", flush=True)
    except Exception as e:
        print(f"  ERROR: Cannot reach Ollama — {e}")
        print(f"  Make sure Ollama is running: ollama serve")
        return

    # Get PDF list
    pdf_files = sorted([f for f in os.listdir(args.pdf_dir) if f.lower().endswith(".pdf")])
    print(f"Found {len(pdf_files)} PDFs in {args.pdf_dir}")

    # Track already processed files
    processed = set()
    if args.resume and os.path.exists(args.output + ".progress"):
        with open(args.output + ".progress") as f:
            processed = set(line.strip() for line in f)
        print(f"Resuming: {len(processed)} files already done, {len(pdf_files)-len(processed)} remaining")

    todo = [(i + 1, fn) for i, fn in enumerate(pdf_files) if fn not in processed]
    print(f"Processing {len(todo)} PDFs with {args.workers} worker(s)...\n", flush=True)

    counters = {"total_pairs": 0, "done": 0, "start_time": time.time()}
    failed = []
    print_lock = threading.Lock()
    write_lock = threading.Lock()

    with open(args.output, "a") as out_file, \
         open(args.output + ".progress", "a") as progress_file:

        # Each worker gets its own client to avoid sharing a socket across threads
        clients = [make_client() for _ in range(args.workers)]

        def worker_task(task):
            idx, fn = task
            worker_id = threading.current_thread().name
            client = clients[int(worker_id.split("_")[-1]) % args.workers]
            return fn, process_one_pdf(
                idx, len(pdf_files), fn, args, client,
                print_lock, write_lock, out_file, progress_file, counters
            )

        with ThreadPoolExecutor(max_workers=args.workers, thread_name_prefix="worker") as pool:
            futures = {pool.submit(worker_task, task): task for task in todo}
            for future in as_completed(futures):
                fn, (n_pairs, error) = future.result()
                if error:
                    failed.append((fn, error))

    # --- Summary ---
    elapsed = time.time() - counters["start_time"]
    print("\n" + "=" * 60)
    print(f"DONE")
    print(f"  PDFs processed : {len(todo) - len(failed)}/{len(pdf_files)}")
    print(f"  Total Q&A pairs: {counters['total_pairs']}")
    print(f"  Output file    : {args.output}")
    print(f"  Time           : {elapsed/60:.1f} minutes")
    print(f"  Failed         : {len(failed)}")
    if failed:
        for fname, reason in failed[:20]:
            print(f"    - {fname}: {reason}")
    print("=" * 60)

    if failed:
        with open("failed_pdfs.json", "w") as f:
            json.dump(failed, f, indent=2)
        print(f"Failed list saved to failed_pdfs.json")


if __name__ == "__main__":
    main()