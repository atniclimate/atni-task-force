// The resource use page. It has no tabs. Its four plates (the streamed hour, world electricity, the boundary ruler, and the 2030 forecasts) run on the kit;
// the rest is the page's own: deep links into disclosures, the rail, poured figures, bench rows, two hand-kept figures, and the no-script page.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { JSDOM, ROOT, ok, eq, wait, read, plateFile, open, fire, key, holds, leads } = require('./lib');

const REL = 'site/data-centers/resource-use/index.html';
const html = read(REL);
const PAGE = 'http://localhost/site/data-centers/resource-use/index.html';
// The page as it stood before the refresh: old ids and source links must survive.
const OLD_COMMIT = '2d8003f';
const old = execFileSync('git', ['-C', ROOT, 'show', `${OLD_COMMIT}:${REL}`], { encoding: 'utf8' });
const CLAIMS = {};
for (const name of fs.readdirSync(path.join(ROOT, 'site/data/claims'))) for (const c of JSON.parse(read(`site/data/claims/${name}`)).claims || []) CLAIMS[c.id] = c;
// The plates in page order, with their rows on the plot.
const PLATES = { 'ru-hour': 12, 'ru-electricity': 3, 'ru-boundary': 16, 'ru-forecasts': 5 };

const load = (hash = '') => open(html, `${PAGE}${hash}`, (window) => {
  window.seen = [];
  window.IntersectionObserver = class {
    constructor(cb) { this.cb = cb; window.spy = this; }
    observe(el) { window.seen.push(el); }
  };
  window.ResizeObserver = class { observe() {} }; // plate.js watches the rail and each plot
  window.Element.prototype.scrollIntoView = function () { window.scrolled = this.id; };
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

async function ids() {
  const { window: { document } } = new JSDOM(html);
  const before = new JSDOM(old).window.document;
  const all = [...document.querySelectorAll('[id]')].map((n) => n.id);
  eq(new Set(all).size, all.length, 'no id is used twice');
  for (const h of before.querySelectorAll('h2[id]:not(#facts-title)')) ok(document.querySelector(`h2#${h.id}`), `old h2 id ${h.id} is still an h2`); // the band's hidden Key Facts heading went with its box; its list names itself
  const moved = { water: 'water-use' };
  const seenWater = [...before.querySelectorAll('h3[id]')];
  for (const h of seenWater) {
    const id = moved[h.id] || h.id;
    ok(document.querySelector(`h3#${id}`), `old h3 id ${h.id} lands on ${id}`);
  }
  eq(document.querySelector('h2#water').textContent, 'Water', 'the h2 keeps water');
  eq(document.querySelector('h3#water-use').textContent, 'Water', 'the h3 becomes water-use');
  eq([...document.querySelectorAll('p')].filter((p) => p.textContent.trim() === '---').length, 0, 'no stray rule lines');
  eq(document.querySelector('.site-nav a[href="../../energy/"]').hasAttribute('aria-current'), false, 'Energy is not current');
  eq(document.querySelectorAll('.site-nav [aria-current]').length, 1, 'one current section in the main nav');
  eq(document.querySelectorAll('.subnav [aria-current="page"]').length, 1, 'one current page in the subnav');
  // The figures' title ids survive as the plates' own.
  for (const id of Object.keys(PLATES)) eq(document.getElementById(`${id}-title`).closest('[data-plate]').id, id, `${id}-title names its plate`);
}

async function content() {
  const { window: { document } } = new JSDOM(html);
  const words = (doc) => doc.querySelector('main').textContent.replace(/\s+/g, ' ');
  const before = new JSDOM(old).window.document;
  // Every old link target is still on the page, or was replaced by a claim's source.
  const hrefs = new Set([...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')));
  const gone = [...new Set([...before.querySelectorAll('main a[href^="https"]')].map((a) => a.getAttribute('href')))].filter((u) => !hrefs.has(u));
  // The Google blog's machine-learning share gave way to the paper that states its one-week basis (ru-040, N3 11/05/2026).
  const replaced = ['https://arxiv.org/abs/2304.03271', 'https://sustainability.aboutamazon.com/2025-aws-summary.pdf', 'https://research.google/blog/good-news-about-the-carbon-footprint-of-machine-learning-training'];
  eq(gone.filter((u) => !replaced.includes(u)).join(' '), '', 'no other old source link is lost');
  // Subjects that must survive (a quoted source stays verbatim), and filler the plan cuts.
  for (const s of ['monitoring data', 'queue', '"a stressed water system,"', 'turnover', 'network measurements', 'Workload', '500-milliliter', 'Tribal government']) {
    ok(words(document).includes(s), `kept: ${s}`);
  }
  for (const s of ['The spread is itself a finding', 'the honest measure of how much is unknown', 'Who benefits?']) {
    ok(!words(document).includes(s), `cut: ${s}`);
  }
  // Bench rows link out to the plates on the other two pages.
  const bench = { 'ai-same-hour': '../../ai/index.html#ai-same-hour', 'dc-eia-servers': '../index.html#dc-eia-servers', 'dc-water-intensity': '../index.html#dc-water-intensity', 'ai-company-footprint': '../../ai/index.html#ai-company-footprint' };
  const links = [...document.querySelectorAll('.bench-link a')].map((a) => a.getAttribute('href'));
  eq(links.length, 4, 'four bench rows');
  for (const target of Object.values(bench)) ok(links.includes(target), `a bench row opens ${target}`);
  for (const r of document.querySelectorAll('.bench-reading')) ok(r.textContent.trim().length > 20, 'a bench row holds a Reading');
  // Poured figures are filled; poured source links go to https.
  const poured = [...document.querySelectorAll('[data-pour]')];
  ok(poured.length > 100, 'figures are poured');
  for (const n of poured) ok(n.textContent.trim() && n.textContent.trim() !== 'x', `filled: ${n.dataset.pour}`);
  for (const a of document.querySelectorAll('a[data-pour]')) ok(a.getAttribute('href').startsWith('https://'), `source link: ${a.dataset.pour}`);
  // A partly verified figure poured in prose prints its limit on the page, now that the figure captions that held three of them are plates.
  for (const id of ['fp-122', 'fp-070', 'dem-041']) eq(document.querySelector(`[data-pour="${id}"][data-field="limit"]`).textContent, CLAIMS[id].limit, `${id}'s limit stands in the prose`);
  // The band: three bare figures, each poured with its source, and no box.
  const band = [...document.querySelectorAll('.page-band-figures > li')];
  eq(band.length, 3, 'three figures in the band');
  eq(band[0].querySelector('.figure-num').textContent, '485 TWh', 'band figure');
  for (const li of band) {
    ok(li.querySelector('.figure-num[data-pour]') && li.querySelector('.figure-label a[data-pour][data-field="source"]').getAttribute('href').startsWith('https://'), `the band's ${li.querySelector('.figure-num').textContent} is poured, with its source`);
    ok(/modeled/.test(li.querySelector('.figure-label').textContent), 'and says it is modeled');
  }
  eq(document.querySelectorAll('.key-facts, .page-hero').length, 0, 'the band has no box');
  ok(/All modeled, not metered\. Sources checked 10\/29\/2026/.test(words(document)), 'the sources date prints');
  // The first screen is the streamed-hour plate, at the column's full width, ahead of the section's text; each other plate leads its section the same way.
  const first = document.querySelector('.ru-section');
  ok(first.children[1] === document.getElementById('ru-hour') && first.children[2].id === 'plate-data-ru-hour' && first.children[3].matches('.ru-columns'), 'the plate leads the first section, and its text follows in columns');
  eq(document.querySelector('.ru-split.is-even'), null, 'it no longer shares a row with the text');
  for (const id of ['ru-electricity', 'ru-boundary', 'ru-forecasts']) {
    const plate = document.getElementById(id);
    ok(plate.parentElement.matches('.ru-section') && plate.previousElementSibling.tagName === 'H2' && !plate.closest('.ru-split'), `${id} sits under its section's heading, at the column's width`);
  }
  // The derived figures of the evidence refresh: each is said to be derived, with its arithmetic beside it, and what it rests on is poured or names a claim.
  const test = [...document.querySelectorAll('.ru-detail > p')].find((p) => /quick test/.test(p.textContent)).textContent.replace(/\s+/g, ' ');
  for (const s of ['485 over 3, derived', '162 TWh over each, derived', '55 times 2.88, derived', '162 TWh over 158 Wh, derived', '1 trillion hours over 8 billion people over 365 days, derived', '52 to 124 trillion hours']) ok(test.includes(s), `the arithmetic prints: ${s}`);
  ok(!/3\.9 Wh|41 to 124/.test(test), 'the figure with no claim behind it is gone');
  const near = (a, b) => Math.abs(a - b) / b < 0.01;
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
  // The streamed hour's sentence: the retired 70 Wh made the UK share "about a quarter"; its replacement makes it a sliver.
  const hourReading = document.querySelector('#ru-hour .plate-claim').textContent.replace(/\s+/g, ' ');
  // 1 over 188 is finer than Carbon Trust's own rounding, so the page prints its own "roughly 1 percent" (ru-003) beside the figure's two numbers.
  ok(/about 1 percent on Carbon Trust's own reading \(1 of 188 Wh\)/.test(hourReading) && /about 0\.3 percent on the UK follow-up \(0\.6 of 192\.3 Wh, derived\)/.test(hourReading) && !/quarter/.test(hourReading), 'the streamed hour reads as its figure draws it');
  ok(CLAIMS['ru-003'].value === 1 && CLAIMS['ru-004'].value === 0.3 && Math.abs(60 / 192.3 - 0.3) < 0.05, 'and the shares hold');
  // The two hand-kept figures: marks on the ruler, one row each, and each chart row prints its value next to its mark.
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
    ok(tr.querySelector('a[href^="http"]'), `a row names its source: ${tr.querySelector('th').textContent.slice(0, 40)}`);
  }
  // Table regions can be scrolled by keyboard and carry a name: the hand-kept figures' and each plate's.
  const regions = [...document.querySelectorAll('.table-wrap')];
  ok(regions.length >= 3, 'three hand-kept figures with tables');
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
  eq(document.querySelectorAll('.ru-boundary, .ru-hour, input[name="ru-boundary"]').length, 0, 'the hand-drawn hour and the CSS-only switch are gone');
}

// Each plate as built, with no script: every number on the plot is its claim's own, placed on the ruler from that claim, with the claim id in the Table
// and its receipt (and a partly claim's limit) in Sources.
async function plates() {
  const { window: { document } } = new JSDOM(html);
  eq([...document.querySelectorAll('[data-plate]')].map((n) => n.id).join(), Object.keys(PLATES).join(), 'four plates, in page order');
  for (const [id, count] of Object.entries(PLATES)) {
    const def = plateFile(id);
    const root = document.getElementById(id);
    const data = JSON.parse(document.getElementById(`plate-data-${id}`).textContent);
    eq(def.page, 'data-centers/resource-use/index.html', `${id} names this page`);
    eq(root.querySelectorAll('.ladder-row').length, count, `${id}: ${count} rows on the plot`);
    const lines = [...root.querySelectorAll('table.plate-table tbody tr')];
    eq(lines.length, count, `${id}: every row in the Table`);
    const groups = def.plot.groups || [{ id: undefined }];
    for (const [i, spec] of def.rows.entries()) {
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
      const line = lines[i]; // in the plate's order: "Data center" is a row of two accounts
      ok(line.querySelector('th').textContent === spec.label && line.lastElementChild.textContent.split(', ').includes(spec.claim), `${id} ${spec.id}: the Table names ${spec.claim}`);
      for (const claim of [spec.claim, ...(spec.cites || []), ...(spec.range_from ? [spec.range_from] : [])]) {
        ok(root.querySelector(`#${id}-source-${claim}`), `${id}: ${claim} has its receipt`);
        eq(data.receipts[claim].status, CLAIMS[claim].status, `${id}: ${claim} keeps its status`);
        if (CLAIMS[claim].status === 'partly') eq(data.receipts[claim].limit, CLAIMS[claim].limit, `${id}: ${claim} carries its limit`);
      }
      // A number in a row's label is its cited claim's.
      for (const claim of spec.cites || []) ok(spec.label.includes(String(CLAIMS[claim].value)), `${id} ${spec.id}: the label's figure is ${claim}'s`);
    }
    ok(root.querySelector('.reading').textContent.length > 20, `${id}: a default Reading`);
    ok(root.querySelector('.plate-title').textContent.length <= 120, `${id}: a title of at most 120 characters`);
    eq(root.querySelectorAll('.plate-controls').length, 0, `${id}: no setting to keep in the address`);
  }
  const plate = (id) => document.getElementById(id);
  // Titles say the default's figures, from their claims.
  ok(holds(plate('ru-hour').querySelector('.plate-title').textContent, [`${num(CLAIMS['fp-037'].value)} Wh`, figureOf(CLAIMS['fp-141'])]), 'the hour: 1 Wh and 0.6 (0.3 to 3.1) Wh');
  ok(holds(plate('ru-electricity').querySelector('.plate-title').textContent, [`${num(CLAIMS['dem-040'].value)} TWh`, '2025', '2030']), 'electricity: 485 TWh in 2025');
  ok(holds(plate('ru-forecasts').querySelector('.plate-title').textContent, [`${figureOf(CLAIMS['dem-051'])} TWh`, `${figureOf(CLAIMS['dem-030'])} TWh`]), 'the forecasts: the two ranges');
  ok(holds(plate('ru-electricity').querySelector('.plate-claim').textContent, [`${num(CLAIMS['dem-042'].value)} percent`]), 'the year\'s growth, from its claim');
  // The one figure a plate types itself: the 2024 row's share of the world's electricity, from that row's own claim's quote.
  ok(row(plate('ru-electricity'), 'w-2024').querySelector('.ladder-label').textContent.includes('1.5 percent') && /around 1\.5% of the world/.test(CLAIMS['dem-046'].quote), 'the 2024 share is dem-046\'s own');
  // Hollow is modeled; filled is measured or company-reported, as the hand figures drew them. Projections are dashed.
  const filled = ['dimpact', 'gemini', 'clip'];
  for (const [id] of Object.entries(PLATES)) {
    for (const node of plate(id).querySelectorAll('.ladder-row')) {
      const hollow = node.querySelector('.ladder-mark.is-hollow, .ladder-bar.is-hollow');
      ok(id === 'ru-boundary' && filled.includes(node.dataset.row) ? !hollow : hollow, `${id} ${node.dataset.row}: ${hollow ? 'hollow' : 'filled'}`);
    }
  }
  ok(row(plate('ru-electricity'), 'w-2030').querySelector('.ladder-bar.is-proj'), 'the 2030 bar is a projection');
  for (const k of ['lbnl-2030', 'epri-2030']) ok(row(plate('ru-forecasts'), k).querySelector('.ladder-range.is-proj:not([hidden])'), `${k}: a dashed range`);
  ok(row(plate('ru-forecasts'), 'epri-2030').querySelector('.ladder-mark').hidden, 'a scenario range has no middle mark');
  // Two rulers on one log scale: the same streamed hour sits at 1 Wh inside the data center and at 188 Wh on the whole chain.
  const labels = [...plate('ru-boundary').querySelectorAll('.ladder-group-label')].map((n) => n.textContent);
  ok(labels.length === 2 && labels[0].startsWith('Data center only') && labels[1].startsWith('Whole chain'), 'one ruler for each boundary');
  ok(+row(plate('ru-boundary'), 'ct-dc').style.getPropertyValue('--x') < 0.3 && +row(plate('ru-boundary'), 'ct-whole').style.getPropertyValue('--x') > 0.8, 'the boundary does the work: 1 Wh, then 188 Wh');
  // The figures that stand beside a plot, with no mark: each with its claim's figure and, where partly verified, its limit.
  const facts = (id) => plate(id).querySelector('.plate-facts').textContent;
  ok(holds(facts('ru-electricity'), [`${num(CLAIMS['dem-047'].value)} percent`, `${num(CLAIMS['ru-036'].value)} percent`]), 'electricity: the United States share and the rest, beside the plot');
  ok(holds(facts('ru-forecasts'), [`${num(CLAIMS['ru-010'].value)} TWh`, `${figureOf(CLAIMS['ru-121'])} TWh`, `${num(CLAIMS['ru-089'].value)} TWh`]) && facts('ru-forecasts').includes(CLAIMS['ru-089'].limit), 'the forecasts: Gartner twice and the IEA as LBNL describes it, with its limit');
  // The hour's three rulers share one scale, so the data center's sliver reads against its whole.
  eq(new Set(plateFile('ru-hour').plot.groups.map((g) => String(g.domain || plateFile('ru-hour').plot.domain))).size, 1, 'one scale for the hour');
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
  const c = await load('#water');
  ok(c.document.getElementById('water'), 'an old h2 link lands');
  eq(c.errors.join(), '', 'no script errors on a deep link');
  // Print opens everything.
  a.window.dispatchEvent(new a.window.Event('beforeprint'));
  eq(a.document.querySelectorAll('details:not([open])').length, 0, 'print opens every disclosure');
  // The rail marks the section in view.
  const sections = [...a.document.querySelectorAll('.ru-section')];
  eq(a.window.seen.length, sections.length, 'every section is watched');
  eq(a.document.querySelectorAll('.toc a').length, sections.length, 'one rail link per section');
  for (const rail of a.document.querySelectorAll('.toc a')) ok(a.document.getElementById(rail.getAttribute('href').slice(1)).tagName === 'H2', 'rail links land on h2s');
  a.window.spy.cb([{ isIntersecting: true, target: sections[4] }]);
  const current = a.document.querySelectorAll('.toc a[aria-current]');
  eq(current.length, 1, 'one rail link is current');
  eq(current[0].getAttribute('href'), '#streaming-and-ai-compared-carefully', 'the right one');
  a.window.spy.cb([{ isIntersecting: true, target: sections[6] }]);
  eq(a.document.querySelector('.toc a[aria-current]').getAttribute('href'), '#water', 'it moves');

  // The plates, with the kit: a list box each, one Tab stop, the selection in the detail panel.
  const d = await load();
  eq(d.errors.join(), '', 'no script errors with the plates');
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
  // The streamed hour: the data center's sliver, then its whole.
  const hour = part('ru-hour');
  eq(`${hour.value.textContent} ${hour.unit.textContent}`, `${num(CLAIMS['fp-037'].value)} Wh`, 'the hour opens on the data center');
  ok(leads(hour.reading.textContent, ['Data center', '2020', 'Carbon Trust', `${num(CLAIMS['fp-037'].value)} Wh`]) && /modeled/.test(hour.reading.textContent), `the hour's Reading: ${hour.reading.textContent}`);
  fire(d.window, row(hour.root, 'ct-whole'), 'click');
  ok(leads(hour.reading.textContent, ['Whole chain', '2020', 'Carbon Trust', `${num(CLAIMS['fp-035'].value)} Wh`]), 'a click selects the whole hour');
  fire(d.window, row(hour.root, 'youtube'), 'click');
  ok(hour.reading.textContent.includes(`Limit: ${CLAIMS['fp-120'].limit}`), 'a partly verified row says its limit in the Reading');
  // The boundary ruler: arrows cross from one ruler to the other, and stop at the ends.
  const edge = part('ru-boundary');
  key(d.window, edge.plot, 'ArrowDown');
  ok(leads(edge.reading.textContent, ['One video hour, DIMPACT', `${num(CLAIMS['fp-122'].value)} Wh`]) && edge.reading.textContent.includes(CLAIMS['fp-122'].limit), 'ArrowDown moves to DIMPACT, with its limit');
  key(d.window, edge.plot, 'End');
  eq(`${edge.value.textContent} ${edge.unit.textContent}`, `${num(CLAIMS['fp-143'].value)} (${num(CLAIMS['fp-143'].low)} to ${num(CLAIMS['fp-143'].high)}) Wh`, 'End reaches the whole chain\'s last row');
  key(d.window, edge.plot, 'ArrowDown');
  eq(edge.plot.getAttribute('aria-activedescendant'), row(edge.root, 'desnz-whole').id, 'and stops there');
  key(d.window, edge.plot, 'Home');
  ok(leads(edge.reading.textContent, ['One video hour, Carbon Trust, 2020', `${num(CLAIMS['fp-037'].value)} Wh`]), 'Home goes back to the first row');
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
}

async function noScripts() {
  const { window: { document } } = new JSDOM(html);
  eq(document.querySelectorAll('.ru-section').length, 10, 'every section renders');
  eq(document.querySelectorAll('details').length, document.querySelectorAll('details summary').length, 'every disclosure has a summary');
  ok(document.querySelectorAll('details[open]').length >= 3, 'the first answers start open');
  eq([...document.querySelectorAll('summary')].filter((s) => s.textContent.trim().length < 20).length, 0, 'a summary is a sentence');
  // Outside the plates nothing waits on a script; a plate's controls, view switch, and chips do, by design, while its Reading, Sources, and Table all show.
  eq([...document.querySelectorAll('[hidden]:not([data-theme-toggle])')].filter((n) => !n.closest('[data-plate]')).length, 0, 'nothing waits on a script');
  for (const root of document.querySelectorAll('[data-plate]')) {
    ok(root.querySelector('.reading').textContent.length > 20, `${root.id} default Reading`);
    ok(root.querySelector('table tbody tr'), `${root.id} table`);
    ok(root.querySelector('.plate-plot').firstElementChild, `${root.id} static plot`);
    ok(root.querySelector('.plate-sources li'), `${root.id} sources`);
    eq(root.querySelectorAll('.plate-view[hidden]').length, 0, `${root.id}: every view shows`);
  }
}

module.exports = { groups: { ids, content, plates, behavior, noScripts } };
