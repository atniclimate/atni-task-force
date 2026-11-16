// The Energy and Water Use page (R2, Council Agenda). It opens with a brief and an agenda of four questions: the streamed hour (ru-hour, a meter), the 2030
// forecasts (ru-forecasts), water counting the power plant (ru-water, a meter), and what to ask a developer or utility to disclose (a list face that ticks the
// page's form). Six chapters follow under the rail, with ru-electricity and ru-boundary leading theirs; the rest is the page's own: closed disclosures that a
// deep link opens, the rail, poured figures and claim marks, bench rows, four hand-kept figures, the meeting sheet's form, and the no-script page.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { JSDOM, ROOT, ok, eq, wait, read, plateFile, receiptsOn, open, fire, key, holds, leads } = require('./lib');

const REL = 'site/data-centers/resource-use/index.html';
const html = read(REL);
const PAGE = 'http://localhost/site/data-centers/resource-use/index.html';
const SOURCES = 'site/data-centers/resource-use/sources/index.html';
const receipt = receiptsOn(SOURCES);
// The page as it stood before the refresh: old ids and source links must survive.
const OLD_COMMIT = '2d8003f';
const old = execFileSync('git', ['-C', ROOT, 'show', `${OLD_COMMIT}:${REL}`], { encoding: 'utf8' });
const CLAIMS = {};
for (const name of fs.readdirSync(path.join(ROOT, 'site/data/claims'))) for (const c of JSON.parse(read(`site/data/claims/${name}`)).claims || []) CLAIMS[c.id] = c;
// The plates in page order, with their rows on the plot: the three faces, then the two chapter leads.
const PLATES = { 'ru-hour': 4, 'ru-forecasts': 5, 'ru-water': 3, 'ru-electricity': 3, 'ru-boundary': 16 };
const FACES = { 'face-hour': 'ru-hour', 'face-growth': 'ru-forecasts', 'face-water': 'ru-water', 'face-ask': null };
const CHAPTERS = ['what-data-centers-use', 'what-drives-that-use', 'streaming-and-ai-compared-carefully', 'water', 'what-this-means-for-tribal-decisions', 'what-is-not-known'];

const load = (hash = '') => open(html, `${PAGE}${hash}`, (window) => {
  window.seen = [];
  window.IntersectionObserver = class {
    constructor(cb) { this.cb = cb; window.spy = this; }
    observe(el) { window.seen.push(el); }
  };
  window.ResizeObserver = class { observe() {} }; // plate.js watches the rail and each plot
  window.Element.prototype.scrollIntoView = function () { window.scrolled = this.id; };
  Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async (t) => { window.clip = t; } } });
});

// A claim's figure as a plate prints it: grouped, as stated, the range in parentheses or alone.
const num = (v) => v.toLocaleString('en-US', { maximumFractionDigits: 20 });
function figureOf(c, range = c) {
  const { low, high } = range;
  if (c.value != null) return low != null && high != null ? `${num(c.value)} (${num(low)} to ${num(high)})` : num(c.value);
  if (low != null && high != null) return `${num(low)} to ${num(high)}`;
  return low != null ? `at least ${num(low)}` : `up to ${num(high)}`;
}
const row = (root, k) => root.querySelector(`[data-row="${k}"]`);
const near = (a, b) => Math.abs(a - b) / b < 0.01;
// The main page's own text, without its generated plate and bench blocks.
const own = (source) => source.replace(/<!-- (plate|bench):(\S+) -->[\s\S]*?<!-- \/\1:\2 -->/g, '');

async function ids() {
  const { window: { document } } = new JSDOM(html);
  const before = new JSDOM(old).window.document;
  const all = [...document.querySelectorAll('[id]')].map((n) => n.id);
  eq(new Set(all).size, all.length, 'no id is used twice');
  // Old section links still land: a chapter keeps its h2; a section the agenda or a chapter absorbed keeps its id on what took it in.
  const absorbed = { 'the-short-version': 'SECTION', 'how-to-read-the-figures': 'H3', 'growth-trajectories': 'H3', 'materials-and-e-waste': 'H3' };
  for (const h of before.querySelectorAll('h2[id]:not(#facts-title)')) {
    const now = document.getElementById(h.id);
    ok(now && now.tagName === (absorbed[h.id] || 'H2'), `old h2 id ${h.id} lands on a ${absorbed[h.id] || 'H2'}`);
  }
  ok(document.getElementById('the-short-version').matches('section.agenda'), 'the old Short Version link lands on the agenda that replaced it (resource-use-16)');
  const moved = { water: 'water-use' };
  for (const h of before.querySelectorAll('h3[id]')) {
    const id = moved[h.id] || h.id;
    ok(document.querySelector(`h3#${id}`), `old h3 id ${h.id} lands on ${id}`);
  }
  eq(document.querySelector('h2#water').textContent, 'Water', 'the h2 keeps water');
  eq(document.querySelector('h3#water-use').textContent, 'Water', 'the h3 becomes water-use');
  eq(document.querySelector('.site-nav a[href="../../energy/"]').hasAttribute('aria-current'), false, 'Energy is not current');
  eq(document.querySelectorAll('.site-nav [aria-current]').length, 1, 'one current section in the main nav');
  ok(!document.querySelector('.site-header .subnav') && document.querySelector('main .brief-name a[href="../"]'), 'the header is the same as every page\'s, and the name line leads back to Data Centers (home-shell-21)');
  for (const id of Object.keys(PLATES)) eq(document.getElementById(`${id}-title`).closest('[data-plate]').id, id, `${id}-title names its plate`);
}

async function content() {
  const { window: { document } } = new JSDOM(html);
  const words = (doc) => doc.querySelector('main').textContent.replace(/\s+/g, ' ');
  const before = new JSDOM(old).window.document;
  // Every old link target is still on the page or on its Sources page (owner ruling 39), or was replaced by a claim's source.
  const listed = new JSDOM(read(SOURCES)).window.document;
  const hrefs = new Set([...document.querySelectorAll('a[href]'), ...listed.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')));
  const gone = [...new Set([...before.querySelectorAll('main a[href^="https"]')].map((a) => a.getAttribute('href')))].filter((u) => !hrefs.has(u));
  // The Google blog's machine-learning share gave way to the paper that states its one-week basis (ru-040, N3 11/05/2026).
  const replaced = ['https://arxiv.org/abs/2304.03271', 'https://sustainability.aboutamazon.com/2025-aws-summary.pdf', 'https://research.google/blog/good-news-about-the-carbon-footprint-of-machine-learning-training'];
  eq(gone.filter((u) => !replaced.includes(u)).join(' '), '', 'no other old source link is lost');
  // The text names its sources and links none: a figure's source is its claim mark's, and every other document is on the Sources page (resource-use-18).
  const outside = new JSDOM(own(html)).window.document;
  eq([...outside.querySelectorAll('main a[href^="http"]')].map((a) => a.getAttribute('href')).join(' '), '', 'no source link in the page\'s own text');
  ok(listed.querySelector('#text-documents li a[href^="https://"]') && listed.querySelector('.sources-rail a[href="#text-documents"]'), 'the documents the text names are listed on the Sources page, and its rail links them');
  // Subjects that must survive (a quoted source stays verbatim), and filler the plan cuts.
  for (const s of ['monitoring data', 'queue', '"a stressed water system,"', 'turnover', 'network measurements', 'Workload', '500-milliliter', 'Tribal government', 'the wrong binary']) {
    ok(words(document).includes(s), `kept: ${s}`);
  }
  for (const s of ['The spread is itself a finding', 'the honest measure of how much is unknown', 'Who benefits?', 'The Short Version']) {
    ok(!words(document).includes(s), `cut: ${s}`);
  }
  // The brief: the name line, the h1, a lead with no figure, and the Sources checked date with the Sources link (DIRECTION-R2 3.1).
  const brief = document.querySelector('main > header.brief');
  eq(brief.querySelector('h1').textContent, 'What a data center uses, how well it is known, and what to ask for', 'the h1 says what the page settles');
  ok(!/\d/.test(brief.querySelector('.brief-lead').textContent), 'the lead states no figure (resource-use-17)');
  ok(/10\/29\/2026/.test(brief.querySelector('.brief-meta .figure-num').textContent) && brief.querySelector('.brief-meta .figure-label').textContent === 'Sources checked' && brief.querySelector('.brief-meta a[data-sources][href="sources/"]'), 'one date, then the Sources page');
  eq(document.querySelectorAll('.page-band-figures, .ru-notice-line, .key-facts, .page-hero').length, 0, 'the old band, its claim ids, and its three dates are gone (resource-use-14, -17)');
  // The agenda: four questions, each a jump link to its face; three faces hold a plate and the fourth the disclosure list (resource-use-16, -22).
  const qs = [...document.querySelectorAll('.agenda-q > a')];
  eq(qs.map((a) => a.getAttribute('href')).join(), Object.keys(FACES).map((f) => `#${f}`).join(), 'four questions, in order');
  for (const [face, plate] of Object.entries(FACES)) {
    const node = document.getElementById(face);
    ok(node && node.closest('.agenda-faces'), `${face} is a face`);
    if (plate) ok(node.querySelector(`[data-plate="${plate}"]`) && document.querySelector(`.agenda-a[data-answer="${plate}"]`).textContent.length > 40, `${face} holds ${plate}, and its answer is built`);
  }
  ok(document.getElementById('face-ask').querySelector('#ru-disclosure-title') && document.querySelectorAll('#face-ask [data-sheet-add]').length === document.querySelectorAll('form[data-sheet] fieldset').length, 'the disclosure face holds the table and one Add per question set');
  for (const b of document.querySelectorAll('[data-sheet-add]')) {
    const set = document.getElementById(b.dataset.sheetAdd);
    ok(set && set.matches('fieldset.ask-set'), `${b.dataset.sheetAdd} is a set`);
    ok(b.textContent.includes(`(${set.querySelectorAll('input[name="ask"]').length})`), `its button counts its ${set.querySelectorAll('input').length} questions`);
  }
  // One form, each question once, each with a value of its set's id.
  eq(document.querySelectorAll('form[data-sheet]').length, 1, 'one form for the sheet');
  for (const box of document.querySelectorAll('input[name="ask"]')) ok(box.value.startsWith(`${box.closest('fieldset').id}-`), `a question's value names its set: ${box.value}`);
  eq(new Set([...document.querySelectorAll('input[name="ask"]')].map((b) => b.value)).size, document.querySelectorAll('input[name="ask"]').length, 'no question twice');
  ok(document.querySelector('script[src$="sheet.js"]') && document.querySelectorAll('button.paper[data-sheet-open][data-js]').length >= 1, 'the sheet loads, with its button');
  ok(document.querySelector('#what-this-means-for-tribal-decisions ~ .ru-intro a[href="#face-ask"]'), 'the prose names the disclosure table by a link to its face (P-ru critic 9)');
  ok(/columns: 3 19rem/.test(read('site/assets/css/ru.css')), 'the question sets pack into columns, not grid rows (P-ru critic 8)');
  ok(document.querySelector('#the-short-version > h2.sr-only#agenda-title') && document.getElementById('the-short-version').getAttribute('aria-labelledby') === 'agenda-title', 'an h2 stands between the h1 and the face titles (P-ru critic 18)');
  // The chapters and the rail.
  eq([...document.querySelectorAll('.ru-section > h2')].map((h) => h.id).join(), CHAPTERS.join(), 'six chapters, in order');
  eq([...document.querySelectorAll('.toc-chapters a')].map((a) => a.hash.slice(1)).join(), CHAPTERS.join(), 'the rail names each chapter');
  eq([...document.querySelectorAll('.toc-out a')].map((a) => a.getAttribute('href')).join(), 'sources/,#top', 'and ends with Sources and Top (resource-use-09)');
  ok(document.getElementById('ru-electricity').parentElement.id === '' && document.getElementById('ru-electricity').closest('.ru-section').querySelector('h2').id === 'what-data-centers-use', 'ru-electricity leads What Data Centers Use');
  eq(document.getElementById('ru-boundary').closest('.ru-section').querySelector('h2').id, 'streaming-and-ai-compared-carefully', 'ru-boundary leads Streaming and AI Compared Carefully');
  // Bench rows link out to the plates on the other two pages, and draw no ruler that looks like a slider (resource-use-11).
  const bench = { 'ai-same-hour': '../../ai/index.html#ai-same-hour', 'dc-eia-servers': '../index.html#dc-eia-servers', 'dc-water-intensity': '../index.html#dc-water-intensity', 'ai-company-footprint': '../../ai/index.html#ai-company-footprint' };
  const links = [...document.querySelectorAll('.bench-link a')].map((a) => a.getAttribute('href'));
  eq(links.length, 4, 'four bench rows');
  for (const target of Object.values(bench)) ok(links.includes(target), `a bench row opens ${target}`);
  for (const r of document.querySelectorAll('.bench-reading')) ok(r.textContent.trim().length > 20, 'a bench row holds a Reading');
  ok(/\.ru-bench \.bench-ruler \{ display: none; \}/.test(read('site/assets/css/ru.css')) && /\.ru-bench \.bench-link a::after \{ content: ""; position: absolute; inset: 0; \}/.test(read('site/assets/css/ru.css')), 'the ruler goes and the whole row is the link');
  // Poured figures are filled; a poured figure in the text is a claim mark, so its source is one press away.
  const poured = [...document.querySelectorAll('[data-pour]')];
  ok(poured.length > 60, `figures are poured: ${poured.length}`);
  for (const n of poured) ok(n.textContent.trim() && n.textContent.trim() !== 'x', `filled: ${n.dataset.pour}`);
  for (const n of outside.querySelectorAll('main [data-pour]:not([data-field="limit"]):not([data-field="source"]):not([data-field="unit"])')) {
    ok(n.closest('a.cr') || n.closest('summary'), `${n.dataset.pour} is marked, or sits in a summary sentence`);
  }
  ok(document.querySelectorAll('main a.cr').length > 200, 'the text marks its figures');
  // A partly verified figure poured in prose prints its limit on the page.
  for (const id of ['fp-122', 'fp-070', 'dem-041']) eq(document.querySelector(`[data-pour="${id}"][data-field="limit"]`).textContent, CLAIMS[id].limit, `${id}'s limit stands in the prose`);
  // Every disclosure starts closed: one rule, and the page fits fewer screens (resource-use-09).
  eq(document.querySelectorAll('details[open]').length, 0, 'every disclosure starts closed');
  // The derived figures of the evidence refresh: each is said to be derived, with its arithmetic beside it, and what it rests on is poured or names a claim.
  const test = [...document.querySelectorAll('.ru-detail > p')].find((p) => /quick test/.test(p.textContent)).textContent.replace(/\s+/g, ' ');
  for (const s of ['485 over 3, derived', '162 TWh over each, derived', '55 times 2.88, derived', '162 TWh over 158 Wh, derived', '1 trillion hours over 8 billion people over 365 days, derived', '52 to 124 trillion hours']) ok(test.includes(s), `the arithmetic prints: ${s}`);
  ok(!/3\.9 Wh|41 to 124/.test(test), 'the figure with no claim behind it is gone');
  ok(near(485 / 3, 162) && near(162e12 / 1.3, 124e12) && near(162e12 / 3.1, 52e12) && near(8e9 * 8760, 70e12) && near(55 * 2.88, 158) && near(162e12 / 158 / 1e12, 1.025) && near(1.025e12 / 8e9 / 365 * 60, 21) && near(57.8 / 485, 0.119), 'and it holds');
  eq(CLAIMS['dem-040'].value, 485, 'dem-040 is still 485');
  eq(CLAIMS['fp-122'].value, 1.3, 'fp-122 is still 1.3');
  eq(CLAIMS['fp-141'].high, 3.1, 'fp-141 still tops out at 3.1');
  eq(CLAIMS['fp-130'].value, 2.88, 'fp-130 is still 2.88');
  ok(/55 x 2\.88 = 158\.4/.test(CLAIMS['fp-150'].derived), 'fp-150 holds 158.4 in its arithmetic');
  ok(/0\.055 kWh per GB = 55 Wh per GB/.test(CLAIMS['ec-024'].derived), 'ec-024 holds 55 Wh per GB');
  const model = JSON.parse(read('site/data/comparison-model.json'));
  ok(near(model.computed_defaults.scale.youtube_dc_twh_top, 57.8), 'the model still holds 57.8 TWh');
  eq(model.assumptions.video_dc_intensity.options.top_down, 55, 'and 55 Wh per GB');
  ok(test.includes(CLAIMS['fp-150'].limit), 'and the top-down figure prints its limit');
  ok(/57\.8 TWh over 485, derived/.test(words(document)), 'the 12 percent shows its arithmetic');
  // The AI share arithmetic that only The Short Version held moved into AI Training and Inference, with its marks.
  ok(document.getElementById('ai-training-and-inference').closest('details').querySelector('a.cr[data-claim="ru-011"]'), 'ru-011 keeps its sentence');
  // The streamed hour's sentence: the retired 70 Wh made the UK share "about a quarter"; its replacement makes it a sliver. It moved from the face's head into
  // Video and Streaming, so the face's plot rises; the face's answer says the same with the plate's own figures.
  const video = document.getElementById('video-and-streaming').closest('details').textContent.replace(/\s+/g, ' ');
  ok(/about 1 percent on Carbon Trust's own reading and about 0\.3 percent on the UK follow-up \(derived\)/.test(video) && document.querySelector('a.cr[data-claim="ru-003"]') && document.querySelector('a.cr[data-claim="ru-004"]'), 'the streamed hour\'s shares stand in the text, marked');
  ok(!/quarter/.test(document.querySelector('#ru-hour').textContent), 'and the hour reads as its figure draws it');
  ok(CLAIMS['ru-003'].value === 1 && CLAIMS['ru-004'].value === 0.3 && Math.abs(60 / 192.3 - 0.3) < 0.05, 'and the shares hold');
  // The hand-kept companies figure: marks on the ruler, and each row's figures are claim marks.
  const marks = [...document.querySelectorAll('.ru-track i')];
  ok(marks.length > 0, 'marks drawn');
  for (const m of marks) {
    for (const v of ['--x', '--lo', '--hi']) {
      const raw = m.style.getPropertyValue(v);
      if (raw) ok(Number(raw) >= 0 && Number(raw) <= 1, `${v} inside the ruler: ${raw}`);
    }
  }
  for (const tr of document.querySelectorAll('.ru-chart tbody tr:not(.ru-group-head)')) {
    ok(tr.querySelector('th').textContent.trim() && tr.querySelector('td:last-child').textContent.trim(), 'a row has a label and a value');
    ok(tr.querySelector('td:last-child a.cr') && /company-reported$/.test(tr.querySelector('.ru-note').textContent), `a row's figure is marked and its note names the report: ${tr.querySelector('th').textContent.slice(0, 40)}`);
  }
  // Table regions can be scrolled by keyboard and carry a name: the hand-kept figures' and each plate's.
  const regions = [...document.querySelectorAll('.table-wrap')];
  eq(regions.length, 4, 'four hand-kept figures with tables: the resource ledger, drivers, companies, disclosure');
  // The resource ledger: each resource at three scales, every figure a claim mark, every row opening its section (P-ru critic 15).
  const ledger = document.getElementById('ru-ledger-title').closest('figure');
  eq([...ledger.querySelectorAll('tbody th a')].map((a) => a.getAttribute('href')).join(), '#electricity,#water-use,#land,#materials', 'the ledger names the four resources');
  for (const a of ledger.querySelectorAll('tbody th a')) ok(document.getElementById(a.hash.slice(1)).closest('details.ru-detail'), `${a.hash} opens its section`);
  for (const td of ledger.querySelectorAll('tbody td')) ok(td.classList.contains('is-gap') ? /^None in this review$/.test(td.textContent) : td.querySelector('a.cr[data-claim]'), `a ledger cell is a claim mark or says there is none: ${td.textContent.slice(0, 30)}`);
  for (const r of regions) {
    eq(r.getAttribute('role'), 'region', 'region role');
    eq(r.getAttribute('tabindex'), '0', 'keyboard stop');
    ok(document.getElementById(r.getAttribute('aria-labelledby')), 'region named');
  }
  for (const id of Object.keys(PLATES)) {
    const region = document.querySelector(`#${id} .table-scroll`);
    ok(region.getAttribute('role') === 'region' && region.getAttribute('tabindex') === '0' && region.getAttribute('aria-label'), `${id}: its Table is a named keyboard stop`);
  }
  eq(document.querySelectorAll('canvas, iframe, video').length, 0, 'nothing heavy');
  eq(document.querySelectorAll('.ru-boundary, .ru-hour-row, .ru-stack, input[name="ru-boundary"]').length, 0, 'the hand-drawn hour, the hand-kept water split, and the CSS-only switch are gone');
}

// Each plate as built, with no script: every number on the plot is its claim's own, placed on the ruler from that claim, with the claim id in the Table
// and its receipt (and a partly claim's limit) on the Sources page. The two meters' parts add up to their claims' wholes on one fixed scale.
async function plates() {
  const { window: { document } } = new JSDOM(html);
  eq([...document.querySelectorAll('[data-plate]')].map((n) => n.id).join(), Object.keys(PLATES).join(), 'five plates, in page order');
  for (const [id, count] of Object.entries(PLATES)) {
    const def = plateFile(id);
    const root = document.getElementById(id);
    const data = JSON.parse(document.getElementById(`plate-data-${id}`).textContent);
    eq(def.page, 'data-centers/resource-use/index.html', `${id} names this page`);
    eq(root.querySelectorAll('.ladder-row').length, count, `${id}: ${count} rows on the plot`);
    const lines = [...root.querySelectorAll('table.plate-table tbody tr')];
    ok(lines.length >= count, `${id}: every row in the Table`);
    const groups = def.plot.groups || [{ id: undefined }];
    for (const spec of def.rows.filter((r) => r.claim)) {
      const c = CLAIMS[spec.claim];
      const range = spec.range_from ? CLAIMS[spec.range_from] : c;
      const node = row(root, spec.id);
      const shown = `${figureOf(c, range)} ${(def.plot.units || {})[c.unit] || c.unit}`;
      eq(node.querySelector('.ladder-value').textContent.replace(/\s+/g, ' ').trim(), shown, `${id} ${spec.id}: ${spec.claim} prints as its claim states it`);
      // Placed from the claim: a log ruler by decades, a linear one from its low end.
      const group = groups.find((g) => g.id === spec.group) || groups[0];
      const [lo, hi] = group.domain || def.plot.domain;
      const t = def.plot.scale === 'log' ? Math.log10 : (v) => v;
      const at = (v) => (t(v) - t(lo)) / (t(hi) - t(lo));
      for (const [name, v] of [['--x', c.value], ['--lo', range.low], ['--hi', range.high]]) {
        if (v == null) continue;
        ok(Math.abs(+node.style.getPropertyValue(name) - at(v)) < 1e-4, `${id} ${spec.id}: ${name} is ${spec.claim}'s place on the ruler`);
      }
      const line = lines.find((l) => l.dataset.key === spec.id);
      ok(line.querySelector('th').textContent === spec.label && [...line.lastElementChild.querySelectorAll('a[data-claim]')].map((a) => a.dataset.claim).includes(spec.claim), `${id} ${spec.id}: the Table names ${spec.claim}`);
      for (const claim of [spec.claim, ...(spec.cites || []), ...(spec.range_from ? [spec.range_from] : [])]) {
        ok(receipt(`${id}-source-${claim}`), `${id}: ${claim} has its receipt on the Sources page`);
        eq(data.receipts[claim].status, CLAIMS[claim].status, `${id}: ${claim} keeps its status`);
        if (CLAIMS[claim].status === 'partly') eq(data.receipts[claim].limit, CLAIMS[claim].limit, `${id}: ${claim} carries its limit`);
      }
      for (const claim of spec.cites || []) ok(spec.label.includes(String(CLAIMS[claim].value)), `${id} ${spec.id}: the label's figure is ${claim}'s`);
    }
    // A computed row cites every claim its formula and its parts read, and each has its receipt.
    for (const spec of def.rows.filter((r) => r.formula)) {
      const names = new Set([...Object.values(spec.formula).filter(Boolean).flatMap((f) => Object.values(f)), ...(spec.segments || []).map((x) => x.value)].join(' ').match(/[a-z_]+[0-9]*/g));
      for (const [name, input] of Object.entries(def.inputs)) if (names.has(name)) ok(spec.cites.includes(input.claim), `${id} ${spec.id}: cites ${input.claim}, which ${name} reads`);
      for (const claim of spec.cites) ok(receipt(`${id}-source-${claim}`) && data.receipts[claim].status === CLAIMS[claim].status, `${id}: ${claim} has its receipt and status`);
    }
    ok(root.querySelector('.reading').textContent.length > 20, `${id}: a default Reading`);
    ok(root.querySelector('.plate-title').textContent.length <= 120, `${id}: a title of at most 120 characters`);
    eq(root.querySelectorAll('.plate-controls, .plate-switch').length > 0, !!def.controls,`${id}: ${def.controls ? 'one setting, the meter\'s stop' : 'no setting to keep in the address'}`);
  }
  const plate = (id) => document.getElementById(id);
  // The hour (a meter): Carbon Trust's parts add up to its whole, the UK follow-up's two parts to its, and the data center's ruler is the hour's a hundred times larger.
  const hour = plateFile('ru-hour');
  const v = (id) => CLAIMS[id].value;
  ok(near(v('fp-037') + v('fp-038') + v('fp-039') + v('fp-040') + v('ru-001'), v('fp-035')) && near(v('fp-141') + v('ru-002'), v('fp-143')), 'the parts add up to each whole');
  eq(hour.plot.domain[1] / hour.plot.groups.find((g) => g.id === 'dc').domain[1], 100, 'the inset is the hour a hundred times larger');
  ok(holds(plate('ru-hour').querySelector('.plate-title').textContent, [`${num(v('fp-037'))} Wh`, `${num(v('fp-035'))} Wh`, figureOf(CLAIMS['fp-141'])]), 'the hour: 1 Wh of 188, and 0.6 (0.3 to 3.1) Wh');
  ok(row(plate('ru-hour'), 'ct-whole').querySelectorAll('.meter-part').length === 3 && row(plate('ru-hour'), 'desnz-whole').querySelectorAll('.meter-part').length === 2, 'the parts are drawn');
  eq(row(plate('ru-hour'), 'ct-whole').querySelector('.ladder-value').textContent, `${v('fp-037')} Wh`, 'the hour starts on the data center alone, the question it answers (P-ru critic 4)');
  eq(row(plate('ru-hour'), 'ct-whole').querySelectorAll('.meter-part.is-ghost').length, 2, 'and the parts it leaves out are dashed');
  // The UK follow-up's remainder is not split, so it has its own key, not the Network ink (P-ru critic 3).
  const hourKey = [...plate('ru-hour').querySelectorAll('.plate-legend li')].map((li) => [li.firstElementChild.className, li.textContent]);
  ok(hourKey.some(([cls, text]) => /is-p2/.test(cls) && text === 'Network') && hourKey.some(([cls, text]) => /is-p4/.test(cls) && /not split/.test(text)), 'the key names the unsplit remainder apart from Network');
  ok(hour.rows.find((r) => r.id === 'desnz-whole').segments[1].label.includes('not split') && read('site/assets/css/ru.css').includes('[data-row="desnz-whole"] .meter-part.is-p2:not(.is-ghost)'), 'and its part wears that key');
  // Water (a meter): on site, then the power plant on the same scale.
  const water = plateFile('ru-water');
  eq(water.plot.domain.join(), '0,1000', 'one fixed scale for water');
  eq(row(plate('ru-water'), 'us-2023').querySelector('.ladder-value').textContent, `${num(v('tr-001') + v('tr-004'))} billion liters`, 'with the power plant, 66 and nearly 800');
  // 2014 has no power plant figure, so it stands with 2023 on the on-site ruler, drawn at both settings (P-ru critic 6).
  eq(water.plot.domain[1] / water.plot.groups.find((g) => g.id === 'site').domain[1], 10, 'the on-site ruler is the whole ten times larger');
  ok(['site-2023', 'site-2014'].every((k) => !row(plate('ru-water'), k).classList.contains('is-gap') && row(plate('ru-water'), k).querySelector('.ladder-bar')), 'both years draw a bar');
  ok(document.querySelector('.agenda-a[data-answer="ru-water"]').textContent.trim().endsWith(`about ${Math.round(v('ru-118'))} times as much.`), 'the answer rounds the ratio as its limit does');
  // The growth face's answer is in its Reading: the AI figures, from the plate's own inputs (P-ru critic 5).
  ok(holds(plate('ru-forecasts').querySelector('.reading').textContent, [`${num(v('dem-043'))} percent in 2025`, `${num(v('ru-005'))} percent of data center electricity`]), 'the growth face reads its AI figures beside the plot');
  ok(holds(plate('ru-water').querySelector('.plate-facts').textContent, [`${num(v('ru-027'))} billion gallons`, `${num(v('ru-118'))} times`, CLAIMS['ru-118'].limit]), 'gallons beside the plot, and the ratio with its limit');
  // Titles say the default's figures, from their claims.
  ok(holds(plate('ru-electricity').querySelector('.plate-title').textContent, [`${num(v('dem-040'))} TWh`, '2025', '2030']), 'electricity: 485 TWh in 2025');
  ok(holds(plate('ru-forecasts').querySelector('.plate-title').textContent, [`${figureOf(CLAIMS['dem-051'])} TWh`, `${figureOf(CLAIMS['dem-030'])} TWh`]), 'the forecasts: the two ranges');
  ok(holds(document.querySelector('.agenda-a[data-answer="ru-forecasts"]').textContent, [`${v('dem-043')} percent`, `${v('ru-005')} percent`]) && holds(plate('ru-forecasts').querySelector('.plate-facts').textContent, [`${v('dem-043')} percent`, `${v('ru-005')} percent`]), 'the growth answer prints only figures its plate prints');
  ok(holds(plate('ru-electricity').querySelector('.plate-claim').textContent, [`${num(v('dem-042'))} percent`]), 'the year\'s growth, from its claim');
  ok(row(plate('ru-electricity'), 'w-2024').querySelector('.ladder-label').textContent.includes('1.5 percent') && /around 1\.5% of the world/.test(CLAIMS['dem-046'].quote), 'the 2024 share is dem-046\'s own');
  // Hollow is modeled; filled is measured or company-reported. Projections are dashed.
  const filled = ['dimpact', 'gemini', 'clip'];
  for (const id of ['ru-forecasts', 'ru-electricity', 'ru-boundary']) {
    for (const node of plate(id).querySelectorAll('.ladder-row')) {
      const hollow = node.querySelector('.ladder-mark.is-hollow, .ladder-bar.is-hollow');
      ok(id === 'ru-boundary' && filled.includes(node.dataset.row) ? !hollow : hollow, `${id} ${node.dataset.row}: ${hollow ? 'hollow' : 'filled'}`);
    }
  }
  ok(row(plate('ru-electricity'), 'w-2030').querySelector('.ladder-bar.is-proj'), 'the 2030 bar is a projection');
  for (const k of ['lbnl-2030', 'epri-2030']) ok(row(plate('ru-forecasts'), k).querySelector('.ladder-range.is-proj:not([hidden])'), `${k}: a dashed range`);
  ok(row(plate('ru-forecasts'), 'epri-2030').querySelector('.ladder-mark').hidden, 'a scenario range has no middle mark');
  const labels = [...plate('ru-boundary').querySelectorAll('.ladder-group-label')].map((n) => n.textContent);
  ok(labels.length === 2 && labels[0].startsWith('Data center only') && labels[1].startsWith('Whole chain'), 'one ruler for each boundary');
  ok(+row(plate('ru-boundary'), 'ct-dc').style.getPropertyValue('--x') < 0.3 && +row(plate('ru-boundary'), 'ct-whole').style.getPropertyValue('--x') > 0.8, 'the boundary does the work: 1 Wh, then 188 Wh');
  const facts = (id) => plate(id).querySelector('.plate-facts').textContent;
  ok(holds(facts('ru-electricity'), [`${num(v('dem-047'))} percent`, `${num(v('ru-036'))} percent`]), 'electricity: the United States share and the rest, beside the plot');
  ok(holds(facts('ru-forecasts'), [`${num(v('ru-010'))} TWh`, `${figureOf(CLAIMS['ru-121'])} TWh`, `${num(v('ru-089'))} TWh`]) && facts('ru-forecasts').includes(CLAIMS['ru-089'].limit), 'the forecasts: Gartner twice and the IEA as LBNL describes it, with its limit');
}

async function behavior() {
  const shut = (doc, id) => doc.getElementById(id).closest('details');
  const a = await load();
  eq(a.errors.join(), '', 'no script errors');
  ok(!shut(a.document, 'cryptocurrency').open, 'a disclosure starts closed');
  const link = a.document.querySelector('a[href="#cryptocurrency"]');
  link.dispatchEvent(new a.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  ok(shut(a.document, 'cryptocurrency').open, 'a figure row opens its evidence');
  await wait(150); // jsdom follows the link later; let it land first
  a.window.location.hash = '#land';
  await wait(150);
  eq(a.window.location.hash, '#land', 'the address moved');
  ok(shut(a.document, 'land').open, 'a hash change opens the disclosure');
  const b = await load('#ai-training-and-inference');
  ok(shut(b.document, 'ai-training-and-inference').open, 'a deep link opens the disclosure');
  ok(!shut(b.document, 'cryptocurrency').open, 'and only that one');
  for (const id of ['growth-trajectories', 'materials-and-e-waste', 'how-to-read-the-figures']) {
    const c = await load(`#${id}`);
    ok(shut(c.document, id).open && !c.errors.length, `an old section link, #${id}, opens the disclosure that holds it`);
  }
  const c = await load('#water');
  ok(c.document.getElementById('water'), 'an old h2 link lands');
  eq(c.errors.join(), '', 'no script errors on a deep link');
  // Print opens everything.
  a.window.dispatchEvent(new a.window.Event('beforeprint'));
  eq(a.document.querySelectorAll('details:not([open])').length, 0, 'print opens every disclosure');
  // The rail marks the chapter in view.
  const sections = [...a.document.querySelectorAll('.ru-section')];
  eq(a.window.seen.length, sections.length, 'every chapter is watched');
  eq(a.document.querySelectorAll('.toc-chapters a').length, sections.length, 'one rail link per chapter');
  for (const rail of a.document.querySelectorAll('.toc-chapters a')) ok(a.document.getElementById(rail.getAttribute('href').slice(1)).tagName === 'H2', 'rail links land on h2s');
  a.window.spy.cb([{ isIntersecting: true, target: sections[2] }]);
  const current = a.document.querySelectorAll('.toc a[aria-current]');
  eq(current.length, 1, 'one rail link is current');
  eq(current[0].getAttribute('href'), '#streaming-and-ai-compared-carefully', 'the right one');
  a.window.spy.cb([{ isIntersecting: true, target: sections[3] }]);
  eq(a.document.querySelector('.toc a[aria-current]').getAttribute('href'), '#water', 'it moves');

  // The agenda: a vertical tablist, the first face shown; a question opens its face and starts its plate.
  const d = await load();
  eq(d.errors.join(), '', 'no script errors with the plates');
  const tabs = [...d.document.querySelectorAll('.agenda-q > a')];
  ok(tabs.every((t) => t.getAttribute('role') === 'tab') && d.document.querySelector('.agenda-qs').getAttribute('aria-orientation') === 'vertical', 'the questions are a vertical tablist');
  eq(tabs[0].getAttribute('aria-selected'), 'true', 'the first question is chosen');
  for (const [i, face] of Object.keys(FACES).entries()) {
    fire(d.window, tabs[i], 'click');
    eq(d.document.getElementById(face).hidden, false, `${face} shows when its question is chosen`);
  }
  key(d.window, tabs[3], 'Home');
  eq(d.document.activeElement, tabs[0], 'Home goes back to the first question');
  const part = (id) => {
    const root = d.document.getElementById(id);
    return { root, plot: root.querySelector('.plate-plot'), reading: root.querySelector('.reading'), value: root.querySelector('.readout-value'), unit: root.querySelector('.readout-unit'), facts: root.querySelector('.plate-facts') };
  };
  for (const id of Object.keys(PLATES)) {
    const p = part(id);
    ok(p.root.classList.contains('is-live'), `${id} is live`);
    ok(p.plot.getAttribute('role') === 'listbox' && p.plot.getAttribute('tabindex') === '0' && p.plot.getAttribute('aria-labelledby') === `${id}-title`, `${id}: the plot is one named stop`);
    eq(p.plot.getAttribute('aria-activedescendant'), row(p.root, plateFile(id).default).id, `${id}: the default row is selected`);
  }
  // The streamed hour: the data center alone, the question it answers, then the whole hour, the axis held and the parts outside the data center dashed.
  const hour = part('ru-hour');
  eq(`${hour.value.textContent} ${hour.unit.textContent}`, `${num(CLAIMS['fp-037'].value)} Wh`, 'the hour opens on the data center: 1 Wh');
  ok(holds(hour.reading.textContent, ['Carbon Trust', 'Data center only', `${num(CLAIMS['fp-037'].value)} Wh`]),`the Reading says the setting: ${hour.reading.textContent}`);
  eq(row(hour.root, 'ct-whole').querySelectorAll('.meter-part.is-ghost').length, 2, 'the network and the home are dashed, not counted');
  const reach = hour.root.querySelector('input[name="reach"][value="whole"]');
  reach.checked = true;
  fire(d.window, reach, 'input');
  eq(`${hour.value.textContent} ${hour.unit.textContent}`, `${num(CLAIMS['fp-035'].value)} Wh`, 'Whole hour: 188 Wh');
  eq(row(hour.root, 'ct-whole').querySelectorAll('.meter-part.is-ghost').length, 0, 'every part counted');
  ok(hour.root.querySelector('.plate-title').textContent.includes('Whole hour'), 'the title follows the setting');
  fire(d.window, row(hour.root, 'desnz-dc'), 'click');
  ok(leads(hour.reading.textContent, ['UK follow-up, data center part', figureOf(CLAIMS['fp-141'])]), 'the inset row reads its claim');
  // Water: the power plant, then the site alone.
  const water = part('ru-water');
  eq(`${water.value.textContent} ${water.unit.textContent}`, `${num(CLAIMS['tr-001'].value + CLAIMS['tr-004'].value)} billion liters`, 'water opens counting the power plant');
  const site = water.root.querySelector('input[name="water"][value="site"]');
  site.checked = true;
  fire(d.window, site, 'input');
  eq(`${water.value.textContent} ${water.unit.textContent}`, `${num(CLAIMS['tr-001'].value)} billion liters`, 'on site only: 66 billion liters');
  // The boundary ruler: arrows cross from one ruler to the other, and stop at the ends.
  const edge = part('ru-boundary');
  key(d.window, edge.plot, 'ArrowDown');
  ok(leads(edge.reading.textContent, ['Video hour, DIMPACT', `${num(CLAIMS['fp-122'].value)} Wh`]) && edge.reading.textContent.includes(CLAIMS['fp-122'].limit), 'ArrowDown moves to DIMPACT, with its limit');
  key(d.window, edge.plot, 'End');
  eq(`${edge.value.textContent} ${edge.unit.textContent}`, `${num(CLAIMS['fp-143'].value)} (${num(CLAIMS['fp-143'].low)} to ${num(CLAIMS['fp-143'].high)}) Wh`, 'End reaches the whole chain\'s last row');
  key(d.window, edge.plot, 'ArrowDown');
  eq(edge.plot.getAttribute('aria-activedescendant'), row(edge.root, 'desnz-whole').id, 'and stops there');
  key(d.window, edge.plot, 'Home');
  ok(leads(edge.reading.textContent, ['Video hour, Carbon Trust, 2020', `${num(CLAIMS['fp-037'].value)} Wh`]), 'Home goes back to the first row');
  ok(row(edge.root, 'ct-dc').classList.contains('is-on') && !row(edge.root, 'ct-whole').classList.contains('is-on'), 'one row takes the orange: the selection');
  // Electricity: the projection names the IEA's other 2030 figure, with its limit.
  const power = part('ru-electricity');
  eq(`${power.value.textContent} ${power.unit.textContent}`, `${num(CLAIMS['dem-040'].value)} TWh`, 'electricity opens on 2025');
  fire(d.window, row(power.root, 'w-2030'), 'click');
  ok(holds(power.facts.textContent, [`${num(CLAIMS['dem-041'].value)} TWh`]) && power.facts.textContent.includes(CLAIMS['dem-041'].limit), 'the 2030 row shows the IEA\'s text figure and its limit');
  // The forecasts: the default, a scenario range, and the figures beside the plot at every row.
  const ahead = part('ru-forecasts');
  ok(leads(ahead.reading.textContent, ['LBNL, reference case, 2030', `${figureOf(CLAIMS['dem-029'], CLAIMS['dem-030'])} TWh`]), `the forecasts open on LBNL: ${ahead.reading.textContent}`);
  fire(d.window, row(ahead.root, 'epri-2030'), 'click');
  ok(leads(ahead.reading.textContent, ['EPRI, 2030', `${figureOf(CLAIMS['dem-051'])} TWh`]), 'a click selects the EPRI range');
  ok(ahead.facts.textContent.includes(CLAIMS['ru-089'].limit), 'the figures beside the plot stay, with their limits');
  // The disclosure face's Add ticks its set in the page's one form, and the ticks ride in the address.
  const add = d.document.querySelector('#face-ask [data-sheet-add="q-ru-water"]');
  fire(d.window, add, 'click');
  const ticked = [...d.document.querySelectorAll('#q-ru-water input[name="ask"]')];
  ok(ticked.length > 1 && ticked.every((box) => box.checked), 'Add ticks every question in its set');
  ok(decodeURIComponent(d.window.location.hash).includes(`ask=${ticked.map((box) => box.value).join('.')}`), 'and the ticks ride in the address');
  ok([...d.document.querySelectorAll('[data-sheet-open]')].every((btn) => btn.textContent === `Meeting sheet (${ticked.length})`), 'the sheet buttons count them');
  eq(d.errors.join(), '', 'no script errors after the walk');
}

// A link with settings after its anchor (#plate&name=value) names no element, so the browser lands nowhere; the kit lands on the anchor as the browser would on a
// plain #id: in view, and with focus there, where Tab and a screen reader start (a11y A1). Copy Reading writes that link. A face's plate opens its face first.
async function landing() {
  const a = await load();
  const plate = (doc, id) => doc.getElementById(id);
  fire(a.window, row(plate(a.document, 'ru-boundary'), 'gemini'), 'click');
  fire(a.window, plate(a.document, 'ru-boundary').querySelector('[data-copy]'), 'click');
  await wait(300);
  const link = a.window.clip.split('\n')[2]; // the title, the Reading, then the link
  ok(link.endsWith('#ru-boundary&ru-boundary=gemini'), `Copy reading's link names the plate, then its setting: ${link}`);
  const b = await load(link.slice(link.indexOf('#')));
  eq(b.window.scrolled, 'ru-boundary', 'that link scrolls to its plate');
  eq(b.document.activeElement, plate(b.document, 'ru-boundary'), 'and focus starts there, so Tab goes on into the plate');
  eq(plate(b.document, 'ru-boundary').getAttribute('tabindex'), '-1', 'which takes focus without joining the Tab order');
  eq(plate(b.document, 'ru-boundary').querySelector('.plate-plot').getAttribute('aria-activedescendant'), row(plate(b.document, 'ru-boundary'), 'gemini').id, 'with its setting');
  b.window.location.hash = '#ru-forecasts&ru-forecasts=epri-2030';
  await wait(20);
  ok(!b.document.getElementById('face-growth').hidden && b.document.activeElement === plate(b.document, 'ru-forecasts'), 'a link to a face\'s plate opens its face and lands there');
  const c = await load('#ru-boundary');
  ok(c.document.activeElement === c.document.body && !plate(c.document, 'ru-boundary').hasAttribute('tabindex'), 'a plain #id is left to the browser');
  const w = await load('#face-water&water=site');
  ok(!w.document.getElementById('face-water').hidden && w.document.querySelector('#ru-water .readout-value').textContent === String(CLAIMS['tr-001'].value), 'a water link opens its face at its setting');
  eq(a.errors.join() + b.errors.join() + c.errors.join() + w.errors.join(), '', 'no script errors');
}

async function noScripts() {
  const { window: { document } } = new JSDOM(html);
  eq(document.querySelectorAll('.ru-section').length, 6, 'every chapter renders');
  eq(document.querySelectorAll('details').length, document.querySelectorAll('details summary').length, 'every disclosure has a summary');
  eq([...document.querySelectorAll('summary')].filter((s) => !s.closest('[data-plate]') && s.textContent.trim().length < 20).length, 0, 'a summary is a sentence');
  // The agenda: its questions are jump links and every face is in the page, whole.
  for (const a of document.querySelectorAll('.agenda-q > a')) ok(document.getElementById(a.hash.slice(1)), `${a.hash} lands`);
  for (const face of Object.keys(FACES)) ok(document.getElementById(face).textContent.trim().length > 100, `${face} reads without scripts`);
  // Outside the plates nothing waits on a script; the sheet's buttons and a plate's controls, view switch, and chips do, by design.
  eq([...document.querySelectorAll('[hidden]:not([data-theme-toggle])')].filter((n) => !n.closest('[data-plate]')).length, 0, 'nothing waits on a script');
  for (const btn of document.querySelectorAll('[data-sheet-add], [data-sheet-open]')) ok(btn.hasAttribute('data-js'), 'a sheet button shows only with scripts');
  ok(document.querySelector('#face-ask a[href="#what-this-means-for-tribal-decisions"]'), 'without scripts the disclosure face links the questions');
  for (const root of document.querySelectorAll('[data-plate]')) {
    ok(root.querySelector('.reading').textContent.length > 20, `${root.id} default Reading`);
    ok(root.querySelector('table tbody tr'), `${root.id} table`);
    ok(root.querySelector('.plate-plot').firstElementChild, `${root.id} static plot`);
    ok(root.querySelector(`.plate-sources-link a[href="sources/#${root.id}"]`) && !root.querySelector('ol.plate-sources'), `${root.id} links its sources, and keeps no list`);
    eq(root.querySelectorAll('.plate-view[hidden]').length, 0, `${root.id}: every view shows`);
  }
}

module.exports = { groups: { ids, content, plates, behavior, landing, noScripts } };
