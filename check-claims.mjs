#!/usr/bin/env node
// check-claims.mjs — the numbers in the prose must be the numbers the code produces.
//
// ⚑ The README advertised a 21/21 gate while test.mjs ran 41 assertions, and the same hand-typed 21
// appeared twice more — including on the live page a visitor actually reads. Nobody edits the prose
// when they add the twenty-second assertion, and a claim that drifts downward is the worst kind:
// it under-sells the work AND proves the numbers are decorative.
//
// This is the estate's one-kernel rule applied to a README: a surface stating a fact must be checked
// against the thing it states a fact about. Run in CI.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const out = execFileSync(process.execPath, ['test.mjs'], { encoding: 'utf8' });
const m = /(\d+)\/(\d+)/.exec(out);
if (!m) { console.error('FAIL  test.mjs printed no n/n count — cannot check the claim against anything'); process.exit(1); }
const actual = m[0];

const SELF = 'agora';

let bad = 0, checked = 0;
for (const file of ['README.md', 'index.html']) {
  const text = readFileSync(file, 'utf8');
  for (const [n, line] of text.split(/\r?\n/).entries()) {
    for (const claim of line.matchAll(/\b(\d{1,4})\/(\d{1,4})\b/g)) {
      if (!/gate|proven|assert|test/i.test(line)) continue;
      // ⚑ Only OUR gate. This line may cite another repository's gate — the-wallet's 23/23 sits in
      // the opening paragraph — and that number is that repository's business to keep true, not
      // something to rewrite to match ours. Flagging it would train a reader to ignore the check.
      const other = [...line.matchAll(/sjgant80-hub[/.]([a-z0-9-]+)/gi)].map(m => m[1].replace(/\.github\.io/, ''));
      if (other.length && !other.includes(SELF)) continue;
      checked++;
      if (claim[0] !== actual) {
        bad++;
        console.error(`FAIL  ${file}:${n + 1} claims ${claim[0]} but the gate reports ${actual}\n      ${line.trim().slice(0, 110)}`);
      }
    }
  }
}
if (!checked) { console.error('FAIL  no gate claim found in the prose at all — the check would pass on a README that says nothing'); process.exit(1); }
if (bad) { console.error('\nThe prose and the gate disagree. Run the gate and write down what it said.'); process.exit(1); }
console.log(`OK    every gate claim in the prose reads ${actual}, which is what the gate reports.`);
