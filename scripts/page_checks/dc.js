// The Data Centers page with its real module and data: the agenda, tabs, deep links, selection, every control's effect on the Reading, and the atlas.
const { JSDOM, ok, eq, wait, settle, settings, read, plateFile, receiptsOn, open, fire, key, holds, leads, wordsOnly } = require('./lib');

const PAGE = 'http://localhost/site/data-centers/index.html';
const html = read('site/data-centers/index.html');
const receipt = receiptsOn('site/data-centers/sources/index.html');

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
    // The selection's claims, one entry each, under its publishers' chips (a chip stands for every claim it counts).
    chips: () => [...root.querySelectorAll('.plate-evidence .receipt')].flatMap((chip) => chip.dataset.claims.split(' ').map((claim) => ({ dataset: { claim }, chip }))),
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
  const strip = document.querySelector('.section-strip');
  const links = [...strip.querySelectorAll('[role="tab"]')];
  const panels = [...document.querySelectorAll('main > section.panel[role="tabpanel"]')];
  eq(links.length, 8, 'eight tabs');
  eq(panels.length, 8, 'eight panels');
  eq(panels.map((n) => n.id).join(), 'overview,growth,tradeoffs,where,jobs,policy-landscape,perception,questions', 'panel ids');
  eq(links.map((a) => a.querySelector('.tab-name').textContent).join(), 'Why now,Growth,Tradeoffs,Where,Jobs,Policy,Public Perception,Questions', 'each tab is its name');
  ok(links.every((a) => a.querySelector('.tab-q').textContent.endsWith('?')), 'over the question it answers');
  ok(!panels[0].hidden && panels.slice(1).every((n) => n.hidden), 'Why now shows first');
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
  // From the strip at the window's foot (R3 4), a tab brings its panel up under the strip at once, focus kept on the tab; from mid-window nothing moves (visual-1).
  const rect = window.Element.prototype.getBoundingClientRect;
  let stripAt = 836;
  window.Element.prototype.getBoundingClientRect = function () { return this === strip ? { top: stripAt, bottom: stripAt + 64 } : panels.includes(this) ? { top: stripAt + 64 } : rect.call(this); };
  Object.defineProperty(strip, 'offsetHeight', { value: 64 });
  let went = null;
  window.scrollTo = (o) => { went = o; };
  links[2].focus();
  fire(window, links[2], 'click');
  ok(!panels[2].hidden && went?.top === window.scrollY + stripAt && went.behavior === 'instant', `the panel comes up under the strip: ${JSON.stringify(went)}`);
  eq(document.activeElement, links[2], 'and focus stays on its tab');
  went = null;
  stripAt = 300;
  fire(window, links[3], 'click');
  eq(went, null, 'a strip in mid-window scrolls nothing');
  window.Element.prototype.getBoundingClientRect = rect;
  fire(window, links[0], 'click');
  ok(strip.querySelector('a.strip-out[data-not-tab][href="sources/"]') && strip.querySelector('button.paper[data-sheet-open][data-js]'), 'the strip ends in Sources and the meeting sheet');
  eq(document.querySelectorAll('[data-plate]').length, 17, 'seventeen plates');
  for (const id of ['dc-tradeoff-matrix', 'dc-cooling', 'dc-project', 'dc-jobs-per-mw']) ok(document.querySelector(`#${id} > .plate-bar .plate-views [data-view="table"]`), `${id}: the Table is one press away, over the plot`);
  ok(!document.querySelector('.dc-jump, .dc-panel-head, .page-band, [data-library-feed]'), 'no jump lists, no band, no library feed (data-centers-01, -22, -25)');
  // The agenda (DIRECTION-R2 3.2): three questions, each answered in one sentence read off its face; the third face lists the question sets.
  const agenda = document.querySelector('section.agenda');
  const qs = [...agenda.querySelectorAll('.agenda-q > a[role="tab"]')];
  eq(qs.map((a) => a.getAttribute('aria-controls')).join(), 'face-load,face-project,face-asks', 'three faces');
  eq(agenda.querySelector('[role="tablist"]').getAttribute('aria-orientation'), 'vertical', 'a vertical tablist');
  eq(agenda.querySelector('[data-answer="dc-pnw-load"]').textContent, "The Council's input for data centers and chip fabs is 2,475.1 aMW in 2030, about 11 percent of the region's 22,000 aMW today.", 'the load answer, its year ungrouped');
  eq(agenda.querySelector('[data-answer="dc-project"]').textContent, "A 125 MW project at a 0.8 load factor averages 100 aMW, about 0.45 percent of the region's load today.", 'the proposal answer');
  const adds = [...document.querySelectorAll('#face-asks [data-sheet-add]')];
  eq(adds.length, 8, 'eight sets on the third face');
  for (const b of adds) {
    const set = document.getElementById(b.dataset.sheetAdd);
    ok(set?.matches('form.asks[data-sheet] fieldset.ask-set'), `${b.dataset.sheetAdd} is a set of the page's one form`);
    eq(b.textContent, `Add this set to the sheet (${set.querySelectorAll('input[name="ask"]').length})`, `${b.dataset.sheetAdd}: its button counts its questions`);
  }
  key(window, qs[0], 'ArrowDown');
  ok(!document.getElementById('face-project').hidden && document.getElementById('face-load').hidden, 'Down chooses the next face');
  eq(errors.join(), '', 'no script errors');
}

async function deepLinks() {
  for (const [hash, tab, opens] of [
    ['purpose', 'overview', true], ['why-now', 'overview', false], ['environmental-impacts', 'tradeoffs', false],
    ['policy-landscape', 'policy-landscape', false], ['alternatives', 'policy-landscape', true], ['questions', 'questions', false], ['policy-watch', 'policy-landscape', false],
    ['dc-state-scale', 'growth', false], ['dc-lbnl-us', 'growth', false], ['dc-forecast-check', 'growth', false], ['forecast-revisions', 'growth', false], ['dc-water-intensity', 'tradeoffs', false], ['q-water', 'questions', false], ['policy-tribal', 'policy-landscape', true],
    ['dc-project', 'face-project', false], ['jobs-how-long', 'jobs', false], ['dc-atlas', 'where', false], ['land', 'where', false], ['climate', 'where', false], ['rec-or-dc-01', 'where', true],
    ['perception', 'perception', false], ['dc-ballots', 'perception', false], ['analysts', 'perception', true],
  ]) {
    const { document, errors } = await load(`#${hash}`);
    const target = document.getElementById(hash);
    ok(target, `${hash} exists`);
    ok(!document.getElementById(tab).hidden, `#${hash} opens ${tab}`);
    if (opens) ok(target.closest('details').open, `#${hash} opens its details`);
    eq(errors.join(), '', `#${hash} no errors`);
  }
  const { window, document } = await load();
  window.location.hash = '#purpose';
  await wait(20);
  ok(document.getElementById('purpose').closest('details').open, 'a later hash opens details too');
  const checklists = await load('#checklists');
  ok(!checklists.document.getElementById('questions').hidden, '#checklists opens Questions');
  ok(checklists.document.getElementById('q-consent').closest('form.asks[data-sheet]#checklists'), 'where every set is one fieldset of the page form');
  eq(checklists.errors.join(), '', '#checklists no errors');
  // The brief carries no figure (data-centers-22); its Sources link leads the page's receipts, and an old link to a receipt here goes on to the same id there.
  eq([...document.querySelectorAll('.brief .figure-num')].map((n) => n.textContent).join(), '11/04/2026', 'the brief holds only the date its sources were checked');
  eq(document.querySelector('.brief a[data-sources]').getAttribute('href'), 'sources/', 'the brief links the Sources page');
  ok(document.querySelector('.brief-meta a[href$="atni-res-2026-034-tiered-sovereign-data-framework.pdf"]') && document.querySelector('.brief-meta a[href="resource-use/"]'), 'the resolution and the companion page sit in its meta line (data-centers-32)');
  for (const id of ['dem-058', 'dem-073']) {
    ok(receipt(`dc-pnw-load-source-${id}`), `${id}: its receipt is on the Sources page`);
    eq(window.plate.movedTo(`dc-pnw-load-source-${id}`), `http://localhost/site/data-centers/sources/#dc-pnw-load-source-${id}`, `${id}: an old link goes on there`);
  }
  // Settings after the anchor (#id&name=value) name no element, so the browser lands nowhere: the kit opens the anchor's tab and lands on it as the browser
  // would on a plain #id, in view and with focus there (a11y A1), and a disclosure it names still opens (A2). The old ?query form lands the same way.
  for (const [hash, tab, opens] of [['land', 'where', false], ['climate', 'where', false], ['dc-pnw-load', 'face-load', false], ['purpose', 'overview', true], ['?dc-pnw-load=2046#dc-pnw-load', 'face-load', false]]) {
    const deep = await load(hash.startsWith('?') ? hash : `#${hash}&dc-pnw-load=2046`);
    const id = hash.split('#').pop();
    const target = deep.document.getElementById(id);
    ok(!deep.document.getElementById(tab).hidden && deep.window.scrolled === id && deep.document.activeElement === target, `${hash} with settings opens ${tab}, scrolls to ${id}, and starts focus there`);
    eq(deep.window.location.hash, `#${id}&dc-pnw-load=2046`, `${hash}: the anchor first, then the settings`);
    eq(deep.window.plate.read('dc-pnw-load').selected, '2046', `${hash}: with its setting`);
    if (opens) ok(target.closest('details').open, `${hash} with settings opens its details`);
    eq(deep.errors.join(), '', `${hash} with settings: no errors`);
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
  ok(p.chips().some((c) => c.dataset.claim === 'dem-076') && receipt('dc-pnw-load-source-dem-076'), 'with its receipt');
  eq(`${p.value.textContent} ${p.unit.textContent}`, '2,475.1 (1,512.8 to 4,988.7) aMW', 'readout');
  ok(document.querySelector('.brief-lead').textContent.includes('ATNI takes no position for or against data centers.'), 'the brief says ATNI decides nothing');
  ok(p.root.closest('#face-load'), 'the plate is the agenda\'s first face');
  ok(p.plot.querySelector('.m-needle'), 'a needle');
  // The whole region today is a rule across the same axis, so the input reads against it (data-centers-19).
  const ref = p.plot.querySelector('.dc-ref');
  eq(ref.querySelector('text').textContent, "The region's load today: 22,000 aMW", 'the region is drawn and named');
  ok(+ref.querySelector('line').getAttribute('y1') < +row(p.root, '2030').querySelector('.m-dot').getAttribute('y'), 'above the input, on the same axis');
  eq(plateFile('dc-pnw-load').plot.domain.join(), '0,25000', 'an axis that holds the region');
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
  eq(document.querySelector('[data-answer="dc-pnw-load"]').textContent, "The Council's input for data centers and chip fabs is 2,958.4 aMW in 2046, about 13 percent of the region's 22,000 aMW today.", 'and the agenda answer with it');
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
  eq(p.root.querySelectorAll('.plate-controls').length, 0, 'Lines only: no setting, so its title stays the finding');
  eq(errors.join(), '', 'no script errors');
}

async function growth() {
  const { window, document, errors } = await load('#growth');
  // The study's sites against whole states (11/17/2026): it leads the tab, and a claim row prints its figure as the claim states it.
  const s = parts(document, 'dc-state-scale');
  ok(leads(s.reading.textContent, ['81.8', '67.7 to 98.7', 'TWh']), `state comparison default: ${s.reading.textContent}`);
  ok(document.querySelector('#growth .plate').id === 'dc-state-scale', 'it leads the tab');
  key(window, s.plot, 'ArrowDown');
  ok(leads(s.reading.textContent, ['Washington', '90.115 TWh']), 'Down moves to the next row');
  ok(s.facts.textContent.includes('nine-tenths'), 'and its detail follows');
  const eia = parts(document, 'dc-eia-servers');
  eq(eia.plot.querySelectorAll('.m-line.is-on').length >= 1, true, 'a lead line');
  ok(eia.plot.querySelectorAll('.m-band').length === 1, 'a band');
  ok(leads(eia.reading.textContent, ['Counterfactual Baseline', '178.1 TWh', '2030', '176.8', '190.7']), 'default Reading');
  const eiaLabels = () => [...eia.plot.querySelectorAll('.m-label.is-lead')].map((n) => n.textContent);
  ok(eiaLabels().includes('2030: 178.1') && eiaLabels().some((t) => t.startsWith('2050: ')), `the selected case reads at 2030 and 2050: ${eiaLabels()}`);
  const eiaY = (name) => +[...eia.plot.querySelectorAll('.m-label')].find((n) => n.textContent.startsWith(name)).getAttribute('y');
  ok(eiaY('2050: ') <= eiaY('High Economic Growth') - 17, 'the 2050 figure sits clear above the names at the ends of the lines');
  ok(eia.plot.querySelector('[data-row="2030"] .m-dot.is-lead').classList.contains('is-solo'), 'with its mark');
  moves(window, eia, () => setRadio(window, eia.radio('eia_case', 'High Electricity Demand')), (t) => leads(t, ['High Electricity Demand', '190.7 TWh']), 'the case control');
  ok(eiaLabels().includes('2030: 190.7') && eiaLabels().includes('2050: 818.7'), `the labels follow the case: ${eiaLabels()}`);
  moves(window, eia, () => setRadio(window, eia.radio('eia_case', 'High Economic Growth')), (t) => leads(t, ['High Economic Growth', '178.9']), 'the case control');
  moves(window, eia, () => setRadio(window, eia.radio('eia_case', 'Low Economic Growth')), (t) => leads(t, ['Low Economic Growth', '176.8']), 'the case control');
  setRadio(window, eia.radio('eia_case', 'High Electricity Demand'));
  key(window, eia.plot, 'End');
  ok(leads(eia.reading.textContent, ['High Electricity Demand', '818.7 TWh', '2050']), 'the needle reaches 2050');
  eq(eia.facts.querySelectorAll('.plate-values li').length, 4, 'every case listed');
  eq([...eia.facts.querySelectorAll('.plate-values li > span:first-child')].map((n) => n.className).join(), 'plate-square is-hollow,plate-square is-hollow is-on,plate-square is-hollow,plate-square is-hollow', 'each with a square, no dash: hollow when modeled, orange only for the selected case');
  key(window, eia.plot, 'Home');
  ok([...eia.facts.querySelectorAll('.plate-values li > span:first-child')].every((n) => n.classList.contains('plate-square') && !n.classList.contains('is-hollow')), 'and filled at 2025, which is not modeled');
  ok(eia.reading.textContent.includes('All four cases share this figure for 2025.') && !/span 104.8 to 104.8/.test(eia.reading.textContent), `a year the cases share says so (data-centers-10): ${eia.reading.textContent}`);
  eq(eia.root.querySelector('.plate-title').textContent, "EIA's High Electricity Demand case puts data center servers at 104.8 TWh in 2025", 'the title follows the case (data-centers-07)');
  ok([...document.querySelectorAll('#growth .plate-strip > .plate')].map((n) => n.id).join() === 'dc-eia-servers,dc-lbnl-us,dc-iea-world', 'the three outlooks stand in one strip');
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
  eq(p.root.querySelector('.plate-evidence-line').textContent, '2 verified', 'two receipts, both verified');
  ok(p.root.querySelector('.plate-collar .plate-source-line').textContent.startsWith('44 sourced figures'), 'of the count the collar carries');
  eq(p.chips().map((c) => c.dataset.claim).join(), 'dem-119,dem-113', 'the projection and the realized value');
  ok(p.receipt.hidden, 'no card before a press');
  fire(window, p.chips()[0].chip, 'click');
  ok(!p.receipt.hidden && p.receipt.querySelector('a').href.startsWith('https://'), 'a chip opens its card in the window');

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
  ok(/partly verified/.test(p.root.querySelector('.plate-evidence-line').textContent), 'the evidence line says partly');
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
  eq(settings(window), 'fc_target=2019&dc-forecast-check=l-2024', 'a link carries the year and the row');
  fire(window, p.root.querySelector('[data-reset]'), 'click');
  ok(holds(p.reading.textContent, ['AEO2013', '4,075.26 TWh']), 'Reset');
  eq(row(p.root, 't-10').querySelector('.ladder-label .ladder-tag').textContent, 'AEO2013', 'and the editions come back');
  const deep = await load('?fc_target=2019&dc-forecast-check=c-2#growth');
  ok(holds(deep.document.querySelector('#dc-forecast-check .reading').textContent, ['AEO2017', '1,354.56 TWh', '+6.32 TWh', '0.46 percent']), 'a link opens that year and row');
  eq(deep.errors.join(), '', 'no script errors from a link');

  // Sources and Table.
  ok(p.root.querySelector('.plate-collar .plate-source-line').textContent.startsWith('44 sourced figures from'), 'the collar counts every receipt');
  const sources = (claim) => receipt(`dc-forecast-check-source-${claim}`);
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
  ok(lines.some((l) => l[1] === '2024 Report' && l.slice(4, 8).join('|') === '73 TWh|105 TWh|+32 TWh|30.5 percent' && /partly verified/.test(l[8]) && l[9].replace(/ (partly verified|verified)(?=,|$)/g, '') === 'dem-039, dem-103, dem-108, dem-109' && /partly verified/.test(l[9])), 'table: the data center pair, partly verified, all four claims, each with its status');
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
  ok(!document.querySelector('.slot-label') && !m.root.querySelector('img'), 'no photograph, and no note of one to come');
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
  ok(m.receipt.hidden && m.chips().length === 1, 'one figure names its receipt, and its card waits for a press');

  const c = parts(document, 'dc-cooling');
  const site = () => row(c.root, 'site').querySelector('.ladder-value').textContent;
  ok(leads(c.reading.textContent, ['100 MW', '1.45', '0.8', '1 TWh', '190 million liters', 'Microsoft', '4,600 million liters']), 'cooling default');
  eq(`${c.value.textContent} ${c.unit.textContent}`, '190 million liters', 'the readout opens on the water the title names (data-centers-16)');
  moves(window, c, () => setValue(window, c.slider('c_mw'), 200), (t) => leads(t, ['200 MW', '1.45', '0.8', '2 TWh']), 'MW');
  ok(c.root.querySelector('.plate-title').textContent.startsWith('At 200 MW and PUE 1.45, each year: water on site, 380 million liters; '), `the title follows the settings: ${c.root.querySelector('.plate-title').textContent}`);
  eq(`${c.value.textContent} ${c.unit.textContent}`, '380 million liters', 'a size moves the water on site, the row the plate opens on');
  moves(window, c, () => setValue(window, c.slider('c_lf'), 1), (t) => leads(t, ['200 MW', '1.45', '1', '2.5 TWh']), 'load factor');
  moves(window, c, () => setValue(window, c.typed('c_pue'), 1.145), (t) => holds(t, ['1.145', '1', '2 TWh']), 'PUE typed');
  moves(window, c, () => fire(window, c.root.querySelector('[data-preset="1.45"]'), 'click'), (t) => holds(t, ['1.45']), 'PUE preset');
  moves(window, c, () => setRadio(window, c.radio('c_cool', 'lbnl')), (t) => holds(t, ['630 million liters', 'LBNL']), 'cooling at LBNL');
  eq(`${c.value.textContent} ${c.unit.textContent}`, '630 million liters', 'the readout follows the water a cooling design moves (data-centers-08)');
  moves(window, c, () => setRadio(window, c.radio('c_cool', 'google')), (t) => holds(t, ['2,000 million liters', 'Google']), 'cooling at Google');
  moves(window, c, () => setRadio(window, c.radio('c_cool', 'dry')), (t) => /on-site water none \(Closed loop or dry\)/.test(t), 'dry');
  const dryTitle = c.root.querySelector('.plate-title').textContent;
  ok(/water on site, none; at the power plants, about [\d,]+ million liters; CO2, [\d.]+ Mt$/.test(dryTitle), `the dry title has no empty field: ${dryTitle}`);
  eq(`${c.value.textContent} ${c.unit.textContent}`, 'None on site', 'and the readout says so in words');
  ok(row(c.root, 'site').classList.contains('dc-words'), 'words drop to body size');
  ok(wordsOnly(site()), 'the row says so');
  moves(window, c, () => setRadio(window, c.radio('c_grid', 'hyperscale')), (t) => holds(t, ['0.8 Mt']), 'hyperscale grid');
  ok(c.value.textContent === '0.8' && c.unit.textContent.startsWith('Mt'), 'and the CO2 a grid moves');
  moves(window, c, () => setRadio(window, c.radio('c_grid', 'lbnl')), (t) => holds(t, ['0.86 Mt', 'LBNL']), 'LBNL grid');
  // The reader's own grid opens at 350 g, the step nearest the national 348 (tr-066): 2.5404 TWh x 350 / 1000 = 0.889 Mt (dc-1).
  moves(window, c, () => setRadio(window, c.radio('c_grid', 'own')), (t) => holds(t, ['0.89 Mt']), "reader's grid");
  fire(window, row(c.root, 'energy').querySelector('.ladder-label'), 'click');
  eq(`${c.value.textContent} ${c.unit.textContent}`, row(c.root, 'energy').querySelector('.ladder-value').textContent, 'a row picked after a setting takes the readout from the CO2 the grid moved (CR-06)');
  moves(window, c, () => setValue(window, c.slider('c_own'), 100), (t) => holds(t, ['0.25 Mt']), "reader's number");
  setRadio(window, c.radio('c_cool', 'ms'));
  const plantSquares = () => row(c.root, 'plant').querySelector('.dc-sq path').getAttribute('d').match(/M/g).length;
  ok(plantSquares() > 0, 'plant row has squares');
  fire(window, c.root.querySelector('[data-reset]'), 'click');
  ok(leads(c.reading.textContent, ['100 MW', '1.45']), 'Reset');
  eq(`${c.value.textContent} ${c.unit.textContent}`, '190 million liters', 'and the readout is the water on site again');
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
  const how = document.getElementById('jobs-how-long').closest('.dc-after');
  ok(!how.closest('details') && how.querySelector('p').textContent.startsWith('A data center brings many jobs while it is built and few once it runs.'), 'its one short section reads as prose, its finding first (data-centers-21)');
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
  const record = p.root.querySelector('.plate-detail > details.dc-record');
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
  const chipShown = [...p.root.querySelectorAll('.plate-evidence .receipt')];
  ok(chipShown.length === 1 && chipShown[0].textContent.endsWith(', 5'), `one chip for one publisher, its count after a comma: ${chipShown.map((c) => c.textContent)}`);
  fire(window, chipShown[0], 'click');
  ok(p.root.dataset.view === 'chart' && p.receipt.querySelectorAll('.plate-receipt-item').length === 4 && /1 more from this publisher/.test(p.receipt.textContent), 'its card lists four claims in the window, and the way to the rest');
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
  fire(window, p.chips().find((c) => c.dataset.claim === 'jb-023').chip, 'click');
  ok(!p.receipt.hidden && p.receipt.textContent.includes('Limit:'), 'a partly receipt states its limit, in its card');
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
  const watch = document.getElementById('policy-watch');
  ok(watch.compareDocumentPosition(document.getElementById('policy-grid')) & 4, 'Policy Watch leads the tab (data-centers-34)');
  ok(html.includes('<!-- policy:watch -->') && html.includes('<!-- /policy:watch -->'), 'its list sits in the region build_energy_pages.py writes');
  ok(!/Import followed list/.test(document.getElementById('policy-landscape').textContent) && /Import followed list/.test(receipt('policy-sentinel') || ''), 'its import steps are on the Sources page');
  eq(document.querySelectorAll('#policy-landscape .dc-details > details').length, 4, 'Tribal, State, Federal, Alternatives');
  ok(document.querySelector('.dc-policy-side .dc-grid-wrap + .dc-policy-key'), 'the key sits under the grid');
  eq(errors.join(), '', 'no script errors');
}

async function project() {
  // Count first: the region today, the Council's 2030 input, and the project, a hundred aMW a square in rows of 25, the project's in orange.
  const first = await load('#face-project');
  const f = parts(first.document, 'dc-project');
  const count = () => f.plot.querySelector('.dc-count');
  const n = (cls) => (count().querySelector(cls).getAttribute('d').match(/M/g) || []).length;
  ok(!first.document.getElementById('face-project').hidden && f.plot.classList.contains('dc-is-count'), 'the face opens on Count');
  // Count draws squares over rows that stay in the accessibility tree, so the listbox's selected option is heard (axe plot-selection-heard).
  ok(f.plot.getAttribute('aria-activedescendant') === 'dc-project-row-amw' && !/\.dc-is-count > \.instrument \{ display: none/.test(read('site/assets/css/dc.css')), 'Count hides its rows from the eye only');
  eq([n('.dc-ctx'), n('.m-count.is-hollow'), n('.dc-lit')].join(), '220,25,1', 'the region, the Council input, and the project');
  eq([...count().querySelectorAll('.dc-count-label')].map((l) => l.textContent).join('|'), "The region's load today: 22,000 aMW|The Council's 2030 input, data centers and chip fabs: 2,475.1 aMW|This project: 100 aMW", 'each field named with its figure');
  ok(['dem-058', 'dem-073'].every((id) => first.document.querySelector(`#dc-project .plate-table a[data-claim="${id}"]`)), 'and each figure has its claim in the Table');
  setValue(first.window, f.slider('p_mw'), 1000);
  eq(n('.dc-lit'), 8, 'eight orange squares at 1,000 MW');
  eq(f.root.querySelector('.plate-title').textContent, "A 1,000 MW project at a 0.8 load factor would average 800 aMW, 3.6 percent of the region's load today", 'the title follows the settings (data-centers-07)');
  eq(first.document.querySelector('[data-answer="dc-project"]').textContent, "A 1,000 MW project at a 0.8 load factor averages 800 aMW, about 3.6 percent of the region's load today.", 'and the agenda answer');
  fire(first.window, f.root.querySelector('[data-preset="0.95"]'), 'click');
  ok(leads(f.reading.textContent, ['1,000 MW', '0.95', '950 aMW']), 'a load factor preset');
  ok(!/water|liters/i.test(f.reading.textContent), `Count reads the load and its share alone: ${f.reading.textContent}`);
  ok(!f.root.querySelector('.plate-claim > .plate-controls > [data-param="p_view"]') && f.root.querySelector('.plate-claim details.plate-more [data-param="p_view"]'), 'the face counts; Rulers waits with the water inputs');
  eq(n('.dc-lit'), 10, 'ten squares, the last a sliver');
  ok(f.root.querySelector('details.plate-more [data-param="p_l"]') && f.root.querySelector('details.plate-more [data-param="p_plant"]'), 'the water inputs wait under More, for the Rulers view (data-centers-33)');
  eq(first.errors.join(), '', 'no script errors in Count');
  // Rulers: the instrument, under one needle.
  const { window, document, errors } = await load('#face-project&p_view=rulers');
  const p = parts(document, 'dc-project');
  ok(!p.plot.classList.contains('dc-is-count'), 'a link opens Rulers');
  const lit = () => (p.plot.querySelector('.dc-sq .dc-lit').getAttribute('d').match(/M/g) || []).length;
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
  eq(p.plot.querySelector('.dc-sq .dc-ctx').getAttribute('d').match(/M/g).length, 220, 'the region in squares');
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
  ok(p.plot.classList.contains('dc-is-count'), 'Reset goes back to Count, the starting view');
  fire(window, row(p.root, 'site').querySelector('.ladder-label'), 'click');
  ok(p.chips().some((c) => c.dataset.claim === 'fp-006') && p.chips().some((c) => c.dataset.claim === 'tr-028'), 'site water cites both ends');
  // The questions: one form, each question once with a checkbox (DIRECTION-R2 3.12), the provenance said once above them.
  const form = document.getElementById('checklists');
  ok(form.matches('form.asks[data-sheet]') && form.previousElementSibling.matches('p.dc-wide-note'), 'one form, its provenance first');
  eq(form.querySelectorAll('fieldset.ask-set').length, 8, 'eight sets');
  eq(form.querySelectorAll('input[type="checkbox"][name="ask"]').length, 24, 'every question once');
  eq(document.querySelectorAll('input[name="ask"]').length, 24, 'and nowhere else');
  ok([...form.querySelectorAll('input[name="ask"]')].every((b) => b.value === `${b.closest('fieldset').id}-${[...b.closest('ol').children].indexOf(b.closest('li')) + 1}`), 'each named by its set and place');
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
  // The Table, and so the CSV, follow the measure (CD 12): each line's figure and its one claim are the measure's.
  const line = c.root.querySelector('.plate-table tbody tr[data-key="walla-walla-wa"][data-when="ssp370"]');
  ok(line.children[3].textContent.startsWith(`${ww.days_95.ssp370[1]} (`) && line.children[3].textContent.endsWith('days a year'), `the Table line follows the measure: ${line.children[3].textContent}`);
  eq([...line.querySelectorAll('a[data-claim]')].map((a) => a.dataset.claim).join(), ww.days_95.ssp370[0], 'with that figure\'s claim alone');
  ok(c.root.querySelector('.plate-title').textContent.startsWith('Walla Walla County, WA, Days at or above 95 F: '), `the title follows the measure: ${c.root.querySelector('.plate-title').textContent}`);
  setRadio(window, c.radio('cc_state', 'mt'));
  ok(shown().length && shown().every((k) => k.endsWith('-mt')), 'a state shows its counties only');
  await wait(40);
  ok(c.reading.textContent.includes(', MT,'), `a county shown takes the selection: ${c.reading.textContent.slice(0, 60)}`);
  // Where proposals sit: the larger finding leads (data-centers-31), and the title follows the kind.
  const land = parts(document, 'dc-project-land');
  eq(land.root.querySelector('.plate-title').textContent, 'The filings read state no land for 41 of the 83 named proposals', 'the land title');
  setRadio(window, land.radio('kind', 'dc'));
  ok(/^Not stated by the sources read: [0-9]+ of the named proposals read, Data centers$/.test(land.root.querySelector('.plate-title').textContent), `the title follows the kind: ${land.root.querySelector('.plate-title').textContent}`);
  eq([...errors].join(), '', 'no script errors');
}

// The atlas (data-centers-11, -12, -36): the relief, one square per named proposal at its county's point, the county picker as the accessible route, and the card.
async function atlas() {
  const { window, document, errors } = await load('#where');
  const fig = document.getElementById('dc-atlas');
  ok(fig.closest('#where') && fig.dataset.variant === 'atlas', 'the atlas leads the Where tab');
  ok(!fig.querySelector('path, polygon, polyline, line, image'), 'physical names and squares only: no line of any boundary is drawn, and the relief is the CSS ground');
  ok(/--vw:\d+;--vh:\d+;--cx:\d+;--cy:\d+;--sw:2520;--sh:1920/.test(fig.querySelector('.dc-sheet').getAttribute('style')), 'the view is written by the build, so the field draws without scripts');
  ok(/nw-dark-1600\.webp/.test(read('site/assets/css/dc.css')) && /nw-light-1600\.webp/.test(read('site/assets/css/dc.css')), 'a relief for each theme');
  eq([...fig.querySelectorAll('.dc-names text')].map((t) => t.textContent).join('|'), 'Pacific Ocean|Columbia River|Snake River|Willamette River|Cascade Range|Columbia Plateau|Blue Mountains|Snake River Plain|Northern Rockies|Seattle|Portland|Spokane|Boise|Missoula', 'standard English names of land, water, and five cities');
  ok(fig.querySelector('.dc-sheet-svg').getAttribute('aria-hidden') === 'true', 'the map is a picture; the picker and the records are its words');
  const pick = fig.querySelector('[data-atlas-county]');
  const counts = Object.fromEntries([...pick.options].map((o) => [o.value, +o.textContent.match(/\((\d+)\)$/)[1]]));
  for (const g of fig.querySelectorAll('.dc-cty')) eq(g.querySelectorAll('.dc-m').length, counts[g.dataset.fips], `${g.dataset.fips}: a square for each of its records`);
  const records = [...document.querySelectorAll('#land-records li[data-fips]')];
  for (const [fips, n] of Object.entries(counts)) eq(records.filter((li) => li.dataset.fips.split(' ').includes(fips)).length, n, `${fips}: the picker counts the records`);
  eq(pick.value, '41049', 'the county with the most records opens');
  const card = fig.querySelector('[data-atlas-card]');
  eq(card.querySelector('h4').textContent, 'Morrow County, OR', 'its card');
  eq(card.querySelectorAll('.dc-card-records > li').length, 2, 'two records first');
  ok(card.querySelectorAll('.dc-card-records a.cr[data-claim^="pj-"][data-status]').length >= 1, 'each MW figure is its record\'s claim mark');
  ok(fig.querySelector('.dc-cty[data-fips="41049"]').classList.contains('is-on'), 'the county lights on the map');
  fire(window, [...card.querySelectorAll('button')].find((b) => b.textContent === 'Show the other 9'), 'click');
  eq(card.querySelectorAll('.dc-card-records > li').length, 11, 'and the rest on a press');
  const clim = card.querySelector('.dc-card-climate');
  ok(clim && clim.querySelector('a[href="#climate&dc-climate-counties=morrow-or"]') && clim.querySelectorAll('a[data-claim^="cp-"]').length === 2, 'the climate row, its two claims, and a way to compare');
  pick.value = '53071';
  fire(window, pick, 'change');
  eq(card.querySelector('h4').textContent, 'Walla Walla County, WA', 'the picker chooses a county');
  ok(fig.querySelector('.dc-cty[data-fips="53071"]').classList.contains('is-on') && !fig.querySelector('.dc-cty[data-fips="41049"]').classList.contains('is-on'), 'and lights it alone');
  fire(window, fig.querySelector('.dc-cty[data-fips="41049"] .dc-m'), 'click');
  eq(pick.value, '41049', 'a square on the map chooses its county too');
  ok(window.location.hash.startsWith('#where') && window.location.hash.includes('atlas=41049'), `the county rides in the address: ${window.location.hash}`);
  ok(!/\(EFSEC(?!, EFSC, PUC\))/.test(card.textContent) && !document.querySelector('#land-records li[data-land^="bureau"]'), 'a land phrase keeps its parenthesis and a name its capital');
  const linked = await load('#where&atlas=53071');
  eq(linked.document.querySelector('[data-atlas-card] h4').textContent, 'Walla Walla County, WA', 'and a link with it opens that card');
  eq(linked.errors.join(), '', 'no script errors from a linked county');
  const dc = fig.querySelector('[data-atlas-kind] input[value="tx"]');
  setRadio(window, dc);
  ok([...fig.querySelectorAll('.dc-m')].every((m) => m.classList.contains('is-dim') === (m.dataset.kind !== 'tx')), 'a kind dims the others');
  ok(/^\d+ of the 11 named proposals here (is|are) this kind\.$/.test(card.querySelector('.caption').textContent), `and the card says how many: ${card.querySelector('.caption').textContent}`);
  ok(fig.querySelector('.dc-off').textContent.startsWith('Off this sheet to the south: 7 in Nevada and northern California. Off this sheet to the east: 2 in eastern Montana.'), 'what lies off the sheet, in proposals, as words');
  ok(holds(fig.querySelector('.plate-claim').textContent, ['83', 'A count of a curated public list on its date']), 'the title is the count, with its limit');
  ok(fig.querySelector('.plate-title a.cr[data-claim="ld-001"]') && receipt('src-ld-001'), 'and its claim');
  // The title counts what the map places and what it cannot (r2-scripts-1): every one of its figures a claim mark, and the two parts add to the whole.
  const heads = [...fig.querySelectorAll('.plate-title a.cr')].map((a) => +a.textContent);
  const placed = records.filter((li) => li.dataset.fips.trim()).length;
  ok(heads.length === 3 && heads[1] === placed && heads[0] === heads[1] + heads[2] && heads[0] === document.querySelectorAll('#land-records li[data-fips]').length, `the title: ${fig.querySelector('.plate-title').textContent}`);
  ok(holds(fig.querySelector('.plate-collar').textContent, ['NOAA National Centers for Environmental Information, ETOPO 2022', 'Natural Earth', 'U.S. Census Bureau']) && /NOAA[\s\S]*Natural Earth/.test(receipt('dc-atlas') || ''), 'its data credited in the collar and on the Sources page');
  // Every record, by state: a count in each summary (data-centers-12), and its MW figures marked.
  for (const d of document.querySelectorAll('#land-records details')) ok(/^\d+ named proposals?; (\d+|none) states? a size in MW as filed\.$/.test(d.querySelector('summary span').textContent), `${d.id}: ${d.querySelector('summary span').textContent}`);
  ok(document.querySelector('#land-records .cr[data-claim^="pj-"]'), 'the record list marks its MW figures');
  eq(errors.join(), '', 'no script errors');
}

async function noScripts() {
  const { window: { document } } = new JSDOM(html);
  eq(document.querySelectorAll('section.panel').length, 8, 'all panels in the page');
  ok(!document.querySelector('[role="tablist"]') && document.querySelector('.section-strip a[href="#jobs"]'), 'strip is a jump list');
  ok(['face-load', 'face-project', 'face-asks'].every((id) => document.querySelector(`.agenda-q a[href="#${id}"]`) && !document.getElementById(id).hidden), 'the agenda questions are links, and every face stands whole');
  ok(document.querySelectorAll('.dc-cty').length > 30 && document.querySelector('.dc-sheet').getAttribute('style').includes('--vw:'), 'the atlas draws without scripts');
  eq(document.querySelectorAll('#land-records li[data-fips]').length, 83, 'and every record is listed');
  for (const root of document.querySelectorAll('[data-plate]')) {
    ok(root.querySelector('.reading').textContent.length > 20, `${root.id} default Reading`);
    ok(root.querySelector('table tbody tr'), `${root.id} table`);
    ok(root.querySelector('.plate-plot').firstElementChild, `${root.id} static plot`);
    ok(root.querySelector(`.plate-sources-link a[href="sources/#${root.id}"]`) && !root.querySelector('ol.plate-sources'), `${root.id} links its sources, and keeps no list`);
  }
  ok(holds(document.querySelector('#dc-project .plate-setting').textContent, ['125']), 'the setting named');
  ok(document.querySelector('#dc-jobs-per-mw .plate-plot [data-row="naics"]'), 'without scripts the fixed record stays in the plot');
  ok(document.querySelector('.brief-meta a[href="resource-use/"]') && !document.querySelector('header .subnav'), 'the other page of the family is a link in the brief');
  eq(document.querySelector('.brief-meta a[href="resource-use/"]').textContent, 'Energy and Water Use', 'by the name the footer gives it');
  eq(document.querySelector('.brief-meta a[href="primer/"]').textContent, 'Kinds of Data Centers', 'the primer sits in the meta line');
  eq(document.querySelector('#perception #dc-ballots [data-row="oh"]')?.textContent.includes('21'), true, 'the ballots plate draws without scripts');
  eq(document.querySelector('#dc-nearby [data-row="or"]').textContent.includes('over 70'), true, 'the Oregon floor keeps its word');
  eq(document.querySelector('#dc-pnw-load .m-needle').getAttribute('x1'), `${+document.querySelector('#dc-pnw-load .m-grid').getAttribute('x1') + 24}.0`, 'the static needle stands 24px in from the ticks too');
  ok(!/>2029</.test(document.querySelector('#dc-pnw-load .plate-plot').innerHTML), 'and the static axis starts at 2030');
  eq([...document.querySelectorAll('#dc-tradeoff-matrix td[data-row="water--national"] .matrix-bar')].map((n) => n.style.getPropertyValue('--x')).join(), '0.076,0.9217,1.0', 'three water figures, scaled within the cell');
  eq(document.querySelectorAll('#dc-tradeoff-matrix td[data-row="power--national"] .matrix-bar').length, 0, 'a lone figure has nothing to compare');
  eq(document.querySelectorAll('#dc-tradeoff-matrix td[data-row="emissions--national"] .matrix-bar').length, 0, 'nor figures in different units');
  eq(document.querySelector('[data-pour="dem-067"][data-field="text"]').textContent, '29', 'a poured figure');
  eq(document.querySelector('[data-answer="dc-pnw-load"]').textContent.includes('2,475.1 aMW in 2030'), true, 'the built answer carries the starting figure');
  ok(!document.querySelector('.key-facts, .page-hero, .dc-fact, .page-band'), 'with no raised box and no band of figures');
  for (const id of ['purpose', 'why-now', 'environmental-impacts', 'policy-landscape', 'alternatives', 'questions', 'policy-watch', 'land', 'climate', 'dc-atlas', 'land-records', 'checklists']) ok(document.getElementById(id), `${id} survives`);
  const slots = html.match(/<!-- SLOT:data-centers:[a-z-]+ -->/g);
  eq(slots.length, 8, 'eight slots');
  eq(html.match(/<!-- \/SLOT -->/g).length, 8, 'all closed');
}

// Public Perception (r3, 11/17/2026): ballots, polls on a data center nearby, views of AI, and trackers, each on its own question; no Tribe's position here.
async function perception() {
  const { window, document, errors } = await load('#perception');
  const panel = document.getElementById('perception');
  ok(!panel.hidden, '#perception opens its tab');
  eq([...panel.querySelectorAll('[data-plate]')].map((n) => n.id).join(), 'dc-ballots,dc-nearby,dc-ai-views,dc-trackers', 'the four plates, in order');
  ok(panel.querySelector('a[href="#policy-tribal"]') && panel.querySelector('a[href="../ai/markets/"]'), 'it points to the Tribal section and the Markets page');
  eq(panel.querySelectorAll('.cr[data-claim^="pdc-02"], .cr[data-claim^="pdc-03"]').length, 0, 'and cites no Tribal position itself');
  ok(panel.textContent.includes('ATNI takes no position'), 'ATNI takes no position');
  ok(!/<h3 id="alternatives">[^<]*<\/h2>/.test(html), 'the alternatives heading closes as it opens');
  const b = parts(document, 'dc-ballots');
  // holds, not leads: each label names a date or a quarter before its figure.
  ok(holds(b.reading.textContent, ['Ohio', '21', 'decided toward limits']), `ballots default: ${b.reading.textContent}`);
  ok(holds(b.root.querySelector('.plate-title').textContent, ['53', '52']), 'its title, from the claims');
  key(window, b.plot, 'End');
  ok(holds(b.reading.textContent, ['Nevada', '2026: 1.']) && !/\b1 measures\b/.test(b.root.textContent), `a single measure never reads as measures: ${b.reading.textContent}`);
  ok(b.facts.textContent.includes('29.3 percent yes'), 'and its vote share follows the row');
  const n = parts(document, 'dc-nearby');
  ok(holds(n.reading.textContent, ['ABC News/Washington Post/Ipsos', '72 percent opposed']), `nearby default: ${n.reading.textContent}`);
  ok(n.facts.textContent.includes('66 percent opposed'), 'the other half sample beside it');
  key(window, n.plot, 'End');
  ok(holds(n.reading.textContent, ['likely Oregon voters', 'over 70 percent']), `the Oregon floor reads over: ${n.reading.textContent}`);
  eq(n.plot.querySelectorAll('[role="group"]').length, 2, 'national and Northwest polls on two rulers');
  const v = parts(document, 'dc-ai-views');
  ok(holds(v.reading.textContent, ['for society', '57 percent negative', '42 percent positive']), `AI views default: ${v.reading.textContent}`);
  key(window, v.plot, 'End');
  ok(holds(v.reading.textContent, ['for them personally', '49 percent negative', '50 percent positive']), `the one even question: ${v.reading.textContent}`);
  const t = parts(document, 'dc-trackers');
  ok(holds(t.reading.textContent, ['Data Center Watch, Q1 2026', '130 billion dollars']), `trackers default: ${t.reading.textContent}`);
  ok(t.reading.textContent.includes('Limit:'), 'with its limit');
  key(window, t.plot, 'Home');
  ok(holds(t.reading.textContent, ['Heatmap Pro', 'at least 260 billion dollars']), `a floor reads at least, as its source says: ${t.reading.textContent}`);
  key(window, t.plot, 'End');
  ok(holds(t.reading.textContent, ['Q2 2026, project count', 'at least 45 projects']), `projects on their own ruler: ${t.reading.textContent}`);
  eq(errors.join(), '', 'no script errors');
}

async function untrusted() {
  const js = read('site/assets/js/data-centers.js');
  ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|fetch\(/.test(js), 'no markup strings or fetches');
  ok(!/ -- |\u2014/.test(js), 'house style');
  console.log(`module ${Buffer.byteLength(js)} bytes`);
}


module.exports = { groups: { tabs, deepLinks, council, growth, forecastCheck, forecastProvenance, tradeoffs, jobs, policy, perception, project, climateLand, atlas, noScripts, untrusted } };
