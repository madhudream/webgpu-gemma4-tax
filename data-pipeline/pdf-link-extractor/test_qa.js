/**
 * test_qa.js — test Q&A generation on 1-2 PDFs using Claude Batch API
 * PDF text is cached to ./pdf_cache/ so re-runs skip parsing.
 *
 * Usage:
 *   node test_qa.js                    # auto-picks 2 PDFs (one form, one pub)
 *   node test_qa.js f1040.pdf p17.pdf  # test specific files
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const fs        = require('fs');
const Anthropic = require('@anthropic-ai/sdk');

const DATA_DIR  = path.join(__dirname, 'data');
const CACHE_DIR = path.join(__dirname, 'pdf_cache');
const OUT_DIR   = path.join(__dirname, 'output');
const STATE     = path.join(__dirname, 'test_batch_state.json');

const MODEL      = 'claude-haiku-4-5';
const CHUNK_SIZE = 3000;
const OVERLAP    = 200;

const SYSTEM_PROMPT = `You are an expert IRS tax document analyst generating Q&A pairs to fine-tune a tax assistant AI.

Generate diverse pairs covering:
- Factual lookups (deadlines, dollar thresholds, form numbers, percentages)
- Eligibility criteria (who qualifies, income limits, age requirements)
- Procedural steps (how to file, how to calculate, how to amend)
- List extraction (required documents, eligible deductions, what to attach)
- Definitions (what is a term, what does a form do)

Rules:
- Ground every answer ONLY in the provided document text — no external knowledge
- Include exact figures, dates, form numbers from the text
- Vary question phrasing naturally
- Skip boilerplate/legal headers with no informational value

Return a JSON array only — no markdown, no explanation:
[{"question": "...", "answer": "..."}, ...]`;

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
function loadState() { return fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {}; }
function saveState(s) { fs.writeFileSync(STATE, JSON.stringify(s, null, 2)); }

// ─── PDF text with cache ──────────────────────────────────────────────────────

async function getPdfText(filename) {
  ensureDir(CACHE_DIR);
  const cacheFile = path.join(CACHE_DIR, filename.replace('.pdf', '.txt'));

  if (fs.existsSync(cacheFile)) {
    process.stdout.write(`  [CACHE HIT] ${filename}\n`);
    return fs.readFileSync(cacheFile, 'utf8');
  }

  process.stdout.write(`  [PARSING]   ${filename}...`);
  let pdfParse;
  try {
    const mod = require('pdf-parse');
    pdfParse = mod.default || mod;
  } catch {
    console.error('\nRun: npm install pdf-parse');
    process.exit(1);
  }

  const data = await pdfParse(fs.readFileSync(path.join(DATA_DIR, filename)), { max: 0 });
  const text = data.text.replace(/\s+/g, ' ').trim();
  fs.writeFileSync(cacheFile, text, 'utf8');
  process.stdout.write(` ${text.length} chars cached\n`);
  return text;
}

// ─── Build batch requests from PDFs ──────────────────────────────────────────

async function buildRequests(files) {
  const requests = [];

  for (const filename of files) {
    const text = await getPdfText(filename);
    if (text.length < 100) { console.log(`  SKIP ${filename} — image-only`); continue; }

    // Chunk large docs
    const chunks = [];
    let start = 0;
    while (start < text.length) { chunks.push(text.slice(start, start + CHUNK_SIZE)); start += CHUNK_SIZE - OVERLAP; }

    const pairs = text.length < 3000 ? 20 : text.length < 10000 ? 40 : 60;
    console.log(`  ${filename}: ${text.length} chars → ${chunks.length} chunk(s), ~${pairs} pairs/chunk`);

    for (let c = 0; c < chunks.length; c++) {
      requests.push({
        custom_id: `${filename.replace('.pdf', '')}__chunk${c}`,
        params: {
          model: MODEL,
          max_tokens: 2048,
          system: SYSTEM_PROMPT,
          messages: [{
            role: 'user',
            content: `Document: ${filename}\nChunk ${c + 1} of ${chunks.length}\n\nGenerate ${pairs} Q&A pairs from this IRS document text:\n\n${chunks[c]}`,
          }],
        },
      });
    }
  }

  return requests;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  const client = new Anthropic();

  // Pick files
  let files = process.argv.slice(2).filter(f => f.endsWith('.pdf'));
  if (files.length === 0) {
    const all = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.pdf')).sort();
    const form = all.find(f => f.startsWith('f')) || all[0];
    const pub  = all.find(f => f.startsWith('p')) || all[1];
    files = [...new Set([form, pub].filter(Boolean))].slice(0, 2);
    console.log(`Auto-selected: ${files.join(', ')}\n`);
  }

  // Check if we already have a batch running
  let state = loadState();

  if (!state.batchId) {
    // ── Step 1: build & submit ──
    console.log('Building batch requests...\n');
    const requests = await buildRequests(files);
    console.log(`\nSubmitting ${requests.length} request(s) to Claude Batch API...`);

    const batch = await client.messages.batches.create({ requests });
    console.log(`✓ Batch submitted: ${batch.id}\n`);
    state = { batchId: batch.id, files, submittedAt: new Date().toISOString() };
    saveState(state);
  } else {
    console.log(`Resuming batch ${state.batchId} (submitted ${state.submittedAt})\n`);
  }

  // ── Step 2: poll ──
  console.log('Polling...');
  let batch;
  while (true) {
    batch = await client.messages.batches.retrieve(state.batchId);
    const c = batch.request_counts;
    console.log(`  ${new Date().toLocaleTimeString()} | ${batch.processing_status} | succeeded: ${c.succeeded}  processing: ${c.processing}  errored: ${c.errored}`);
    if (batch.processing_status === 'ended') break;
    await new Promise(r => setTimeout(r, 15000)); // poll every 15s for test
  }

  // ── Step 3: download & display ──
  console.log('\nDownloading results...\n');
  ensureDir(OUT_DIR);
  const outFile = path.join(OUT_DIR, 'test_qa_output.jsonl');
  const stream  = fs.createWriteStream(outFile);

  let totalPairs = 0;
  const byFile = {};

  for await (const result of await client.messages.batches.results(state.batchId)) {
    const docName = result.custom_id.split('__chunk')[0];

    if (result.result.type === 'error') {
      console.log(`  ERROR [${result.custom_id}]: ${JSON.stringify(result.result.error)}`);
      continue;
    }

    const raw   = result.result.message.content[0].text.trim();
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) { console.log(`  WARN [${result.custom_id}]: no JSON array`); continue; }

    let pairs;
    try { pairs = JSON.parse(match[0]); } catch { console.log(`  WARN [${result.custom_id}]: JSON parse failed`); continue; }

    pairs = pairs.filter(p => p.question && p.answer);
    if (!byFile[docName]) byFile[docName] = [];
    byFile[docName].push(...pairs);

    for (const p of pairs) {
      stream.write(JSON.stringify({
        messages: [
          { role: 'system',    content: 'You are an IRS tax expert. Answer questions accurately based on official IRS forms, publications, and instructions.' },
          { role: 'user',      content: p.question },
          { role: 'assistant', content: String(p.answer) },
        ],
      }) + '\n');
      totalPairs++;
    }
  }

  stream.end();

  // ── Show samples ──
  console.log('═'.repeat(60));
  for (const [doc, pairs] of Object.entries(byFile)) {
    console.log(`\n📄 ${doc}.pdf  (${pairs.length} pairs)`);
    console.log('─'.repeat(60));
    pairs.slice(0, 3).forEach((p, i) => {
      console.log(`\nQ${i + 1}: ${p.question}`);
      const ans = String(p.answer);
      console.log(`A${i + 1}: ${ans.slice(0, 300)}${ans.length > 300 ? '...' : ''}`);
    });
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`Total Q&A pairs: ${totalPairs}`);
  console.log(`Output  → ${outFile}`);
  console.log(`Cache   → ${CACHE_DIR}/`);

  // Clean up state so next run starts fresh
  fs.unlinkSync(STATE);
})();
