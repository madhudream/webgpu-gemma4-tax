/**
 * download_pdfs.js
 * Downloads all PDFs from irs_pdf_links_final.json into ./data/
 * Skips files already downloaded. Runs 5 concurrent downloads.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const fs   = require('fs');
const https = require('https');
const http  = require('http');

const INPUT_FILE  = path.join(__dirname, 'irs_pdf_links_final.json');
const DATA_DIR    = path.join(__dirname, 'data');
const CONCURRENCY = 5;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function urlToFilename(url) {
  // e.g. https://www.irs.gov/pub/irs-pdf/f1040.pdf → f1040.pdf
  return path.basename(new URL(url).pathname);
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const proto = url.startsWith('https') ? https : http;

    const req = proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      // Follow redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    });

    req.on('error', (err) => {
      file.close();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(err);
    });

    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

async function runPool(tasks, concurrency) {
  let i = 0;
  let completed = 0;
  let failed = 0;
  const total = tasks.length;
  const errors = [];

  async function worker() {
    while (i < tasks.length) {
      const task = tasks[i++];
      try {
        await task();
        completed++;
      } catch (e) {
        failed++;
        errors.push(e.message);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return { completed, failed, errors };
}

(async () => {
  const items = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  console.log(`Downloading ${items.length} PDFs into ${DATA_DIR}`);
  console.log(`Concurrency: ${CONCURRENCY}\n`);

  let skipped = 0;
  const tasks = [];

  for (const item of items) {
    const filename = urlToFilename(item.pdfUrl);
    const dest = path.join(DATA_DIR, filename);

    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      skipped++;
      continue;
    }

    const url = item.pdfUrl;
    tasks.push(async () => {
      await download(url, dest);
      const num = tasks.indexOf(tasks.find(t => t.url === url)) + 1;
      process.stdout.write(`  ✓ ${filename}\n`);
    });
    // store url for logging
    tasks[tasks.length - 1].url = url;
  }

  if (skipped > 0) console.log(`Skipping ${skipped} already-downloaded files.\n`);
  console.log(`Downloading ${tasks.length} files...\n`);

  let done = 0;
  // Wrap tasks to show progress
  const wrapped = tasks.map((task) => async () => {
    const filename = urlToFilename(task.url);
    const dest = path.join(DATA_DIR, filename);
    try {
      await download(task.url, dest);
      done++;
      process.stdout.write(`  [${String(done + skipped).padStart(4)}/${items.length}] ✓ ${filename}\n`);
    } catch (err) {
      done++;
      process.stdout.write(`  [${String(done + skipped).padStart(4)}/${items.length}] ✗ ${filename} — ${err.message}\n`);
      throw err;
    }
  });

  const { completed, failed } = await runPool(wrapped, CONCURRENCY);

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Downloaded: ${completed}  |  Skipped: ${skipped}  |  Failed: ${failed}`);
  console.log(`Files in ${DATA_DIR}`);
})();
