# Demo Script — Browser-Based LLM with Near-Zero Inference Cost
**30 min total: 15 min demo + 15 min Q&A · Audience: AI technical folks**

---

## The one-line pitch

> "Every chatbot you ship today has a meter running — every token costs money. I'm going to show you an app where the meter reads zero: the model runs on the user's own GPU, inside the browser tab, with no install and no API key."

Say "near-zero **marginal inference** cost" — not "free." You still pay static hosting and the user pays a one-time model download. Technical people will respect the precision; "free" invites nitpicking.

---

## Pre-demo checklist (do tonight, not tomorrow morning)

1. **Warm the model cache.** Open the deployed app AND localhost on the demo machine, let the full weight download finish. Second load is from IndexedDB — seconds, not minutes.
2. **Arena defaults to the CLOUD backend** (`model.js` sends users to Workers AI unless WebGPU is forced). For a zero-cost pitch this is a live grenade — someone will open DevTools and see network calls. Force the WebGPU toggle in the arena UI before the demo and confirm `sessionStorage['arena.backend'] === 'webgpu'`.
3. Check `chrome://gpu` shows WebGPU hardware acceleration on the demo machine.
4. Have a backup: screen-recording of the full flow, in case of hotel/office Wi-Fi or a driver surprise.
5. Open these tabs in order: `index.html` (tax POC) → DevTools Network panel → `arena.html` → `empirical/report.md` rendered (or the viewer).
6. Close everything else. 2B model + Chrome + screen share competes for the same GPU/RAM.

---

## 15-minute demo flow

### Minute 0–2 — Hook + the architecture in one breath

Open the tax POC. While it loads from cache, give the architecture:

> "Gemma 4 E2B, 2 billion params, quantized to q4f16 — about 1.5 GB. Served as static files. Transformers.js runs it through ONNX Runtime Web on WebGPU. The 'server' is an nginx container that serves HTML — it has never seen a single prompt."

Key framing for this audience: **this is a static site**. There is no inference backend to scale, secure, or pay for.

### Minute 2–5 — Tax POC: constrained RAG, not a free-roaming chatbot

1. Pick W-2. Ask a question from the form's domain ("What goes in Box 12?").
2. Point at the answer's **source attribution** — the model tags `Source: Q&A` vs `Source: Model`. Explain the design: per-form Q&A (generated from the actual IRS PDFs via a Claude Haiku pipeline) is injected into the system prompt. Form-keyed lookup, deliberately simple — no vector DB to host (that would be another server, another cost).
3. Ask something out of scope ("Who won the World Cup?"). It refuses. Say the number: **100% out-of-scope refusal across all 8 forms in our eval** — for a small model, the guardrails are the story, and you'll come back to this in the empirical section.

### Minute 5–6 — The money shot: the Network tab

DevTools → Network → ask another question.

> "Watch the network panel while it generates. Nothing. Zero requests. The tokens are being produced by the GPU in this laptop. This conversation costs me nothing, and the user's data — which on this app is *tax data* — never left the machine."

This 60 seconds is the whole pitch. Privacy and cost are the same demo.

### Minute 6–11 — Arena: small models can be agents

Open `arena.html` (WebGPU forced!).

1. **Chart Stitcher** (2 min): "render a bar chart of monthly sales." Narrate the tool-call trace as it streams: list_components → get_dataset → render → finish. Explain the protocol in one line: "Fenced-JSON tool calls, parsed with a regex, executed in plain JS, result fed back as a message. No function-calling API, no SDK — the whole agent loop is 190 lines you can read."
2. **Form Filler** (2 min): "I made $85k at Acme Corp" → model fills the W-2 via `set_field` calls. This is the enterprise use case: agentic form completion with zero per-action cost.
3. **PII Prevention** (1 min): show PII detected and redacted *before* the model sees it. Frame: "And since the model is local anyway, even the redaction failure mode stays on-device."

Pick the example you've rehearsed most; cut Form Filler if running long. Never run an example for the first time live.

### Minute 11–14 — Empirical results (see framing section below)

Show the comparison table from `empirical/report.md`. Tell the three-model story: quality clusters, behavior differentiates, Gemma wins on the metrics that matter for this domain.

### Minute 14–15 — Close with the cost curve

> "API chatbot: cost grows linearly with usage — every user, every message, forever. This: cost is flat — static hosting, pennies. The user brings the compute. For high-volume, low-stakes assistance — form help, FAQ deflection, field explanations — the economics aren't 10% better, they're a different shape."

Mention the WebView2 desktop host as a one-liner: one shared model cache across every app on the machine — download once, every app benefits.

---

## How to present the empirical analysis

**Do not skip it and do not apologize for it.** A technical audience trusts you *more* when you show an eval harness with honest caveats. The trick is leading with the right metric, not hiding the weak one.

### The setup (30 seconds)

> "We built an eval harness that runs the same Transformers.js pipeline as the browser — not a different stack. Three browser-runnable models, same IRS Q&A data, three modes: grounded (answer only from context or refuse), mixed (context + general knowledge, must attribute), and model-only."

### The narrative (this is the honest spin)

> "First finding: on raw semantic quality, small models cluster. BERTScore F1 is 0.95 for all three — Gemma 4 E2B, Llama 3.2 1B, SmolLM2 1.7B. At 1–2B params, generic answer quality won't differentiate your model choice.
>
> Second finding — and this is the one that matters: **behavior** differentiates wildly. SmolLM2 has the best raw scores but only 7.5% source attribution and a 2.5% refusal rate in grounded mode — it confidently answers everything, including things it shouldn't. Gemma: perfect source attribution, 100% out-of-scope refusal. For a domain like tax, the question isn't 'which model writes the prettiest answer,' it's 'which model knows what it doesn't know.' That's why Gemma is pinned."

This turns "results are not great" into "we measured the right thing." Every claim above is true from `empirical/report.md`.

### Handling the weak numbers if probed

- **"Your ROUGE-L is only ~0.2."** True, and it's why ROUGE was demoted. ROUGE-L is lexical overlap — it punishes paraphrase. The model rephrases correct content, so we moved to BERTScore (semantic similarity) as primary, where scores are ~0.95. Keep faithfulness (0.91 grounded) as the lexical complement. This is a methodologically standard move — own it confidently.
- **"2.5 tokens/sec?"** That's the Node **CPU proxy** run — quality numbers are honest, perf numbers explicitly are not browser numbers. Real perf is WebGPU on the user's GPU; that's what the live demo shows. (If you have browser-run numbers from `empirical/browser/`, quote those instead.)
- **"Faithfulness drops to 0.80 in model-only mode."** Yes — that's exactly the argument for the grounded/RAG design. We don't ship model-only mode; we ship injected context plus refusal.

### The "different use cases" pivot (memorize this paragraph)

> "Let me be direct about where this fits. A 2B quantized model is not a frontier model, and we don't position it as one. It's the wrong tool for authoritative tax advice or complex multi-form reasoning. It's the *right* tool where the economics dominate: high-volume, low-stakes assistance — field-level help, FAQ deflection, form pre-filling, PII pre-screening, offline or air-gapped environments, privacy-sensitive data. The pattern is a tiered architecture: the free local model handles the 80% of interactions that are simple, and you escalate the hard 20% to a frontier API. Your inference bill shrinks by whatever the local tier absorbs."

This is the strongest possible honest framing: you're not defending weak results, you're presenting a routing architecture every AI engineer already believes in.

---

## Q&A prep — 12 likely questions

**Q1. How does quality compare to GPT/Claude/Gemini?**
It doesn't, and that's not the claim. A 2B q4 model loses to frontier models on open-ended quality. The claim: for constrained, grounded tasks with injected context, it's good enough — 0.91 faithfulness, perfect attribution — at zero marginal cost. Tiered routing: local first, escalate when needed.

**Q2. Hallucinations on tax topics — isn't that a liability?**
Three mitigations: grounded mode answers only from vetted Q&A or refuses (100% OOS refusal in eval); answers carry source tags (`Q&A` vs `Model`); known-issues warnings rendered per form deterministically, not by the model. Plus this is positioned as form *help*, not tax *advice*.

**Q3. What are the device requirements?**
Chrome/Edge 113+ with WebGPU, a reasonable GPU, ~1.5 GB download, a few GB RAM headroom. Mobile is explicitly gated out today. That's exactly why the arena has a cloud fallback — heterogeneous fleets get hybrid routing: capable devices run free, weak devices hit the paid path. Fleet cost scales with the share of weak devices, not with usage.

**Q4. 1.5 GB download before first use — seriously?**
Once per device, then IndexedDB cache makes every later load near-instant. Enterprise answer: the WebView2 host points all apps at one shared cache — one download per *machine*, amortized across every app. Also viable: pre-seed via MDM/installer.

**Q5. Why Gemma 4 E2B and not Llama 3.2 or SmolLM2?**
Measured all three on identical data. Quality ties (~0.95 BERTScore); Gemma wins where it matters — source attribution 1.0 vs 0.075 (SmolLM2, grounded), OOS refusal 100% vs 10%. SmolLM2 is a confident hallucinator; wrong fit for this domain.

**Q6. Is the model fine-tuned on tax data?**
Not in production. We fine-tuned with Unsloth on Colab and pushed to HF, but Gemma 4 → ONNX export is blocked upstream (Optimum doesn't support the architecture yet; we have a patch attempt going and pinged HF). Meanwhile, injected per-form Q&A delivers the domain knowledge — and honestly, RAG-style injection updates faster than weights anyway (tax law changes yearly).

**Q7. Tool calling with a 2B model — how reliable?**
Pragmatic engineering: fenced-JSON protocol instead of native function-calling tokens (Transformers.js template support for `role:"tool"` is unstable), parse-retry budget, error results fed back so the model self-corrects, fallback hints (`next_step`) when it picks a non-existent component, recipes in the system prompt for known-hard cases. Demo'd live today. It's not 99.9% — for UI assembly and form filling, retry-with-feedback covers the gap.

**Q8. Why not just self-host an open model behind vLLM?**
That moves the cost, it doesn't remove it — you're still buying/renting GPUs that scale with load, plus ops. Browser inference shifts compute to hardware the user already owns and idles. Also: data residency for free — prompts never reach you.

**Q9. What about WebGPU support across browsers/fleets?**
Chrome/Edge solid since 113. Safari has it in preview (improving fast); Firefox behind a flag. The app gates unsupported browsers up front rather than failing silently, and the cloud fallback covers the rest. Enterprise fleets on Chrome/Edge are the realistic near-term target.

**Q10. Model updates — how do you ship a new version?**
Weights are versioned static assets on the HF CDN; bump the model ID, clients re-download once. Same story as shipping a big app update.

**Q11. What's actually "zero" here — be precise.**
Marginal inference cost: zero (user's GPU). Hosting: static files, pennies. Weight delivery: HF CDN today, your CDN egress if self-hosted. Cloud fallback path: paid per-request, only for incapable devices. One-time costs: data pipeline (~$ for Haiku Q&A generation) and eval runs.

**Q12. Can it run offline?**
After first load, inference is fully local — works with the network cable pulled (great demo if asked: toggle DevTools offline mode and generate). Full offline app needs a service worker for the static assets — straightforward, not done yet.

---

## Things NOT to say

- "The model is fine-tuned on IRS data" — it isn't (in production). Q6 is the honest version and it's a *better* story (you hit a real upstream gap and engineered around it).
- "Zero cost" without "marginal/inference" — invites the CDN/fallback gotcha.
- "The results weren't great" — never volunteer this framing. The eval found that behavior metrics differentiate where quality metrics don't. That's a finding, not a failure.
- Don't show the Node CPU tokens/sec table unprompted; if it's visible, preempt with "CPU proxy, quality-honest, perf-irrelevant."
