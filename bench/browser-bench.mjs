#!/usr/bin/env node
/**
 * In-browser bubblesort benchmark: runs bench/bubblesort.mjs programs in the
 * production build of the app in Chromium, the way a user would (toolbar Run,
 * devices attached, live panel refresh), checks the result and prints the time.
 *
 *   node bench/browser-bench.mjs [--no-build] [N ...]     (default: 1000 10000)
 *
 * Builds the app with `ng build` unless --no-build is given and dist/ exists,
 * serves dist/jasmin-port/browser on a free local port and drives Chromium with
 * Playwright. Set PW_CHROMIUM_PATH to a Chromium binary (default
 * /opt/pw-browsers/chromium if present, else Playwright's own).
 */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist/jasmin-port/browser');
const MEMORY = 65536;

const args = process.argv.slice(2);
const noBuild = args.includes('--no-build');
const sizes = args.filter((a) => !a.startsWith('--')).map(Number);
if (sizes.length === 0) sizes.push(1000, 10000);
if (sizes.some((n) => !Number.isInteger(n) || n < 2 || n * 4 > MEMORY)) {
  process.stderr.write(
    `usage: node bench/browser-bench.mjs [--no-build] [N ...] (2 <= N <= ${MEMORY / 4})\n`,
  );
  process.exit(2);
}

if (!noBuild || !existsSync(join(DIST, 'index.html'))) {
  execFileSync('npx', ['ng', 'build'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
}

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
};

/** A static server for the build; unknown paths get index.html (client-side routes). */
function serve() {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    let file = join(DIST, path);
    if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) {
      file = join(DIST, 'index.html');
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

function bubblesort(mode, n) {
  return execFileSync(process.execPath, [join(ROOT, 'bench/bubblesort.mjs'), mode, String(n)], {
    encoding: 'utf8',
  });
}

const executablePath =
  process.env.PW_CHROMIUM_PATH ??
  (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const server = await serve();
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
let status = 0;
try {
  console.log(`${'entries'.padStart(8)} ${'browser_ms'.padStart(11)}  result`);
  for (const n of sizes) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.addInitScript(
      (memory) => localStorage.setItem('jasmin.settings', JSON.stringify({ memory })),
      MEMORY,
    );
    await page.goto(url);
    await page.keyboard.press('Alt+n');
    await page.getByRole('region', { name: 'Memory' }).waitFor();
    const editor = page.getByRole('textbox', { name: 'Program code' });
    const asm = bubblesort('asm', n);
    await editor.fill(asm);
    const run = page.getByRole('toolbar').locator('[data-action="runPause"]');
    // Time the run in the page: from the button showing a run in progress until it no longer does.
    await run.evaluate((button) => {
      const w = /** @type {any} */ (window);
      w.__bench = { start: null, end: null };
      new MutationObserver(() => {
        const running = button.classList.contains('running');
        if (running && w.__bench.start === null) w.__bench.start = performance.now();
        if (!running && w.__bench.start !== null && w.__bench.end === null) {
          w.__bench.end = performance.now();
        }
      }).observe(button, { attributes: true, attributeFilter: ['class'] });
    });
    await run.click();
    await page.waitForFunction(() => /** @type {any} */ (window).__bench.end !== null, null, {
      timeout: 600_000,
      polling: 50,
    });
    const ms = Math.round(
      await page.evaluate(() => {
        const { start, end } = /** @type {any} */ (window).__bench;
        return end - start;
      }),
    );
    const registers = page.getByRole('region', { name: 'Registers', exact: true });
    const hex = async (name) => {
      const text = await registers.getByRole('textbox', { name, exact: true }).inputValue();
      return '0x' + (Number(text) >>> 0).toString(16).toUpperCase().padStart(8, '0');
    };
    const got = `EAX=${await hex('EAX')} EBX=${await hex('EBX')} EDI=${await hex('EDI')}`;
    const expected = bubblesort('expect', n).trim();
    const result = got === expected ? 'ok' : `WRONG (${got}, expected ${expected})`;
    if (result !== 'ok') status = 1;
    console.log(`${String(n).padStart(8)} ${String(ms).padStart(11)}  ${result}`);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
process.exit(status);
