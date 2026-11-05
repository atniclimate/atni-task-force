// The resource use page. It has no tabs and no plate module, so this covers what it does have: deep links into disclosures, the rail, the CSS-only
// boundary switch, poured figures, bench rows, and the no-script page.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { JSDOM, ROOT, ok, eq, wait, read, open } = require('./lib');

const REL = 'site/data-centers/resource-use/index.html';
const html = read(REL);
const PAGE = 'http://localhost/site/data-centers/resource-use/index.html';
// The page as it stood before the refresh: old ids and source links must survive.
const OLD_COMMIT = '2d8003f';
const old = execFileSync('git', ['-C', ROOT, 'show', `${OLD_COMMIT}:${REL}`], { encoding: 'utf8' });

const load = (hash = '') => open(html, `${PAGE}${hash}`, (window) => {
  window.seen = [];
  window.IntersectionObserver = class {
    constructor(cb) { this.cb = cb; window.spy = this; }
    observe(el) { window.seen.push(el); }
  };
});

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
}

async function content() {
  const { window: { document } } = new JSDOM(html);
  const words = (doc) => doc.querySelector('main').textContent.replace(/\s+/g, ' ');
  const before = new JSDOM(old).window.document;
  // Every old link target is still on the page, or was replaced by a claim's source.
  const hrefs = new Set([...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')));
  const gone = [...new Set([...before.querySelectorAll('main a[href^="https"]')].map((a) => a.getAttribute('href')))].filter((u) => !hrefs.has(u));
  const replaced = ['https://arxiv.org/abs/2304.03271', 'https://sustainability.aboutamazon.com/2025-aws-summary.pdf'];
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
  // The first screen is the streamed-hour figure, at the column's full width, ahead of the section's text.
  const first = document.querySelector('.ru-section');
  ok(first.querySelector('.ru-hour') === first.children[1] && first.children[2].matches('.ru-columns'), 'the figure leads the first section, and its text follows in columns');
  eq(document.querySelector('.ru-split.is-even'), null, 'it no longer shares a row with the text');
  // The derived figures of the evidence refresh: each is said to be derived, with its arithmetic beside it, and what it rests on is poured or names a claim.
  const test = [...document.querySelectorAll('.ru-detail > p')].find((p) => /quick test/.test(p.textContent)).textContent.replace(/\s+/g, ' ');
  for (const s of ['485 over 3, derived', '162 TWh over each, derived', '55 times 2.88, derived', '162 TWh over 158 Wh, derived', '1 trillion hours over 8 billion people over 365 days, derived', '52 to 124 trillion hours']) ok(test.includes(s), `the arithmetic prints: ${s}`);
  ok(!/3\.9 Wh|41 to 124/.test(test), 'the figure with no claim behind it is gone');
  const near = (a, b) => Math.abs(a - b) / b < 0.01;
  ok(near(485 / 3, 162) && near(162e12 / 1.3, 124e12) && near(162e12 / 3.1, 52e12) && near(8e9 * 8760, 70e12) && near(55 * 2.88, 158) && near(162e12 / 158 / 1e12, 1.025) && near(1.025e12 / 8e9 / 365 * 60, 21) && near(57.8 / 485, 0.119), 'and it holds');
  const claims = {};
  for (const name of fs.readdirSync(path.join(ROOT, 'site/data/claims'))) for (const c of JSON.parse(read(`site/data/claims/${name}`)).claims || []) claims[c.id] = c;
  eq(claims['dem-040'].value, 485, 'dem-040 is still 485');
  eq(claims['fp-122'].value, 1.3, 'fp-122 is still 1.3');
  eq(claims['fp-141'].high, 3.1, 'fp-141 still tops out at 3.1');
  eq(claims['fp-130'].value, 2.88, 'fp-130 is still 2.88');
  ok(/55 x 2\.88 = 158\.4/.test(claims['fp-150'].derived), 'fp-150 holds 158.4 in its arithmetic');
  ok(/0\.055 kWh per GB = 55 Wh per GB/.test(claims['ec-024'].derived), 'ec-024 holds 55 Wh per GB');
  const model = JSON.parse(read('site/data/comparison-model.json'));
  ok(near(model.computed_defaults.scale.youtube_dc_twh_top, 57.8), 'the model still holds 57.8 TWh');
  eq(model.assumptions.video_dc_intensity.options.top_down, 55, 'and 55 Wh per GB');
  ok(test.includes(claims['fp-150'].limit), 'and the top-down figure prints its limit');
  ok(/57\.8 TWh over 485, derived/.test(words(document)), 'the 12 percent shows its arithmetic');
  // The figure's Reading: the retired 70 Wh made the UK share "about a quarter"; its replacement makes it a sliver.
  const hourReading = document.querySelector('.ru-hour .ru-reading').textContent.replace(/\s+/g, ' ');
  // 1 over 188 is finer than Carbon Trust's own rounding, so the page prints its own "roughly 1 percent" (ru-003) beside the figure's two numbers.
  ok(/about 1 percent on Carbon Trust's own reading \(1 of 188 Wh\)/.test(hourReading) && /about 0\.3 percent on the UK follow-up \(0\.6 of 192\.3 Wh, derived\)/.test(hourReading) && !/quarter/.test(hourReading), 'the streamed hour reads as its figure draws it');
  ok(claims['ru-003'].value === 1 && claims['ru-004'].value === 0.3 && Math.abs(60 / 192.3 - 0.3) < 0.05, 'and the shares hold');
  // Marks: on the ruler, one row each, and each chart row prints its value next to its mark.
  const marks = [...document.querySelectorAll('.ru-track i')];
  ok(marks.length > 20, 'marks drawn');
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
  // Table regions can be scrolled by keyboard and carry a name.
  const regions = [...document.querySelectorAll('.table-wrap')];
  ok(regions.length >= 6, 'six figures with tables');
  for (const r of regions) {
    eq(r.getAttribute('role'), 'region', 'region role');
    eq(r.getAttribute('tabindex'), '0', 'keyboard stop');
    ok(document.getElementById(r.getAttribute('aria-labelledby')), 'region named');
  }
  eq(document.querySelectorAll('canvas, iframe, video').length, 0, 'nothing heavy');
  const stack = document.querySelector('.ru-hour .ru-seg.is-on');
  ok(stack.textContent.includes('Data center'), 'the orange part names itself');
}

async function behavior() {
  const shut = (doc, id) => doc.getElementById(id).closest('details');
  const a = await load();
  eq(a.errors.join(), '', 'no script errors');
  ok(!shut(a.document, 'cryptocurrency').open, 'a disclosure starts closed');
  const row = a.document.querySelector('a[href="#cryptocurrency"]');
  row.dispatchEvent(new a.window.MouseEvent('click', { bubbles: true, cancelable: true }));
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
  for (const link of a.document.querySelectorAll('.toc a')) ok(a.document.getElementById(link.getAttribute('href').slice(1)).tagName === 'H2', 'rail links land on h2s');
  a.window.spy.cb([{ isIntersecting: true, target: sections[4] }]);
  const current = a.document.querySelectorAll('.toc a[aria-current]');
  eq(current.length, 1, 'one rail link is current');
  eq(current[0].getAttribute('href'), '#streaming-and-ai-compared-carefully', 'the right one');
  a.window.spy.cb([{ isIntersecting: true, target: sections[6] }]);
  eq(a.document.querySelector('.toc a[aria-current]').getAttribute('href'), '#water', 'it moves');
  // The boundary switch: native radios; the CSS rule keys on which one is checked.
  const fig = a.document.querySelector('.ru-boundary');
  const radios = [...fig.querySelectorAll('input[name="ru-boundary"]')];
  eq(radios.length, 2, 'two stops');
  eq(fig.querySelector('input:checked').value, 'dc', 'data center only by default');
  eq(fig.querySelectorAll('tbody[data-group="dc"] tr').length > fig.querySelectorAll('tbody[data-group="whole"] tr').length, true, 'both groups are in the markup');
  eq(fig.querySelectorAll('p[data-group]').length, 2, 'a Reading for each stop');
  const css = read('site/assets/css/ru.css');
  ok(css.includes('.ru-boundary:has(input[value="dc"]:checked) [data-group="whole"]') && css.includes('.ru-boundary:has(input[value="whole"]:checked) [data-group="dc"]'), 'the rule hides the other boundary');
  ok(fig.matches(':has(input[value="dc"]:checked)'), 'default stop matches');
  radios[1].checked = true;
  ok(fig.matches(':has(input[value="whole"]:checked)') && !fig.matches(':has(input[value="dc"]:checked)'), 'the other stop takes over');
  ok(/chat hour/.test(fig.querySelector('p[data-group="whole"]').textContent), 'its Reading says so');
}

async function noScripts() {
  const { window: { document } } = new JSDOM(html);
  eq(document.querySelectorAll('.ru-section').length, 10, 'every section renders');
  eq(document.querySelectorAll('details').length, document.querySelectorAll('details summary').length, 'every disclosure has a summary');
  ok(document.querySelectorAll('details[open]').length >= 3, 'the first answers start open');
  eq([...document.querySelectorAll('summary')].filter((s) => s.textContent.trim().length < 20).length, 0, 'a summary is a sentence');
  eq(document.querySelectorAll('[hidden]:not([data-theme-toggle])').length, 0, 'nothing waits on a script');
}


module.exports = { groups: { ids, content, behavior, noScripts } };
