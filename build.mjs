#!/usr/bin/env node
// Inlines the question bank and the study-notes data into the template and
// writes a single self-contained file to dist/index.html.
// No dependencies on purpose — Render can run this with nothing installed.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const read = p => readFileSync(join(root, p), 'utf8');

const template = read('src/template.html');
const questions = JSON.parse(read('src/data/questions.json'));
const review = JSON.parse(read('src/data/review.json'));
const corrections = JSON.parse(read('src/data/corrections.json'));

// ---- apply audited answer-key corrections ----
// `from` must still match what's in the bank, so a correction can never drift
// silently after the underlying question is edited.
const byId = new Map(questions.map(q => [q.i, q]));
let fixed = 0, noted = 0;
for (const c of corrections.corrections) {
  const q = byId.get(c.id);
  if (!q) { console.error(`build failed — correction targets missing question ${c.id}`); process.exit(1); }
  const current = [...q.a].sort().join(',');
  if (current !== [...c.from].sort().join(',')) {
    console.error(`build failed — correction ${c.id} expected key ${c.from} but the bank now says ${q.a}`);
    process.exit(1);
  }
  if (!c.to.every(a => q.o.some(o => o[0] === a))) {
    console.error(`build failed — correction ${c.id} points at an option that doesn't exist`);
    process.exit(1);
  }
  q.a = c.to;
  q.fix = c.reason;
  fixed++;
}
for (const d of corrections.disputes) {
  const q = byId.get(d.id);
  if (!q) { console.error(`build failed — dispute targets missing question ${d.id}`); process.exit(1); }
  q.dis = d.note;
  noted++;
}

// ---- validate the data before it can ever reach the browser ----
const problems = [];
const seen = new Set();
for (const q of questions) {
  const at = `question ${q.i}`;
  if (seen.has(q.i)) problems.push(`${at}: duplicate id`);
  seen.add(q.i);
  if (!q.q || !q.q.trim()) problems.push(`${at}: empty stem`);
  if (!Array.isArray(q.o) || q.o.length < 2) problems.push(`${at}: needs at least two options`);
  if (!Array.isArray(q.a) || !q.a.length) problems.push(`${at}: no answer key`);
  const letters = new Set((q.o || []).map(o => o[0]));
  for (const a of q.a || []) if (!letters.has(a)) problems.push(`${at}: answer ${a} is not one of the options`);
  if (![1, 2, 3, 4].includes(q.d)) problems.push(`${at}: bad domain ${q.d}`);
  if (/<\s*\/?\s*(br|p|div|span)\b/i.test(q.q)) problems.push(`${at}: raw html left in the stem`);
  const want = /choose two|select two/i.test(q.q) ? 2 : /choose three|select three/i.test(q.q) ? 3 : null;
  if (want && q.a.length !== want) problems.push(`${at}: says choose ${want} but the key has ${q.a.length}`);
}
if (!review.services?.length) problems.push('review: no services');
if (!review.pairs?.length) problems.push('review: no comparison pairs');
if (!review.cats?.length) problems.push('review: no categories');

if (problems.length) {
  console.error(`build failed — ${problems.length} data problem(s):`);
  for (const p of problems.slice(0, 25)) console.error('  ' + p);
  process.exit(1);
}

// ---- inline ----
let out = template
  .replace('__DATA__', JSON.stringify(questions))
  .replace('__REVIEW__', JSON.stringify(review));

for (const token of ['__DATA__', '__REVIEW__']) {
  if (out.includes(token)) { console.error(`build failed — ${token} still present`); process.exit(1); }
}
// the whole point of this app is that it works with no connection
if (/\bfetch\(\s*["'`]https?:/.test(out.replace(/https:\/\/api\.github\.com/g, ''))) {
  console.error('build failed — an unexpected outbound request slipped into the bundle');
  process.exit(1);
}

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/index.html'), out);

const kb = (Buffer.byteLength(out) / 1024).toFixed(0);
const sets = new Set(questions.filter(q => q.e > 0).map(q => q.e)).size;
const svc = questions.filter(q => q.src === 'svc').length;
console.log(`built dist/index.html — ${kb} KB, ${questions.length} questions ` +
            `(${sets} sets + ${svc} service scenarios), ${review.services.length} study notes, ` +
            `${fixed} key correction(s), ${noted} disputed note(s)`);
