#!/usr/bin/env python3
"""
IRS Q&A Evaluation Script
==========================
Evaluates Gemma 4 (onnx-community/gemma-4-E2B-it-ONNX) against the data.json
ground-truth Q&A pairs using the same prompts as the browser app (js/ai.js).

Metrics
-------
  ROUGE-L         Lexical n-gram overlap with reference answer
  BERTScore F1    Semantic similarity (language-model based)
  Faithfulness    Lexical proxy: % of content words appearing in injected context
  Source acc.     Did the model correctly emit "Source: Q&A" vs "Source: Model"
  Refusal rate    Grounded mode: does it refuse out-of-scope questions

Modes (mirrors the browser chat panel)
---------------------------------------
  grounded  Only the injected Q&A — refuse if not found
  mixed     Q&A preferred + model knowledge allowed  (default)
  model     No Q&A injected — free general knowledge

Usage
-----
  cd measure/
  uv run evaluate_qa.py                           # all forms, 5 Qs each, mixed mode
  uv run evaluate_qa.py --forms W-2 1040         # specific forms
  uv run evaluate_qa.py --n 10 --mode grounded   # more questions, grounded only
  uv run evaluate_qa.py --mode all               # run all three modes
  uv run evaluate_qa.py --oos                    # also test out-of-scope refusal
  uv run evaluate_qa.py --verbose                # print each Q&A exchange
"""

import argparse
import json
import random
import re
import sys
from pathlib import Path
from typing import Literal

import pandas as pd
from rich.console import Console
from rich.table import Table

from huggingface_hub import login
HF_TOKEN = "replace"
login(HF_TOKEN)
console = Console()

# ── Constants ─────────────────────────────────────────────────────────────────
MODEL_ID      = "onnx-community/gemma-4-E2B-it-ONNX"   # ONNX weights (browser app)
BASE_MODEL_ID = "google/gemma-4-e2b-it"                 # base PyTorch weights + processor
DATA_PATH = Path(__file__).parent.parent / "data.json"

# Out-of-scope questions to probe refusal in grounded mode
OOS_QUESTIONS = [
    "What is the approximate federal tax filing deadline?",
    "Can I deduct my home office on this form?",
    "What is the penalty for late filing in California?",
    "How much is the standard deduction for 2025?",
    "What is the child tax credit amount?",
]

Mode = Literal["grounded", "mixed", "model"]

# ── Model loading ─────────────────────────────────────────────────────────────
def load_model():
    """
    Load Gemma 4 using the same classes as the browser app (Transformers.js).
    Dev transformers has Gemma4ForConditionalGeneration + AutoProcessor for Gemma 4.
    Falls back to AutoModelForCausalLM if the specific class isn't registered yet.
    """
    console.print(f"[dim]Loading from: {BASE_MODEL_ID}[/]")

    # Attempt 1: exact same classes as js/ai.js (dev transformers)
    try:
        from transformers import AutoProcessor, Gemma4ForConditionalGeneration
        processor = AutoProcessor.from_pretrained(BASE_MODEL_ID, token=HF_TOKEN)
        console.print("[dim]AutoProcessor loaded[/]")
        model = Gemma4ForConditionalGeneration.from_pretrained(
            BASE_MODEL_ID,
            token=HF_TOKEN,
            torch_dtype="auto",
            device_map="auto",
        )
        console.print("[green]✓ Gemma4ForConditionalGeneration loaded (matches browser)[/]")
        return model, processor
    except (ImportError, AttributeError) as e:
        console.print(f"[yellow]Gemma4ForConditionalGeneration not available: {e}[/]")
    except Exception as e:
        console.print(f"[yellow]Primary load failed ({type(e).__name__}): {e}[/]")

    # Attempt 2: AutoModelForCausalLM fallback
    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
        processor = AutoTokenizer.from_pretrained(BASE_MODEL_ID, token=HF_TOKEN, use_fast=True)
        model = AutoModelForCausalLM.from_pretrained(
            BASE_MODEL_ID, token=HF_TOKEN,
            torch_dtype=torch.bfloat16, device_map="auto",
        )
        console.print("[green]✓ Model loaded via AutoModelForCausalLM[/]")
        return model, processor
    except Exception as e:
        console.print(f"[red]Model load failed: {e}[/]")
        sys.exit(1)


# ── Data loading ──────────────────────────────────────────────────────────────
def load_data() -> dict[str, list[dict]]:
    """Return {formName: [{question, answer}, …]} from data.json."""
    raw = json.loads(DATA_PATH.read_text())
    return {entry["formName"]: entry["qa"] for entry in raw["data"]}


# ── Prompt construction (mirrors js/ai.js chatWithForm) ───────────────────────
def build_messages(
    form_key: str,
    qa_pairs: list[dict],
    user_message: str,
    mode: Mode,
) -> list[dict]:
    """Build the message list exactly as js/ai.js does for each mode."""

    if mode == "model":
        system = (
            f"You are a knowledgeable IRS tax assistant. "
            f"Answer questions about US tax forms, deadlines, regulations, and tax preparation "
            f"using your general training knowledge. Be concise — 2–4 sentences. "
            f"If you genuinely do not know, say so briefly."
        )
        few_shot: list[dict] = []

    else:
        qa_text = "\n\n".join(
            f"Q{i+1}: {p['question']}\nA{i+1}: {p['answer']}"
            for i, p in enumerate(qa_pairs[:20])
        )
        ref_block = f"--- REFERENCE Q&A ---\n{qa_text}\n--- END REFERENCE ---"

        if mode == "grounded":
            system = (
                f"You are an IRS tax assistant for Form {form_key}. "
                f"You ONLY answer using the verified Q&A reference below — do not use outside knowledge.\n\n"
                f"{ref_block}\n\n"
                f"Rules:\n"
                f"1. If the answer is clearly in the reference, answer concisely (2–4 sentences) "
                f'and end with "Source: Q&A".\n'
                f"2. If the answer is NOT in the reference, respond ONLY with: "
                f'"I don\'t have information on that for Form {form_key}."\n'
                f"3. NEVER use outside knowledge. NEVER guess."
            )
            few_shot = [
                {"role": "user", "content": "What goes in Box 99?"},
                {
                    "role": "assistant",
                    "content": f"I don't have information on that for Form {form_key}.",
                },
            ]

        else:  # mixed
            system = (
                f"You are a helpful IRS tax assistant specialising in Form {form_key}. "
                f"You have access to verified Q&A reference data below, and you may also use your general tax knowledge.\n\n"
                f"{ref_block}\n\n"
                f"Rules:\n"
                f"1. Prefer the reference Q&A. You may supplement with general tax knowledge.\n"
                f'2. If the answer comes from the reference, end with "Source: Q&A".\n'
                f'3. If the answer comes from your general knowledge, end with "Source: Model".\n'
                f'4. If you cannot answer, respond ONLY with: "I don\'t have information on that."\n'
                f"5. Be concise — 2–4 sentences."
            )
            few_shot = [
                {
                    "role": "user",
                    "content": "What is the standard tax filing deadline?",
                },
                {
                    "role": "assistant",
                    "content": "The standard federal income tax filing deadline is April 15th. Source: Model",
                },
                {
                    "role": "user",
                    "content": "What goes in Box 99 of this form?",
                },
                {"role": "assistant", "content": "I don't have information on that."},
            ]

    return [
        {"role": "system", "content": system},
        *few_shot,
        {"role": "user", "content": user_message},
    ]


# ── Inference ─────────────────────────────────────────────────────────────────
def run_inference(model, processor, messages: list[dict], max_new_tokens: int = 200) -> str:
    """Run one chat turn and return the generated assistant text."""
    import torch

    inputs = processor.apply_chat_template(
        messages,
        tokenize=True,
        add_generation_prompt=True,
        return_dict=True,
        return_tensors="pt",
    )

    # Move to model's device if possible
    try:
        device = next(model.parameters()).device
        inputs = {k: v.to(device) for k, v in inputs.items()}
    except (StopIteration, AttributeError):
        pass

    with torch.no_grad():
        output_ids = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            do_sample=False,
        )

    prompt_len = inputs["input_ids"].shape[1]
    new_tokens = output_ids[:, prompt_len:]
    tok = getattr(processor, "tokenizer", processor)
    return tok.decode(new_tokens[0], skip_special_tokens=True).strip()


# ── Helpers ───────────────────────────────────────────────────────────────────
def strip_source_tag(text: str) -> tuple[str, str | None]:
    """Return (clean_text, 'Q&A'|'Model'|None)."""
    m = re.search(r"\s*Source:\s*(Q&A|Model)\s*$", text, re.IGNORECASE)
    if m:
        return text[: m.start()].strip(), m.group(1).strip()
    return text.strip(), None


_STOP = frozenset(
    "the a an is in of and to for on this that it be are was i do not have information".split()
)


def faithfulness_score(answer: str, qa_pairs: list[dict]) -> float:
    """
    Lexical proxy for faithfulness.
    Measures what fraction of non-trivial answer words appear in the injected Q&A context.
    (A proper implementation would use cross-encoder NLI e.g. 'cross-encoder/nli-deberta-v3-base')
    """
    context = " ".join(
        f"{p['question']} {p['answer']}" for p in qa_pairs
    ).lower()
    words = re.findall(r"\b\w+\b", answer.lower())
    content = [w for w in words if w not in _STOP and len(w) > 2]
    if not content:
        return 1.0  # refusal phrases have no content words — considered faithful
    return sum(1 for w in content if w in context) / len(content)


REFUSAL_PATTERNS = re.compile(
    r"i (don't|do not) have information|i cannot answer|no information available",
    re.IGNORECASE,
)


def is_refusal(text: str) -> bool:
    return bool(REFUSAL_PATTERNS.search(text))


# ── Per-form evaluation ───────────────────────────────────────────────────────
def evaluate_form(
    model,
    processor,
    form_key: str,
    qa_pairs: list[dict],
    n: int,
    mode: Mode,
    rouge_metric,
    verbose: bool,
) -> dict | None:
    """Sample n questions from the form and return aggregate metrics."""
    sample = random.sample(qa_pairs, min(n, len(qa_pairs)))

    predictions: list[str] = []
    references: list[str] = []
    source_tags: list[str | None] = []
    faith_scores: list[float] = []
    refusals: list[bool] = []

    for pair in sample:
        messages = build_messages(form_key, qa_pairs, pair["question"], mode)
        try:
            raw = run_inference(model, processor, messages)
        except KeyboardInterrupt:
            sys.exit(0)
        except Exception as e:
            console.print(f"[red]Inference error on {form_key}: {e}[/]")
            continue

        clean, tag = strip_source_tag(raw)
        predictions.append(clean)
        references.append(pair["answer"])
        source_tags.append(tag)
        faith_scores.append(faithfulness_score(clean, qa_pairs))
        refusals.append(is_refusal(clean))

        if verbose:
            console.print(
                f"\n[bold cyan]{form_key}[/] [{mode}] | [dim]{pair['question'][:70]}[/]"
            )
            console.print(f" [green]Model:[/]  {clean[:120]}")
            console.print(f" [dim]Ref:[/]    {pair['answer'][:120]}")
            console.print(
                f" tag={tag or '—'}  faithful={faith_scores[-1]:.2f}  refusal={refusals[-1]}"
            )

    if not predictions:
        return None

    # ROUGE-L
    rouge_result = rouge_metric.compute(predictions=predictions, references=references)
    rouge_l = rouge_result["rougeL"]

    # BERTScore (uses DeBERTa under the hood — semantic similarity)
    console.print(f"    [dim]Computing BERTScore for {form_key}…[/]")
    from bert_score import score as bs

    _, _, F1 = bs(predictions, references, lang="en", verbose=False)
    bs_f1 = float(F1.mean())

    # Source attribution breakdown
    n_qa     = sum(1 for t in source_tags if t and t.upper() == "Q&A")
    n_model  = sum(1 for t in source_tags if t and t.upper() == "MODEL")
    n_none   = sum(1 for t in source_tags if t is None)

    # Source accuracy: grounded → should be Q&A or refusal; mixed → both fine; model → no tag expected
    if mode == "grounded":
        correct_source = n_qa + sum(refusals)  # Q&A tag OR proper refusal
        source_acc = correct_source / len(predictions)
    elif mode == "mixed":
        source_acc = (n_qa + n_model) / len(predictions)  # any tag is correct
    else:  # model only — no tag needed, just check it answered
        source_acc = (len(predictions) - sum(refusals)) / len(predictions)

    return {
        "form":         form_key,
        "mode":         mode,
        "n":            len(predictions),
        "rouge_l":      round(rouge_l, 4),
        "bertscore_f1": round(bs_f1, 4),
        "faithfulness": round(sum(faith_scores) / len(faith_scores), 4),
        "source_acc":   round(source_acc, 4),
        "tag_qa":       n_qa,
        "tag_model":    n_model,
        "tag_none":     n_none,
        "refusal_rate": round(sum(refusals) / len(refusals), 4),
    }


# ── Out-of-scope refusal test ─────────────────────────────────────────────────
def evaluate_oos_refusal(model, processor, form_key: str, qa_pairs: list[dict]) -> dict:
    """
    Test grounded-mode refusal on questions deliberately not in the Q&A corpus.
    Metric: % of OOS questions correctly refused.
    """
    correct = 0
    for q in OOS_QUESTIONS:
        messages = build_messages(form_key, qa_pairs, q, "grounded")
        raw = run_inference(model, processor, messages, max_new_tokens=60)
        clean, _ = strip_source_tag(raw)
        if is_refusal(clean):
            correct += 1
    return {
        "form": form_key,
        "oos_questions": len(OOS_QUESTIONS),
        "correctly_refused": correct,
        "refusal_rate": round(correct / len(OOS_QUESTIONS), 4),
    }


# ── Main ──────────────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Evaluate Gemma 4 ONNX on IRS Q&A data",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--forms", nargs="+", default=None,
        help="Form keys to evaluate (default: all). E.g. --forms W-2 1040"
    )
    parser.add_argument("--n", type=int, default=5, help="Questions per form (default: 5)")
    parser.add_argument(
        "--mode", choices=["grounded", "mixed", "model", "all"], default="mixed",
        help="Chat mode (default: mixed)"
    )
    parser.add_argument("--oos", action="store_true", help="Run out-of-scope refusal test (grounded mode)")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--out", type=str, default="results.json", help="Output JSON (default: results.json)")
    parser.add_argument("--verbose", action="store_true", help="Print each Q&A exchange")
    args = parser.parse_args()

    random.seed(args.seed)

    console.rule("[bold cyan]IRS Q&A Evaluator[/]")
    console.print(f"  Model : [cyan]{MODEL_ID}[/] (processor from {BASE_MODEL_ID})")
    console.print(f"  Data  : {DATA_PATH}")
    console.print(f"  Mode  : [yellow]{args.mode}[/]  |  n={args.n}  |  seed={args.seed}")

    # Load data
    data = load_data()
    forms = args.forms or list(data.keys())
    invalid = [f for f in forms if f not in data]
    if invalid:
        console.print(f"[red]Unknown forms: {invalid}[/]  Valid: {list(data.keys())}")
        sys.exit(1)
    console.print(f"  Forms : {forms}\n")

    # Load model
    model, processor = load_model()

    # Load ROUGE metric (fast, no downloads)
    import evaluate as hf_ev
    rouge_metric = hf_ev.load("rouge")

    modes: list[Mode] = (
        ["grounded", "mixed", "model"] if args.mode == "all" else [args.mode]  # type: ignore[list-item]
    )

    all_results: list[dict] = []

    for mode in modes:
        console.rule(f"Mode: [bold yellow]{mode}[/]")
        for form_key in forms:
            qa_pairs = data[form_key]
            console.print(
                f"  [cyan]{form_key}[/]  ({len(qa_pairs)} Q&A pairs total, sampling {min(args.n, len(qa_pairs))})"
            )
            row = evaluate_form(
                model, processor, form_key, qa_pairs, args.n, mode, rouge_metric, args.verbose
            )
            if row:
                all_results.append(row)
                console.print(
                    f"    ROUGE-L={row['rouge_l']:.3f}  "
                    f"BERTScore={row['bertscore_f1']:.3f}  "
                    f"Faithfulness={row['faithfulness']:.3f}  "
                    f"SourceAcc={row['source_acc']:.3f}  "
                    f"RefusalRate={row['refusal_rate']:.2f}"
                )

    # Out-of-scope refusal test
    oos_results: list[dict] = []
    if args.oos:
        console.rule("Out-of-Scope Refusal Test [grounded mode]")
        for form_key in forms:
            console.print(f"  OOS test for [cyan]{form_key}[/]…")
            oos_row = evaluate_oos_refusal(model, processor, form_key, data[form_key])
            oos_results.append(oos_row)
            console.print(
                f"    Refusal rate: {oos_row['correctly_refused']}/{oos_row['oos_questions']} "
                f"({oos_row['refusal_rate']:.0%})"
            )

    if not all_results:
        console.print("[red]No results collected.[/]")
        sys.exit(1)

    # ── Summary table ─────────────────────────────────────────────────────────
    df = pd.DataFrame(all_results)

    console.rule("[bold]Per-Form Results[/]")
    tbl = Table(show_header=True, header_style="bold cyan", show_lines=True)
    display_cols = ["form", "mode", "n", "rouge_l", "bertscore_f1", "faithfulness", "source_acc", "refusal_rate"]
    for col in display_cols:
        tbl.add_column(col)
    for _, row in df[display_cols].iterrows():
        tbl.add_row(*[str(v) for v in row])
    console.print(tbl)

    # ── Aggregates by mode ────────────────────────────────────────────────────
    console.rule("[bold]Aggregate by Mode (mean)[/]")
    agg_cols = ["rouge_l", "bertscore_f1", "faithfulness", "source_acc", "refusal_rate"]
    agg = df.groupby("mode")[agg_cols].mean().round(4)
    console.print(agg.to_string())

    # ── Metric guide ──────────────────────────────────────────────────────────
    console.rule("[dim]Metric Reference[/]")
    console.print("[dim]"
        "  ROUGE-L       > 0.40  = good lexical overlap\n"
        "  BERTScore F1  > 0.85  = good semantic similarity\n"
        "  Faithfulness  > 0.70  = answers grounded in context (lexical proxy)\n"
        "  SourceAcc     > 0.80  = model correctly attributes source\n"
        "  RefusalRate   ~0.00   = for in-scope questions (lower is better)\n"
        "                ~1.00   = for OOS in grounded mode (higher is better)[/]"
    )

    # ── Save ──────────────────────────────────────────────────────────────────
    out_path = Path(__file__).parent / args.out

    agg_cols = ["rouge_l", "bertscore_f1", "faithfulness", "source_acc", "refusal_rate"]
    agg_by_mode = (
        df.groupby("mode")[agg_cols].mean().round(4).to_dict(orient="index")
    )

    output = {
        "model": MODEL_ID,
        "seed": args.seed,
        "n_per_form": args.n,
        "forms_evaluated": forms,
        "per_form": all_results,
        "aggregate_by_mode": agg_by_mode,
    }
    if oos_results:
        output["oos_refusal"] = oos_results

    out_path.write_text(json.dumps(output, indent=2))
    console.print(f"\n[green]Results saved →[/] {out_path}")
    # Also pretty-print the aggregate to terminal
    console.print(json.dumps(agg_by_mode, indent=2))


if __name__ == "__main__":
    main()
