// Drives the built app in jsdom and walks the paths a person actually takes.
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
const ok = (name, cond) => { console.log((cond ? '  ok  ' : 'FAIL  ') + name); if (!cond) failed++; };

function boot({ hostStore = false, netThrows = true } = {}) {
  const mem = {};
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://drill.test/',
    beforeParse(w) {
      w.scrollTo = () => {}; w.confirm = () => true; w.alert = () => {};
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
      if (hostStore) w.storage = {
        get: async k => { if (!(k in mem)) throw 0; return { key: k, value: mem[k] }; },
        set: async (k, v) => { mem[k] = v; }
      };
      if (netThrows) w.fetch = () => { throw new Error('the app must not need the network'); };
    }
  });
  return { w: dom.window, d: dom.window.document, mem };
}

const { w, d } = boot();
const q = s => d.querySelector(s);
const qa = s => [...d.querySelectorAll(s)];

// one click of progress, whatever state the question is in
async function step() {
  if (!q('.verdict')) { qa('.opt')[0].click(); q('[data-main]').click(); }
  q('[data-main]').click();
  await wait(0);
}

(async () => {
  await wait(400);

  // ---------- home ----------
  ok('home renders', /CLF-C02 Drill/.test(d.body.textContent));
  ok('all six modes offered', qa('.mode').length === 6);
  ok('mistakes mode starts disabled', q('[data-go="wrong"]').disabled);
  ok('domain heat bar rendered', qa('.heat .hd').length === 4);

  // ---------- practice set, with feedback ----------
  q('[data-go="set"]').click(); await wait(40);
  ok('24 sets listed', qa('.exbtn').length === 24);
  qa('.exbtn')[0].click(); await wait(40);
  ok('quiz opens', !!q('.qcard'));
  ok('check is disabled until something is picked', q('[data-main]').disabled);
  qa('.opt')[0].click();
  ok('check enables after a pick', !q('[data-main]').disabled);
  q('[data-main]').click(); await wait(20);
  ok('verdict appears', !!q('.verdict'));
  ok('correct option is marked', qa('.opt.right').length >= 1);
  ok('explanation renders without a network call', !!q('.why-box'));
  ok('per-option notes render', qa('.opt-note').length > 0);

  for (let i = 0; i < 60 && q('.qcard'); i++) await step();
  await wait(200);
  ok('finishing a set reaches results', /Results ·/.test(d.body.textContent));
  ok('score ring drawn', !!q('.ring b'));
  ok('per-domain breakdown drawn', /This round by domain/.test(d.body.textContent));
  qa('.filters .chip')[2].click(); await wait(20);
  ok('review lists all 50', qa('.item').length === 50);
  const item = q('.item'); item.open = true; item.dispatchEvent(new w.Event('toggle')); await wait(30);
  ok('review rows explain themselves', !!item.querySelector('.why-box'));

  q('[data-home]').click(); await wait(60);
  ok('stats recorded on home', q('.stat b').textContent === '50');
  ok('mistakes mode now available', !q('[data-go="wrong"]').disabled);
  await wait(600);
  ok('progress written to storage', !!w.localStorage.getItem('clf-c02-drill-v1'));

  // ---------- the exam-style set explains every option ----------
  q('[data-go="set"]').click(); await wait(40);
  qa('.exbtn')[23].click(); await wait(40);
  ok('set 24 is labelled as exam-style', /Exam-style set/.test(q('.qmeta').textContent));
  qa('.opt')[0].click(); q('[data-main]').click(); await wait(20);
  ok('every option gets its own rationale', qa('.opt-note').length === qa('.opt').length);
  ok('the key insight is shown', /The point of this question/.test(d.body.textContent));
  ok('the keyed option confirms itself', /^Correct\b/.test(q('.opt.right .opt-note').textContent));
  q('[data-quit]').click(); await wait(60);

  // ---------- exam simulation ----------
  q('[data-go="sim"]').click(); await wait(60);
  ok('sim is 65 questions', /\/ 65/.test(q('.hud-in').textContent));
  ok('sim shows a timer', !!q('#timer'));
  qa('.opt')[0].click(); q('[data-main]').click(); await wait(20);
  ok('sim withholds the answer', !q('.verdict'));

  // walk the whole 65 and make sure no question comes round twice
  const stems = [];
  for (let i = 0; i < 70 && q('.qcard'); i++) {
    stems.push(q('.qtext').textContent.trim());
    const last = /Submit/.test(q('[data-main]').textContent);
    if (last) break;
    q('[data-main]').click(); await wait(0);
  }
  ok('a 65-question sim asks 65 different questions',
     stems.length >= 60 && new Set(stems).size === stems.length);
  ok('sim lets you go back', !!q('[data-back]'));
  q('[data-back]').click(); await wait(20);
  ok('going back lands on an earlier question', !!q('.qcard'));
  q('[data-quit]').click(); await wait(60);

  // ---------- service scenarios ----------
  q('[data-go="svc"]').click(); await wait(40);
  ok('service categories offered', qa('[data-cats] .chip').length >= 12);
  qa('[data-count] .chip')[0].click();
  q('[data-start]').click(); await wait(40);
  ok('service drill runs', /Service scenario ·/.test(q('.qmeta').textContent));
  ok('service questions have four options', qa('.opt').length === 4);
  q('[data-quit]').click(); await wait(60);

  // ---------- study notes ----------
  q('[data-go="review"]').click(); await wait(60);
  ok('study notes open', /What each service is for/.test(d.body.textContent));
  ok('service cards render', qa('.rcard').length > 50);
  const box = q('.search'); box.value = 'Glacier'; box.oninput(); await wait(20);
  ok('search narrows the list', qa('.rcard').length > 0 && qa('.rcard').length < 20);
  box.value = ''; box.oninput(); await wait(20);
  q('[data-lang="th"]').click(); await wait(30);
  ok('thai copy available', /บริการและคอนเซปต์/.test(d.body.textContent));
  q('[data-lang="en"]').click(); await wait(30);
  q('[data-tab="pairs"]').click(); await wait(30);
  ok('30 comparison groups render', qa('.rcard.pair').length === 30);
  q('[data-tab="services"]').click(); await wait(20);
  q('[data-drill]').click(); await wait(60);
  ok('drilling straight from the notes works', !!q('.qcard'));
  q('[data-quit]').click(); await wait(60);

  // ---------- a random round never repeats a question ----------
  const dupCounts = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    q('[data-go="sim"]').click(); await wait(60);
    const stems = w.eval('R.qs.map(q=>q.g?("g"+q.g):("i"+q.i))');
    dupCounts.push(stems.length - new Set(stems).size);
    q('[data-quit]').click(); await wait(40);
  }
  ok('three exam simulations, none repeats a question', dupCounts.every(n => n === 0));

  q('[data-go="drill"]').click(); await wait(40);
  qa('[data-count] .chip')[3].click();   // 50 questions
  q('[data-start]').click(); await wait(60);
  const drill = w.eval('R.qs.map(q=>q.g?("g"+q.g):("i"+q.i))');
  ok('a 50-question domain drill has no repeats', drill.length === new Set(drill).size);
  q('[data-quit]').click(); await wait(40);

  // ---------- theme ----------
  ok('starts dark', d.body.getAttribute('data-theme') === 'dark');
  q('[data-themebtn]').click(); await wait(60);
  ok('switches to light', d.body.getAttribute('data-theme') === 'light');
  await wait(600);
  ok('theme choice persists', JSON.parse(w.localStorage.getItem('clf-c02-drill-v1')).theme === 'light');
  q('[data-themebtn]').click(); await wait(60);

  // ---------- export / import ----------
  let blob = null;
  w.URL.createObjectURL = b => { blob = b; return 'blob:x'; };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () {};
  const answeredBefore = q('.stat b').textContent;
  q('[data-export]').click(); await wait(20);
  ok('export produces a file', !!blob);
  const text = typeof blob.text === 'function' ? await blob.text()
    : await new Promise(res => { const fr = new w.FileReader(); fr.onload = () => res(fr.result); fr.readAsText(blob); });
  ok('export is tagged and carries stats', JSON.parse(text).app === 'clf-c02-drill');

  const two = boot();
  await wait(400);
  ok('a fresh browser starts empty', two.d.querySelector('.stat b').textContent === '0');
  const input = two.d.querySelector('[data-file]');
  Object.defineProperty(input, 'files', { value: [new two.w.File([text], 'p.json')], configurable: true });
  input.onchange(); await wait(250);
  ok('import restores the progress', two.d.querySelector('.stat b').textContent === answeredBefore);

  // ---------- host storage wins when present ----------
  const hosted = boot({ hostStore: true });
  await wait(400);
  ok('an embedded host store is preferred', /Progress is saved automatically/.test(hosted.d.body.textContent));

  console.log(failed ? `\n${failed} FAILURES` : '\nui: all checks passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
