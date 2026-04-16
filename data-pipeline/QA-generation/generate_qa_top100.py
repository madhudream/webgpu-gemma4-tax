"""
IRS Top-100 PDF → Q&A Generator (Claude Haiku)
================================================
Processes the 100 most widely-used IRS forms and publications.
Splits output 80/20 into train_top100.jsonl and test_top100.jsonl.

Setup:
    export ANTHROPIC_API_KEY=sk-ant-...
    uv add anthropic

Usage:
    uv run python generate_qa_top100.py --pdf_dir ./irs_pdfs
    uv run python generate_qa_top100.py --pdf_dir ./irs_pdfs --resume
"""

import os
import re
import json
import time
import argparse
import pymupdf4llm
import fitz
import anthropic


# =============================================================================
# Top 100 most widely used IRS PDFs (curated by filing volume & taxpayer impact)
# First 80 → train_top100.jsonl | Last 20 → test_top100.jsonl
# =============================================================================

TOP_100_PDFS = [
    # --- Individual Income Tax (1040 family) ---
    "f1040.pdf",       # Form 1040 - Core individual income tax return (~150M filed)
    "f1040sr.pdf",     # 1040-SR - U.S. Tax Return for Seniors 65+
    "f1040x.pdf",      # 1040-X - Amended U.S. Individual Income Tax Return
    "f1040es.pdf",     # 1040-ES - Estimated Tax for Individuals
    "f1040v.pdf",      # 1040-V - Payment Voucher
    "f1040sa.pdf",     # Schedule A - Itemized Deductions
    "f1040sb.pdf",     # Schedule B - Interest and Ordinary Dividends
    "f1040sc.pdf",     # Schedule C - Profit or Loss From Business (Self-Employed)
    "f1040sd.pdf",     # Schedule D - Capital Gains and Losses
    "f1040se.pdf",     # Schedule E - Supplemental Income and Loss
    "f1040sse.pdf",    # Schedule SE - Self-Employment Tax
    "f1040s1.pdf",     # Schedule 1 - Additional Income and Adjustments
    "f1040s2.pdf",     # Schedule 2 - Additional Taxes
    "f1040s3.pdf",     # Schedule 3 - Additional Credits and Payments

    # --- W-Forms ---
    "fw2.pdf",         # W-2 - Wage and Tax Statement (~250M issued annually)
    "fw3.pdf",         # W-3 - Transmittal of Wage and Tax Statements
    "fw4.pdf",         # W-4 - Employee's Withholding Certificate
    "fw9.pdf",         # W-9 - Request for Taxpayer Identification Number
    "fw8ben.pdf",      # W-8BEN - Certificate of Foreign Status (Beneficial Owner)
    "fw7.pdf",         # W-7 - Application for IRS Individual Taxpayer ID (ITIN)
    "fw2c.pdf",        # W-2c - Corrected Wage and Tax Statement
    "fw4p.pdf",        # W-4P - Withholding Certificate for Periodic Pension Payments

    # --- Employment / Payroll ---
    "f940.pdf",        # 940 - Employer's Annual Federal Unemployment (FUTA) Tax Return
    "f941x.pdf",       # 941-X - Adjusted Employer's Quarterly Federal Tax Return
    "f944.pdf",        # 944 - Employer's Annual Federal Tax Return
    "f945.pdf",        # 945 - Annual Return of Withheld Federal Income Tax
    "f943.pdf",        # 943 - Employer's Return for Agricultural Employees

    # --- Estates & Trusts ---
    "f1041.pdf",       # 1041 - U.S. Income Tax Return for Estates and Trusts
    "f1041es.pdf",     # 1041-ES - Estimated Income Tax for Estates and Trusts

    # --- Exempt Organizations ---
    "f990.pdf",        # 990 - Return of Organization Exempt From Income Tax
    "f990ez.pdf",      # 990-EZ - Short Form Exempt Organization Return
    "f990pf.pdf",      # 990-PF - Return of Private Foundation
    "f990t.pdf",       # 990-T - Exempt Organization Business Income Tax Return

    # --- High-Volume Individual Forms ---
    "f9465.pdf",       # 9465 - Installment Agreement Request
    "f982.pdf",        # 982 - Reduction of Tax Attributes (Debt Discharge/Forgiveness)
    "f843.pdf",        # 843 - Claim for Refund and Request for Abatement
    "f8879.pdf",       # 8879 - IRS e-file Signature Authorization
    "f8962.pdf",       # 8962 - Premium Tax Credit (ACA Marketplace Health Insurance)
    "f8949.pdf",       # 8949 - Sales and Other Dispositions of Capital Assets
    "f8606.pdf",       # 8606 - Nondeductible IRAs
    "f8863.pdf",       # 8863 - Education Credits (American Opportunity & Lifetime Learning)
    "f8889.pdf",       # 8889 - Health Savings Accounts (HSAs)
    "f8880.pdf",       # 8880 - Credit for Qualified Retirement Savings Contributions
    "f8822.pdf",       # 8822 - Change of Address
    "f8822b.pdf",      # 8822-B - Change of Address or Responsible Party (Business)
    "f8821.pdf",       # 8821 - Tax Information Authorization
    "f8829.pdf",       # 8829 - Expenses for Business Use of Your Home
    "f8832.pdf",       # 8832 - Entity Classification Election (LLC elections)
    "f8862.pdf",       # 8862 - Information to Claim Earned Income Credit After Disallowance
    "f8867.pdf",       # 8867 - Paid Preparer's Earned Income Credit Checklist
    "f8868.pdf",       # 8868 - Application for Automatic Extension (Exempt Orgs)
    "f8888.pdf",       # 8888 - Allocation of Refund (Including Savings Bond Purchases)
    "f8915f.pdf",      # 8915-F - Qualified Disaster Retirement Plan Distributions
    "f8919.pdf",       # 8919 - Uncollected Social Security and Medicare Tax on Wages
    "f8960.pdf",       # 8960 - Net Investment Income Tax (3.8% NIIT)
    "f8959.pdf",       # 8959 - Additional Medicare Tax (0.9%)
    "f8958.pdf",       # 8958 - Allocation of Tax Between Individuals in Community Property
    "f8857.pdf",       # 8857 - Request for Innocent Spouse Relief
    "f8839.pdf",       # 8839 - Adoption Credit and Employer-Provided Adoption Benefits
    "f8843.pdf",       # 8843 - Statement for Exempt Individuals (Foreign Students/Scholars)
    "f8815.pdf",       # 8815 - Exclusion of Interest From Series EE and I U.S. Savings Bonds
    "f8814.pdf",       # 8814 - Parent's Election to Report Child's Interest and Dividends
    "f8801.pdf",       # 8801 - Credit for Prior Year Minimum Tax
    "f8582.pdf",       # 8582 - Passive Activity Loss Limitations
    "f8824.pdf",       # 8824 - Like-Kind Exchanges (Section 1031 Real Estate)
    "f8825.pdf",       # 8825 - Rental Real Estate Income and Expenses
    "f8833.pdf",       # 8833 - Treaty-Based Return Position Disclosure
    "f8840.pdf",       # 8840 - Closer Connection Exception Statement for Aliens
    "f8802.pdf",       # 8802 - Application for United States Residency Certification
    "f8300.pdf",       # 8300 - Report of Cash Payments Over $10,000
    "f8886.pdf",       # 8886 - Reportable Transaction Disclosure Statement

    # --- Tax Cuts & Jobs Act / Modern Forms ---
    "f8995.pdf",       # 8995 - Qualified Business Income (QBI) Deduction Simplified
    "f8995a.pdf",      # 8995-A - Qualified Business Income Deduction (Complex)
    "f8990.pdf",       # 8990 - Limitation on Business Interest Expense (Section 163(j))
    "f8936.pdf",       # 8936 - Clean Vehicle Credits (Electric Vehicle Tax Credit)
    "f8911.pdf",       # 8911 - Alternative Fuel Vehicle Refueling Property Credit
    "f8941.pdf",       # 8941 - Credit for Small Employer Health Insurance Premiums
    "f8974.pdf",       # 8974 - Qualified Small Business Payroll Tax Credit (R&D)
    "f8994.pdf",       # 8994 - Employer Credit for Paid Family and Medical Leave

    # --- International / Withholding ---
    "f8858.pdf",       # 8858 - Information Return of U.S. Persons re Foreign Disregarded Entities
    "f8865.pdf",       # 8865 - Return of U.S. Persons With Respect to Foreign Partnerships
    "f8938.pdf",       # 8938 - Statement of Specified Foreign Financial Assets (FATCA)
    "f8992.pdf",       # 8992 - U.S. Shareholder Calculation of GILTI
    "f8993.pdf",       # 8993 - Foreign-Derived Intangible Income (FDII) Deduction
    "f8991.pdf",       # 8991 - Tax on Base Erosion Payments of Taxpayers (BEAT)

    # --- Other Frequently Filed ---
    "f8917.pdf",       # 8917 - Tuition and Fees Deduction
    "f8396.pdf",       # 8396 - Mortgage Interest Credit
    "f8835.pdf",       # 8835 - Renewable Electricity, Refined Coal, Indian Coal Credit
    "f966.pdf",        # 966 - Corporate Dissolution or Liquidation
    "f926.pdf",        # 926 - Return by a U.S. Transferor of Property to a Foreign Corp

    # --- Key Publications (most downloaded / read) ---
    "p17.pdf",         # Pub 17 - Your Federal Income Tax (most read IRS publication)
    "p15.pdf",         # Pub 15 - Employer's Tax Guide (Circular E)
    "p15b.pdf",        # Pub 15-B - Employer's Tax Guide to Fringe Benefits
    "p501.pdf",        # Pub 501 - Dependents, Standard Deduction, and Filing Information
    "p502.pdf",        # Pub 502 - Medical and Dental Expenses
    "p503.pdf",        # Pub 503 - Child and Dependent Care Expenses
    "p505.pdf",        # Pub 505 - Tax Withholding and Estimated Tax
    "p523.pdf",        # Pub 523 - Selling Your Home (capital gains exclusion)
    "p526.pdf",        # Pub 526 - Charitable Contributions
    "p590a.pdf",       # Pub 590-A - Contributions to Individual Retirement Arrangements
    "p590b.pdf",       # Pub 590-B - Distributions from Individual Retirement Arrangements
    "p596.pdf",        # Pub 596 - Earned Income Credit (EIC)
    "p969.pdf",        # Pub 969 - Health Savings Accounts and Other Tax-Favored Health Plans
    "p970.pdf",        # Pub 970 - Tax Benefits for Education
]

# First 80 → training, last 20 → test
TRAIN_PDFS = set(TOP_100_PDFS[:80])
TEST_PDFS  = set(TOP_100_PDFS[80:])


# =============================================================================
# Helpers (same as generate_qa_claude.py)
# =============================================================================

def load_dotenv(path=".env"):
    if not os.path.exists(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


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
    m = re.match(r"^p(\d+)([a-z]*)$", base, re.IGNORECASE)
    if m:
        suffix = m.group(2).upper()
        return f"Publication {m.group(1)}{('-' + suffix) if suffix else ''}"
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
# Claude Q&A generation
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
{{"messages": [{{"role": "system", "content": "You are an IRS tax documentation expert. Answer using IRS publications and forms when possible. Be precise and concise."}}, {{"role": "user", "content": "question naming {form_name} here"}}, {{"role": "assistant", "content": "answer here"}}]}}"""


def generate_qa_claude(client, form_name, md_content, model):
    system = SYSTEM_PROMPT.replace("{form_name}", form_name)
    user_msg = f"Generate Q&A training pairs from this IRS document about {form_name}:\n\n{md_content}"

    response = client.messages.create(
        model=model,
        max_tokens=4096,
        system=system,
        messages=[{"role": "user", "content": user_msg}],
    )

    content = response.content[0].text
    in_tok = response.usage.input_tokens
    out_tok = response.usage.output_tokens
    stop = response.stop_reason
    return content, in_tok, out_tok, stop


def parse_qa_output(raw_output, form_name):
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
                q = user_msg["content"].rstrip("?")
                user_msg["content"] = f"According to {form_name}, {q[0].lower() + q[1:]}?"
            if not any(m.get("role") == "system" for m in msgs):
                msgs.insert(0, {
                    "role": "system",
                    "content": "You are an IRS tax documentation expert. Answer using IRS publications and forms when possible. Be precise and concise."
                })
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
# Main
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="IRS Top-100 PDF → Q&A Generator (Claude Haiku)")
    parser.add_argument("--pdf_dir",   default="./irs_pdfs",             help="Folder with IRS PDFs")
    parser.add_argument("--train_out", default="train_top100.jsonl",      help="Training output file (first 80 PDFs)")
    parser.add_argument("--test_out",  default="test_top100.jsonl",       help="Test output file (last 20 PDFs)")
    parser.add_argument("--model",     default="claude-haiku-4-5",        help="Claude model to use")
    parser.add_argument("--max_chars", type=int, default=12000,           help="Max chars extracted per PDF")
    parser.add_argument("--resume",    action="store_true",               help="Skip already-processed files")
    args = parser.parse_args()

    load_dotenv()

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY not set.  export ANTHROPIC_API_KEY=sk-ant-...")
        return

    client = anthropic.Anthropic(api_key=api_key)

    # Verify API key
    print("Verifying Anthropic API key...", flush=True)
    try:
        client.messages.create(model=args.model, max_tokens=10, messages=[{"role": "user", "content": "hi"}])
        print(f"  OK — {args.model} is reachable", flush=True)
    except Exception as e:
        print(f"  ERROR: {e}")
        return

    # Filter to PDFs that exist on disk
    available = set(os.listdir(args.pdf_dir))
    todo_list = [fn for fn in TOP_100_PDFS if fn in available]
    missing   = [fn for fn in TOP_100_PDFS if fn not in available]

    print(f"\nTop-100 list: {len(TOP_100_PDFS)} entries")
    print(f"  Found on disk : {len(todo_list)}")
    print(f"  Missing       : {len(missing)}")
    if missing:
        for fn in missing:
            print(f"    MISSING: {fn}")

    # Resume: load already-processed filenames from both progress files
    processed = set()
    progress_file_path = args.train_out + ".progress"
    if args.resume and os.path.exists(progress_file_path):
        with open(progress_file_path) as pf:
            processed = set(line.strip() for line in pf)
        print(f"\nResuming: {len(processed)} already done, {len(todo_list)-len(processed)} remaining")

    todo = [fn for fn in todo_list if fn not in processed]
    print(f"\nProcessing {len(todo)} PDFs with {args.model}...")
    print(f"  Train split   : {len([f for f in todo if f in TRAIN_PDFS])} PDFs → {args.train_out}")
    print(f"  Test split    : {len([f for f in todo if f in TEST_PDFS])} PDFs → {args.test_out}")
    print()

    total_pairs = 0
    total_in_tok = 0
    total_out_tok = 0
    failed = []
    start_time = time.time()

    with open(args.train_out, "a") as train_f, \
         open(args.test_out,  "a") as test_f,  \
         open(progress_file_path, "a") as prog_f:

        for seq, filename in enumerate(todo, start=1):
            pdf_path = os.path.join(args.pdf_dir, filename)
            is_test  = filename in TEST_PDFS
            split_label = "TEST " if is_test else "TRAIN"
            file_start = time.time()

            print(f"[{seq}/{len(todo)}] [{split_label}] {filename}", flush=True)

            form_name = extract_form_name(pdf_path, filename)
            print(f"  Form name  : {form_name}", flush=True)

            t0 = time.time()
            md_content = extract_pdf_markdown(pdf_path, max_chars=args.max_chars)
            truncated = " (truncated)" if "[Document truncated...]" in md_content else ""
            print(f"  Extracted  : {len(md_content):,} chars in {time.time()-t0:.1f}s{truncated}", flush=True)

            if len(md_content.strip()) < 100:
                print("  SKIP       : too little text", flush=True)
                failed.append((filename, "too little text"))
                print()
                continue

            try:
                print(f"  LLM call   : {args.model} ...", flush=True)
                t0 = time.time()
                raw, in_tok, out_tok, stop = generate_qa_claude(client, form_name, md_content, args.model)
                llm_secs = time.time() - t0

                total_in_tok  += in_tok
                total_out_tok += out_tok
                cost = (total_in_tok / 1_000_000 * 0.80) + (total_out_tok / 1_000_000 * 4.00)

                print(f"  LLM done   : {llm_secs:.1f}s | in={in_tok} out={out_tok} stop={stop}", flush=True)
                if stop == "max_tokens":
                    print("  WARNING    : max_tokens hit — output may be cut off", flush=True)

                pairs = parse_qa_output(raw, form_name)

                if not pairs:
                    print("  WARN       : 0 valid pairs parsed", flush=True)
                    failed.append((filename, "no valid pairs parsed"))
                    print()
                    continue

                out_f = test_f if is_test else train_f
                for pair in pairs:
                    out_f.write(json.dumps(pair, ensure_ascii=False) + "\n")
                out_f.flush()
                prog_f.write(filename + "\n")
                prog_f.flush()

                total_pairs += len(pairs)
                elapsed = time.time() - start_time
                rate = seq / elapsed * 60
                eta_min = (len(todo) - seq) / (seq / elapsed) / 60 if seq > 0 else 0

                print(
                    f"  Result     : {len(pairs)} pairs → {split_label} | "
                    f"total {total_pairs} pairs | {rate:.1f} files/min | "
                    f"ETA ~{eta_min:.0f}min | cost ~${cost:.3f}",
                    flush=True,
                )

            except anthropic.RateLimitError as e:
                wait = 60
                print(f"  RATE LIMIT : sleeping {wait}s... ({e})", flush=True)
                time.sleep(wait)
                failed.append((filename, f"rate limit: {e}"))
            except Exception as e:
                print(f"  ERROR      : {e}", flush=True)
                failed.append((filename, str(e)))

            print()

    # Summary
    elapsed = time.time() - start_time
    final_cost = (total_in_tok / 1_000_000 * 0.80) + (total_out_tok / 1_000_000 * 4.00)
    train_count = sum(1 for fn in todo_list if fn in TRAIN_PDFS and fn not in [f for f, _ in failed])
    test_count  = sum(1 for fn in todo_list if fn in TEST_PDFS  and fn not in [f for f, _ in failed])

    print("=" * 60)
    print("DONE")
    print(f"  PDFs processed : {len(todo) - len(failed)}/{len(todo)}")
    print(f"  Total Q&A pairs: {total_pairs}")
    print(f"  Train file     : {args.train_out}  ({train_count} PDFs)")
    print(f"  Test file      : {args.test_out}   ({test_count} PDFs)")
    print(f"  Time           : {elapsed/60:.1f} minutes")
    print(f"  Tokens used    : {total_in_tok:,} input / {total_out_tok:,} output")
    print(f"  Estimated cost : ~${final_cost:.3f}")
    print(f"  Failed         : {len(failed)}")
    if failed:
        for fname, reason in failed[:20]:
            print(f"    - {fname}: {reason}")
        with open("failed_pdfs_top100.json", "w") as f:
            json.dump(failed, f, indent=2)
        print("  Failed list saved to failed_pdfs_top100.json")
    print("=" * 60)


if __name__ == "__main__":
    main()
