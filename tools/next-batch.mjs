// Lists the questions that still lack a rationale on every option, worst first,
// so the next writing batch is obvious.  node tools/next-batch.mjs [count]
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const G = new Function('return [' + html.match(/const GLOSS_RAW = \[(.*?)\n\];/s)[1] +
  '].map(([p,n,l])=>[new RegExp(p,"i"),n,l]);')();
const Q = JSON.parse(html.match(/const QUESTIONS = (\[.*?\]);\nconst REVIEW/s)[1]);

const gaps = [];
for (const q of Q) {
  if (q.r) continue;
  const missing = q.o.filter(([, v]) => !G.find(g => g[0].test(v)));
  if (missing.length) gaps.push({ q, missing: missing.length });
}
gaps.sort((a, b) => b.missing - a.missing || a.q.i - b.q.i);

const want = Number(process.argv[2] || 25);
console.log(`${gaps.length} questions still have at least one unexplained option\n`);
for (const { q, missing } of gaps.slice(0, want)) {
  console.log(`#${q.i}  d${q.d}  ${q.e ? 's' + q.e + 'q' + q.n : 'svc'}  (${missing}/${q.o.length} unexplained)`);
  console.log('  ' + q.q);
  for (const [k, v] of q.o) {
    const g = G.find(x => x[0].test(v));
    console.log(`   ${q.a.includes(k) ? '*' : ' '}${k}. ${v}${g ? '   [glossary: ' + g[1] + ']' : ''}`);
  }
  console.log();
}
