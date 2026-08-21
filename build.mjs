#!/usr/bin/env node
// Inlines the question bank and the study-notes data into the template and
// writes a single self-contained file to dist/index.html.
// No dependencies on purpose — Render can run this with nothing installed.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

// Uploading through the GitHub web UI often flattens folders, so look for each
// input in the tidy location first and then anywhere sensible nearby.
function locate(name, ...candidates) {
  for (const rel of candidates) {
    const p = join(root, rel);
    if (existsSync(p)) return p;
  }
  const tree = [];
  const walk = (dir, depth) => {
    if (depth > 2) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist') continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else tree.push(relative(root, full));
    }
  };
  try { walk(root, 0); } catch {}
  console.error(`build failed — could not find ${name}`);
  console.error(`  looked for: ${candidates.join(', ')}`);
  console.error(`  files actually present:`);
  for (const f of tree.sort().slice(0, 40)) console.error(`    ${f}`);
  console.error(`\n  If these are sitting at the repo root, either move them back into src/`);
  console.error(`  and src/data/, or leave them — this script accepts both layouts.`);
  process.exit(1);
}

// exam-style.json is a bonus set. If it hasn't been uploaded yet, say so loudly
// and build without it rather than failing the whole deploy.
function locateOptional(...candidates) {
  for (const rel of candidates) {
    const p = join(root, rel);
    if (existsSync(p)) return p;
  }
  return null;
}

const read = p => readFileSync(p, 'utf8');

const templatePath  = locate('template.html',   'src/template.html', 'template.html', 'src/data/template.html');
const questionsPath = locate('questions.json',  'src/data/questions.json', 'src/questions.json', 'data/questions.json', 'questions.json');
const reviewPath    = locate('review.json',     'src/data/review.json', 'src/review.json', 'data/review.json', 'review.json');
const correctionsPath = locate('corrections.json', 'src/data/corrections.json', 'src/corrections.json', 'data/corrections.json', 'corrections.json');
const examStylePath   = locateOptional('src/data/exam-style.json', 'src/exam-style.json', 'data/exam-style.json', 'exam-style.json');
const explainPath     = locateOptional('src/data/explanations.json', 'src/explanations.json', 'data/explanations.json', 'explanations.json');
const cafPath         = locateOptional('src/data/caf-set.json', 'src/caf-set.json', 'data/caf-set.json', 'caf-set.json');

console.log('inputs:');
for (const p of [templatePath, questionsPath, reviewPath, correctionsPath]) console.log('  ' + relative(root, p));
console.log('  ' + (examStylePath ? relative(root, examStylePath)
  : 'exam-style.json  << NOT FOUND, so set 24 is missing from this build'));
console.log('  ' + (explainPath ? relative(root, explainPath)
  : 'explanations.json  << NOT FOUND, hand-written rationales will be missing'));
console.log('  ' + (cafPath ? relative(root, cafPath)
  : 'caf-set.json  << NOT FOUND, so set 25 is missing from this build'));

const template = read(templatePath);
const questions = JSON.parse(read(questionsPath));
const review = JSON.parse(read(reviewPath));
const corrections = JSON.parse(read(correctionsPath));
// set 24 is written for this app and carries a rationale for every option
if (examStylePath) for (const q of JSON.parse(read(examStylePath)).questions) questions.push(q);
// set 25 covers the Cloud Adoption Framework, which the community bank barely touches
if (cafPath) for (const q of JSON.parse(read(cafPath)).questions) questions.push(q);

// hand-written rationales for questions the glossary cannot reach
if (explainPath) {
  const byIdForExpl = new Map(questions.map(q => [String(q.i), q]));
  const expl = JSON.parse(read(explainPath)).explanations;
  for (const [id, e] of Object.entries(expl)) {
    const q = byIdForExpl.get(id);
    if (!q) { console.error(`build failed - explanations.json targets missing question ${id}`); process.exit(1); }
    q.k = e.k; q.r = e.r;
  }
}

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

// ---- derive a stem-group id ----
// Some questions appear in more than one practice set. Each set keeps its copy,
// but the app uses this id so one round never asks the same thing twice. It is
// derived here on every build and is deliberately NOT stored in the source data.
const norm = t => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const groups = new Map();
for (const q of questions) {
  if ('g' in q) delete q.g;
  const k = norm(q.q);
  if (!groups.has(k)) groups.set(k, groups.size + 1);
  q.g = groups.get(k);
}
const repeated = questions.length - groups.size;

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
  const keySet = new Set((q.o || []).map(o => o[0]));
  for (const a of q.a || []) if (!keySet.has(a)) problems.push(`${at}: answer ${a} is not one of the options`);
  if (![1, 2, 3, 4].includes(q.d)) problems.push(`${at}: bad domain ${q.d}`);
  if (/<\s*\/?\s*(br|p|div|span)\b/i.test(q.q)) problems.push(`${at}: raw html left in the stem`);
  // the source markdown sometimes leaves option A on the question's own line,
  // which silently swallows it into the stem
  if (/\s-\s*[A-F]\.\s/.test(q.q)) problems.push(`${at}: an option marker is stuck inside the stem`);
  const letters = (q.o || []).map(o => o[0]);
  const expected = 'ABCDEF'.slice(0, letters.length).split('');
  if (letters.join('') !== expected.join('')) problems.push(`${at}: option letters are ${letters.join('')}, expected ${expected.join('')}`);
  const want = /choose two|select two/i.test(q.q) ? 2 : /choose three|select three/i.test(q.q) ? 3 : null;
  if (want && q.a.length !== want) problems.push(`${at}: says choose ${want} but the key has ${q.a.length}`);
}
// every question that ships a rationale must cover each option and say why the key is right
for (const q of questions) {
  if (!q.r && !q.k) continue;
  const at = `question ${q.i}`;
  if (!q.r) { problems.push(`${at}: has a key insight but no per-option rationales`); continue; }
  // set 24 is authored whole, so it must explain every option; the patch file
  // written against the glossary only needs to cover the options it claims to
  if (q.src === 'orig') {
    if (!q.k) problems.push(`${at}: has per-option rationales but no key insight`);
    for (const [letter] of q.o) {
      if (!q.r[letter] || q.r[letter].trim().length < 15) problems.push(`${at}: option ${letter} has no usable rationale`);
    }
  } else {
    for (const [letter, line] of Object.entries(q.r)) {
      if (line.trim().length < 15) problems.push(`${at}: the rationale for option ${letter} is too short to be useful`);
    }
  }
  for (const letter of Object.keys(q.r)) {
    if (!q.o.some(o => o[0] === letter)) problems.push(`${at}: rationale for option ${letter}, which doesn't exist`);
  }
  for (const a of q.a) {
    if (q.r[a] && !/^correct\b/i.test(q.r[a])) problems.push(`${at}: the rationale for keyed option ${a} should start by confirming it`);
  }
  for (const [letter] of q.o) {
    if (!q.a.includes(letter) && /^correct\b/i.test(q.r[letter] || '')) problems.push(`${at}: option ${letter} is not keyed but its rationale says it is correct`);
  }
}

// no set may ask the same question twice
const perSet = new Map();
for (const q of questions) {
  if (!(q.e > 0)) continue;
  const k = `${q.e}::${norm(q.q)}`;
  if (perSet.has(k)) problems.push(`set ${q.e}: Q${perSet.get(k)} and Q${q.n} are the same question`);
  else perSet.set(k, q.n);
}
// every question that shares a stem with another must carry the same group tag,
// or the random modes can't tell they're the same
const stems = new Map();
for (const q of questions) {
  const k = norm(q.q);
  if (!stems.has(k)) stems.set(k, []);
  stems.get(k).push(q);
}
for (const [, rows] of stems) {
  if (rows.length < 2) continue;
  const tags = new Set(rows.map(q => q.g));
  if (tags.size !== 1 || tags.has(undefined)) {
    problems.push(`questions ${rows.map(q => q.i).join(', ')} share a stem but are not grouped`);
  }
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
            `${fixed} key correction(s), ${noted} disputed note(s), ` +
            `${repeated} cross-set repeats (de-duplicated in random modes), ` +
            `${questions.filter(q => q.r).length} with full per-option rationales`);
