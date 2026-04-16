/**
 * filter_with_claude.js
 *
 * Uses Claude claude-3-5-haiku-20241022 (fast + cheap) to go through
 * irs_pdf_links.json in batches of 100 and keep only genuine IRS forms,
 * publications, and instructions that a taxpayer or tax professional would use.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... node filter_with_claude.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');

const INPUT_FILE  = path.join(__dirname, 'irs_pdf_links.json');
const OUTPUT_FILE = path.join(__dirname, 'irs_pdf_links_final.json');
const URLS_FILE   = path.join(__dirname, 'irs_pdf_urls_final.txt');
const LOG_FILE    = path.join(__dirname, 'filter_log.jsonl');

const BATCH_SIZE = 100;
const MODEL      = 'claude-haiku-4-5-20251001';

// ─── PROMPT ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert at categorizing IRS tax documents.
Your job is to decide which items from a numbered list are genuine IRS tax forms,
schedules, instructions for forms, or tax publications that a taxpayer or tax
professional would actually use to prepare or understand taxes.

KEEP these types:
- Tax forms           (Form 1040, Form W-2, Form 941, Form 1099-*, etc.)
- Schedules           (Schedule A, Schedule B, Schedule C, Schedule SE, etc.)
- Instructions        (Instructions for Form 1040, Instructions for Schedule C, etc.)
- Tax publications    (Publication 17, Publication 501, Publication 535, etc.)
- Guides and booklets aimed at taxpayers or tax practitioners

REMOVE these types:
- IRS Glossaries / dictionaries of terms
- Internal IRS procedural or training documents (not for taxpayers)
- IRS statistics, data books, annual reports, SOI (Statistics of Income) reports
- IRS press kits, media guides, disclosure statements
- Blank envelope templates, mailing labels
- Items marked as "obsolete", "revoked", or "replaced"
- Foreign-language versions (anything with language codes in parentheses)
- Anything that is clearly not a standard tax form, schedule, instruction, or tax publication

Respond with ONLY a raw JSON array of the indices (0-based) to KEEP.
No markdown fences, no explanation — just the array, e.g.: [0,1,3,7,12]`;

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function parseIndices(text) {
  const match = text.match(/\[[\d\s,]*\]/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

(async () => {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is not set.\n');
    console.error('  export ANTHROPIC_API_KEY=sk-ant-...');
    process.exit(1);
  }

  const client = new Anthropic();

  const allItems = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  console.log(`Loaded ${allItems.length} items from ${INPUT_FILE}`);

  const batches = chunk(allItems, BATCH_SIZE);
  console.log(`Processing ${batches.length} batches of up to ${BATCH_SIZE} with ${MODEL}...\n`);

  // Clear log file
  fs.writeFileSync(LOG_FILE, '');

  const kept = [];
  let totalRemoved = 0;

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const label = `Batch ${String(b + 1).padStart(3, ' ')}/${batches.length}`;

    // Build numbered list for Claude
    const list = batch
      .map((item, i) => `${i}: [${item.formNumber}] ${item.title}`)
      .join('\n');

    const userMessage = `Here are ${batch.length} IRS document entries. Return only the indices to KEEP:\n\n${list}`;

    process.stdout.write(`  ${label} (${batch.length} items) → `);

    let keptInBatch = batch; // default: keep all on error
    let rawResponse = '';

    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      });

      rawResponse = response.content[0].text.trim();
      const indices = parseIndices(rawResponse);

      if (indices === null) {
        process.stdout.write(`WARN (could not parse response, keeping all) → `);
        keptInBatch = batch;
      } else {
        keptInBatch = indices.map(i => batch[i]).filter(Boolean);
      }
    } catch (err) {
      process.stdout.write(`ERROR (${err.message.slice(0, 60)}, keeping all) → `);
      keptInBatch = batch;
    }

    const removed = batch.length - keptInBatch.length;
    totalRemoved += removed;
    kept.push(...keptInBatch);

    process.stdout.write(`kept ${keptInBatch.length}, removed ${removed}  (running total: ${kept.length})\n`);

    // Append log entry
    fs.appendFileSync(LOG_FILE, JSON.stringify({
      batch: b + 1,
      input: batch.length,
      kept: keptInBatch.length,
      removed,
      rawResponse,
    }) + '\n');

    // Polite delay between batches (avoid rate limits)
    if (b < batches.length - 1) await new Promise(r => setTimeout(r, 400));
  }

  console.log(`\n${'─'.repeat(55)}`);
  console.log(`Total kept:    ${kept.length}`);
  console.log(`Total removed: ${totalRemoved}`);
  console.log(`${'─'.repeat(55)}`);

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(kept, null, 2));
  console.log(`\nFull objects → ${OUTPUT_FILE}`);

  fs.writeFileSync(URLS_FILE, kept.map(r => r.pdfUrl).join('\n'));
  console.log(`PDF URLs only → ${URLS_FILE}`);

  console.log(`Filter log    → ${LOG_FILE}`);
})();
