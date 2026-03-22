/**
 * Verify that invalid pipeline and event runs show error banners with raw JSON.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const PORT = 8780;
const ROOT = path.resolve(import.meta.dirname, '..');
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json',
  '.css': 'text/css',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let filePath = path.join(ROOT, decodeURIComponent(url.pathname));
  if (filePath.endsWith('/')) filePath += 'index.html';
  const ext = path.extname(filePath);
  const mime = MIME[ext] || 'application/octet-stream';
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

async function switchRun(page, runKey) {
  await page.evaluate((key) => {
    const select = document.querySelector('#run-select');
    if (select) {
      select.value = key;
      select.dispatchEvent(new Event('change'));
    }
  }, runKey);
  await page.waitForTimeout(3000);
}

async function getErrorBanner(page) {
  return page.evaluate(() => {
    const el = document.querySelector('#load-error');
    if (!el) return null;
    return {
      title: el.querySelector('.load-error-title')?.textContent || '',
      message: el.querySelector('.load-error-message')?.textContent || '',
      hasJsonDetails: el.querySelector('.load-error-details') !== null,
      jsonContent: el.querySelector('.load-error-json')?.textContent || '',
    };
  });
}

async function run() {
  await new Promise(resolve => server.listen(PORT, resolve));
  const browser = await chromium.launch({ headless: true });
  let passed = 0;
  let failed = 0;

  function check(label, condition, actual) {
    if (condition) {
      console.log(`  \x1b[32m✔\x1b[0m ${label}`);
      passed++;
    } else {
      console.log(`  \x1b[31m✘ ${label}\x1b[0m`);
      if (actual !== undefined) console.log(`      got: ${JSON.stringify(actual)}`);
      failed++;
    }
  }

  // Test 1: Invalid pipeline (missing 'id')
  console.log('\n  Invalid Pipeline Run');
  let page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await switchRun(page, 'invalid-pipeline');
  let banner = await getErrorBanner(page);
  check('shows error banner', banner !== null);
  check('title says "Failed to load run"', banner?.title === 'Failed to load run');
  check('message mentions missing field', banner?.message?.includes('missing required field') === true, banner?.message);
  check('message mentions pipeline source', banner?.message?.includes('invalid_pipeline.json') === true, banner?.message);
  check('shows raw JSON details', banner?.hasJsonDetails === true);
  check('raw JSON contains the invalid object', banner?.jsonContent?.includes('"broken_pipeline"') === true);
  await page.close();

  // Test 2: Invalid event (bad eventType)
  console.log('\n  Invalid Event Run');
  page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await switchRun(page, 'invalid-event');
  banner = await getErrorBanner(page);
  check('shows error banner', banner !== null);
  check('title says "Failed to load run"', banner?.title === 'Failed to load run');
  check('message mentions invalid event', banner?.message?.includes('Invalid event') === true, banner?.message);
  check('shows raw JSON details', banner?.hasJsonDetails === true);
  check('raw JSON contains BOGUS eventType', banner?.jsonContent?.includes('"BOGUS"') === true);
  await page.close();

  // Test 3: Recovery — valid run clears error
  console.log('\n  Recovery — valid ELT run');
  page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await switchRun(page, 'invalid-pipeline');
  await switchRun(page, 'elt');
  banner = await getErrorBanner(page);
  check('error banner is cleared', banner === null);
  await page.close();

  await browser.close();
  server.close();

  console.log();
  if (failed > 0) {
    console.log(`\x1b[31mFAILED: ${passed} passed, ${failed} failed\x1b[0m`);
    process.exit(1);
  } else {
    console.log(`\x1b[32mPASSED: ${passed} error-handling tests passed\x1b[0m`);
  }
}

run().catch(err => {
  console.error('Verify error:', err);
  server.close();
  process.exit(1);
});
