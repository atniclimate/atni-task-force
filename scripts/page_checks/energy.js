// The Energy pages with their real scripts and data: stacked bars and the needle, the alphabetical detail, the deadlines strip at fixed dates, and what shows without scripts.
// jsdom cannot run a module, so each page's modules run here as plain scripts with the imports inlined; nothing else about them changes. The clock is fixed, so no check goes stale.
const { JSDOM, ok, eq, read, open, fire, key, wait, settle, settings } = require('./lib');

const util = read('site/assets/js/util.js').replace(/^export (async function|function|const) /gm, '$1 ').replace('import.meta.url', "'http://localhost/site/assets/js/util.js'");
const classic = (rel) => read(rel).replace(/^import .*$/m, '');
const claims = Object.fromEntries(['potential', 'funding'].flatMap((name) => JSON.parse(read(`site/data/claims/${name}.json`)).claims.map((c) => [c.id, c])));
const POTENTIAL = JSON.parse(read('site/data/energy-potential.json'));

function page(rel, modules) {
  const others = /<script type="module"[^>]*><\/script>\s*/g;
  const inline = modules.map((name) => `<script>document.addEventListener('DOMContentLoaded', () => { ${util}\n${classic(`site/assets/js/${name}`)} });</script>`).join('\n');
  return read(rel).replace(others, '').replace('</body>', `${inline}</body>`);
}

async function load(rel, modules, query = '', today = [2026, 10, 5]) {
  const loaded = await open(page(rel, modules), `http://localhost/${rel}${query}`, (window) => {
    const Real = window.Date;
    const now = new Real(...today, 12).getTime();
    window.Date = class extends Real {
      constructor(...args) { super(...(args.length ? args : [now])); }
      static now() { return now; }
    };
    window.ResizeObserver = class { observe() {} };
    window.Element.prototype.scrollIntoView = function () { window.scrolled = this.id; };
    window.fetch = async (url) => ({ ok: true, json: async () => JSON.parse(read(new URL(url).pathname.slice(1))) });
  });
  await wait(20); // the promises of a module that reads a data file
  return loaded;
}
const overview = (query, today) => load('site/energy/index.html', ['energy-potential.js', 'energy-funding.js'], query, today);
const row = (root, name) => root.querySelector(`[data-row="${name}"]`);
const reading = (root) => root.querySelector('.reading').textContent;
const panel = (root) => root.querySelector('.plate-detail > details');
const view = (root) => root.dataset.view;

async function noScripts() {
  for (const [rel, types, deadlines] of [['site/energy/index.html', 'energy-types-by-stage', 'energy-deadlines'], ['site/energy/potential/index.html', 'energy-types-by-stage-plans', null], ['site/energy/funding/index.html', null, 'energy-deadlines-catalog']]) {
    const { document } = new JSDOM(read(rel)).window;
    ok(!document.querySelector('.plate-detail details.energy-detail'), 'without scripts the panel stands open, as the build wrote it');
    if (types) {
      const plate = document.getElementById(types);
      eq(plate.querySelectorAll('.ladder-row').length, 13, 'every type is in the list');
      ok(row(plate, 'efficiency').textContent.includes(`${claims['ep-032'].value} Tribes`), 'each row prints its count');
      eq(row(plate, 'offshore-wind').querySelector('.ladder-value').textContent, '0 Tribes', 'a row with no finding prints 0');
      ok(plate.querySelector('.ladder-bar'), 'a bar of the total stands for the stages');
      const table = plate.querySelector('.plate-table').textContent;
      ok(table.includes('Installed or operating') && table.includes('ep-032'), 'the Table holds the stages and the claim');
      ok(/machine-assisted reading of public plans/.test(plate.textContent) && /absence is not evidence/.test(plate.textContent), 'the caveats are there');
      ok(/No finding after search: 9 Tribes/.test(plate.textContent) && /Pending text extraction: 22 documents, held by 11 Tribes/.test(plate.textContent), 'the states are there');
      ok(!POTENTIAL.tribes.some((t) => plate.textContent.includes(t.name)), 'no Tribe is named');
    }
    if (deadlines) {
      const plate = document.getElementById(deadlines);
      for (const date of ['11/05/2026', '12/11/2026', '02/17/2027', '08/31/2028']) ok(plate.querySelector('.plate-plot').textContent.includes(date), `the static page shows ${date}`);
      ok(!/\bdays\b/.test(plate.querySelector('.plate-plot').textContent), 'days until need the browser');
      ok(plate.querySelector('.plate-title').textContent.includes('the first on 11/05/2026; 8 more programs'), 'the static title cannot go stale');
      ok(!document.querySelector('[data-strip]'), 'the strip is built with scripts');
    }
  }
}

async function typesPlate() {
  const { document, window, errors } = await overview();
  eq(errors.length, 0, `no errors: ${errors[0]}`);
  const plate = document.getElementById('energy-types-by-stage');
  const plot = plate.querySelector('.plate-plot');
  const parts = [...row(plate, 'efficiency').querySelectorAll('.stack-bar i')];
  const stages = claims['ep-032'].stages;
  eq(parts.length, Object.values(stages).filter(Boolean).length, 'one segment per stage with a count');
  ok(Math.abs(parts.reduce((sum, p) => sum + +p.style.getPropertyValue('--w'), 0) - claims['ep-032'].value / 40) < 1e-9, 'segments add to the total on the axis');
  eq(parts[0].className, 'stage-4', 'installed first, at the top of the ramp');
  eq(row(plate, 'efficiency').querySelector('.stack-bar').getAttribute('aria-hidden'), 'true', 'the row\'s words carry it aloud');
  ok(row(plate, 'marine').classList.contains('is-zero') && !row(plate, 'marine').querySelector('.stack-bar i'), 'a zero row draws nothing');
  eq(plate.querySelectorAll('.plate-legend li').length, 4, 'a key for the stages');
  ok(plate.querySelectorAll(':scope > .plate-under').length === 1 && plate.querySelector(':scope > .plate-under > .plate-legend + .plate-to-table'), 'in the one row under the plot, before Read as a table, so neither lies over the other');
  eq(plate.querySelector('.ladder-needle .needle-label').textContent, 'Efficiency, 32 Tribes', 'the needle names the row');
  eq(plot.style.getPropertyValue('--stack-at'), String(32 / 40), 'and stands at its total');
  ok(reading(plate).includes('8 installed or operating, 15 planned or funded, 2 assessed or sited, 7 goal or interest'), 'the Reading gives the stages');
  ok(reading(plate).includes('Limit: A machine-assisted reading'), 'and the limit');
  ok(plate.querySelector('.energy-states').textContent.includes('No document held: 1 Tribe'), 'selecting a row shows the states');
  ok(plate.querySelector('a.button').closest('.plate-claim'), 'the button stays beside the figures, on the first screen');
  ok(plate.querySelector('.plate-view[data-view="reading"] a[href$="energy-potential.json"]'), 'and the data link waits in the Reading');
  ok(!panel(plate).open, 'the panel starts closed');
  eq(panel(plate).querySelector('summary').textContent, 'Energy efficiency and weatherization: 32 Tribes, by the most advanced stage found', 'one line: the Reading\'s first');
  ok(panel(plate).contains(plate.querySelector('.reading')) && panel(plate).contains(plate.querySelector('.plate-sources')), 'the views are inside it');
  ok(plate.querySelector('.plate-detail > output'), 'the live region is not, so a selection is still spoken');
  fire(window, row(plate, 'solar'), 'click');
  ok(panel(plate).open, 'selecting a row opens it');
  await wait(0);
  eq(panel(plate).querySelector('summary').textContent, 'Solar energy: 30 Tribes, by the most advanced stage found', 'and its line follows');
  eq(plate.querySelector('.ladder-needle .needle-label').textContent, 'Solar, 30 Tribes', 'selection moves the needle');
  await settle();
  ok(settings(window).includes('energy-types-by-stage=solar'), 'and the address');
  eq(plate.querySelector('a.button').getAttribute('href'), 'potential/?type=solar#tribes', 'Read it Tribe by Tribe goes to that filter');
  ok(!panel(document.getElementById('energy-deadlines')).open, 'the other plate\'s panel stays closed');
  const deadlines = document.getElementById('energy-deadlines');
  fire(window, deadlines.querySelector('.plate-to-table'), 'click');
  ok(panel(deadlines).open && deadlines.querySelector('.plate-views input[value="table"]').checked, 'Read as a table opens a closed panel on its Table view');
  eq(document.activeElement, deadlines.querySelector('.plate-view[data-view="table"] .table-scroll'), 'and focus goes to the table');
  panel(plate).open = false;
  plot.focus();
  key(window, plot, 'Tab');
  ok(!panel(plate).open, 'moving on opens nothing');
  key(window, plot, 'ArrowDown');
  ok(reading(plate).startsWith('Electrification'), 'arrow keys step');
  ok(panel(plate).open, 'and open it');
  key(window, plot, 'End');
  ok(reading(plate).startsWith('Marine') && reading(plate).includes('no finding'), 'End reaches the last row, in words');
  await wait(0);
  eq(panel(plate).querySelector('summary').textContent, 'Marine energy (tidal or wave): no finding', 'a row with no finding has its line too');
  eq(plate.querySelector('.ladder-needle .needle-label').textContent, 'Marine, 0 Tribes', 'a zero is said as a zero');
  key(window, plot, 'Home');
  ok(reading(plate).startsWith('Energy efficiency'), 'Home returns');
  ok(!POTENTIAL.tribes.some((t) => plate.textContent.includes(t.name)), 'no Tribe is named before a reader asks');
}

// A link into a closed panel opens it: a selection in the address, a view, or a source's own place.
async function panelLinks() {
  const selected = (await overview('?energy-types-by-stage=wind')).document;
  ok(panel(selected.getElementById('energy-types-by-stage')).open, 'a selected row in the address opens its panel');
  ok(!panel(selected.getElementById('energy-deadlines')).open, 'and only its own');
  const asked = (await overview('?energy-deadlines=doe-40101d')).document.getElementById('energy-deadlines');
  ok(panel(asked).open && reading(asked).startsWith('Grid Resilience'), 'so does a selected deadline');
  ok(asked.querySelector('[data-key="doe-40101d"]').classList.contains('is-on'), 'with its row marked');
  const sources = (await overview('?energy-deadlines-view=sources')).document.getElementById('energy-deadlines');
  ok(panel(sources).open && view(sources) === 'sources', 'and a view');
  const source = (await overview('#energy-deadlines-source-ef-011')).document.getElementById('energy-deadlines');
  ok(panel(source).open && view(source) === 'sources', 'and a source, on its view');
  // Settings after the anchor, as Copy Reading writes them, name no element: the kit lands on the plate as the browser would on a plain #id (a11y A1).
  const deep = await overview('#energy-deadlines&energy-deadlines=doe-40101d');
  const plate = deep.document.getElementById('energy-deadlines');
  ok(deep.window.scrolled === 'energy-deadlines' && deep.document.activeElement === plate, 'a link with settings scrolls to its plate and starts focus there');
  ok(panel(plate).open && plate.querySelector('[data-key="doe-40101d"]').classList.contains('is-on'), 'with its row selected and its panel open');
  eq(deep.errors.join(), '', 'no script errors');
}

async function tribesList() {
  const { document, window } = await overview('?energy-types-by-stage=wind');
  const plate = document.getElementById('energy-types-by-stage');
  const more = plate.querySelector('.energy-tribes');
  eq(more.querySelector('summary').textContent, 'Wind: the Tribes, alphabetically (11)', 'the summary counts them');
  eq(more.querySelector('li'), null, 'the file is not read until a reader asks');
  more.open = true;
  fire(window, more, 'toggle');
  await wait(20);
  const links = [...more.querySelectorAll('.energy-tribe-list > li > a')];
  const expected = POTENTIAL.tribes.filter((t) => t.top.some((f) => f.type === 'wind')).map((t) => t.name).sort((a, b) => a.localeCompare(b));
  eq(links.length, 11, 'one line per Tribe');
  eq(JSON.stringify(links.map((a) => a.textContent)), JSON.stringify(expected), 'alphabetical, never a ranking');
  ok(links.every((a) => a.getAttribute('href').startsWith('potential/#')), 'each links to its entry');
  const first = POTENTIAL.tribes.find((t) => t.name === expected[0]);
  const line = links[0].parentElement;
  eq(line.querySelector('.tag.stage').textContent, first.top.find((f) => f.type === 'wind').stage_label, 'with its stage');
  eq(line.querySelector('blockquote').getAttribute('cite'), first.top.find((f) => f.type === 'wind').citations[0].url, 'and its cited excerpt');
  ok(!line.textContent.includes('Rank'), 'and no rank');
  fire(window, row(plate, 'marine'), 'click');
  await wait(200);
  eq(more.querySelector('.energy-tribe-list'), null, 'a type with no finding lists nobody');
  ok(more.textContent.includes('not Tribal positions'), 'and says what that means');
}

async function strip() {
  const { document, window, errors } = await overview();
  eq(errors.length, 0, `no errors: ${errors[0]}`);
  const plate = document.getElementById('energy-deadlines');
  ok(plate.querySelector('.plate-plot').hidden, 'the static list gives way');
  ok(plate.querySelector('.strip').classList.contains('is-live'), 'to the strip');
  const rows = [...plate.querySelectorAll('.strip-rows .strip-row')];
  eq(rows.map((r) => r.querySelector('.strip-n').textContent).join(), 'today,36,104,665', 'days until, soonest first, from a fixed today');
  ok(rows.every((r) => r.querySelector('.strip-body > .strip-when > .strip-n') && r.style.getPropertyValue('--drop')), 'the days stand in their own column, and each stem has its drop');
  eq(rows[1].querySelector('.strip-when').textContent.trim().replace(/\s+/, ' '), '36 days', 'with their word');
  ok(!panel(plate).open, 'the panel starts closed');
  eq(panel(plate).querySelector('summary').textContent, 'Dated deadlines in the catalog: 4 programs', 'one line: the Reading\'s first');
  fire(window, rows[0].querySelector('.strip-name'), 'click');
  ok(!panel(plate).open, 'a program\'s name just goes to its record');
  fire(window, rows[1].querySelector('.strip-what'), 'click');
  ok(panel(plate).open && reading(plate).startsWith('Tribal HEEHR home rebates (IRA 50122): 12/11/2026'), 'a row selects its deadline, and opens the panel');
  ok(rows[1].classList.contains('is-on') && view(plate) === 'reading', 'marked, on its Reading');
  await wait(0);
  eq(panel(plate).querySelector('summary').textContent, 'Tribal HEEHR home rebates (IRA 50122): 12/11/2026', 'and the line follows');
  fire(window, plate.querySelectorAll('.strip-mark')[2], 'click');
  ok(reading(plate).startsWith('Grid Resilience') && rows[2].classList.contains('is-on') && !rows[1].classList.contains('is-on'), 'its mark does too');
  fire(window, rows[3].querySelector('.strip-claim'), 'click');
  ok(reading(plate).startsWith('DOE Tribal Energy Financing') && view(plate) === 'sources', 'and its receipt, the keyboard\'s way, on the Sources view');
  plate.querySelector('[data-reset]').click();
  ok(reading(plate).startsWith('Dated deadlines in the catalog') && !rows.some((r) => r.classList.contains('is-on')), 'Reset returns');
  eq(plate.querySelector('.strip-name').getAttribute('href'), 'funding/#prog-bpa_tribal_iq', 'the name links to its record');
  ok(rows[1].textContent.includes('12/11/2026') && rows[1].textContent.includes('Checked 11/05/2026') && rows[1].textContent.includes('ef-012, verified'), 'a row keeps its date, its check, and its claim');
  eq(plate.querySelector('.strip-claim').getAttribute('href'), '#energy-deadlines-source-ef-011', 'the claim links to its source');
  ok(document.getElementById('energy-deadlines-source-ef-011'), 'which is there');
  eq(plate.querySelectorAll('.strip-mark.is-soon').length, 1, 'only today is soon');
  eq(plate.querySelector('.strip .needle-label').textContent, 'today, 11/05/2026', 'the needle stands at today');
  eq(plate.querySelector('.plate-title').textContent, '4 dated deadlines in the next 24 months, and the first is today; 8 more programs carry no date in the catalog', 'the title says today');
  eq(plate.querySelectorAll('.strip-undated li').length, 8, 'eight in the lane');
  ok([...plate.querySelectorAll('.strip-undated li')].some((li) => li.textContent === 'HUD ICDBG (forecasted)'), 'a forecasted program says so');
  ok(plate.querySelector('.strip-foot').textContent.includes('other statuses checked 10/29/2026, 7 days ago'), 'the foot counts its days');
  eq(plate.querySelectorAll('.strip-foot').length, 1, 'one foot');
  ok(plate.querySelector('.plate-tally').textContent.includes('4 verified, 14 partly verified'), 'the receipts line counts every claim');
  ok(reading(plate).includes('The catalog holds 22 programs: 11 open, 10 closed, and 1 forecasted'), 'the Reading holds the counts');
}

async function stripOverTime() {
  const next = await overview('', [2026, 10, 6]);
  const plate = next.document.getElementById('energy-deadlines');
  eq([...plate.querySelectorAll('.strip-rows .strip-n')].map((n) => n.textContent).join(), '35,103,664', 'a passed date leaves the track');
  ok([...plate.querySelectorAll('.strip-undated li')].some((li) => li.textContent.includes('BPA Tribal efficiency grants') && li.textContent.includes('passed 11/05/2026; confirm with the agency')), 'for the lane, saying so');
  eq(plate.querySelector('.plate-title').textContent, '3 dated deadlines in the next 24 months, the next in 35 days; 8 more programs carry no date in the catalog, and 1 passed', 'the title follows');
  const late = await overview('', [2026, 11, 15]);
  ok(late.document.querySelector('#energy-deadlines .strip-foot').textContent.startsWith('Stale: '), 'past 30 days the foot says so in words');
  const soon = await overview('', [2026, 10, 30]);
  ok(soon.document.querySelector('#energy-deadlines .strip-mark.is-soon'), 'inside 14 days a mark fills');
  eq(soon.document.querySelector('#energy-deadlines .plate-title').textContent.includes('the next in 11 days'), true, 'and the title counts');
}

async function potentialPage() {
  const { document, window, errors } = await load('site/energy/potential/index.html', ['energy-potential.js']);
  eq(errors.length, 0, `no errors: ${errors[0]}`);
  const plate = document.getElementById('energy-types-by-stage-plans');
  eq(document.querySelectorAll('#potential-results > li').length, 56, 'the list holds every Tribe');
  const names = [...document.querySelectorAll('#potential-results > li h3')].map((h) => h.textContent);
  eq(JSON.stringify(names), JSON.stringify([...names].sort((a, b) => a.localeCompare(b))), 'alphabetical');
  fire(window, row(plate, 'hydropower'), 'click');
  const read = plate.querySelector('a.button');
  eq(read.getAttribute('href'), '?type=hydropower#tribes', 'the button names the filter');
  fire(window, read, 'click');
  eq(document.querySelectorAll('#potential-results > li').length, 7, 'and applies it, in place');
  ok(document.getElementById('potential-status').textContent.includes('hydropower'), 'and says so');
  ok(document.querySelector('#read-first ~ .energy-caveat').textContent.includes('ranks no Tribe against another'), 'Read This First opens on its caveat');
  ok(!document.querySelector('#read-first ~ .notice'), 'in no box');
  for (const [claim, text] of [['ep-002', '56'], ['ep-001', '44'], ['ep-004', '279'], ['ep-003', '22']]) {
    eq(document.querySelector(`.page-band-figures [data-pour="${claim}"]`).textContent, text, `the band pours ${claim}`);
    ok(document.querySelector(`.energy-limits [data-pour="${claim}"][data-field="limit"]`).textContent.trim(), `with the limit of ${claim} on the page`);
  }
  ok(!document.querySelector('.chart, #potential-chart'), 'the old chart is gone');
}

async function fundingPage() {
  const { document, errors } = await load('site/energy/funding/index.html', ['energy-funding.js']);
  eq(errors.length, 0, `no errors: ${errors[0]}`);
  const plate = document.getElementById('energy-deadlines-catalog');
  eq([...document.querySelectorAll('.content > section > h2')].slice(0, 2).map((h) => h.id).join(), 'deadlines,read-first', 'the deadlines come first');
  eq([...document.querySelectorAll('.toc a')].slice(0, 2).map((a) => a.getAttribute('href')).join(), '#deadlines,#read-first', 'and the rail says so');
  eq(document.querySelectorAll('#read-first ~ .energy-flow').length, 2, 'Read This First flows in two columns of its own');
  eq(document.querySelectorAll('.energy-flow [data-pour$="1"][data-field="limit"], .energy-flow [data-pour$="2"][data-field="limit"]').length, 2, 'with both limits');
  ok(!panel(plate).open, 'the panel starts closed');
  eq(plate.querySelector('.strip-name').getAttribute('href'), '#prog-bpa_tribal_iq', 'the name links in this page');
  ok(document.getElementById('prog-bpa_tribal_iq'), 'to a record that is there');
  eq(document.querySelectorAll('#catalog-results > li').length, 22, 'the catalog holds every program');
  ok(document.getElementById('catalog-status').textContent.includes('Statuses checked 10/29/2026, with 4 rechecked 11/05/2026'), 'the catalog says which dates moved');
  ok(document.querySelector('#prog-doe_heehr_tribal .status-line').textContent.includes('11/05/2026'), 'a rechecked program shows its date');
  ok(document.querySelector('#prog-hud_icdbg .status-line').textContent.includes('10/29/2026'), 'and one not rechecked keeps its own');
}

// The stage ramp, at the numbers that fail silently: dataviz validate_palette.js's normal-vision floor on every adjacent pair, and 3:1 for the step nearest each ground.
async function stageRamp() {
  const css = read('site/assets/css/site.css');
  const tokens = read('site/assets/css/tokens.css');
  const token = (name) => new RegExp(`--atni-color-${name}: (#[0-9A-Fa-f]{6})`).exec(tokens)[1];
  const steps = (head) => { const body = css.slice(css.indexOf(head)); return [1, 2, 3, 4].map((n) => new RegExp(`--stage-${n}: (#[0-9A-Fa-f]{6})`).exec(body)[1]); };
  const linear = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const oklab = (hex) => {
    const [r, g, b] = linear(hex);
    const [l, m, s] = [0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b, 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b, 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b].map(Math.cbrt);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  };
  const apart = (a, b) => { const [p, q] = [oklab(a), oklab(b)]; return 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
  const lum = (hex) => { const [r, g, b] = linear(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const dark = steps('--gutter:');
  const light = steps('[data-theme="light"] {');
  for (const [theme, ramp, grounds, away] of [['dark', dark, ['core-black-bg', 'core-grey-element'], 1], ['light', light, ['core-surface-tint', 'core-surface'], -1]]) {
    ramp.slice(1).forEach((step, i) => {
      ok(apart(ramp[i], step) >= 15, `${theme} stages ${i + 1} and ${i + 2} clear the floor: ${apart(ramp[i], step).toFixed(1)}`);
      ok((oklab(step)[0] - oklab(ramp[i])[0]) * away > 0, `${theme} stage ${i + 2} is farther from the ground than stage ${i + 1}`);
    });
    for (const ground of grounds) ok(ratio(ramp[0], token(ground)) >= 3, `${theme} stage 1 on ${ground}`);
  }
  eq(steps('[data-theme="auto"] {').join(), light.join(), 'auto light repeats the light ramp');
  eq(steps('@media print {\n  :root, [data-theme] {').join(), light.join(), 'print repeats it');
}

module.exports = { groups: { noScripts, typesPlate, panelLinks, tribesList, strip, stripOverTime, potentialPage, fundingPage, stageRamp } };
