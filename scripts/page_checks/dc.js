// The Data Centers page with its real module and data: tabs, deep links, selection, and every control's effect on the Reading.
const { JSDOM, ok, eq, wait, read, plateFile, open, fire, key, holds, leads, wordsOnly } = require('./lib');

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
  eq(links.length, 6, 'six tabs');
  eq(panels.length, 6, 'six panels');
  eq(panels.map((n) => n.id).join(), 'overview,growth,tradeoffs,jobs,policy-landscape,questions', 'panel ids');
  ok(!panels[0].hidden && panels.slice(1).every((n) => n.hidden), 'Overview shows first');
  for (let i = 1; i < 6; i++) {
    fire(window, links[i], 'click');
    ok(!panels[i].hidden, `tab ${i} shows`);
    eq(window.location.hash, `#${panels[i].id}`, 'hash written');
  }
  key(window, links[5], 'ArrowRight');
  eq(links[0].getAttribute('aria-selected'), 'true', 'arrow wraps');
  key(window, links[0], 'End');
  eq(links[5].getAttribute('aria-selected'), 'true', 'End');
  key(window, links[5], 'Home');
  eq(links[0].getAttribute('aria-selected'), 'true', 'Home');
  eq(document.querySelectorAll('[data-plate]').length, 10, 'ten plates');
  eq(errors.join(), '', 'no script errors');
}

async function deepLinks() {
  for (const [hash, tab, opens] of [
    ['purpose', 'overview', true], ['why-now', 'overview', true], ['library', 'overview', false], ['environmental-impacts', 'tradeoffs', false],
    ['policy-landscape', 'policy-landscape', false], ['alternatives', 'policy-landscape', true], ['questions', 'questions', false], ['policy-watch', 'policy-landscape', false],
    ['dc-lbnl-us', 'growth', false], ['dc-water-intensity', 'tradeoffs', false], ['q-water', 'questions', true], ['policy-tribal', 'policy-landscape', true], ['dc-project', 'questions', false],
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
}

async function council() {
  const { window, document, errors } = await load();
  const p = parts(document, 'dc-pnw-load');
  eq(p.plot.querySelectorAll('.plate-svg').length, 1, 'one svg');
  ok(p.plot.querySelector('.dc-ctx').getAttribute('d').match(/M/g).length === 220, '220 squares for the region');
  eq(p.plot.querySelectorAll('.m-band').length, 1, 'a band');
  eq(row(p.root, '2030').getAttribute('aria-selected'), 'true', 'default year');
  ok(leads(p.reading.textContent, ['2030', '2,475.1', '1,512.8', '4,988.7) aMW', '11 percent']), 'default Reading');
  eq(`${p.value.textContent} ${p.unit.textContent}`, '2,475.1 (1,512.8 to 4,988.7) aMW', 'readout');
  const lit = () => p.plot.querySelector('.dc-lit').getAttribute('d').match(/M/g).length;
  eq(lit(), 25, 'the selected year lights 25 squares');
  eq(p.plot.querySelectorAll('.m-count').length, 0, 'the growth band stays in the plot, not in a third field');
  ok(p.plot.querySelector('.m-needle'), 'a needle');
  const end = [...p.plot.querySelectorAll('.m-tick')].find((n) => n.textContent === '2046');
  eq(end.getAttribute('text-anchor'), 'end', 'the axis end label ends at the edge, so it is not clipped');
  ok(p.plot.style.getPropertyValue('--at').endsWith('px'), 'needle placed');
  key(window, p.plot, 'ArrowRight');
  eq(row(p.root, '2046').getAttribute('aria-selected'), 'true', 'arrow moves the year');
  eq(lit(), 30, 'squares follow the year');
  ok(leads(p.reading.textContent, ['2046', '2,958.4']), 'Reading follows');
  ok(p.facts.textContent.includes('29,600 to 39,800 aMW') && p.facts.textContent.includes('Limit:'), 'the region in 2046 with its limit');
  ok(p.chips().some((c) => c.dataset.claim === 'dem-092'), 'its receipt');
  ok(!p.chips().some((c) => c.dataset.claim === 'dem-070'), 'only what the panel shows');
  key(window, p.plot, 'Home');
  eq(row(p.root, '2029').getAttribute('aria-selected'), 'true', 'Home');
  ok(leads(p.reading.textContent, ['2029', '2,197.8']), 'Reading');
  fire(window, row(p.root, '2030').querySelector('.m-hit'), 'click');
  eq(row(p.root, '2030').getAttribute('aria-selected'), 'true', 'a click selects');
  ok(p.root.querySelector('[data-copy]') && p.root.querySelector('[data-reset]'), 'copy and reset');
  ok(p.root.querySelector('.plate-foot a').getAttribute('href') === '#questions', 'foot link');
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
  const lbnl = parts(document, 'dc-lbnl-us');
  ok(lbnl.reading.textContent.includes('2030, Reference Case: 649 (521 to 843) TWh'), 'LBNL default');
  ok([...lbnl.plot.querySelectorAll('.m-label')].some((n) => n.textContent === 'EPRI'), 'the EPRI range is named');
  key(window, lbnl.plot, 'Home');
  ok(lbnl.reading.textContent.startsWith('2024, Reference Case: 192 TWh'), 'LBNL year needle');
  const iea = parts(document, 'dc-iea-world');
  ok(leads(iea.reading.textContent, ['2025', '485 TWh']), 'IEA default');
  key(window, iea.plot, 'End');
  ok(iea.reading.textContent.startsWith('2030: 945 TWh'), 'IEA year needle');
  const miss = parts(document, 'dc-forecast-misses');
  ok(leads(miss.reading.textContent, ['LBNL', '2024', '176 TWh', '2023']), 'misses default');
  eq(miss.plot.querySelectorAll('.m-title').length, 3, 'three panels');
  ok(miss.plot.querySelectorAll('.m-line.is-proj').length >= 2, 'forecast segments are dashed');
  key(window, miss.plot, 'ArrowDown');
  ok(leads(miss.reading.textContent, ['LBNL', '2024', '325', '580 TWh', '2028']), 'arrows move point to point');
  ok(/replaced/i.test(miss.facts.textContent), 'its note');
  fire(window, row(miss.root, 's-may').querySelector('.m-hit'), 'click');
  ok(leads(miss.reading.textContent, ['EIA', '2027', '05/2026', '5.3 percent']), 'a click selects a point');
  ok(!miss.receipt.hidden && miss.receipt.querySelector('a').href.startsWith('https://'), 'the receipt opens');
  eq(errors.join(), '', 'no script errors');
}

async function tradeoffs() {
  const { window, document, errors } = await load('#tradeoffs');
  const m = parts(document, 'dc-tradeoff-matrix');
  eq(m.plot.getAttribute('role'), 'grid', 'matrix is a grid');
  eq(m.plot.querySelectorAll('td[data-row]').length, 21, 'seven rows by three columns');
  ok(leads(m.reading.textContent, ['66 billion liters', '2023']), 'default Reading');
  eq(m.chips().length, 3, 'a receipt per figure');
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
  const squares = (k) => [...row(p.root, k).querySelectorAll('.dc-sq path')].map((n) => (n.getAttribute('d').match(/M/g) || []).length);
  ok(leads(p.reading.textContent, ['100 MW', '70', '200', '15', '35', '270']), 'default');
  eq(squares('build').join(), '70,130', 'construction squares');
  eq(squares('ops').join(), '15,20', 'operations squares');
  const opsFaint = row(p.root, 'ops').querySelector('.dc-sq .dc-faint').getAttribute('d');
  const pathStart = (d) => d.match(/M([\d.]+) ([\d.]+)/).slice(1).map(Number);
  const [ax] = pathStart(row(p.root, 'ops').querySelector('.dc-sq path').getAttribute('d'));
  const steps = row(p.root, 'ops').querySelector('.dc-sq path').getAttribute('d').match(/M[\d.]+ /g).map((s) => Number(s.slice(1)));
  const pitch = steps[1] - steps[0];
  eq(pathStart(opsFaint)[0], ax + (15 % Math.floor(window.size.w / pitch)) * pitch, 'the fainter run starts on the next cell, with no gap');
  eq(squares('other').join(), '270,0', 'other squares');
  ok(/one job/i.test(p.plot.querySelector('.dc-unit').textContent), 'the unit');
  const record = p.root.querySelector('.plate-view[data-view="reading"] .dc-fixed');
  ok(record && record.querySelector('[data-row="naics"]') && !p.plot.querySelector('.is-fixed'), 'the fixed record reads under the Reading');
  eq(p.plot.getAttribute('aria-owns'), record.id, 'and the plot still owns its rows');
  eq(p.plot.querySelectorAll('.instrument-row').length, 3, 'three ratios fill the plot');
  eq(row(p.root, 'montana').querySelector('.ladder-num').textContent, '168', 'a fixed figure stands apart from its words');
  moves(window, p, () => setValue(window, p.slider('j_mw'), 500), (t) => leads(t, ['500 MW', '350', '1,000']), 'MW');
  ok(leads(p.plot.querySelector('.dc-unit').textContent, ['10']), 'the unit follows');
  eq(squares('build').join(), '35,65', 'squares follow');
  setValue(window, p.typed('j_mw'), 2000);
  ok(leads(p.plot.querySelector('.dc-unit').textContent, ['100']), 'the unit at the top of the range');
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
  ok(wordsOnly(row(p.root, 'site').querySelector('.ladder-tag').textContent), 'the site row says whose figure it is');
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
  moves(window, p, () => setValue(window, p.slider('p_lf'), 1), (t) => leads(t, ['1,000 MW', '1', '1,000 aMW', '8.8 TWh']), 'load factor');
  moves(window, p, () => setValue(window, p.root.querySelector('[data-param="p_l"] input'), 0.5), (t) => holds(t, ['4,400 million liters', '0.5']), "the applicant's figure");
  moves(window, p, () => setValue(window, p.root.querySelector('[data-param="p_l"] input'), ''), (t) => holds(t, ['2,400', '10,000 million liters']), 'blank returns the spread');
  const plant = () => row(p.root, 'plant').querySelector('.ladder-value').textContent;
  ok(wordsOnly(plant()), 'plant row off');
  ok(row(p.root, 'plant').classList.contains('dc-words'), 'words at body size');
  moves(window, p, () => setRadio(window, p.radio('p_plant', 'on')), (t) => holds(t, ['40,000 million liters']), 'the plant toggle');
  ok(!row(p.root, 'plant').hidden, 'Yes shows the row');
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
  eq(document.querySelectorAll('#questions .dc-details > details').length, 8, 'eight checklists');
  eq(errors.join(), '', 'no script errors');
}

async function noScripts() {
  const { window: { document } } = new JSDOM(html);
  eq(document.querySelectorAll('section.panel').length, 6, 'all panels in the page');
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
  eq([...document.querySelectorAll('#dc-tradeoff-matrix td[data-row="water--national"] .matrix-bar')].map((n) => n.style.getPropertyValue('--x')).join(), '0.076,0.9217,1.0', 'three water figures, scaled within the cell');
  eq(document.querySelectorAll('#dc-tradeoff-matrix td[data-row="power--national"] .matrix-bar').length, 0, 'a lone figure has nothing to compare');
  eq(document.querySelectorAll('#dc-tradeoff-matrix td[data-row="emissions--national"] .matrix-bar').length, 0, 'nor figures in different units');
  eq(document.querySelector('[data-pour="dem-058"]').textContent, '22,000 aMW', 'a poured figure');
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


module.exports = { groups: { tabs, deepLinks, council, growth, tradeoffs, jobs, policy, project, noScripts, untrusted } };
