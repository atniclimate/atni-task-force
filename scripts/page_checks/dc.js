// The Data Centers page with its real module and data: tabs, deep links, selection, and every control's effect on the Reading.
const { JSDOM, ok, eq, wait, settle, read, plateFile, open, fire, key, holds, leads, wordsOnly } = require('./lib');

const PAGE = 'http://localhost/site/data-centers/index.html';
const html = read('site/data-centers/index.html');

async function load(query = '', { size = { w: 980, h: 520 } } = {}) {
  return open(html, `${PAGE}${query}`, (window) => {
    window.size = size;
    window.innerWidth = 1440;
    window.innerHeight = 900;
    window.observers = [];
    window.ResizeObserver = class { constructor(cb) { window.observers.push(cb); } observe() {} };
    const visible = (el) => !el.closest('[hidden]');
    Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', { get() { return visible(this) ? window.document.body : null; } });
    Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { get() { return visible(this) ? window.size.w : 0; } });
    Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { get() { return visible(this) ? window.size.h : 0; } });
    window.Element.prototype.getBoundingClientRect = () => ({ top: 300 });
    window.document.elementFromPoint = () => window.under;
    window.Element.prototype.scrollIntoView = function () { window.scrolled = this.id; };
  });
}

const row = (plate, k) => [...plate.querySelectorAll('[data-row]')].find((n) => n.dataset.row === k);
const parts = (document, id) => {
  const root = document.getElementById(id);
  return {
    root, plot: root.querySelector('.plate-plot'), reading: root.querySelector('.reading'), value: root.querySelector('.readout-value'), unit: root.querySelector('.readout-unit'),
    facts: root.querySelector('.plate-facts'), receipt: root.querySelector('.plate-receipt'),
    chips: () => [...root.querySelectorAll('.receipt')].filter((c) => !c.hidden),
    radio: (name, value) => root.querySelector(`input[name="${name}"][value="${value}"]`),
    slider: (name) => root.querySelector(`[data-param="${name}"] input[type=range]`),
    typed: (name) => root.querySelector(`[data-param="${name}"] input[type=number]`),
  };
};
const setRadio = (window, input) => { input.checked = true; fire(window, input, 'input'); fire(window, input, 'change'); };
const setValue = (window, input, value) => { input.value = String(value); fire(window, input, 'input'); fire(window, input, 'change'); };
const near = (a, b, message) => ok(Math.abs(a - b) < 1e-6, `${message}: ${a} against ${b}`);
const place = (node, name) => +node.style.getPropertyValue(`--${name}`);
// The Reading must change, and a figure read back from it must be the one expected.
function moves(window, p, act, expected, message) {
  const before = p.reading.textContent;
  act();
  ok(p.reading.textContent !== before, `${message}: the Reading changes`);
  if (expected) ok(expected(p.reading.textContent), `${message}: ${p.reading.textContent.slice(0, 220)}`);
}

async function tabs() {
  const { window, document, errors } = await load();
  const links = [...document.querySelectorAll('[role="tab"]')];
  const panels = [...document.querySelectorAll('[role="tabpanel"]')];
  eq(links.length, 8, 'eight tabs');
  eq(panels.length, 8, 'eight panels');
  eq(panels.map((n) => n.id).join(), 'overview,growth,tradeoffs,land,climate,jobs,policy-landscape,questions', 'panel ids');
  ok(!panels[0].hidden && panels.slice(1).every((n) => n.hidden), 'Overview shows first');
  for (let i = 1; i < 8; i++) {
    fire(window, links[i], 'click');
    ok(!panels[i].hidden, `tab ${i} shows`);
    eq(window.location.hash, `#${panels[i].id}`, 'hash written');
  }
  key(window, links[7], 'ArrowRight');
  eq(links[0].getAttribute('aria-selected'), 'true', 'arrow wraps');
  key(window, links[0], 'End');
  eq(links[7].getAttribute('aria-selected'), 'true', 'End');
  key(window, links[7], 'Home');
  eq(links[0].getAttribute('aria-selected'), 'true', 'Home');
  eq(document.querySelectorAll('[data-plate]').length, 12, 'twelve plates');
  eq(errors.join(), '', 'no script errors');
}

async function deepLinks() {
  for (const [hash, tab, opens] of [
    ['purpose', 'overview', true], ['why-now', 'overview', true], ['library', 'overview', false], ['environmental-impacts', 'tradeoffs', false],
    ['policy-landscape', 'policy-landscape', false], ['alternatives', 'policy-landscape', true], ['questions', 'questions', false], ['policy-watch', 'policy-landscape', false],
    ['dc-lbnl-us', 'growth', false], ['dc-forecast-check', 'growth', false], ['forecast-revisions', 'growth', false], ['dc-water-intensity', 'tradeoffs', false], ['q-water', 'questions', true], ['policy-tribal', 'policy-landscape', true], ['dc-project', 'questions', false], ['jobs-how-long', 'jobs', true],
  ]) {
    const { document, errors } = await load(`#${hash}`);
    const target = document.getElementById(hash);
    ok(target, `${hash} exists`);
    ok(!document.getElementById(tab).hidden, `#${hash} opens ${tab}`);
    if (opens) ok(target.closest('details').open, `#${hash} opens its details`);
    eq(errors.join(), '', `#${hash} no errors`);
  }
  const { window, document } = await load();
  window.location.hash = '#why-now';
  await wait(20);
  ok(document.getElementById('why-now').closest('details').open, 'a later hash opens details too');
  const checklists = await load('#checklists');
  ok(!checklists.document.getElementById('questions').hidden, '#checklists opens Questions');
  ok(checklists.document.getElementById('q-consent').open, 'and the Consent checklist');
  ok(!checklists.document.getElementById('q-land').open, 'and only that one');
  eq(checklists.errors.join(), '', '#checklists no errors');
  // A claim id in the band opens the Overview plate on its Sources view, at that receipt.
  for (const a of document.querySelectorAll('.page-band-figures .figure-label a')) {
    const band = await load(a.getAttribute('href'));
    ok(!band.document.getElementById('overview').hidden, `${a.textContent} opens Overview`);
    eq(band.document.getElementById('dc-pnw-load').dataset.view, 'sources', `${a.textContent} opens Sources`);
    eq(band.window.scrolled, `dc-pnw-load-source-${a.textContent}`, `${a.textContent} reaches its receipt`);
    eq(band.errors.join(), '', `${a.textContent} no errors`);
  }
}

async function council() {
  const { window, document, errors } = await load();
  const p = parts(document, 'dc-pnw-load');
  eq(p.plot.querySelectorAll('.plate-svg').length, 1, 'one svg');
  eq(p.plot.querySelectorAll('.m-band').length, 1, 'a band');
  eq(p.plot.querySelectorAll('.dc-ctx, .m-count').length, 0, 'Lines is one picture, with the squares in the second view');
  eq(row(p.root, '2030').getAttribute('aria-selected'), 'true', 'default year');
  ok(leads(p.reading.textContent, ['2030', '2,475.1', '1,512.8', '4,988.7) aMW', '11 percent', '22,000 aMW', '2,020.4 aMW']), 'default Reading');
  eq(p.reading.textContent.split('2,475.1').length, 2, 'the Reading states the figure once');
  eq(p.facts.querySelectorAll('.plate-values').length, 0, 'and no list under it repeats it');
  ok(p.facts.textContent.includes('2,020.4 (1,301.9 to 4,429.3) aMW'), 'data centers only keeps its range in how this is modeled');
  ok(p.chips().some((c) => c.dataset.claim === 'dem-075'), 'and its receipt');
  // The 2029 claim holds only a mid figure, so the plot starts where the band does; that figure keeps its place in how this is modeled, the Table view's list, and Sources.
  eq(row(p.root, '2029'), undefined, 'no 2029 stop');
  ok(p.facts.textContent.includes('2029') && p.facts.textContent.includes('2,197.8 aMW'), 'the 2029 input stays in how this is modeled');
  ok(p.root.querySelector('.plate-also').textContent.includes('2,197.8 aMW'), 'and in the Table view');
  ok(p.chips().some((c) => c.dataset.claim === 'dem-076') && document.getElementById('dc-pnw-load-source-dem-076'), 'with its receipt');
  eq(`${p.value.textContent} ${p.unit.textContent}`, '2,475.1 (1,512.8 to 4,988.7) aMW', 'readout');
  ok(p.root.querySelector('.plate-claim .dc-jump a[href="#rate-change"]') && !document.querySelector('.dc-panel-head .dc-jump'), 'the jump lists read in the claim zones');
  eq(p.root.querySelector('.plate-claim .dc-jump').textContent, 'Further down: Rates, Purpose, Why Now, Library', 'each is one sentence');
  eq(html.split('This plate does not decide a proposal.').length, 2, 'the plate says it decides nothing, once');
  ok(p.plot.querySelector('.m-needle'), 'a needle');
  eq([...p.plot.querySelectorAll('.m-tick')].map((n) => n.textContent).filter((t) => /^20\d\d$/.test(t)).sort().join(), '2030,2046', 'the axis starts at 2030');
  const end = [...p.plot.querySelectorAll('.m-tick')].find((n) => n.textContent === '2046');
  eq(end.getAttribute('text-anchor'), 'end', 'the axis end label ends at the edge, so it is not clipped');
  const name = [...p.plot.querySelectorAll('.m-label')].find((n) => n.textContent === 'Data centers and chip fabs');
  eq(name.getAttribute('text-anchor'), 'end', 'the line is named over its end, inside the plot, so no margin can cut the name');
  const grid = p.plot.querySelector('.m-grid');
  eq(+name.getAttribute('x'), +grid.getAttribute('x2') - 8, 'its name ends 8px in from the plot edge');
  ok(+name.getAttribute('y') < +row(p.root, '2046').querySelector('.m-dot').getAttribute('y'), 'and sits above the last point and its mark');
  eq(parseFloat(p.plot.style.getPropertyValue('--at')) - +grid.getAttribute('x1'), 24, 'the needle at the first year stands 24px in from the ticks, so it cannot read as the y axis');
  near(+row(p.root, '2030').querySelector('.m-dot').getAttribute('x') + +row(p.root, '2030').querySelector('.m-dot').getAttribute('width') / 2, parseFloat(p.plot.style.getPropertyValue('--at')), 'and the first mark stands on it');
  eq([...p.plot.querySelectorAll('.m-dot')].map((n) => `${n.classList.contains('is-solo')} ${n.classList.contains('is-hollow')} ${n.classList.contains('is-lead')}`).join(), 'true true false,true true false', 'both inputs show, hollow, and grey until selected');
  key(window, p.plot, 'ArrowRight');
  eq(row(p.root, '2046').getAttribute('aria-selected'), 'true', 'arrow moves the year');
  ok(leads(p.reading.textContent, ['2046', '2,958.4']), 'Reading follows');
  ok(p.facts.textContent.includes('29,600 to 39,800 aMW') && p.facts.textContent.includes('Limit:'), 'the region in 2046 with its limit');
  ok(p.chips().some((c) => c.dataset.claim === 'dem-092'), 'its receipt');
  ok(!p.chips().some((c) => c.dataset.claim === 'dem-070'), 'only what the panel shows');
  key(window, p.plot, 'Home');
  eq(row(p.root, '2030').getAttribute('aria-selected'), 'true', 'Home');
  ok(leads(p.reading.textContent, ['2030', '2,475.1']), 'Reading');
  fire(window, row(p.root, '2046').querySelector('.m-hit'), 'click');
  eq(row(p.root, '2046').getAttribute('aria-selected'), 'true', 'a click selects');
  fire(window, row(p.root, '2030').querySelector('.m-hit'), 'click');
  ok(p.root.querySelector('[data-copy]') && p.root.querySelector('[data-reset]'), 'copy and reset');
  ok(document.querySelector('#overview .disclosure-grid .plate-foot a').getAttribute('href') === '#questions', 'foot link, under the plate with the prose the claim zone let go');
  // Squares: the region and each year in squares of one size. Keys, the Reading, and the receipts do not change with the view.
  const reading = p.reading.textContent;
  setRadio(window, p.radio('pnw_view', 'squares'));
  eq(p.reading.textContent, reading, 'the view leaves the Reading alone');
  eq(p.plot.querySelectorAll('.plate-svg').length, 1, 'one svg in Squares too');
  eq(p.plot.querySelector('.dc-ctx').getAttribute('d').match(/M/g).length, 220, '220 squares for the region');
  eq(p.plot.querySelectorAll('.m-band, .m-needle').length, 0, 'no band and no needle in Squares');
  const squares = (k, kind) => row(p.root, k).querySelector(kind).getAttribute('d').match(/M/g).length;
  const mid = '.m-count:not(.dc-faint)';
  const up = '.m-count.dc-faint';
  eq([squares('2030', mid), squares('2046', mid)].join(), '25,30', 'each year at 100 aMW a square');
  eq([squares('2030', up), squares('2046', up)].join(), '25,40', 'the squares up to the high input');
  const words = [...p.plot.querySelectorAll('.m-label')].map((n) => n.textContent);
  ok(words.includes('The region today: 22,000 aMW. One square is 100 aMW.'), 'the unit is named');
  ok(words.includes('2030: 2,475.1 aMW, fainter to 4,988.7 at high input') && words.includes('2046: 2,958.4 aMW, fainter to 6,923.5 at high input'), `each year is named: ${words}`);
  ok(row(p.root, '2030').classList.contains('is-on'), 'the selected year is on');
  key(window, p.plot, 'ArrowRight');
  ok(row(p.root, '2046').classList.contains('is-on') && leads(p.reading.textContent, ['2046', '2,958.4']), 'arrows move the year in Squares');
  fire(window, row(p.root, '2030').querySelector('.m-hit'), 'click');
  ok(leads(p.reading.textContent, ['2030', '2,475.1']), 'a click selects a year in Squares');
  setRadio(window, p.radio('pnw_view', 'lines'));
  eq(p.plot.querySelectorAll('.dc-ctx').length, 0, 'and Lines comes back');
  eq(p.plot.querySelectorAll('.m-band').length, 1, 'with its band');
  const deep = await load('?pnw_view=squares');
  eq(deep.document.querySelector('#dc-pnw-load .dc-ctx').getAttribute('d').match(/M/g).length, 220, 'a link can open Squares');
  eq(deep.errors.join(), '', 'no script errors in Squares');
  eq(errors.join(), '', 'no script errors');
}

async function growth() {
  const { window, document, errors } = await load('#growth');
  const eia = parts(document, 'dc-eia-servers');
  eq(eia.plot.querySelectorAll('.m-line.is-on').length >= 1, true, 'a lead line');
  ok(eia.plot.querySelectorAll('.m-band').length === 1, 'a band');
  ok(leads(eia.reading.textContent, ['Counterfactual Baseline', '178.1 billion kWh', '2030', '176.8', '190.7']), 'default Reading');
  const eiaLabels = () => [...eia.plot.querySelectorAll('.m-label.is-lead')].map((n) => n.textContent);
  ok(eiaLabels().includes('2030: 178.1') && eiaLabels().some((t) => t.startsWith('2050: ')), `the selected case reads at 2030 and 2050: ${eiaLabels()}`);
  const eiaY = (name) => +[...eia.plot.querySelectorAll('.m-label')].find((n) => n.textContent.startsWith(name)).getAttribute('y');
  ok(eiaY('2050: ') <= eiaY('High Economic Growth') - 17, 'the 2050 figure sits clear above the names at the ends of the lines');
  ok(eia.plot.querySelector('[data-row="2030"] .m-dot.is-lead').classList.contains('is-solo'), 'with its mark');
  moves(window, eia, () => setRadio(window, eia.radio('eia_case', 'High Electricity Demand')), (t) => leads(t, ['High Electricity Demand', '190.7 billion kWh']), 'the case control');
  ok(eiaLabels().includes('2030: 190.7') && eiaLabels().includes('2050: 818.7'), `the labels follow the case: ${eiaLabels()}`);
  moves(window, eia, () => setRadio(window, eia.radio('eia_case', 'High Economic Growth')), (t) => leads(t, ['High Economic Growth', '178.9']), 'the case control');
  moves(window, eia, () => setRadio(window, eia.radio('eia_case', 'Low Economic Growth')), (t) => leads(t, ['Low Economic Growth', '176.8']), 'the case control');
  setRadio(window, eia.radio('eia_case', 'High Electricity Demand'));
  key(window, eia.plot, 'End');
  ok(leads(eia.reading.textContent, ['High Electricity Demand', '818.7 billion kWh', '2050']), 'the needle reaches 2050');
  eq(eia.facts.querySelectorAll('.plate-values li').length, 4, 'every case listed');
  eq([...eia.facts.querySelectorAll('.plate-values li > span:first-child')].map((n) => n.className).join(), 'plate-square is-hollow,plate-square is-hollow is-on,plate-square is-hollow,plate-square is-hollow', 'each with a square, no dash: hollow when modeled, orange only for the selected case');
  key(window, eia.plot, 'Home');
  ok([...eia.facts.querySelectorAll('.plate-values li > span:first-child')].every((n) => n.classList.contains('plate-square') && !n.classList.contains('is-hollow')), 'and filled at 2025, which is not modeled');
  const lbnl = parts(document, 'dc-lbnl-us');
  ok(lbnl.reading.textContent.includes('2030, Reference Case: 649 (521 to 843) TWh'), 'LBNL default');
  ok([...lbnl.plot.querySelectorAll('.m-label')].some((n) => n.textContent === 'EPRI'), 'the EPRI range is named');
  key(window, lbnl.plot, 'Home');
  ok(lbnl.reading.textContent.startsWith('2024, Reference Case: 192 TWh'), 'LBNL year needle');
  const iea = parts(document, 'dc-iea-world');
  ok(leads(iea.reading.textContent, ['2025', '485 TWh']), 'IEA default');
  key(window, iea.plot, 'End');
  ok(iea.reading.textContent.startsWith('2030: 945 TWh'), 'IEA year needle');
  eq(errors.join(), '', 'no script errors');
}

// One row of the check: a projection and what came after, for one target year on one boundary.
const CLAIMS = Object.fromEntries(JSON.parse(read('site/data/claims/demand.json')).claims.map((c) => [c.id, c]));
const forecastData = (document) => JSON.parse(document.getElementById('plate-data-dc-forecast-check').textContent);

async function forecastCheck() {
  const { window, document, errors } = await load('#growth');
  const p = parts(document, 'dc-forecast-check');
  const data = forecastData(document);
  const title = p.root.querySelector('.plate-title').textContent;
  ok(holds(title, ['15 editions of 18', '2023', '7 editions of 9']), `the title carries the two counts: ${title}`);
  ok(!/missed|forecasts? miss/i.test(`${title} ${p.root.querySelector('.plate-claim').textContent}`), 'the claim zone does not say forecasts miss');
  ok(!/forecast-misses|missed in both directions/.test(html), 'the retired plate and its verdict are gone from the page');
  eq(document.querySelectorAll('[data-plate="dc-forecast-misses"]').length, 0, 'no old plate');
  ok(document.querySelector('.dc-jump a[href="#dc-forecast-check"]'), 'the jump list reaches the new plate');
  eq(p.plot.querySelectorAll('.ladder-group').length, 4, 'four rulers');
  eq(p.root.querySelector('.plate-switch [data-param="fc_target"] input:checked').value, '2023', 'the target year switch sits over the plot, at 2023');
  ok(!p.plot.querySelector('svg'), 'rows, so nothing has to redraw for print or with no scripts');
  ok(p.plot.classList.contains('no-needle'), 'no needle: it would stand at a projection and read as what happened');

  // Default: the longest-range verified row, not the chart read.
  eq(row(p.root, 't-10').getAttribute('aria-selected'), 'true', 'the first EIA row is selected');
  eq(`${p.value.textContent} ${p.unit.textContent}`, '-201.01 TWh', 'the readout is how far off it ran');
  ok(holds(p.reading.textContent, ['AEO2013', '10 years out', '4,075.26 TWh', '2023', '3,874.25 TWh', '-201.01 TWh', '5.19 percent', 'high']), `default Reading: ${p.reading.textContent}`);
  eq([...p.facts.querySelectorAll('.plate-values strong')].map((n) => n.textContent).join(), '4,075.26 TWh,3,874.25 TWh', 'both figures, named');
  eq(row(p.root, 't-10').querySelector('.ladder-value').textContent.replace(/\s+/g, ' '), '-201.01 TWh', "a row's end prints the difference");
  eq(row(p.root, 't-10').querySelector('.ladder-label .ladder-tag').textContent, 'AEO2013', 'and names the edition');
  eq(p.root.querySelector('.plate-tally').textContent, 'This row: 2 verified; 44 sources on the plate', 'two receipts, both verified, of the count the Sources tab carries');
  eq(p.chips().map((c) => c.dataset.claim).join(), 'dem-119,dem-113', 'the projection and the realized value');
  ok(!p.receipt.hidden && p.receipt.querySelector('a').href.startsWith('https://'), 'the receipt waits in Sources');

  // Every position is its figure on its ruler: projection at --x, what came after at --x2, the bar between.
  const onRuler = (key, stop) => {
    const [a, b] = data.rows.filter((r) => r.key === key && (!r.when || r.when === stop));
    const { domain: [lo, hi] } = data.plot.groups.find((g) => g.id === a.group);
    const node = row(p.root, key);
    const at = (v) => (v - lo) / (hi - lo);
    ok(Math.abs(place(node, 'x') - at(a.value)) < 1e-3 && Math.abs(place(node, 'x2') - at(b.value)) < 1e-3, `${key} at ${stop}: both marks on the ruler`);
    near(place(node, 'lo'), Math.min(place(node, 'x'), place(node, 'x2')), `${key}: the bar starts at the lower mark`);
    near(place(node, 'hi'), Math.max(place(node, 'x'), place(node, 'x2')), `${key}: and ends at the higher`);
  };
  for (const r of data.rows) if (r.when !== '2019') onRuler(r.key, '2023');

  // Keys: one stop per row, across the rulers.
  key(window, p.plot, 'ArrowDown');
  ok(holds(p.reading.textContent, ['AEO2015', '8 years out', '4,015.47 TWh', '-141.22 TWh', '3.65 percent', 'high']), 'arrows move row to row');
  eq(p.value.textContent, '-141.22', 'the readout follows');
  for (let i = 0; i < 3; i++) key(window, p.plot, 'ArrowDown');
  ok(holds(p.reading.textContent, ['AEO2021', '2 years out', '3,793.13 TWh', '+81.12 TWh', '2.09 percent', 'low']), 'a projection that ran low');
  key(window, p.plot, 'ArrowDown');
  ok(holds(p.reading.textContent, ['AEO2015', '1,438.51 TWh', '1,408.11 TWh', '-30.40 TWh', '2.16 percent', 'high']) && p.reading.textContent.includes('commercial-sector'), 'keys cross into the commercial ruler');
  key(window, p.plot, 'End');
  ok(p.reading.textContent.startsWith("NorthWestern Energy's") && holds(p.reading.textContent, ['0.6', '-1.7', '1.9', '1.2', '+0.6 percentage points', 'low']), 'End reaches the last utility');
  ok(/Montana/.test(p.reading.textContent) && /inside that range/.test(p.reading.textContent), 'said to be outside the Pacific Northwest group, and inside its own range');
  key(window, p.plot, 'Home');
  eq(row(p.root, 't-10').getAttribute('aria-selected'), 'true', 'Home');

  // LBNL: one pair, partly verified, its limit on the Reading.
  fire(window, row(p.root, 'l-2024').querySelector('.ladder-label'), 'click');
  ok(leads(p.reading.textContent, ['2016', '73 TWh', '2020', '2024 Report', 'about 105 TWh', '+32 TWh', '30.5 percent']), `the data center pair: ${p.reading.textContent}`);
  ok(/not a record of data center forecasts/.test(p.reading.textContent), 'and what it does not support');
  ok(p.reading.textContent.includes(`Limit: ${CLAIMS['dem-103'].limit}`), 'its limit is on the Reading');
  eq(`${p.value.textContent} ${p.unit.textContent}`, '+32 TWh', 'the readout');
  eq(p.chips().map((c) => c.dataset.claim).sort().join(), 'dem-039,dem-103,dem-108,dem-109', 'the two figures and the two differences');
  ok(/partly verified/.test(p.root.querySelector('.plate-tally').textContent), 'the receipts line says partly');
  ok(p.facts.textContent.includes('cryptocurrency mining') && /was not checked/.test(p.facts.textContent), 'what was not checked stays in the detail');
  fire(window, row(p.root, 'l-2025').querySelector('.ladder-label'), 'click');
  ok(holds(p.reading.textContent, ['2025 Update', 'about 103 TWh', '+30 TWh', '29.1 percent']) && p.reading.textContent.includes(CLAIMS['dem-104'].limit), 'the later estimate, the same way');
  fire(window, row(p.root, 'l-base').querySelector('.ladder-label'), 'click');
  ok(leads(p.reading.textContent, ['2016', '2014', '70 TWh', '2024 Report', 'about 60 TWh', '4 percent', 'about 75 percent']) && p.reading.textContent.includes(CLAIMS['dem-107'].limit), 'the rebase, with its growth comparison and limit');
  ok(/not part of the error/.test(p.reading.textContent), 'said to be context');
  eq(`${p.value.textContent} ${p.unit.textContent}`, '70 TWh', 'a context row has no difference to print');
  ok(holds(row(p.root, 'l-base').querySelector('.ladder-value').textContent, ['70', '60', 'TWh']), 'it prints both bases');

  // Utility plans: a difference in points, and no percent of a rate near zero.
  fire(window, row(p.root, 'n-pse').querySelector('.ladder-label'), 'click');
  ok(p.reading.textContent.startsWith("Puget Sound Energy's") && holds(p.reading.textContent, ['1.7', '1.2', '2.3', '-0.2', '-1.9 percentage points']), `a plan: ${p.reading.textContent}`);
  ok(/below even the low forecast/.test(p.reading.textContent) && /No percent error/.test(p.reading.textContent), 'said below the low forecast, with no percent');
  eq(`${p.value.textContent} ${p.unit.textContent}`, '-1.9 percentage points', 'the readout');

  // The EIA target year: same rows, other editions; the other rulers do not change.
  fire(window, row(p.root, 'c-8').querySelector('.ladder-label'), 'click');
  moves(window, p, () => setRadio(window, p.radio('fc_target', '2019')), (t) => holds(t, ['AEO2009', '10 years out', '4,131.91 TWh', '2019', '3,811.15 TWh', '-320.76 TWh', '8.42 percent']), 'the target year, from a row that year has no pair for');
  eq(row(p.root, 't-10').getAttribute('aria-selected'), 'true', 'the selection goes back to the default row');
  eq(row(p.root, 't-10').querySelector('.ladder-label .ladder-tag').textContent, 'AEO2009', "the row's edition follows");
  eq(row(p.root, 't-10').querySelector('.ladder-value').textContent.replace(/\s+/g, ' '), '-320.76 TWh', "and its end");
  eq(row(p.root, 't-8').querySelector('.ladder-value').textContent.replace(/\s+/g, ' '), '-130.00 TWh', 'each row');
  eq(p.chips().map((c) => c.dataset.claim).join(), 'dem-114,dem-112', 'receipts follow');
  for (const r of data.rows) if (r.when !== '2023') onRuler(r.key, '2019');
  const shown = (id) => !p.plot.querySelector(`[data-mark="${id}"]`).hidden;
  ok(shown('real-total-2019') && !shown('real-total-2023') && shown('real-commercial-2019') && !shown('real-commercial-2023'), 'each realized rule follows the year');
  ok(p.plot.querySelector('[data-mark="real-total-2019"]').textContent.includes('3,811.15 TWh'), 'and prints its figure');
  // Commercial has no edition this far back in the open data: the kit's ghosts, with no stop for the keys.
  for (const ghost of ['c-8', 'c-6']) {
    ok(row(p.root, ghost).classList.contains('is-ghost') && row(p.root, ghost).getAttribute('aria-disabled') === 'true', `${ghost} is a ghost at 2019`);
    ok(wordsOnly(row(p.root, ghost).querySelector('.ladder-value').textContent) && !row(p.root, ghost).querySelector('.ladder-label .ladder-tag').textContent, 'with words and no edition');
  }
  for (let i = 0; i < 5; i++) key(window, p.plot, 'ArrowDown');
  eq(row(p.root, 'c-4').getAttribute('aria-selected'), 'true', 'the keys go past the ghosts');
  ok(holds(p.reading.textContent, ['AEO2015', '1,404.94 TWh', '1,360.88 TWh', '-44.06 TWh', '3.24 percent']), 'commercial at 2019');
  fire(window, row(p.root, 'l-2024').querySelector('.ladder-label'), 'click');
  ok(holds(p.reading.textContent, ['about 105 TWh', '+32 TWh']), 'LBNL stays at 2020 whatever the EIA year');
  await settle();
  eq(window.location.search, '?fc_target=2019&dc-forecast-check=l-2024', 'a link carries the year and the row');
  fire(window, p.root.querySelector('[data-reset]'), 'click');
  ok(holds(p.reading.textContent, ['AEO2013', '4,075.26 TWh']), 'Reset');
  eq(row(p.root, 't-10').querySelector('.ladder-label .ladder-tag').textContent, 'AEO2013', 'and the editions come back');
  const deep = await load('?fc_target=2019&dc-forecast-check=c-2#growth');
  ok(holds(deep.document.querySelector('#dc-forecast-check .reading').textContent, ['AEO2017', '1,354.56 TWh', '+6.32 TWh', '0.46 percent']), 'a link opens that year and row');
  eq(deep.errors.join(), '', 'no script errors from a link');

  // Sources and Table.
  ok(p.root.querySelector('.plate-views input[value="sources"] + span').textContent === 'Sources (44)', 'the tab counts every receipt');
  const sources = (claim) => document.getElementById(`dc-forecast-check-source-${claim}`).textContent;
  ok(sources('dem-113').includes(`Limit: ${CLAIMS['dem-113'].limit}`) && sources('dem-113').startsWith(CLAIMS['dem-113'].source.title), "EIA's history-revision limit prints on a verified receipt");
  ok(sources('dem-103').includes(`Partly verified. Limit: ${CLAIMS['dem-103'].limit}`), 'the chart read says so');
  ok(sources('dem-114').includes('published 03/2009'), 'a month with no day prints as a month');
  ok(!/missed the AI-era/.test(sources('dem-039')), 'the receipt no longer compares two target years');
  const heads = [...p.root.querySelectorAll('.plate-table thead th')].map((n) => n.textContent);
  ok(['Earlier figure', 'Later figure', 'Later minus earlier', 'Absolute percent error', 'Source', 'Claims'].every((h) => heads.includes(h)), `table columns: ${heads}`);
  const lines = [...p.root.querySelectorAll('.plate-table tbody tr')].map((tr) => [...tr.children].map((n) => n.textContent));
  eq(lines.length, 24, 'one line per pair: ten total, six commercial, three LBNL, five plans');
  const line = (edition, year, text) => ok(lines.some((l) => l[2] === edition && l[3] === year && l.slice(4, 8).join('|') === text), `table: ${edition} for ${year}: ${text}`);
  line('AEO2013', '2023', '4,075.26 TWh|3,874.25 TWh|-201.01 TWh|5.19 percent');
  line('AEO2021', '2023', '3,793.13 TWh|3,874.25 TWh|+81.12 TWh|2.09 percent');
  line('AEO2009', '2019', '4,131.91 TWh|3,811.15 TWh|-320.76 TWh|8.42 percent');
  line('AEO2017', '2019', '3,804.4 TWh|3,811.15 TWh|+6.75 TWh|0.18 percent');
  line('AEO2021', '2023', '1,335.87 TWh|1,408.11 TWh|+72.24 TWh|5.13 percent');
  ok(lines.some((l) => l[1] === '2024 Report' && l.slice(4, 8).join('|') === '73 TWh|105 TWh|+32 TWh|30.5 percent' && /partly verified/.test(l[8]) && l[9] === 'dem-039, dem-103, dem-108, dem-109'), 'table: the data center pair, partly verified, all four claims');
  ok(lines.some((l) => l[1] === 'Portland General Electric' && l.slice(4, 8).join('|') === '2.6 (1.2 to 3.1) percent per year|0.2 percent per year|-2.4 points|not computed'), 'table: a plan, no percent');
  ok(lines.some((l) => l[1] === '2014 base' && l.slice(4, 8).join('|') === '70 TWh|60 TWh||'), 'table: context, no difference');
  eq(errors.join(), '', 'no script errors');
}

// The arithmetic on the page is the arithmetic on the receipts, and each pair is one target year on one boundary. The sentences a reader could lean on come from these rows.
async function forecastProvenance() {
  const { window: { document } } = new JSDOM(html);
  const data = forecastData(document);
  const pairs = new Map();
  for (const r of data.rows) pairs.set(`${r.key}|${r.when ?? ''}`, [...(pairs.get(`${r.key}|${r.when ?? ''}`) || []), r]);
  eq(pairs.size, 24, 'twenty-four pairs');
  for (const [name, [a, b]] of pairs) {
    const [before, after] = [CLAIMS[a.claim], CLAIMS[b.claim]];
    eq(before.year, after.year, `${name}: one target year`);
    eq(a.hollow, true, `${name}: the earlier figure is never drawn as if measured`);
    if (a.key.startsWith('l-')) eq(b.hollow, true, `${name}: LBNL's later figure is modeled history, an open circle`);
    if (/^[tc]-/.test(a.key)) {
      ok(before.boundary.includes(`realized claim ${b.claim}`) && !b.hollow, `${name}: its boundary names the realized claim, which is filled`);
      ok(before.derived.includes(a.fields.diff.replace('+', '')) && before.derived.includes(`${a.fields.error}`), `${name}: ${a.fields.diff}, ${a.fields.error} are the receipt's own arithmetic`);
      eq(a.fields.ran, a.fields.diff.startsWith('-') ? 'high' : 'low', `${name}: the sign and the word agree`);
      ok(before.derived.includes(a.fields.ran === 'high' ? 'above the realized value' : 'below the realized value'), `${name}: the receipt says the same way`);
    }
    if (a.key.startsWith('n-')) ok(before.derived.includes(`${a.fields.diff.replace('+', '')} percentage points`) || before.derived.includes(`= ${a.fields.diff} percentage points`), `${name}: ${a.fields.diff} points is the receipt's own arithmetic`);
  }
  // Counts over every edition, recounted from the rows each receipt lists.
  for (const [id, want, sign] of [['dem-132', 14, '-'], ['dem-133', 18, '-'], ['dem-134', 9, '+']]) {
    const listed = [...CLAIMS[id].derived.matchAll(/AEO\d{4} [\d,.]+ \(([+-])[\d,.]+\)/g)];
    eq(listed.length, want, `${id} lists every edition`);
    eq(listed.filter((m) => m[1] === sign).length, CLAIMS[id].value, `${id} is the count of those rows`);
    eq(CLAIMS[id].unit, `editions of ${want}`, `${id} names its whole`);
  }
  // Shape carries projection against what came after, and the sheet says so; it works with no scripts and in print because it is CSS on the row.
  const css = read('site/assets/css/dc.css');
  ok(/#dc-forecast-check \.ladder-mark:not\(\.is-b\) \{[^}]*rotate\(45deg\)/.test(css), 'a projection is a diamond');
  ok(/#dc-forecast-check \.ladder-mark\.is-b \{[^}]*border-radius: 50%/.test(css), 'what came after is a circle');
  ok(/#dc-forecast-check :is\(\[data-row="l-2024"\], \[data-row="l-2025"\]\) \.ladder-mark\.is-b \{ background: var\(--plot-ground\)/.test(css), "LBNL's later estimate is an open circle");
  const key = [...document.querySelectorAll('#dc-forecast-check .plate-legend li')].map((n) => [n.firstElementChild?.className.replace('plate-square is-', '') ?? '', n.textContent]);
  eq(key.map(([shape]) => shape).join(), 'diamond,circle,open,tick,', 'the key draws each shape');
  ok(/minus means the projection ran high/.test(key.at(-1)[1]), 'and says how to read the sign');
  // No target year not yet reached, and none of the retired rows.
  const on = new Set(Object.keys(data.receipts));
  for (const id of ['dem-022', 'dem-023', 'dem-028', 'dem-033', 'dem-036', 'dem-037', 'dem-053', 'dem-054', 'dem-055']) ok(!on.has(id), `${id} is a revision or an unreached target, so it stays off this plate`);
  ok(Object.keys(data.receipts).every((id) => CLAIMS[id].year <= 2023), 'every target year has passed');
  // A revision is not a miss: the one sentence, each figure poured, and the lesson.
  const words = document.getElementById('forecast-revisions');
  eq(['dem-023', 'dem-022', 'dem-055', 'dem-054'].map((id) => words.querySelector(`span[data-pour="${id}"]`).textContent).join(), '5.3,2.8,106,194', 'the revision sentence, poured');
  ok(holds(words.textContent, ['from 5.3 to 2.8 percent', 'from 106 to 194 GW']), 'in its words');
  ok(words.textContent.includes('A decision record should name the edition, target year, boundary, and uncertainty range.'), 'the lesson');
  ok(['dem-023', 'dem-022', 'dem-055', 'dem-054'].every((id) => words.textContent.includes(id) && CLAIMS[id].status === 'verified'), 'each claim id prints, and each is verified');
  ok(words.querySelector('a[data-pour="dem-022"]').href.startsWith('https://www.eia.gov/') && words.querySelector('a[data-pour="dem-054"]').href.startsWith('https://about.bnef.com/'), 'with its sources');
  // No scripts: the same figures, in the same places.
  eq(document.querySelector('#dc-forecast-check .readout-value').textContent, '-201.01', 'the readout');
  eq(document.querySelector('#dc-forecast-check [data-row="t-10"] .ladder-value').textContent, '-201.01 TWh', 'a row\'s end');
  ok(holds(document.querySelector('#dc-forecast-check .reading').textContent, ['AEO2013', '4,075.26 TWh', '3,874.25 TWh', '-201.01 TWh', '5.19 percent']), 'the Reading');
  ok(document.querySelector('#dc-forecast-check [data-mark="real-total-2019"]').hasAttribute('hidden'), 'the other year\'s rule waits');
  ok(holds(document.querySelector('#dc-forecast-check .plate-setting').textContent, ['EIA target year 2023']), 'the setting is named');
}

async function tradeoffs() {
  const { window, document, errors } = await load('#tradeoffs');
  const m = parts(document, 'dc-tradeoff-matrix');
  eq(m.plot.getAttribute('role'), 'grid', 'matrix is a grid');
  eq(m.plot.querySelectorAll('td[data-row]').length, 21, 'seven rows by three columns');
  ok(leads(m.reading.textContent, ['66 billion liters', '2023', '800 billion liters', '2023', '868 billion liters', '2024', 'Limit:']), 'default Reading: one sentence for the cell, and its partly figure keeps its limit');
  eq(m.value.textContent, '66', 'the readout is the cell\'s first figure');
  eq(m.chips().length, 3, 'a receipt per figure');
  ok(m.root.querySelector('.plate-claim .slot-label') && !m.root.querySelector('img'), 'the photograph slot is named, with no image');
  ok(/#dc-tradeoff-matrix \.matrix tbody td\.is-on \{ outline-width: 1px; outline-offset: -1px; \}/.test(read('site/assets/css/dc.css')), 'the selected cell is 1px, so the needle stays the only 2px orange line');
  key(window, m.plot, 'ArrowRight');
  ok(leads(m.reading.textContent, ['0.36 L per kWh']), 'right moves a column');
  key(window, m.plot, 'ArrowDown');
  ok(leads(m.reading.textContent, ['1.45']), 'down moves a row');
  key(window, m.plot, 'ArrowRight');
  ok(/Workload/.test(m.reading.textContent), 'a word cell');
  eq(m.chips().length, 0, 'no receipt on words');
  fire(window, row(m.root, 'heat--national').querySelector('.matrix-figure'), 'click');
  ok(holds(m.reading.textContent, ['+2 degrees C']) && m.reading.textContent.includes('Limit:'), 'a partly figure keeps its limit');
  ok(!m.receipt.hidden, 'one figure opens its receipt');

  const c = parts(document, 'dc-cooling');
  const site = () => row(c.root, 'site').querySelector('.ladder-value').textContent;
  ok(leads(c.reading.textContent, ['100 MW', '1.45', '0.8', '1 TWh', '190 million liters', 'Microsoft', '4,600 million liters']), 'cooling default');
  moves(window, c, () => setValue(window, c.slider('c_mw'), 200), (t) => leads(t, ['200 MW', '1.45', '0.8', '2 TWh']), 'MW');
  moves(window, c, () => setValue(window, c.slider('c_lf'), 1), (t) => leads(t, ['200 MW', '1.45', '1', '2.5 TWh']), 'load factor');
  moves(window, c, () => setValue(window, c.typed('c_pue'), 1.145), (t) => holds(t, ['1.145', '1', '2 TWh']), 'PUE typed');
  moves(window, c, () => fire(window, c.root.querySelector('[data-preset="1.45"]'), 'click'), (t) => holds(t, ['1.45']), 'PUE preset');
  moves(window, c, () => setRadio(window, c.radio('c_cool', 'lbnl')), (t) => holds(t, ['630 million liters', 'LBNL']), 'cooling at LBNL');
  moves(window, c, () => setRadio(window, c.radio('c_cool', 'google')), (t) => holds(t, ['2,000 million liters', 'Google']), 'cooling at Google');
  moves(window, c, () => setRadio(window, c.radio('c_cool', 'dry')), (t) => /None on site/.test(t), 'dry');
  ok(row(c.root, 'site').classList.contains('dc-words'), 'words drop to body size');
  ok(wordsOnly(site()), 'the row says so');
  moves(window, c, () => setRadio(window, c.radio('c_grid', 'hyperscale')), (t) => holds(t, ['1.4 Mt']), 'hyperscale grid');
  moves(window, c, () => setRadio(window, c.radio('c_grid', 'lbnl')), (t) => holds(t, ['0.86 Mt', 'LBNL']), 'LBNL grid');
  moves(window, c, () => setRadio(window, c.radio('c_grid', 'own')), (t) => holds(t, ['0.94 Mt']), "reader's grid");
  moves(window, c, () => setValue(window, c.slider('c_own'), 100), (t) => holds(t, ['0.25 Mt']), "reader's number");
  setRadio(window, c.radio('c_cool', 'ms'));
  const plantSquares = () => row(c.root, 'plant').querySelector('.dc-sq path').getAttribute('d').match(/M/g).length;
  ok(plantSquares() > 0, 'plant row has squares');
  fire(window, c.root.querySelector('[data-reset]'), 'click');
  ok(leads(c.reading.textContent, ['100 MW', '1.45']), 'Reset');
  eq(plantSquares(), 46, '46 squares of 100 million liters at the default');
  fire(window, row(c.root, 'site').querySelector('.ladder-label'), 'click');
  ok(c.facts.querySelectorAll('.plate-seg').length === 2, 'two segments: water here, water at the plant');
  ok(/here/.test(c.facts.textContent) && /plant/.test(c.facts.textContent), 'each named');
  ok(plateFile('dc-cooling').rows.some((r) => r.detail && c.facts.textContent.includes(r.detail)), 'the sentence');
  ok(holds(c.facts.textContent, ['8.76']), 'the equation');
  ok(c.chips().length >= 3, 'each factor has a receipt');

  const w = parts(document, 'dc-water-intensity');
  eq(w.plot.querySelectorAll('.ladder').length, 2, 'two rulers');
  eq(w.plot.querySelectorAll('.ladder-group-label').length, 2, 'each labeled by its basis');
  ok(leads(w.reading.textContent, ['Microsoft', '0.27 L per kWh']), 'water default');
  key(window, w.plot, 'End');
  ok(leads(w.reading.textContent, ['Amazon', '0.12 L per kWh']) && w.reading.textContent.includes('Limit:'), 'keys cross the rulers; a partly row keeps its limit');
  ok(w.facts.textContent.includes(plateFile('dc-water-intensity').details[0]), 'the sentence');
  fire(window, row(w.root, 'lbnl-after').querySelector('.ladder-label'), 'click');
  ok(w.reading.textContent.includes('0.45 to 0.48 L per kWh'), 'LBNL after 2023');
  eq(errors.join(), '', 'no script errors');
}

async function jobs() {
  const { window, document, errors } = await load('#jobs');
  const p = parts(document, 'dc-jobs-per-mw');
  // One ruler: each end is its figure over the ruler's top, so the bars' lengths compare, and the needle stands at the reader's megawatts on the same numbers.
  const spot = (k, name) => place(row(p.root, k), name);
  const ticks = (k = 'other') => [...row(p.root, k).querySelectorAll('.instrument-ends span')].map((n) => n.textContent).join('|');
  const onRuler = (top, mw, message) => {
    near(spot('mw', 'x'), mw / top, `${message}: the project`);
    near(+p.plot.style.getPropertyValue('--at'), mw / top, `${message}: the needle stands there`);
    near(spot('build', 'lo'), (mw * 0.7) / top, `${message}: construction, low`);
    near(spot('build', 'hi'), (mw * 2) / top, `${message}: construction, high`);
    near(spot('ops', 'lo'), (mw * 0.15) / top, `${message}: operations, low`);
    near(spot('ops', 'hi'), (mw * 0.35) / top, `${message}: operations, high`);
    near(spot('other', 'x'), (mw * 2.7) / top, `${message}: other local jobs`);
  };
  ok(leads(p.reading.textContent, ['100 MW', '70', '200', '15', '35', '270']), 'default');
  eq(row(p.root, 'build').getAttribute('aria-selected'), 'true', 'construction is selected first');
  // The claim zone holds the title, one short paragraph, and the controls. The rest moved under the plate, with the county figure poured and its limit printed.
  eq([...p.root.querySelectorAll('.plate-claim > p')].filter((n) => !/eyebrow|plate-foot/.test(n.className)).length, 1, 'one paragraph beside the plot');
  const how = document.getElementById('jobs-how-long').closest('details');
  ok(how.closest('.dc-details') && how.querySelector('summary').textContent.includes('A data center brings many jobs while it is built and few once it runs.'), 'the summary is the sentence');
  eq(how.querySelector('[data-pour="jb-035"][data-field="text"]').textContent, '2.7', 'the county figure, poured per MW');
  eq(how.querySelector('[data-pour="jb-035"][data-field="status"]').textContent, 'partly verified', 'with its status');
  ok(how.textContent.includes('(jb-035, partly verified)') && how.querySelector('[data-pour="jb-035"][data-field="limit"]').textContent.includes('association rather than cause'), 'its id and its limit');
  ok(how.textContent.includes('The record shows what tax preferences bought in Washington and Georgia.'), 'and the sentence on the record');
  const sheet = read('site/assets/css/dc.css');
  ok(/\.dc-work-links \.bench-ruler \{ display: none; \}/.test(sheet) && /\.dc-work-links \.bench-link \{ font-size: 0\.9375rem; \}/.test(sheet), 'the two AI figures print no empty ruler, and their link is 0.9375rem');
  onRuler(500, 100, 'at 100 MW');
  eq(ticks(), '0|100|200|300|400|500', 'the ruler prints its numbers');
  eq(ticks('mw'), ticks(), 'and repeats them under the first row');
  eq(p.root.querySelector('.instrument > .needle .needle-label'), null, 'the needle is named by the row it stands on, not twice');
  eq(row(p.root, 'mw').querySelector('.ladder-value').textContent, '100 MW', 'the project row');
  eq(row(p.root, 'build').querySelector('.ladder-value').textContent, '70 to 200 workers', 'construction');
  eq(row(p.root, 'ops').querySelector('.ladder-value').textContent, '15 to 35 FTE', 'operations');
  eq(row(p.root, 'other').querySelector('.ladder-value').textContent, '270 jobs', 'other local jobs');
  const record = p.root.querySelector('.plate-view[data-view="reading"] > details.dc-record');
  ok(record && record.querySelector('[data-row="naics"]') && !p.plot.querySelector('.is-fixed'), "the fixed record is the panel's details");
  eq(record.querySelector('summary').textContent, 'The record', 'named so');
  ok(!record.open, 'and closed, so the first screen is the number and the sentence');
  eq(p.plot.getAttribute('aria-owns'), record.querySelector('.dc-fixed').id, 'and the plot still owns its rows');
  eq(p.plot.querySelectorAll('.instrument-row').length, 4, 'the project and three ratios fill the plot');
  eq(row(p.root, 'montana').querySelector('.ladder-num').textContent, '168', 'a fixed figure stands apart from its words');
  moves(window, p, () => setValue(window, p.slider('j_mw'), 500), (t) => leads(t, ['500 MW', '350', '1,000']), 'MW');
  onRuler(2000, 500, 'at 500 MW');
  eq(ticks(), '0|400|800|1,200|1,600|2,000', 'the ruler follows');
  eq(ticks('mw'), ticks(), 'under the first row too');
  setValue(window, p.typed('j_mw'), 2000);
  onRuler(10000, 2000, 'at the top of the range');
  eq(ticks(), '0|2,000|4,000|6,000|8,000|10,000', 'the ruler at the top of the range');
  window.size = { w: 280, h: 520 }; // the Table view narrows the plot
  window.observers.forEach((notify) => notify());
  await wait(40);
  eq(ticks(), '0|10,000', 'a narrow plot keeps only the ruler\'s ends, so its numbers cannot run together');
  eq(ticks('mw'), ticks(), 'under the first row too');
  window.size = { w: 980, h: 520 };
  window.observers.forEach((notify) => notify());
  await wait(40);
  // A closed record hides its rows, so a key that reaches one opens it; a reader's closing it holds through a resize. A link opens it too.
  key(window, p.plot, 'End');
  eq(row(p.root, 'doe-shortage').getAttribute('aria-selected'), 'true', 'keys reach the record');
  ok(record.open, 'and open it');
  record.open = false;
  window.size = { w: 900, h: 520 };
  window.observers.forEach((notify) => notify());
  await wait(40);
  ok(!record.open, 'a resize leaves it closed');
  window.size = { w: 980, h: 520 };
  window.observers.forEach((notify) => notify());
  await wait(40);
  const deep = await load('?dc-jobs-per-mw=wa-cost#jobs');
  ok(deep.document.querySelector('#dc-jobs-per-mw .dc-record').open, 'a link to a record row opens it');
  eq(deep.errors.join(), '', 'no script errors from that link');
  key(window, p.plot, 'Home');
  ok(!record.open, 'a row on the plot leaves it closed');
  fire(window, row(p.root, 'naics').querySelector('.ladder-label'), 'click');
  ok(leads(p.reading.textContent, ['518210', '419.4', '491.6 thousand jobs', '2021', '2025']), 'a trend row');
  eq(p.chips().length, 5, 'five receipts');
  const chipShown = p.chips().filter((c) => !c.classList.contains('is-extra'));
  ok(chipShown.length === 1 && chipShown[0].textContent.endsWith(', 5 claims'), `one chip for one publisher: ${chipShown.map((c) => c.textContent)}`);
  fire(window, chipShown[0], 'click');
  eq(p.root.dataset.view, 'sources', 'it opens the per-claim list');
  fire(window, p.root.querySelector('input[value="reading"]'), 'change');
  ok(row(p.root, 'naics').querySelector('svg.spark path'), 'a sparkline');
  fire(window, row(p.root, 'wa-cost').querySelector('.ladder-label'), 'click');
  eq(p.facts.querySelectorAll('.plate-values li').length, 3, 'three figures');
  ok(p.reading.textContent.includes('Limit:'), 'a partly figure keeps its limit');
  ok(holds(row(p.root, 'wa-cost').textContent, ['0']), 'zero prints');
  key(window, p.plot, 'Home');
  eq(row(p.root, 'mw').getAttribute('aria-selected'), 'true', 'keys reach the project row');
  key(window, p.plot, 'ArrowDown');
  eq(row(p.root, 'build').getAttribute('aria-selected'), 'true', 'keys move through rows');
  ok(holds(p.facts.textContent, ['0.7', '2.0']), 'the equation');
  eq(p.chips().filter((c) => c.dataset.claim === 'jb-023').length, 1, 'its receipt');
  ok(!p.receipt.hidden && p.receipt.textContent.includes('Limit:'), 'a partly receipt states its limit');
  eq(errors.join(), '', 'no script errors');
}

async function policy() {
  const { document, errors } = await load('#policy-landscape');
  const grid = document.querySelector('.dc-grid');
  eq(grid.querySelectorAll('tbody tr').length, 5, 'five rows');
  eq([...grid.querySelectorAll('thead th')].map((n) => n.textContent).join(), 'Tribal,State,Federal', 'three columns');
  ok(![...grid.querySelectorAll('td')].some((n) => /\b\d+(\.\d+)? ?(percent|MW|aMW|TWh)/.test(n.textContent)), 'no figures in the grid');
  ok(document.querySelector('[data-policy-watch="data-centers"]'), 'policy watch hook');
  const climate = document.querySelector('[data-policy-watch="data-centers"] > .climate-voice');
  ok(climate.querySelector('img.climate-on-dark[alt="ATNI Climate"]') && climate.querySelector('img.climate-on-light[alt="ATNI Climate"]'), 'the Climate voice: one lockup per theme');
  ok(climate.querySelector('a[href*="policy-sentinel"]') && climate.querySelector('[data-policy-checked]'), 'on the source line, which names Policy Sentinel and its date');
  ok(!document.querySelector('figure .climate-voice, [role="tablist"] .climate-voice'), 'and never on a plate or a tab');
  ok(document.querySelector('#policy-grid .plate-claim .dc-jump a[href="#policy-watch"]'), 'the jump list reads in the claim zone');
  ok(document.querySelector('[data-library-feed][data-area="data-centers"]'), 'library hook');
  eq(document.querySelectorAll('#policy-landscape .dc-details > details').length, 4, 'Tribal, State, Federal, Alternatives');
  ok(document.querySelector('.dc-policy-side .dc-grid-wrap + .dc-policy-key'), 'the key sits under the grid');
  eq(errors.join(), '', 'no script errors');
}

async function project() {
  const { window, document, errors } = await load('#questions');
  const p = parts(document, 'dc-project');
  const lit = () => (p.plot.querySelector('.dc-lit').getAttribute('d').match(/M/g) || []).length;
  ok(leads(p.reading.textContent, ['125 MW', '0.8', '100 aMW', '0.88 TWh', '0.45 percent', '22,000 aMW', '240', '1,000 million liters']), 'default');
  const amwAt = +row(p.root, 'amw').style.getPropertyValue('--x');
  ok(Math.abs(amwAt - 0.606) < 0.01, `125 MW reads at 60 percent of its log ruler: ${amwAt}`);
  // One needle across the rulers: each spans the same multiple, so the marks that scale with the load stand under it at any setting.
  const needle = p.root.querySelector('.instrument > .needle');
  const onNeedle = (k, message) => near(+place(row(p.root, k), 'x').toFixed(3), +(+p.plot.style.getPropertyValue('--at')).toFixed(3), message);
  near(+p.plot.style.getPropertyValue('--at'), amwAt, 'the needle stands at 125 MW, 0.8 load factor');
  ok(!p.plot.classList.contains('no-needle') && needle, 'and it shows');
  eq(needle.querySelector('.needle-label'), null, 'the row it stands on names it');
  eq(row(p.root, 'amw').querySelector('.ladder-label').firstChild.textContent, 'Average load', 'and that row says what it is');
  onNeedle('twh', 'energy stands under the needle');
  ok(wordsOnly(row(p.root, 'site').querySelector('.ladder-tag').textContent), 'the site row says whose figure it is');
  ok(place(row(p.root, 'site'), 'lo') < amwAt && amwAt < place(row(p.root, 'site'), 'hi'), 'and its spread straddles the needle: 1 liter per kWh stands under it');
  ok(row(p.root, 'plant').hidden, 'the plant row waits for Yes');
  for (let i = 0; i < 6; i++) {
    key(window, p.plot, 'ArrowDown');
    ok(row(p.root, 'plant').getAttribute('aria-selected') !== 'true', 'arrows skip a row that is off');
  }
  key(window, p.plot, 'Home');
  eq(p.plot.querySelector('.dc-ctx').getAttribute('d').match(/M/g).length, 220, 'the region in squares');
  eq(lit(), 1, 'one lit square');
  moves(window, p, () => setValue(window, p.slider('p_mw'), 1000), (t) => leads(t, ['1,000 MW', '0.8', '800 aMW', '7 TWh', '3.6 percent']), 'MW');
  eq(lit(), 8, 'eight lit squares');
  ok(+p.plot.style.getPropertyValue('--at') > amwAt, 'the needle moves with the reader');
  onNeedle('twh', 'and energy stays under it');
  moves(window, p, () => setValue(window, p.slider('p_lf'), 1), (t) => leads(t, ['1,000 MW', '1', '1,000 aMW', '8.8 TWh']), 'load factor');
  moves(window, p, () => setValue(window, p.root.querySelector('[data-param="p_l"] input'), 0.5), (t) => holds(t, ['4,400 million liters', '0.5']), "the applicant's figure");
  moves(window, p, () => setValue(window, p.root.querySelector('[data-param="p_l"] input'), ''), (t) => holds(t, ['2,400', '10,000 million liters']), 'blank returns the spread');
  const plant = () => row(p.root, 'plant').querySelector('.ladder-value').textContent;
  ok(wordsOnly(plant()), 'plant row off');
  ok(row(p.root, 'plant').classList.contains('dc-words'), 'words at body size');
  moves(window, p, () => setRadio(window, p.radio('p_plant', 'on')), (t) => holds(t, ['40,000 million liters']), 'the plant toggle');
  ok(!row(p.root, 'plant').hidden, 'Yes shows the row');
  onNeedle('plant', 'and its mark stands under the needle');
  ok(wordsOnly(row(p.root, 'site').querySelector('.ladder-tag').textContent), 'blank again, so the record\'s spread');
  eq(plant(), '40,000 million liters', 'plant row on');
  ok(!row(p.root, 'plant').classList.contains('dc-words'), 'a figure again');
  fire(window, row(p.root, 'council').querySelector('.ladder-label'), 'click');
  ok(leads(p.reading.textContent, ['2030', '2,020.4', '1,301.9', '4,429.3) aMW']), 'a context row');
  fire(window, p.root.querySelector('[data-reset]'), 'click');
  eq(lit(), 1, 'Reset');
  fire(window, row(p.root, 'site').querySelector('.ladder-label'), 'click');
  ok(p.chips().some((c) => c.dataset.claim === 'fp-006') && p.chips().some((c) => c.dataset.claim === 'tr-028'), 'site water cites both ends');
  eq(p.root.querySelector('.plate-foot a').getAttribute('href'), '#q-water', 'foot link');
  eq(document.querySelectorAll('#checklists.dc-details > details').length, 8, 'eight checklists');
  ok(p.root.querySelector('.plate-claim .dc-jump a[href="#checklists"]'), 'the jump list reaches them');
  eq(errors.join(), '', 'no script errors');
}

// County climate and where proposals sit: the measure's own ruler and figures, the scenario, the county filter, and the map's lit squares.
async function climateLand() {
  const { window, document, errors } = await load('#climate');
  const c = parts(document, 'dc-climate-counties');
  const m = JSON.parse(document.getElementById('plate-data-dc-climate-counties').textContent).measures;
  const shown = () => [...c.plot.querySelectorAll('.ladder-row')].filter((n) => !n.hidden).map((n) => n.dataset.row);
  const ww = m.rows['walla-walla-wa'];
  eq(shown().join(), m.dc.join(), 'the first view is the data center counties');
  ok(['Walla Walla County, WA, SSP2-4.5', `about ${ww.tmax_summer.ssp245[1]} (`].every((s) => c.reading.textContent.includes(s)), `default: ${c.reading.textContent.slice(0, 160)}`);
  moves(window, c, () => setRadio(window, c.radio('cc_metric', 'days_95')), (t) => t.includes(`about ${ww.days_95.ssp245[1]} (`) && t.includes(`against ${ww.days_95.baseline[1]} (`) && t.includes('days a year'), 'measure');
  const d = m.metrics.days_95;
  eq(c.plot.querySelector('.ladder-group-label').textContent, d.axis, 'the ruler says what it measures');
  eq(c.plot.querySelector('.ladder-axis').lastChild.textContent, String(d.domain[1]), 'and runs to its own top');
  near(place(row(c.root, 'walla-walla-wa'), 'x'), (ww.days_95.ssp245[1] - d.domain[0]) / (d.domain[1] - d.domain[0]), 'the 2040 to 2059 mark stands at its figure');
  near(place(row(c.root, 'walla-walla-wa'), 'x2'), (ww.days_95.baseline[1] - d.domain[0]) / (d.domain[1] - d.domain[0]), 'and the 1995 to 2014 mark at its own');
  ok(c.facts.textContent.includes(`${ww.days_95.baseline[1]} (`), 'the facts follow the measure');
  moves(window, c, () => setRadio(window, c.radio('cc_scenario', 'ssp370')), (t) => t.includes('SSP3-7.0') && t.includes(`about ${ww.days_95.ssp370[1]} (`), 'scenario');
  setRadio(window, c.radio('cc_state', 'mt'));
  ok(shown().length && shown().every((k) => k.endsWith('-mt')), 'a state shows its counties only');
  await wait(40);
  ok(c.reading.textContent.includes(', MT,'), `a county shown takes the selection: ${c.reading.textContent.slice(0, 60)}`);
  const land = await load('#land');
  const squares = [...land.document.querySelectorAll('#project-map .m')];
  const lit = squares.filter((s) => !s.classList.contains('is-dim'));
  ok(lit.length && lit.every((s) => s.dataset.row === 'federal-blm'), `the map lights the selected land row: ${lit.length} of ${squares.length}`);
  ok(land.document.querySelector('#land-records .cr[data-claim^="pj-"]'), 'the record list marks its MW figures');
  eq([...errors, ...land.errors].join(), '', 'no script errors');
}

async function noScripts() {
  const { window: { document } } = new JSDOM(html);
  eq(document.querySelectorAll('section.panel').length, 8, 'all panels in the page');
  ok(!document.querySelector('[role="tablist"]') && document.querySelector('.section-strip a[href="#jobs"]'), 'strip is a jump list');
  for (const root of document.querySelectorAll('[data-plate]')) {
    ok(root.querySelector('.reading').textContent.length > 20, `${root.id} default Reading`);
    ok(root.querySelector('table tbody tr'), `${root.id} table`);
    ok(root.querySelector('.plate-plot').firstElementChild, `${root.id} static plot`);
    ok(root.querySelector('.plate-sources li'), `${root.id} sources`);
  }
  ok(holds(document.querySelector('#dc-project .plate-setting').textContent, ['125']), 'the setting named');
  ok(document.querySelector('#dc-jobs-per-mw .plate-plot [data-row="naics"]'), 'without scripts the fixed record stays in the plot');
  ok(document.querySelector('.section-strip a[href="resource-use/"]') && !document.querySelector('header .subnav'), 'the other page of the family is a link in the strip');
  eq(document.querySelector('.section-strip a[href="resource-use/"]').textContent, 'Reference: What Uses Data Center Energy and Water', 'and says so');
  eq(document.querySelector('#dc-pnw-load .m-needle').getAttribute('x1'), `${+document.querySelector('#dc-pnw-load .m-grid').getAttribute('x1') + 24}.0`, 'the static needle stands 24px in from the ticks too');
  ok(!/>2029</.test(document.querySelector('#dc-pnw-load .plate-plot').innerHTML), 'and the static axis starts at 2030');
  eq([...document.querySelectorAll('#dc-tradeoff-matrix td[data-row="water--national"] .matrix-bar')].map((n) => n.style.getPropertyValue('--x')).join(), '0.076,0.9217,1.0', 'three water figures, scaled within the cell');
  eq(document.querySelectorAll('#dc-tradeoff-matrix td[data-row="power--national"] .matrix-bar').length, 0, 'a lone figure has nothing to compare');
  eq(document.querySelectorAll('#dc-tradeoff-matrix td[data-row="emissions--national"] .matrix-bar').length, 0, 'nor figures in different units');
  eq(document.querySelector('[data-pour="dem-058"]').textContent, '22,000 aMW', 'a poured figure');
  eq(document.querySelector('.page-band-figures [data-pour="dem-058"]').textContent, '22,000 aMW', 'the band: the region');
  eq(document.querySelector('.page-band-figures').textContent.includes('2,475.1 aMW'), true, 'the band: the Council input, its middle figure');
  eq(document.querySelector('[data-pour="dem-073"][data-field="value"]').textContent, '2,475.1', 'poured from its claim');
  eq(document.querySelectorAll('.page-band-figures > li').length, 3, 'three figures');
  const bandIds = [...document.querySelectorAll('.page-band-figures .figure-label a')];
  eq(bandIds.map((a) => a.textContent).join(), 'dem-058,dem-073', 'each claim figure prints its id as a link');
  for (const a of bandIds) {
    eq(a.parentElement.textContent, `${a.textContent}, ${CLAIMS[a.textContent].status}`, `${a.textContent}: the status comes from the claim`);
    ok(document.getElementById(a.getAttribute('href').split('#')[1]), `${a.textContent}: the link names a receipt on the page`);
    eq(CLAIMS[a.textContent].limit ?? null, null, `${a.textContent}: no limit is owed beside it`);
  }
  ok(document.querySelector('.page-band .lead a[href$="atni-res-2026-034-tiered-sovereign-data-framework.pdf"]'), 'and the resolution link, at the end of the lead');
  ok(!document.querySelector('.key-facts, .page-hero, .dc-fact'), 'with no raised box');
  ok(document.querySelector('#overview .dc-panel-head .dc-jump') && document.querySelector('#overview .dc-panel-head .panel-title'), 'without scripts the jump list and the title stay above the plate');
  for (const id of ['purpose', 'why-now', 'environmental-impacts', 'policy-landscape', 'alternatives', 'questions', 'policy-watch', 'library', 'facts-title']) ok(document.getElementById(id), `${id} survives`);
  const slots = html.match(/<!-- SLOT:data-centers:[a-z-]+ -->/g);
  eq(slots.length, 8, 'eight slots');
  eq(html.match(/<!-- \/SLOT -->/g).length, 8, 'all closed');
}

async function untrusted() {
  const js = read('site/assets/js/data-centers.js');
  ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|fetch\(/.test(js), 'no markup strings or fetches');
  ok(!/ -- |\u2014/.test(js), 'house style');
  console.log(`module ${Buffer.byteLength(js)} bytes`);
}


module.exports = { groups: { tabs, deepLinks, council, growth, forecastCheck, forecastProvenance, tradeoffs, jobs, policy, project, climateLand, noScripts, untrusted } };
