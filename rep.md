# Browser-Runnable LLMs vs Gemma 4 — Empirical Comparison

_Generated 2026-05-07T14:14:35.495Z_

## 1. Setup

Same eval harness as `measure/` (BERTScore F1, faithfulness, source attribution, refusal rate). BERTScore F1 chosen as primary quality metric — semantic similarity tolerant of paraphrase, well-suited to creative outputs. Three browser-runnable models compared on identical IRS form Q&A data.

### Models

| Label | Repo | Params (B) | dtype | Notes |
| --- | --- | --- | --- | --- |
| gemma-4-E2B | `onnx-community/gemma-4-E2B-it-ONNX` | 2.00 | q4f16 | Production baseline (pinned). Multimodal-capable, used text-only here. |
| llama-3.2-1B | `onnx-community/Llama-3.2-1B-Instruct` | 1.24 | q4f16 | Smaller peer. Decoder-only, AutoModelForCausalLM. |
| smollm2-1.7B | `HuggingFaceTB/SmolLM2-1.7B-Instruct` | 1.71 | q4f16 | Same-family-size peer. Decoder-only, AutoModelForCausalLM. |

### Modes
- **grounded** — model must answer ONLY from injected Q&A or refuse
- **mixed** — Q&A reference + general knowledge, attribution required
- **model** — no Q&A reference, model knowledge only

### Caveats
- **BERTScore F1** here uses `Xenova/bert-base-uncased` token embeddings with token-level greedy cosine matching, CLS/SEP excluded. No IDF weighting. Reference paper (Zhang et al. 2020) defaults to RoBERTa-large; we trade absolute scores for speed and reproducibility — **relative ranking between models is meaningful**, absolute values are not directly comparable to other BERTScore reports.
- **Node CPU runs** use ONNX Runtime CPU. Quality numbers are honest; perf numbers are PROXY only — they do **not** equate to browser WebGPU.
- **Browser WebGPU runs** are the real-world numbers. Hardware varies — GPU info captured per run.
- All models q4f16 quantised — fair size/quality tradeoff comparison.
- Faithfulness metric is a lexical proxy (% of answer content words found in injected Q&A context). Complements BERTScore.
- Source attribution scoring credits Q&A or Model tag in `mixed`, refusal in `grounded`.

## 2. Node CPU results (proxy perf)

### Quality — mode: `grounded`

| Model | BERTScore F1 | Faithfulness | Source Acc | Refusal Rate |
| --- | --- | --- | --- | --- |
| gemma-4-E2B | 0.951 | 0.912 | 1.000 | 0.675 |
| llama-3.2-1B | 0.946 | 0.894 | 0.975 | 0.975 |
| smollm2-1.7B | 0.954 | 0.933 | 0.075 | 0.025 |

### Quality — mode: `mixed`

| Model | BERTScore F1 | Faithfulness | Source Acc | Refusal Rate |
| --- | --- | --- | --- | --- |
| gemma-4-E2B | 0.951 | 0.872 | 0.875 | 0.100 |
| llama-3.2-1B | 0.921 | 0.869 | 0.050 | 0.500 |
| smollm2-1.7B | 0.955 | 0.917 | 0.825 | 0.000 |

### Quality — mode: `model`

| Model | BERTScore F1 | Faithfulness | Source Acc | Refusal Rate |
| --- | --- | --- | --- | --- |
| gemma-4-E2B | 0.948 | 0.797 | 1.000 | 0.000 |
| llama-3.2-1B | 0.953 | 0.916 | 1.000 | 0.000 |
| smollm2-1.7B | 0.955 | 0.913 | 1.000 | 0.000 |

### Performance

| Model | Load (s) | Mean first-token (ms) | Mean total (ms) | Mean TPS |
| --- | --- | --- | --- | --- |
| gemma-4-E2B | 4.3 | 10118 | 11753 | 2.5 |
| llama-3.2-1B | 3.4 | 4028 | 4999 | 3.3 |
| smollm2-1.7B | 1.4 | 16405 | 25099 | 2.4 |

### Out-of-scope refusal (grounded mode)

| Model | Refusal rate (avg over forms) |
| --- | --- |
| gemma-4-E2B | 100.0% |
| llama-3.2-1B | 90.0% |
| smollm2-1.7B | 10.0% |

## Node CPU — Verdict

- `grounded` best BERTScore F1: **smollm2-1.7B** (0.954)
- `grounded` best Faithfulness: **smollm2-1.7B** (0.933)
- `grounded` best Source Acc: **gemma-4-E2B** (1.000)
- `mixed` best BERTScore F1: **smollm2-1.7B** (0.955)
- `mixed` best Faithfulness: **smollm2-1.7B** (0.917)
- `mixed` best Source Acc: **gemma-4-E2B** (0.875)
- `model` best BERTScore F1: **smollm2-1.7B** (0.955)
- `model` best Faithfulness: **llama-3.2-1B** (0.916)
- `model` best Source Acc: **gemma-4-E2B** (1.000)
- Fastest first-token: **llama-3.2-1B** (4028 ms)
- Highest TPS: **llama-3.2-1B** (3.3)
- Fastest load: **smollm2-1.7B** (1.4 s)

## 4. Recommendation

Decision pending data — re-read this section after the run. The pinned production model (`onnx-community/gemma-4-E2B-it-ONNX`) stays unless the comparison surfaces a candidate that beats it on quality without violating the size budget.

## 5. Reproducibility

```bash
# Node (quality-honest, perf-proxy)
cd empirical && npm install
node evaluate_multi.mjs --mode all --oos

# Browser (real WebGPU perf)
# Serve repo root: e.g. `npx http-server . -p 8080` then open
# http://localhost:8080/empirical/browser/
# Click "Download JSON", drop it into empirical/results/browser/

# Rebuild this report
node aggregate.mjs
```
