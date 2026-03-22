/**
 * Headless test runner using Playwright.
 * Starts a temporary HTTP server, opens the test page in headless Chromium,
 * waits for results, and prints them to the terminal.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const PORT = 8777;
const ROOT = path.resolve(import.meta.dirname, '..');

// Minimal static file server
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml',
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

async function run() {
  // Start server
  await new Promise(resolve => server.listen(PORT, resolve));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Capture console output
  const logs = [];
  page.on('console', msg => logs.push(msg.text()));
  page.on('pageerror', err => console.error('  PAGE ERROR:', err.message));

  await page.goto(`http://localhost:${PORT}/tests/`, { waitUntil: 'domcontentloaded' });

  // Wait for test results to appear (up to 30s)
  try {
    await page.waitForSelector('#test-results h2', { timeout: 30000 });
  } catch {
    console.error('Tests timed out after 30 seconds');
    await browser.close();
    server.close();
    process.exit(1);
  }

  // Extract results from the DOM
  const results = await page.evaluate(() => {
    const h2 = document.querySelector('#test-results h2');
    const suites = [];
    document.querySelectorAll('#test-results .suite').forEach(s => {
      const name = s.querySelector('h3')?.textContent || '';
      const tests = [];
      s.querySelectorAll('.test').forEach(t => {
        const passed = t.classList.contains('pass');
        const text = t.textContent.trim().split('\n')[0];
        const error = t.querySelector('.error')?.textContent || null;
        tests.push({ text, passed, error });
      });
      suites.push({ name, tests });
    });
    return { header: h2?.textContent || '', suites };
  });

  await browser.close();
  server.close();

  // Print results
  console.log();
  let totalPass = 0;
  let totalFail = 0;

  for (const suite of results.suites) {
    console.log(`  ${suite.name}`);
    for (const test of suite.tests) {
      if (test.passed) {
        totalPass++;
        console.log(`    \x1b[32m✔\x1b[0m ${test.text.replace(/^[✔✘]\s*/, '')}`);
      } else {
        totalFail++;
        console.log(`    \x1b[31m✘ ${test.text.replace(/^[✔✘]\s*/, '')}\x1b[0m`);
        if (test.error) {
          console.log(`      \x1b[33m${test.error}\x1b[0m`);
        }
      }
    }
    console.log();
  }

  if (totalFail > 0) {
    console.log(`\x1b[31mFAILED: ${totalPass} passed, ${totalFail} failed\x1b[0m`);
    process.exit(1);
  } else {
    console.log(`\x1b[32mPASSED: ${totalPass} tests passed\x1b[0m`);
    process.exit(0);
  }
}

run().catch(err => {
  console.error('Test runner error:', err);
  server.close();
  process.exit(1);
});
