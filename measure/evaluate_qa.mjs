#!/usr/bin/env node
/**
 * IRS Q&A Evaluator — Node.js
 * ============================
 * Uses the exact same model + runtime as the browser app (Transformers.js ONNX).
 * 
 * Metrics:
 *   ROUGE-L       Lexical overlap with reference answer
 *   Faithfulness  % of answer words found in the injected Q&A context (lexical proxy)
 *   Source Acc    Correct "Source: Q&A" / "Source: Model" / refusal attribution
 *   Refusal Rate  Grounded: did it refuse out-of-scope questions?
 *
 * Usage:
 *   npm install
 *   node evaluate_qa.mjs                          # all forms, 5 Qs, mixed mode
 *   node evaluate_qa.mjs --forms W-2 1040         # specific forms
 *   node evaluate_qa.mjs --n 10 --mode grounded   # more Qs, strict grounded
 *   node evaluate_qa.mjs --mode all --oos          # all 3 modes + OOS refusal
 *   node evaluate_qa.mjs --verbose                 # print each Q&A exchange
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { pipeline, env,
  AutoProcessor,
  Gemma4ForConditionalGeneration,
  TextStreamer,
} from '@huggingface/transformers';

// ── Config ────────────────────────────────────────────────────────────────────
const MODEL_ID   = 'onnx-community/gemma-4-E2B-it-ONNX';
const DATA_PATH  = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data.json');
const HF_TOKEN   = 'replace';

// Set HF token for gated models
env.huggingface ??= {};
env.backends ??= {};

const OOS_QUESTIONS = [
  'What is the approximate federal tax filing deadline?',
  'Can I deduct my home office on this form?',
  'What is the penalty for late filing in California?',
  'How much is the standard deduction for 2025?',
  'What is the child tax credit amount?',
];

// ── CLI args ──────────────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { forms: null, n: 5, mode: 'mixed', oos: false, seed: 42,
                 out: 'results.json', verbose: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--forms') {
      opts.forms = [];
      while (args[i + 1] && !args[i + 1].startsWith('--')) opts.forms.push(args[++i]);
    } else if (args[i] === '--n')       opts.n       = +args[++i];
    else if (args[i] === '--mode')      opts.mode    = args[++i];
    else if (args[i] === '--seed')      opts.seed    = +args[++i];
    else if (args[i] === '--out')       opts.out     = args[++i];
    else if (args[i] === '--oos')       opts.oos     = true;
    else if (args[i] === '--verbose')   opts.verbose = true;
  }
  return opts;
}

// ── Seeded random sample ──────────────────────────────────────────────────────
function seededShuffle(arr, seed) {
  const a = [...arr];
  let s = seed;
  const rand = () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── ROUGE-L ───────────────────────────────────────────────────────────────────
function rougeL(pred, ref) {
  const p = pred.toLowerCase().split(/\s+/);
  const r = ref.toLowerCase().split(/\s+/);
  if (!p.length || !r.length) return 0;
  // LCS length via DP
  const dp = Array.from({ length: p.length + 1 }, () => new Array(r.length + 1).fill(0));
  for (let i = 1; i <= p.length; i++)
    for (let j = 1; j <= r.length; j++)
      dp[i][j] = p[i-1] === r[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);
  const lcs = dp[p.length][r.length];
  const prec = lcs / p.length;
  const rec  = lcs / r.length;
  return (prec + rec) === 0 ? 0 : (2 * prec * rec) / (prec + rec);
}

// ── Faithfulness (lexical proxy) ──────────────────────────────────────────────
const STOP = new Set('the a an is in of and to for on this that it be are was i do not have information'.split(' '));
function faithfulness(answer, qaPairs) {
  const context = qaPairs.map(p => `${p.question} ${p.answer}`).join(' ').toLowerCase();
  const words = answer.toLowerCase().match(/\b\w+\b/g) || [];
  const content = words.filter(w => !STOP.has(w) && w.length > 2);
  if (!content.length) return 1.0;
  return content.filter(w => context.includes(w)).length / content.length;
}

// ── Source tag parser ─────────────────────────────────────────────────────────
function stripSourceTag(text) {
  const m = text.match(/\s*Source:\s*(Q&A|Model)\s*$/i);
  if (m) return { text: text.slice(0, m.index).trim(), tag: m[1] };
  return { text: text.trim(), tag: null };
}

const REFUSAL_RE = /i (don't|do not) have information|i cannot answer|no information available/i;
const isRefusal = t => REFUSAL_RE.test(t);

// ── Prompt builder (mirrors js/ai.js chatWithForm) ────────────────────────────
function buildMessages(formKey, qaPairs, userMessage, mode) {
  if (mode === 'model') {
    return [
      { role: 'system', content:
        `You are a knowledgeable IRS tax assistant. Answer questions about US tax forms, ` +
        `deadlines, regulations, and tax preparation using your general training knowledge. ` +
        `Be concise — 2–4 sentences. If you genuinely do not know, say so briefly.` },
      { role: 'user', content: userMessage },
    ];
  }

  const qaPairsText = qaPairs.slice(0, 20)
    .map((p, i) => `Q${i+1}: ${p.question}\nA${i+1}: ${p.answer}`)
    .join('\n\n');
  const refBlock = `--- REFERENCE Q&A ---\n${qaPairsText}\n--- END REFERENCE ---`;

  if (mode === 'grounded') {
    return [
      { role: 'system', content:
        `You are an IRS tax assistant for Form ${formKey}. ` +
        `You ONLY answer using the verified Q&A reference below — do not use outside knowledge.\n\n` +
        `${refBlock}\n\n` +
        `Rules:\n` +
        `1. If the answer is clearly in the reference, answer concisely (2–4 sentences) and end with "Source: Q&A".\n` +
        `2. If the answer is NOT in the reference, respond ONLY with: "I don't have information on that for Form ${formKey}."\n` +
        `3. NEVER use outside knowledge. NEVER guess.` },
      { role: 'user', content: 'What goes in Box 99?' },
      { role: 'assistant', content: `I don't have information on that for Form ${formKey}.` },
      { role: 'user', content: userMessage },
    ];
  }

  // mixed
  return [
    { role: 'system', content:
      `You are a helpful IRS tax assistant specialising in Form ${formKey}. ` +
      `You have access to verified Q&A reference data below, and you may also use your general tax knowledge.\n\n` +
      `${refBlock}\n\n` +
      `Rules:\n` +
      `1. Prefer the reference Q&A. You may supplement with general tax knowledge.\n` +
      `2. If the answer comes from the reference, end with "Source: Q&A".\n` +
      `3. If the answer comes from your general knowledge, end with "Source: Model".\n` +
      `4. If you cannot answer, respond ONLY with: "I don't have information on that."\n` +
      `5. Be concise — 2–4 sentences.` },
    { role: 'user', content: 'What is the standard tax filing deadline?' },
    { role: 'assistant', content: 'The standard federal income tax filing deadline is April 15th. Source: Model' },
    { role: 'user', content: 'What goes in Box 99 of this form?' },
    { role: 'assistant', content: "I don't have information on that." },
    { role: 'user', content: userMessage },
  ];
}

// ── Inference ─────────────────────────────────────────────────────────────────
async function runInference(model, processor, messages, maxNewTokens = 200) {
  const inputs = processor.apply_chat_template(messages, {
    tokenize: true, add_generation_prompt: true, return_dict: true,
  });

  let output = '';
  const streamer = new TextStreamer(processor.tokenizer, {
    skip_prompt: true, skip_special_tokens: true,
    callback_function: chunk => { output += chunk; },
  });

  await model.generate({ ...inputs, max_new_tokens: maxNewTokens, do_sample: false, streamer });
  return output.trim();
}

// ── Per-form evaluator ────────────────────────────────────────────────────────
async function evaluateForm(model, processor, formKey, qaPairs, n, mode, seed, verbose) {
  const sample = seededShuffle(qaPairs, seed).slice(0, n);
  const predictions = [], references = [], tags = [], faithScores = [], refusals = [];

  for (const pair of sample) {
    const messages = buildMessages(formKey, qaPairs, pair.question, mode);
    let raw;
    try {
      raw = await runInference(model, processor, messages);
    } catch (e) {
      console.error(`  ✗ Inference error [${formKey}]: ${e.message}`);
      continue;
    }

    const { text: clean, tag } = stripSourceTag(raw);
    predictions.push(clean);
    references.push(pair.answer);
    tags.push(tag);
    faithScores.push(faithfulness(clean, qaPairs));
    refusals.push(isRefusal(clean));

    if (verbose) {
      console.log(`\n  [${formKey}/${mode}] Q: ${pair.question.slice(0, 70)}`);
      console.log(`    Model : ${clean.slice(0, 120)}`);
      console.log(`    Ref   : ${pair.answer.slice(0, 120)}`);
      console.log(`    tag=${tag ?? '—'}  faith=${faithScores.at(-1).toFixed(2)}  refusal=${refusals.at(-1)}`);
    }
  }

  if (!predictions.length) return null;

  const rougeLScores = predictions.map((p, i) => rougeL(p, references[i]));
  const avgRougeL    = rougeLScores.reduce((a, b) => a + b, 0) / rougeLScores.length;
  const avgFaith     = faithScores.reduce((a, b) => a + b, 0) / faithScores.length;
  const refusalCount = refusals.filter(Boolean).length;

  const nQA    = tags.filter(t => t?.toUpperCase() === 'Q&A').length;
  const nModel = tags.filter(t => t?.toUpperCase() === 'MODEL').length;

  let sourceAcc;
  if (mode === 'grounded')     sourceAcc = (nQA + refusalCount) / predictions.length;
  else if (mode === 'mixed')   sourceAcc = (nQA + nModel) / predictions.length;
  else                         sourceAcc = (predictions.length - refusalCount) / predictions.length;

  return {
    form:         formKey,
    mode,
    n:            predictions.length,
    rouge_l:      +avgRougeL.toFixed(4),
    faithfulness: +avgFaith.toFixed(4),
    source_acc:   +sourceAcc.toFixed(4),
    tag_qa:       nQA,
    tag_model:    nModel,
    tag_none:     tags.filter(t => !t).length,
    refusal_rate: +(refusalCount / predictions.length).toFixed(4),
  };
}

// ── OOS refusal test ──────────────────────────────────────────────────────────
async function evaluateOOS(model, processor, formKey, qaPairs) {
  let correct = 0;
  for (const q of OOS_QUESTIONS) {
    const msgs = buildMessages(formKey, qaPairs, q, 'grounded');
    const raw  = await runInference(model, processor, msgs, 60);
    const { text } = stripSourceTag(raw);
    if (isRefusal(text)) correct++;
  }
  return { form: formKey, oos_questions: OOS_QUESTIONS.length,
           correctly_refused: correct,
           refusal_rate: +(correct / OOS_QUESTIONS.length).toFixed(4) };
}

// ── Main ──────────────────────────────────────────────────────────────────────
const opts = parseArgs();
const modes = opts.mode === 'all' ? ['grounded', 'mixed', 'model'] : [opts.mode];

console.log('═'.repeat(70));
console.log('  IRS Q&A Evaluator (Node.js / Transformers.js ONNX)');
console.log(`  Model : ${MODEL_ID}`);
console.log(`  Data  : ${DATA_PATH}`);
console.log(`  Mode  : ${opts.mode}  |  n=${opts.n}  |  seed=${opts.seed}`);
console.log('═'.repeat(70));

// Load data
const raw = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
const dataMap = Object.fromEntries(raw.data.map(e => [e.formName, e.qa]));
const forms = opts.forms ?? Object.keys(dataMap);
const invalid = forms.filter(f => !dataMap[f]);
if (invalid.length) { console.error(`Unknown forms: ${invalid}`); process.exit(1); }
console.log(`  Forms : ${forms.join(', ')}\n`);

// Load model (same as browser app)
console.log('Loading model…');
const processor = await AutoProcessor.from_pretrained(MODEL_ID, {
  dtype: 'q4f16', device: 'cpu',   // Node uses ONNX Runtime CPU (no WebGPU in Node)
  token: HF_TOKEN,
});
const model = await Gemma4ForConditionalGeneration.from_pretrained(MODEL_ID, {
  dtype: 'q4f16', device: 'cpu',
  token: HF_TOKEN,
});
console.log('✓ Model ready\n');

const allResults = [];

for (const mode of modes) {
  console.log(`\n${'─'.repeat(60)}\nMode: ${mode.toUpperCase()}\n${'─'.repeat(60)}`);
  for (const formKey of forms) {
    const qaPairs = dataMap[formKey];
    console.log(`  ${formKey}  (${qaPairs.length} Q&A pairs, sampling ${Math.min(opts.n, qaPairs.length)})`);
    const row = await evaluateForm(model, processor, formKey, qaPairs, opts.n, mode, opts.seed, opts.verbose);
    if (row) {
      allResults.push(row);
      console.log(`    ROUGE-L=${row.rouge_l.toFixed(3)}  Faithfulness=${row.faithfulness.toFixed(3)}  SourceAcc=${row.source_acc.toFixed(3)}  RefusalRate=${row.refusal_rate.toFixed(2)}`);
    }
  }
}

// OOS refusal
const oosResults = [];
if (opts.oos) {
  console.log(`\n${'─'.repeat(60)}\nOut-of-Scope Refusal Test [grounded]\n${'─'.repeat(60)}`);
  for (const formKey of forms) {
    process.stdout.write(`  OOS ${formKey}… `);
    const oos = await evaluateOOS(model, processor, formKey, dataMap[formKey]);
    oosResults.push(oos);
    console.log(`${oos.correctly_refused}/${oos.oos_questions} refused (${(oos.refusal_rate * 100).toFixed(0)}%)`);
  }
}

// Aggregate by mode
const aggByMode = {};
for (const mode of modes) {
  const rows = allResults.filter(r => r.mode === mode);
  if (!rows.length) continue;
  const avg = k => +(rows.reduce((s, r) => s + r[k], 0) / rows.length).toFixed(4);
  aggByMode[mode] = {
    rouge_l:      avg('rouge_l'),
    faithfulness: avg('faithfulness'),
    source_acc:   avg('source_acc'),
    refusal_rate: avg('refusal_rate'),
  };
}

// Print summary
console.log('\n' + '═'.repeat(70));
console.log('AGGREGATE BY MODE');
console.log(JSON.stringify(aggByMode, null, 2));

console.log('\nMETRIC GUIDE');
console.log('  ROUGE-L       > 0.40  = good lexical overlap');
console.log('  Faithfulness  > 0.70  = answers grounded in context');
console.log('  SourceAcc     > 0.80  = correct source attribution');
console.log('  RefusalRate   ~0.00   = in-scope (lower better) | ~1.00 OOS grounded (higher better)');

// Save
const output = {
  model: MODEL_ID,
  seed: opts.seed,
  n_per_form: opts.n,
  forms_evaluated: forms,
  per_form: allResults,
  aggregate_by_mode: aggByMode,
  ...(oosResults.length ? { oos_refusal: oosResults } : {}),
};
const outPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), opts.out);
writeFileSync(outPath, JSON.stringify(output, null, 2));
console.log(`\nResults saved → ${outPath}`);
