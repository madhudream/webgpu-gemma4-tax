/**
 * IRS Forms PDF Link Extractor
 *
 * Step 1: Scrape all 124 pages (3088 rows) from:
 *         https://www.irs.gov/forms-instructions-and-publications
 *         Save full table data to irs_all_forms_raw.json
 *
 * Step 2: Filter out non-English and duplicate forms,
 *         save final English-only PDF URLs to irs_pdf_links.json
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.irs.gov/forms-instructions-and-publications';
const LAST_PAGE = 123; // page=0 to page=123 → 124 pages × 25 = 3100 (3088 actual)
const RAW_OUTPUT = path.join(__dirname, 'irs_all_forms_raw.json');
const FILTERED_OUTPUT = path.join(__dirname, 'irs_pdf_links.json');

// ─── STEP 1: SCRAPE ──────────────────────────────────────────────────────────

async function scrapePage(page, pageIndex) {
  const url = pageIndex === 0 ? BASE_URL : `${BASE_URL}?page=${pageIndex}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Wait for the table rows to appear
  await page.waitForSelector('table tbody tr, .views-table tbody tr', { timeout: 30000 });

  const rows = await page.$$eval('table tbody tr', (trs) =>
    trs.map((tr) => {
      const cells = tr.querySelectorAll('td');
      if (cells.length < 2) return null;

      // First cell usually has the PDF link
      const linkEl = tr.querySelector('a[href*=".pdf"]');
      const pdfUrl = linkEl ? linkEl.href : null;

      return {
        formNumber: cells[0]?.innerText?.trim() || '',
        title: cells[1]?.innerText?.trim() || '',
        period: cells[2]?.innerText?.trim() || '',
        datePosted: cells[3]?.innerText?.trim() || '',
        pdfUrl,
      };
    }).filter(Boolean)
  );

  return rows;
}

// ─── STEP 2: FILTER (AI-style logic) ─────────────────────────────────────────

// Language codes the IRS puts in parentheses after form numbers for non-English versions
// e.g. "Publication 1 (SP)", "Form 1040 (sp)", "Publication 5 (zh-s)"
const LANGUAGE_CODE_PATTERN = /\(\s*(sp|ht|zh-s|zh-t|ko|vi|ru|ar|bn|fa|fr|guj|it|ja|km|pa|pl|pt|tl|ur|vie|kr|po|de|am|so|om|ti)\s*\)/i;

// Title keywords that indicate a non-English version
const FOREIGN_TITLE_KEYWORDS = [
  'spanish version', 'haitian creole', 'chinese-simplified', 'chinese-traditional',
  'korean version', 'vietnamese version', 'russian version', 'arabic version',
  'bengali version', 'farsi version', 'french version', 'gujarati version',
  'italian version', 'japanese version', 'khmer', 'punjabi version', 'polish version',
  'portuguese version', 'tagalog version', 'urdu version',
  'en español', 'versión en español', 'en espanol',
  'amharic', 'somali version', 'oromo version', 'tigrinya version',
];

function isNonEnglish(row) {
  const formNum = row.formNumber.toLowerCase();
  const title = row.title.toLowerCase();

  // Check for language code in parentheses in the form number
  if (LANGUAGE_CODE_PATTERN.test(row.formNumber)) return true;

  // Check title for foreign language keywords
  if (FOREIGN_TITLE_KEYWORDS.some((kw) => title.includes(kw))) return true;

  // Check if title ends with "(spanish)" etc.
  if (/\((spanish|korean|vietnamese|russian|chinese|arabic|french|italian|tagalog|portuguese|urdu|punjabi|haitian|bengali|farsi|gujarati|polish|japanese|khmer)\)/i.test(title)) return true;

  return false;
}

function filterAndDeduplicate(allRows) {
  const seenFormNums = new Map(); // formNumber (normalized) → best row
  const seenPdfUrls = new Set();

  const englishRows = allRows.filter((row) => !isNonEnglish(row));

  const result = [];
  for (const row of englishRows) {
    if (!row.pdfUrl) continue;

    // Normalize the PDF URL for dedup (strip query strings)
    const urlKey = row.pdfUrl.split('?')[0].toLowerCase();
    if (seenPdfUrls.has(urlKey)) continue;

    // Also deduplicate by form number (keep first occurrence = most recent page order)
    const formKey = row.formNumber.toLowerCase().replace(/\s+/g, '');
    if (seenFormNums.has(formKey)) continue;

    seenPdfUrls.add(urlKey);
    seenFormNums.set(formKey, true);
    result.push(row);
  }

  return result;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  // ── STEP 1: Scrape all pages ──
  const allRows = [];
  console.log(`Scraping ${LAST_PAGE + 1} pages (3088 forms)...\n`);

  for (let i = 0; i <= LAST_PAGE; i++) {
    process.stdout.write(`  Page ${String(i + 1).padStart(3, ' ')}/${LAST_PAGE + 1} → `);
    try {
      const rows = await scrapePage(page, i);
      allRows.push(...rows);
      process.stdout.write(`${rows.length} rows  (total: ${allRows.length})\n`);
    } catch (err) {
      process.stdout.write(`ERROR: ${err.message}\n`);
    }

    // Polite delay to avoid hammering the server
    if (i < LAST_PAGE) await page.waitForTimeout(300);
  }

  await browser.close();

  console.log(`\nTotal raw rows collected: ${allRows.length}`);
  fs.writeFileSync(RAW_OUTPUT, JSON.stringify(allRows, null, 2));
  console.log(`Raw data saved → ${RAW_OUTPUT}`);

  // ── STEP 2: Filter for English-only, deduplicate ──
  console.log('\nFiltering non-English and duplicate forms...');
  const filtered = filterAndDeduplicate(allRows);

  console.log(`English-only, deduplicated: ${filtered.length} forms`);

  // Save full filtered rows
  fs.writeFileSync(FILTERED_OUTPUT, JSON.stringify(filtered, null, 2));
  console.log(`Filtered data saved → ${FILTERED_OUTPUT}`);

  // Also save a plain list of just PDF URLs
  const urlsOnly = filtered.map((r) => r.pdfUrl);
  const urlsFile = path.join(__dirname, 'irs_pdf_urls_only.txt');
  fs.writeFileSync(urlsFile, urlsOnly.join('\n'));
  console.log(`PDF URLs (plain list) saved → ${urlsFile}`);

  // Preview
  console.log('\n--- First 15 filtered results ---');
  filtered.slice(0, 15).forEach((r, i) => {
    console.log(`${String(i + 1).padStart(2, ' ')}. [${r.formNumber}] ${r.title}`);
    console.log(`    ${r.pdfUrl}`);
  });
})();

