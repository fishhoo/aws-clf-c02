// Checks the built artifact itself. No dependencies, runs in about a second.
import { readFileSync } from 'node:fs';

const stemKey = t => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
let failed = 0;
const ok = (name, cond) => { console.log((cond ? '  ok  ' : 'FAIL  ') + name); if (!cond) failed++; };

// ---- self-contained ----
ok('no external script tags', !/<script[^>]+src=/i.test(html));
ok('no external stylesheets', !/<link[^>]+rel=["']?stylesheet/i.test(html));
ok('no @import', !/@import/.test(html));
ok('no build placeholders left', !html.includes('__DATA__') && !html.includes('__REVIEW__'));

// Links inside explanations are fine — they are passive hrefs. What matters is
// that nothing fetches on its own. Every fetch() call site must be one of the
// three that belong to the opt-in GitHub sync.
const allowed = [
  /^fetch\("https:\/\/api\.github\.com"\s*\+\s*path/,   // the API helper
  /^fetch\(f\.raw_url/,                                   // oversized gist body
  /^fetch\(bust\s*,/                                       // a link the user pasted
];
const sites = [...html.matchAll(/fetch\([^)]{0,60}/g)].map(m => m[0]);
const rogue = sites.filter(s => !allowed.some(re => re.test(s)));
if (rogue.length) console.log('   ', rogue.slice(0, 5));
ok('the only fetch call sites are the opt-in GitHub sync', rogue.length === 0);
ok('nothing auto-loads on page open', !/fetch\(/.test(html.slice(html.indexOf('async function loadS'), html.indexOf('function saveS'))));

// ---- payload ----
const qm = html.match(/const QUESTIONS = (\[.*?\]);\nconst REVIEW/s);
ok('question bank is present and parseable', !!qm);
const Q = JSON.parse(qm[1]);
ok('bank has every question', Q.length === 1346);
ok('the exam-style set is present', Q.filter(q => q.e === 24).length === 30);
ok('the CAF set is present', Q.filter(q => q.e === 25).length === 20);
const withR = Q.filter(q => q.r);
ok('hand-written rationales are attached', withR.length === 560);
const GLOSS = new Function('return [' + html.match(/const GLOSS_RAW = \[(.*?)\n\];/s)[1] +
  '].map(([p,n,l])=>[new RegExp(p,"i"),n,l]);')();
const explained = q => q.o.every(([k, v]) => (q.r && q.r[k]) || GLOSS.find(g => g[0].test(v)));
ok('every question explains every option', Q.every(explained));
for (const [d, name] of [[1, 'cloud concepts'], [2, 'security'], [3, 'technology'], [4, 'billing']]) {
  ok(`${name}: no bare options`, Q.filter(q => q.d === d).every(explained));
}

ok('set 24 explains every option',
   Q.filter(q => q.src === 'orig').every(q => q.o.every(([k]) => (q.r[k] || '').trim().length >= 15)));
ok('no patched rationale is a stub',
   withR.every(q => Object.values(q.r).every(v => v.trim().length >= 15)));
ok('a keyed option that has a rationale confirms itself',
   withR.every(q => q.a.every(a => !q.r[a] || /^correct\b/i.test(q.r[a]))));
ok('no distractor claims to be correct',
   withR.every(q => q.o.every(([k]) => q.a.includes(k) || !/^correct\b/i.test(q.r[k]))));
ok('set 24 carries a key insight on every question',
   Q.filter(q => q.src === 'orig').every(q => (q.k || '').trim().length > 30));
ok('the exam-style set spans all four domains',
   new Set(Q.filter(q => q.e === 24).map(q => q.d)).size === 4);
ok('CAF is covered by more than a single question',
   Q.filter(q => /cloud adoption framework|\bCAF\b/i.test(q.q)).length >= 10);
ok('25 sets survived the build', new Set(Q.filter(q => q.e > 0).map(q => q.e)).size === 25);
ok('155 service scenarios survived the build', Q.filter(q => q.src === 'svc').length === 155);
ok('every question has a valid key', Q.every(q => q.a.every(a => q.o.some(o => o[0] === a))));
ok('no stray markup in any stem', !Q.some(q => /<\s*\/?\s*(br|p|div|span)\b/i.test(q.q)));
ok('no option swallowed into a stem', !Q.some(q => /\s-\s*[A-F]\.\s/.test(q.q)));
ok('option letters run A, B, C… with no gaps', Q.every(q => {
  const l = q.o.map(o => o[0]).join('');
  return l === 'ABCDEF'.slice(0, q.o.length);
}));

// ---- every option survived the pipeline ----
const optCounts = Q.reduce((m, q) => (m[q.o.length] = (m[q.o.length] || 0) + 1, m), {});
console.log('    options per question:', JSON.stringify(optCounts));
ok('no question has fewer than three options', Q.every(q => q.o.length >= 3));
ok('no option text is blank', Q.every(q => q.o.every(o => o[1] && o[1].trim().length > 1)));
ok('no option text is repeated inside a question',
   Q.every(q => new Set(q.o.map(o => o[1].toLowerCase().replace(/[^a-z0-9]+/g, ''))).size === q.o.length));
ok('"choose two" questions offer at least four options',
   Q.filter(q => /choose two|select two/i.test(q.q)).every(q => q.o.length >= 4));

// ---- duplicates ----
const nrm = t => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const inSet = new Map(), clashes = [];
for (const q of Q) {
  if (!(q.e > 0)) continue;
  const k = `${q.e}::${nrm(q.q)}`;
  if (inSet.has(k)) clashes.push(`set ${q.e}: Q${inSet.get(k)} == Q${q.n}`);
  else inSet.set(k, q.n);
}
if (clashes.length) console.log('   ', clashes.slice(0, 5));
ok('no set asks the same question twice', clashes.length === 0);

const stems = new Map();
for (const q of Q) { const k = nrm(q.q); stems.set(k, [...(stems.get(k) || []), q]); }
const shared = [...stems.values()].filter(v => v.length > 1);
console.log(`    ${shared.length} stems appear in more than one set`);
ok('every question carries a group id', Q.every(q => Number.isInteger(q.g) && q.g > 0));
ok('questions that share a stem share one group id',
   shared.every(rows => new Set(rows.map(q => q.g)).size === 1));
ok('different stems never share a group id',
   new Set(Q.map(q => q.g)).size === new Set(Q.map(q => stemKey(q.q))).size);
ok('group ids are derived at build time, not stored in the source',
   !readFileSync(new URL('../src/data/questions.json', import.meta.url), 'utf8').includes('"g":'));

// ---- audit layer ----
const fixes = Q.filter(q => q.fix), disputes = Q.filter(q => q.dis);
ok('audited corrections are applied', fixes.length === 11);
ok('every correction carries its reasoning', fixes.every(q => q.fix.length > 40));
ok('disputed keys are flagged', disputes.length === 9);
ok('corrected keys point at real options', fixes.every(q => q.a.every(a => q.o.some(o => o[0] === a))));

// no duplicated stem may disagree on the answer TEXT any more
const norm = t => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const byStem = new Map();
for (const q of Q) {
  const k = norm(q.q);
  const key = q.a.map(a => norm((q.o.find(o => o[0] === a) || ['', ''])[1])).sort().join('|');
  if (!byStem.has(k)) byStem.set(k, new Set());
  byStem.get(k).add(key);
}
// two keys agree if one answer text contains the other ("Awareness" vs "Awareness and training")
const agree = keys => {
  const parts = [...keys].map(k => k.split('|'));
  return parts.every(p => parts.every(o =>
    p.length === o.length && p.every((x, i) => x.includes(o[i]) || o[i].includes(x))));
};
const conflicts = [...byStem.entries()].filter(([, v]) => v.size > 1 && !agree(v));
if (conflicts.length) console.log('   ', conflicts.slice(0, 3).map(c => c[0].slice(0, 60)));
ok('no repeated question disagrees with itself', conflicts.length === 0);

// a random round must never ask the same thing twice — simulate 200 draws
const uniqQ = list => { const seen = new Set(); return list.filter(q => {
  const k = q.g ? 'g' + q.g : 'i' + q.i; if (seen.has(k)) return false; seen.add(k); return true; }); };
let worstRepeat = 0;
for (let trial = 0; trial < 200; trial++) {
  const pool = Q.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const draw = uniqQ(pool).slice(0, 65);
  const stemsSeen = new Set(draw.map(q => norm(q.q)));
  worstRepeat = Math.max(worstRepeat, draw.length - stemsSeen.size);
}
ok('200 simulated 65-question rounds contain no repeat', worstRepeat === 0);
ok('a full de-duplicated pass still covers every distinct question',
   uniqQ(Q).length === new Set(Q.map(q => norm(q.q))).size);

const rm = html.match(/const REVIEW = (\{.*?\});\n/s);
ok('study notes are present and parseable', !!rm);
const R = JSON.parse(rm[1]);
ok('163 study notes', R.services.length === 163);
ok('32 comparison groups', R.pairs.length === 32);
ok('the six CAF perspectives all appear in the study notes',
   ['business','people','governance','platform','security','operations']
     .every(p => R.services.some(s => s.n.toLowerCase() === 'caf: ' + p + ' perspective')));
ok('study notes carry both languages', R.services.every(s => s.en && s.th));

// ---- theming ----
const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
const rules = style
  .replace(/:root\{[\s\S]*?\}/, '')
  .replace(/body\[data-theme="light"\]\{[\s\S]*?\}/, '');
ok('no colours hardcoded outside the token blocks', !/#[0-9A-Fa-f]{3,6}|rgba?\(/.test(rules));
ok('both themes are defined', /:root\{/.test(style) && /body\[data-theme="light"\]\{/.test(style));

const lum = hex => {
  const v = [1, 3, 5].map(i => parseInt(hex.substr(i, 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const tokens = block => Object.fromEntries([...block.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9A-Fa-f]{6})/g)].map(m => [m[1], m[2]]));
const dark = tokens(style.slice(style.indexOf(':root{'), style.indexOf('body[data-theme="light"]')));
const light = tokens(style.slice(style.indexOf('body[data-theme="light"]')));
for (const [name, T] of [['dark', dark], ['light', light]]) {
  ok(`${name}: body text meets AA`, ratio(T.txt, T.ink) >= 4.5);
  ok(`${name}: body text is not harsh`, ratio(T.txt, T.ink) < 14);
  ok(`${name}: secondary text meets AA`, ratio(T.mut, T.ink) >= 4.5);
  ok(`${name}: faint text meets AA-large`, ratio(T.dim, T.ink) >= 3);
  ok(`${name}: text on the accent button meets AA`, ratio(T['on-accent'], T.amber) >= 4.5);
  ok(`${name}: all four domain colours readable`, [T.d1, T.d2, T.d3, T.d4].every(c => ratio(c, T.ink) >= 3));
}

console.log(failed ? `\n${failed} FAILURES` : '\nintegrity: all checks passed');
process.exit(failed ? 1 : 0);
