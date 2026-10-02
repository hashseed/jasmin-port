#!/usr/bin/env node
// Help pages of the context help pane (spec 09 §1.1).
//
//   node scripts/help-pages.mjs                     regenerate the indexes
//   node scripts/help-pages.mjs --check             fail if an index is out of date
//   node scripts/help-pages.mjs --import <upstream> copy pages and images from an
//                                                   upstream Jasmin checkout, then index
//
// Pages live in public/help/<language>/<MNEMONIC>.htm. Each language gets an
// index.json mapping the lower-case mnemonic (file name without extension) to the
// file name, like the original HelpLoader's map; public/help/languages.json lists
// the language directories. Imported pages ship unchanged except for the LOOP*
// fix of 07 Q-I-14: the loops always use ECX, the pages said CX.
//
// The pages and images are GPL-2.0 like the rest of Jasmin (spec 09 §5, LICENSE.md).

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const helpDir = join(root, 'public', 'help');

/** Pages whose `CX` means the loop counter, which is ECX (07 Q-I-14). */
const ECX_PAGES = ['LOOP.htm', 'LOOPE.htm', 'LOOPZ.htm', 'LOOPNE.htm', 'LOOPNZ.htm'];

function json(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

function languages() {
  return readdirSync(helpDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function buildIndex(language) {
  const pages = readdirSync(join(helpDir, language))
    .filter((name) => /\.htm$/i.test(name))
    .sort();
  const index = {};
  for (const name of pages) index[name.replace(/\.htm$/i, '').toLowerCase()] = name;
  return index;
}

/** The generated files and their expected content. */
function outputs() {
  const langs = languages();
  const files = [[join(helpDir, 'languages.json'), json(langs)]];
  for (const language of langs) {
    files.push([join(helpDir, language, 'index.json'), json(buildIndex(language))]);
  }
  return files;
}

function importUpstream(upstream) {
  const source = join(upstream, 'help');
  if (!existsSync(source)) throw new Error(`No help directory in ${upstream}`);
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const target = join(helpDir, entry.name);
    mkdirSync(target, { recursive: true });
    for (const name of readdirSync(join(source, entry.name))) {
      if (!/\.htm$/i.test(name)) continue;
      let text = readFileSync(join(source, entry.name, name), 'latin1');
      if (ECX_PAGES.includes(name)) text = text.replace(/\bCX\b/g, 'ECX');
      writeFileSync(join(target, name), text, 'latin1');
    }
  }
}

const args = process.argv.slice(2);
if (args[0] === '--import') {
  if (!args[1]) throw new Error('Usage: --import <upstream checkout>');
  importUpstream(resolve(args[1]));
}
const stale = [];
for (const [file, content] of outputs()) {
  const current = existsSync(file) ? readFileSync(file, 'utf8') : null;
  if (current === content) continue;
  if (args[0] === '--check') stale.push(file);
  else writeFileSync(file, content);
}
if (stale.length) {
  console.error(`Out of date (run node scripts/help-pages.mjs):\n  ${stale.join('\n  ')}`);
  process.exit(1);
}
