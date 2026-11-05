// The plate kit (site/assets/js/plate.js and plate-svg.js) on the demonstration page. The demonstration is a frozen local fixture, so its own
// sentences and figures are test data and stay exact; only words the kit itself prints were loosened.
const { JSDOM, count, ok, eq, wait, read, fixture, open, fire, key } = require('./lib');
const assert = require('assert');

const PAGE = 'http://localhost/work/site-refresh/tmp/plate-demo/index.html';
const html = fixture('work/site-refresh/tmp/plate-demo/index.html', 'Rebuild it with work/site-refresh/tmp/kit_make_demo.py.');
const frame = () => wait(40);

async function load(query = '', { source = html, clipboard = true, wide = false } = {}) {
  return open(source, `${PAGE}${query}`, (window) => {
    window.size = { w: 900, h: 400 };
    if (wide) {
      window.innerWidth = 1440;
      window.innerHeight = 900;
      Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', { get() { return this.closest('[hidden]') ? null : window.document.body; } });
      window.Element.prototype.getBoundingClientRect = () => ({ top: 24 });
    }
    window.observers = [];
    window.ResizeObserver = class { constructor(cb) { window.observers.push(cb); } observe() {} };
    const visible = (el) => !el.closest('[hidden]');
    Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { get() { return visible(this) ? window.size.w : 0; } });
    Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { get() { return visible(this) ? Math.max(parseInt(this.style.minHeight, 10) || 0, window.size.h) : 0; } });
    window.document.elementFromPoint = () => window.under;
    window.Element.prototype.scrollIntoView = function () { window.scrolled = this.id; };
    if (clipboard) Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async (t) => { window.clip = t; } } });
  });
}

const row = (plate, k) => [...plate.querySelectorAll('[data-row]')].find((n) => n.dataset.row === k);
const parts = (document, id) => {
  const root = document.getElementById(id);
  return {
    root, plot: root.querySelector('.plate-plot'), reading: root.querySelector('.reading'), value: root.querySelector('.readout-value'), unit: root.querySelector('.readout-unit'),
    receipt: root.querySelector('.plate-receipt'), live: root.querySelector('output'), status: root.querySelector('.plate-status'), facts: root.querySelector('.plate-facts'),
    chips: () => [...root.querySelectorAll('.receipt')].filter((c) => !c.hidden),
    views: (name) => root.querySelector(`.plate-view[data-view="${name}"]`),
    radio: (name, value) => root.querySelector(`input[name="${name}"][value="${value}"]`),
  };
};

// A detail panel that still fits at the narrower width gives its room to the plot; one that would scroll keeps it.
async function shortDetail() {
  const { window, document, errors } = await load('', { wide: true });
  const root = document.querySelector('[data-plate]');
  const detail = root.querySelector('.plate-detail');
  const resize = (w) => { window.size = { w, h: 400 }; window.observers.forEach((cb) => cb()); };
  let need = 100;
  Object.defineProperty(detail, 'scrollHeight', { get: () => need });
  resize(800);
  await frame();
  await frame();
  ok(root.classList.contains('is-short'), 'it fits, so it narrows');
  need = 5000;
  resize(820);
  await frame();
  await frame();
  ok(!root.classList.contains('is-short'), 'it would scroll, so it keeps its width');
  need = 100;
  resize(800);
  window.innerWidth = 900;
  resize(780);
  await frame();
  await frame();
  eq(errors.join(), '', 'no script errors');
}

async function tabs() {
  const { window, document, errors } = await load();
  const list = document.querySelector('[role="tablist"]');
  const links = [...document.querySelectorAll('[role="tab"]')];
  const panels = [...document.querySelectorAll('[role="tabpanel"]')];
  ok(list && links.length === 14 && panels.length === 14, 'tab list and panels');
  eq(list.getAttribute('aria-label'), 'Demonstration sections', 'tab list named');
  eq(links[0].getAttribute('aria-selected'), 'true', 'first tab selected');
  eq(links[0].getAttribute('tabindex'), '0', 'roving tabindex on');
  eq(links[1].getAttribute('tabindex'), '-1', 'roving tabindex off');
  ok(!panels[0].hidden && panels[1].hidden, 'one panel visible');
  fire(window, links[1], 'click');
  ok(!panels[1].hidden && panels[0].hidden, 'click shows panel');
  eq(window.location.hash, '#electricity', 'hash written');
  key(window, links[1], 'ArrowRight');
  eq(links[2].getAttribute('aria-selected'), 'true', 'arrow right');
  eq(document.activeElement, links[2], 'focus follows');
  key(window, links[2], 'End');
  key(window, links[13], 'ArrowRight');
  eq(links[0].getAttribute('aria-selected'), 'true', 'wraps to first');
  key(window, links[0], 'ArrowLeft');
  eq(links[13].getAttribute('aria-selected'), 'true', 'wraps to last');
  key(window, links[13], 'Home');
  eq(links[0].getAttribute('aria-selected'), 'true', 'home');
  window.location.hash = '#spending';
  await wait(20);
  ok(!panels[2].hidden, 'hashchange follows');
  ok(document.getElementById('session-energy').classList.contains('is-live'), 'a live plate is marked');
  eq(errors.join(), '', 'no script errors');

  const deep = await load('#capital-history');
  ok(!deep.document.getElementById('history').hidden && deep.document.getElementById('sessions').hidden, 'hash inside a panel opens that panel');
  eq(deep.window.scrolled, 'capital-history', 'scrolls to a plate inside the panel');
  const panelLink = await load('#spending');
  ok(!panelLink.document.getElementById('spending').hidden, 'hash of a panel opens it');
}

async function ladder() {
  const { window, document, errors } = await load();
  const p = parts(document, 'session-energy');
  eq(p.plot.getAttribute('role'), 'listbox', 'plot role');
  eq(p.plot.getAttribute('tabindex'), '0', 'plot is one focus stop');
  eq(p.plot.getAttribute('aria-labelledby'), 'session-energy-title', 'plot named');
  eq(p.plot.getAttribute('aria-activedescendant'), row(p.root, 'chat').id, 'active row');
  eq(p.plot.querySelector('.ladder-rows').getAttribute('role'), 'none', 'list role removed');
  ok(!p.root.querySelector('.plate-controls').hidden && !p.root.querySelector('.plate-views').hidden && !p.root.querySelector('.plate-actions').hidden, 'script-only parts shown');
  ok(!p.views('reading').hidden && p.views('sources').hidden && p.views('table').hidden, 'only Reading shows');
  eq(`${p.value.textContent} ${p.unit.textContent}`, '0.24 Wh', 'default readout');
  ok(p.reading.textContent.includes('0.24 Wh inside the data center'), 'page script sentence');
  eq(p.chips().length, 1, 'one chip for the selection');
  ok(!p.receipt.hidden && p.receipt.querySelector('blockquote'), 'the first receipt is open on load, so the panel holds its source');
  ok(p.facts.textContent.includes('Assumption:'), 'assumption in the detail');
  const more = p.facts.querySelector('.plate-more');
  ok(more && !more.open && more.querySelector('summary').textContent.trim().length > 0, 'it waits behind a disclosure');
  more.open = true;
  fire(window, more, 'toggle');
  key(window, p.plot, 'ArrowDown');
  ok(p.facts.querySelector('.plate-more')?.open !== false, 'an open disclosure stays open across selections');
  key(window, p.plot, 'ArrowUp');
  p.facts.querySelector('.plate-more').open = false;
  fire(window, p.facts.querySelector('.plate-more'), 'toggle');

  // Arrows and receipts
  key(window, p.plot, 'ArrowDown');
  eq(row(p.root, 'video').getAttribute('aria-selected'), 'true', 'arrow selects');
  eq(row(p.root, 'chat').getAttribute('aria-selected'), 'false', 'old row cleared');
  ok(row(p.root, 'video').classList.contains('is-on'), 'row marked');
  eq(p.plot.getAttribute('aria-activedescendant'), row(p.root, 'video').id, 'active row moves');
  ok(window.location.search.includes('session-energy=video'), 'selection in the query');
  ok(p.reading.textContent.startsWith('Streamed video, one hour: 70 Wh, 2025.'), 'Reading follows');
  eq(p.plot.style.getPropertyValue('--at'), row(p.root, 'video').style.getPropertyValue('--x'), 'needle at the row');
  ok(!p.receipt.hidden && p.receipt.querySelector('blockquote').textContent.length > 0 && p.receipt.querySelector('a').href.startsWith('https://'), 'receipt opens with quote and link');
  ok(p.receipt.textContent.includes('Boundary:') && p.receipt.textContent.includes('Verified against the source.'), 'receipt has boundary and status');
  eq(p.receipt.querySelectorAll('[id]').length, 0, 'clone holds no duplicate id');
  const [chip] = p.chips();
  eq(chip.getAttribute('aria-expanded'), 'true', 'chip expanded');
  eq(chip.getAttribute('aria-controls'), p.receipt.id, 'chip names its panel');
  fire(window, chip, 'click');
  ok(p.receipt.hidden, 'second press closes');
  eq(chip.getAttribute('aria-expanded'), 'false', 'chip collapsed');
  fire(window, chip.querySelector('span'), 'click');
  ok(!p.receipt.hidden, 'press on the chip text opens');
  key(window, p.plot, 'Escape');
  ok(p.receipt.hidden, 'Escape closes the receipt first');
  eq(row(p.root, 'video').getAttribute('aria-selected'), 'true', 'selection stays');
  key(window, p.plot, 'Escape');
  eq(row(p.root, 'chat').getAttribute('aria-selected'), 'true', 'Escape restores the default');
  ok(p.receipt.hidden, 'restore leaves the receipt closed');
  ok(!window.location.search.includes('session-energy'), 'default leaves the query');
  key(window, p.plot, 'End');
  eq(row(p.root, 'no-figure').getAttribute('aria-selected'), 'true', 'End');
  eq(`${p.value.textContent}|${p.unit.textContent}`, '|No public measurement', 'gap readout');
  ok(p.plot.classList.contains('no-needle'), 'no needle on a gap');
  ok(row(p.root, 'no-figure').querySelector('.ladder-mark').hidden, 'no mark on a gap');
  ok(p.reading.textContent.startsWith('Claude, first-party figure: No public measurement'), 'gap Reading');
  key(window, p.plot, 'Home');
  eq(row(p.root, 'chat').getAttribute('aria-selected'), 'true', 'Home');
  key(window, p.plot, 'ArrowUp');
  eq(row(p.root, 'chat').getAttribute('aria-selected'), 'true', 'arrow stops at the top');

  // Click, views, Enter
  fire(window, p.radio('session-energy-view', 'table'), 'click');
  ok(p.views('table').querySelectorAll('tbody tr').length >= 5 && !p.views('table').hidden && p.views('reading').hidden, 'Table view');
  key(window, p.plot, 'ArrowDown');
  ok(p.views('reading').hidden, 'arrows leave the view alone');
  key(window, p.plot, 'Enter');
  ok(!p.views('reading').hidden, 'Enter brings the Reading forward');
  eq(p.radio('session-energy-view', 'reading').checked, true, 'view radio follows');
  fire(window, p.radio('session-energy-view', 'sources'), 'click');
  ok(!p.views('sources').hidden && p.views('sources').querySelectorAll('li').length === 5, 'Sources lists every receipt');
  fire(window, row(p.root, 'no-figure').querySelector('.ladder-label'), 'click');
  ok(!p.views('reading').hidden, 'click shows the Reading');
  eq(row(p.root, 'no-figure').getAttribute('aria-selected'), 'true', 'click selects');

  // Segmented radios and the by control
  key(window, p.plot, 'Escape');
  key(window, p.plot, 'Escape');
  const full = p.radio('boundary', 'full');
  full.checked = true;
  fire(window, full, 'input');
  fire(window, full, 'change');
  ok(window.location.search.includes('boundary=full'), 'setting in the query');
  eq(row(p.root, 'chat').querySelector('.ladder-value').textContent, 'Not counted at this boundary', 'row keeps its place');
  ok(row(p.root, 'chat').querySelector('.ladder-mark').hidden, 'no mark at that boundary');
  eq(row(p.root, 'video').querySelector('.ladder-value').textContent, '262.5 (162.5 to 417.5) Wh', 'value at the other boundary');
  ok(!row(p.root, 'video').querySelector('.ladder-range').hidden, 'range shows');
  ok(row(p.root, 'youtube').querySelector('.ladder-value').textContent.startsWith('53.7'), 'row appears at that boundary');
  ok(p.reading.textContent.includes('Not counted at this boundary'), 'selected row says so');
  key(window, p.plot, 'ArrowDown');
  key(window, p.plot, 'ArrowDown');
  ok(p.reading.textContent.includes('Limit: Derived from a study'), 'a partly row carries its limit');
  ok(p.receipt.textContent.includes('Partly verified. Limit: Derived from a study'), 'receipt carries the limit');
  eq(p.chips().length, 1, 'chip follows');
  ok(p.chips()[0].dataset.claim === 'fp-120', 'chip for the claim at this boundary');

  // Slider and typed twin
  const range = p.root.querySelector('input[type=range]');
  const num = p.root.querySelector('input[type=number]');
  const dc = p.radio('boundary', 'dc');
  dc.checked = true;
  fire(window, dc, 'input');
  key(window, p.plot, 'Home');
  range.value = '20';
  fire(window, range, 'input');
  eq(num.value, '20', 'number follows the slider');
  ok(window.location.search.includes('use=20'), 'slider in the query');
  eq(p.value.textContent, '4.8', 'page script multiplies');
  eq(row(p.root, 'chat').querySelector('.ladder-value').textContent, '4.8 Wh', 'row text follows');
  eq(p.plot.style.getPropertyValue('--at'), row(p.root, 'chat').style.getPropertyValue('--x'), 'needle follows the page script');
  ok(p.reading.textContent.startsWith('At 20 prompts an hour'), 'Reading follows');
  num.value = '50';
  fire(window, num, 'input');
  eq(range.value, '50', 'slider follows the number');
  eq(p.value.textContent, '12', 'number drives the plate');
  num.value = '999';
  fire(window, num, 'input');
  ok(window.location.search.includes('use=50'), 'bad value ignored');
  fire(window, num, 'change');
  eq(num.value, '50', 'bad value goes back');

  // Reset
  fire(window, p.root.querySelector('[data-reset]'), 'click');
  eq(window.location.search, '', 'Reset clears the query');
  eq(range.value, '1', 'Reset restores the slider');
  eq(p.radio('boundary', 'dc').checked, true, 'Reset restores the radio');
  eq(row(p.root, 'chat').getAttribute('aria-selected'), 'true', 'Reset restores the row');
  eq(p.value.textContent, '0.24', 'Reset restores the readout');
  ok(!p.receipt.hidden, 'Reset returns to the load state, with the first receipt open');
  eq(errors.join(), '', 'no script errors');
}

async function preview() {
  const { window, document } = await load();
  const p = parts(document, 'session-energy');
  window.under = row(p.root, 'video').querySelector('.ladder-label');
  fire(window, p.plot, 'pointermove');
  fire(window, p.plot, 'pointermove');
  await frame();
  ok(p.reading.textContent.startsWith('Streamed video'), 'hover updates the fixed Reading');
  eq(row(p.root, 'video').getAttribute('aria-selected'), 'false', 'hover does not select');
  ok(row(p.root, 'video').classList.contains('is-on'), 'hover marks the row');
  eq(window.location.search, '', 'hover leaves the query');
  eq(p.chips()[0].dataset.claim, 'fp-001', 'chips stay with the selection');
  fire(window, p.plot, 'pointerleave');
  ok(p.reading.textContent.startsWith('At 1 prompts') || p.reading.textContent.includes('0.24 Wh'), 'leaving restores');
  ok(row(p.root, 'chat').classList.contains('is-on'), 'leaving restores the mark');
  window.under = row(p.root, 'video');
  fire(window, p.plot, 'pointermove');
  await frame();
  fire(window, p.plot, 'pointerleave', {}, { pointerType: 'touch' });
  eq(row(p.root, 'video').getAttribute('aria-selected'), 'true', 'a touch drag commits');
}

async function live() {
  const { window, document } = await load();
  const p = parts(document, 'session-energy');
  eq(p.live.getAttribute('aria-live'), 'polite', 'live region');
  eq(p.live.textContent, '', 'silent on load');
  key(window, p.plot, 'ArrowDown');
  await wait(300);
  key(window, p.plot, 'ArrowDown');
  eq(p.live.textContent, '', 'silent while moving');
  ok(p.reading.textContent.length > 0, 'Reading changes at once');
  await wait(300);
  eq(p.live.textContent, '', 'timer restarted');
  await wait(300);
  eq(p.live.textContent, p.reading.textContent, 'speaks the last Reading after the pause');
}

async function copy() {
  const a = await load('?use=3#session-energy');
  const p = parts(a.document, 'session-energy');
  fire(a.window, p.root.querySelector('[data-copy]'), 'click');
  await wait(20);
  ok(a.window.clip.startsWith(p.reading.textContent), 'sentence first');
  ok(a.window.clip.includes('use=3') && a.window.clip.includes('#session-energy'), 'link with state');
  ok(a.window.clip.includes('Sources: Measuring the environmental impact'), 'source titles');
  ok(p.status.textContent.trim().length > 0, 'says so');
  const b = await load('', { clipboard: false });
  const q = parts(b.document, 'session-energy');
  fire(b.window, q.root.querySelector('[data-copy]'), 'click');
  await wait(20);
  eq(b.window.getSelection().toString(), q.reading.textContent, 'fallback selects the sentence');
  ok(/Ctrl/.test(q.status.textContent), 'fallback says so');
  fire(b.window, q.root.querySelector('[data-reset]'), 'click');
  eq(q.status.textContent, '', 'Reset clears the message');
}

async function query() {
  const bad = await load('?boundary=bogus&use=9999&session-energy=nope');
  const p = parts(bad.document, 'session-energy');
  eq(p.radio('boundary', 'dc').checked, true, 'bad stop falls to the default');
  eq(p.root.querySelector('input[type=range]').value, '1', 'bad number falls to the default');
  eq(row(p.root, 'chat').getAttribute('aria-selected'), 'true', 'bad row falls to the default');
  const off = await load('?use=2.5');
  eq(off.document.querySelector('#session-energy input[type=number]').value, '1', 'off-step number falls to the default');
  const good = await load('?boundary=full&session-energy=video&use=5');
  const q = parts(good.document, 'session-energy');
  eq(q.radio('boundary', 'full').checked, true, 'good stop applies');
  eq(row(q.root, 'video').getAttribute('aria-selected'), 'true', 'good row applies');
  eq(q.root.querySelector('input[type=number]').value, '5', 'good number applies');
  ok(q.reading.textContent.includes('262.5'), 'Reading reflects the address');
  eq(good.errors.join(), '', 'no script errors');
}

async function svgPlots() {
  const { window, document, errors } = await load('#electricity');
  const p = parts(document, 'company-electricity');
  const svg = p.plot.querySelector('.plate-svg');
  eq(svg.getAttribute('viewBox'), '0 0 900 400', 'drawn from the measured size');
  eq(svg.getAttribute('role'), 'none', 'drawn svg role');
  eq(p.plot.querySelectorAll('.m-line').length, 3, 'one line per series');
  eq(p.plot.querySelectorAll('.m-line.is-on').length, 1, 'one highlighted line');
  eq(p.plot.querySelectorAll('.m-label').length >= 1, true, 'direct labels');
  const bands = [...p.plot.querySelectorAll('[data-row]')];
  eq(bands.length, 6, 'one band per year');
  ok(bands[1].getAttribute('aria-label').length > 0, 'band named');
  eq(bands.at(-1).getAttribute('aria-selected'), 'true', 'latest year by default');
  ok(p.plot.style.getPropertyValue('--at').endsWith('px'), 'needle in pixels');
  eq(p.facts.querySelectorAll('li').length, 2, 'every series at that year listed');
  eq(p.facts.querySelector('li').textContent.endsWith('Google'), true, 'series keep the plate order');
  eq(bands.map((b) => b.dataset.row).join(), '2020,2021,2022,2023,2024,2025', 'years in order');
  ok(p.facts.querySelector('.plate-key') && p.facts.querySelector('strong'), 'value first, keyed by a stroke');
  ok(p.reading.textContent.includes('Google:') && p.reading.textContent.includes('Microsoft:') && p.reading.textContent.includes('verified against the source.'), 'Reading lists the series and the evidence');
  eq(p.chips().length, 2, 'a chip per claim');
  key(window, p.plot, 'ArrowLeft');
  eq(p.facts.querySelectorAll('li').length, 3, 'all three in the year before');
  ok(!p.receipt.hidden, 'several claims: the first opens, and chips open the others');
  fire(window, p.chips()[1], 'click');
  ok(!p.receipt.hidden, 'chip opens one');
  fire(window, p.chips()[0], 'click');
  eq(p.root.querySelectorAll('.receipt[aria-expanded="true"]').length, 1, 'one open per plate');
  const before = p.plot.querySelector('.m-needle');
  key(window, p.plot, 'ArrowLeft');
  eq(p.plot.querySelector('.m-needle'), before, 'selection does not redraw');
  // Resize redraws; the same size does not.
  window.size = { w: 1200, h: 600 };
  window.observers.forEach((cb) => cb());
  await frame();
  eq(p.plot.querySelector('.plate-svg').getAttribute('viewBox'), '0 0 1200 600', 'redraws on resize');
  eq(p.plot.querySelectorAll('.plate-svg').length, 1, 'one svg');
  const same = p.plot.querySelector('.plate-svg');
  window.observers.forEach((cb) => cb());
  await frame();
  eq(p.plot.querySelector('.plate-svg'), same, 'same size keeps the drawing');
  eq(p.root.querySelector('.is-on [data-nx], [data-row].is-on').dataset.row, '2023', 'selection survives the redraw');

  // Bars in a hidden panel keep the static drawing until shown.
  const bars = parts(document, 'capital-latest');
  fire(window, document.querySelector('a[href="#spending"]'), 'click');
  window.observers.forEach((cb) => cb());
  await frame();
  eq(bars.plot.querySelectorAll('.ladder-bar').length, 7, 'bars are rows on a ruler');
  ok(bars.plot.classList.contains('no-needle'), 'no needle on bars');
  fire(window, bars.plot.querySelectorAll('[data-row] .ladder-label')[3], 'click');
  ok(bars.reading.textContent.startsWith('Meta:'), 'a bar row is its own hit target');
  ok(!bars.receipt.hidden, 'receipt opens');

  // Small multiples: one option per year.
  const many = parts(document, 'capital-history');
  fire(window, document.querySelector('a[href="#history"]'), 'click');
  window.observers.forEach((cb) => cb());
  await frame();
  eq(many.plot.querySelectorAll('.m-title').length, 4, 'one cell per series');
  const y2024 = [...many.plot.querySelectorAll('[data-row="2024"]')];
  eq(y2024.length, 4, 'the year in every cell');
  eq(y2024.filter((n) => n.getAttribute('role') === 'option').length, 1, 'one option per year');
  eq(new Set([...many.plot.querySelectorAll('[role="option"]')].map((n) => n.id)).size, many.plot.querySelectorAll('[role="option"]').length, 'option ids are unique');
  ok(y2024.every((n) => n.classList.contains('is-on')), 'the selection marks every cell');
  ok(many.plot.querySelectorAll('.is-on > .m-dot').length === 4, 'a square per cell');
  eq(errors.join(), '', 'no script errors');
}

async function untrusted() {
  const source = html.replace(/(id="plate-data-session-energy">)(.*?)(<\/script>)/s, (m, a, body, c) => a + body.split('Chat, at the prompts set').join('\\u003cimg src=x id=evil\\u003e') + c);
  ok(source !== html, 'hostile text injected');
  const { window, document } = await load('', { source });
  const p = parts(document, 'session-energy');
  const base = p.reading.textContent;
  fire(window, p.root.querySelector('input[name="boundary"]'), 'input');
  key(window, p.plot, 'ArrowDown');
  key(window, p.plot, 'ArrowUp');
  ok(base.length > 0, 'still reads');
  eq(document.getElementById('evil'), null, 'data text never becomes markup');
  const js = read('site/assets/js/plate.js');
  ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|fetch\(/.test(js), 'no markup strings or fetches');
}

async function api() {
  const { window, document } = await load();
  assert.throws(() => window.plate.register('nope', {}), /No plate/);
  assert.throws(() => window.plate.register('session-energy', { defaults: { use: 9999 } }), /Bad default/);
  assert.throws(() => window.plate.register('session-energy', { defaults: { other: 1 } }), /Bad default/);
  count(3);
  let seen = null;
  window.plate.register('company-electricity', { defaults: {}, render(ctx) { seen = ctx.reason; ctx.auto(); ctx.reading('Own sentence.'); } });
  eq(seen, 'init', 'render runs at once');
  eq(document.querySelector('#company-electricity .reading').textContent, 'Own sentence.', 'a page script can write the Reading');
  const { draw } = window.plate;
  eq(draw.fmt(25000), '25K', 'compact from ten thousand');
  eq(draw.fmt(2500), '2,500', 'in full below it');
  eq(draw.fmt(0.25), '0.25', 'small numbers');
  eq(draw.scale('log', [0.1, 1000], [0, 1])(10), 0.5, 'log scale');
  eq(draw.scale('linear', [0, 100], [10, 110])(50), 60, 'linear scale');
  for (const name of ['add', 'frame', 'inner', 'axes', 'chart', 'lines', 'multiples']) eq(typeof draw[name], 'function', `draw.${name}`);
  // A partly row keeps its limit through a page script's own sentence.
  const b = await load('?boundary=full&session-energy=youtube');
  b.window.plate.register('session-energy', { render(ctx) { ctx.auto(); ctx.reading('Own sentence.'); } });
  ok(b.document.querySelector('#session-energy .reading').textContent.startsWith('Own sentence. Limit: Derived'), 'limit survives a page script');
}

async function noScripts() {
  const { window: { document } } = new JSDOM(html);
  const root = document.getElementById('session-energy');
  ok(document.querySelectorAll('section.section').length === 14, 'all panels in the page');
  ok(root.querySelector('.plate-controls').hidden && root.querySelector('.plate-views').hidden && root.querySelector('.plate-chips').hidden && root.querySelector('.plate-actions').hidden, 'controls stay hidden');
  ok(root.querySelector('.plate-setting').textContent.includes('Boundary:'), 'a line names the setting shown');
  ok([...root.querySelectorAll('.plate-view')].every((v) => !v.hidden), 'Reading, Sources, and Table all show');
  ok(root.querySelector('.reading').textContent.length > 20, 'default Reading');
  ok(root.querySelector('.readout-value').textContent === '0.24', 'default readout');
  ok(root.querySelectorAll('table tbody tr').length >= 5, 'full table');
  ok(root.querySelectorAll('.ladder-row').length === 4, 'static plot');
  ok(document.querySelector('#company-electricity .plate-plot svg[role="img"]').getAttribute('aria-label').includes('table'), 'static svg named');
  ok(document.querySelectorAll('#company-electricity .m-line').length === 3, 'static lines');
  ok(document.querySelectorAll('#capital-latest .ladder-bar').length === 7, 'static bars');
  ok(!document.querySelector('#project-demo').classList.contains('is-live'), 'a static plate has no fixed height');
  ok(document.querySelector('#project-demo [data-row="amw"] .ladder-value').textContent === '100 aMW', 'an instrument is built at its default setting');
  ok(document.querySelector('#project-demo .plate-setting').textContent.includes('Project size, MW: 125'), 'the line names the illustration');
  ok(document.querySelector('#project-demo [data-row="site"] .ladder-value').textContent === '240 to 320 million liters', 'a range is built');
  ok(document.querySelectorAll('#matrix-demo td[data-row]').length === 6, 'a matrix is a table');
  ok(document.querySelector('#matrix-demo .matrix-words').textContent === 'Watershed and season', 'a word cell');
  ok(document.querySelectorAll('#cases-demo .m-band').length === 1, 'a static band');
  ok(document.querySelectorAll('#money-demo .m-title').length === 3, 'static panels');
  ok(document.querySelectorAll('#rulers-demo .ladder').length === 2, 'two static rulers');
  ok(document.querySelector('#pair-demo .ladder-mark.is-b:not([hidden])') !== null, 'a static second mark');
  ok(document.querySelector('[data-pour="dem-058"]').textContent === '22,000 aMW', 'a poured figure');
  ok(document.querySelector('a[data-pour="dem-058"]').getAttribute('href').startsWith('https://'), 'a poured source link');
  ok(document.querySelector('.bench-link a').getAttribute('href') === 'index.html#matrix-demo', 'a bench row links to its plate');
  ok(document.querySelector('.bench-reading').textContent.startsWith('Water, National scale'), 'a bench row holds the default Reading');
  ok(document.querySelectorAll('#capital-history .m-title').length === 4, 'static multiples');
  ok(root.querySelector('.plate-sources').textContent.includes('Limit: Derived from a study'), 'limit on the page');
  ok(document.querySelector('.section-strip a[href="#history"]') && !document.querySelector('[role="tablist"]'), 'strip is a jump list');
}

async function instrument() {
  const { window, document, errors } = await load('#project');
  const p = parts(document, 'project-demo');
  const value = (k) => row(p.root, k).querySelector('.ladder-value').textContent;
  const slider = (name) => p.root.querySelector(`[data-param="${name}"] input[type=range]`);
  ok(p.plot.classList.contains('no-needle'), 'an instrument has no shared needle');
  eq(value('amw'), '100 aMW', 'default computed');
  eq(value('twh'), '0.88 TWh', 'a row reads an earlier row');
  eq(value('share'), '0.45 percent', 'a row reads a claim input');
  eq(value('site'), '240 to 320 million liters', 'a spread from two claims');
  eq(value('plantwater'), 'Off: the reservoir convention is unstated', 'a row off by a setting says so');
  ok(row(p.root, 'plantwater').querySelector('.ladder-mark').hidden, 'no mark while off');
  eq(`${p.value.textContent} ${p.unit.textContent}`, '100 aMW', 'readout');
  ok(p.reading.textContent.startsWith('125 MW at 0.8 load factor is 100 aMW, about 0.88 TWh a year'), 'the Reading fills from the settings');
  ok(p.reading.textContent.includes('22,000 aMW'), 'the Reading carries a claim input');
  ok(p.facts.textContent.includes('Equation: aMW = MW x load factor'), 'the equation prints');
  ok(p.facts.textContent.includes('A fleet average cannot describe a stream'), 'a plain detail sentence prints');
  ok(p.root.querySelector('.plate-setting').textContent.includes('Project size, MW: 125; Load factor: 0.8; Applicant\'s liters per kWh: blank; Count water at the power plant: No'), 'setting line');
  // Move a slider: the rows, the Reading, the query, and the marks all follow.
  const x0 = row(p.root, 'amw').style.getPropertyValue('--x');
  const mw = slider('mw');
  mw.value = '200';
  fire(window, mw, 'input');
  eq(value('amw'), '160 aMW', 'slider moves the row');
  eq(value('twh'), '1.4 TWh', 'and the rows after it');
  ok(row(p.root, 'amw').style.getPropertyValue('--x') !== x0, 'the mark moves');
  ok(window.location.search.includes('mw=200'), 'setting in the query');
  ok(p.reading.textContent.startsWith('200 MW at 0.8 load factor is 160 aMW'), 'the Reading follows');
  eq(p.root.querySelector('[data-param="mw"] input[type=number]').value, '200', 'the typed twin follows');
  // A load factor off the float grid still counts as on a stop.
  const lf = slider('lf');
  lf.value = '0.95';
  fire(window, lf, 'input');
  eq(value('amw'), '190 aMW', 'a decimal step');
  // The blank number: the spread collapses to the applicant's figure, and comes back.
  const typed = p.root.querySelector('[data-param="lkwh"] input');
  typed.value = '1';
  fire(window, typed, 'input');
  ok(window.location.search.includes('lkwh=1'), 'typed in the query');
  eq(value('site'), '1,700 million liters', 'one figure, no spread');
  ok(!row(p.root, 'site').querySelector('.ladder-mark').hidden, 'a mark when low meets high');
  typed.value = '';
  fire(window, typed, 'input');
  ok(!window.location.search.includes('lkwh'), 'blank leaves the query');
  ok(value('site').includes(' to '), 'the spread returns');
  // A toggle turns a row on.
  const plant = p.radio('plant', 'on');
  plant.checked = true;
  fire(window, plant, 'input');
  ok(value('plantwater').endsWith('million liters'), 'the row turns on');
  ok(!row(p.root, 'plantwater').querySelector('.ladder-mark').hidden, 'with its mark');
  fire(window, p.root.querySelector('[data-reset]'), 'click');
  eq(value('amw'), '100 aMW', 'Reset restores');
  eq(value('plantwater'), 'Off: the reservoir convention is unstated', 'Reset turns the row off');
  // A stop stands for a claim's number; a stop with none is blank, and the row prints its words.
  eq(value('cooled'), '240 million liters', 'a stop stands for a claim');
  const lbnl = p.radio('cool', 'lbnl');
  lbnl.checked = true;
  fire(window, lbnl, 'input');
  eq(value('cooled'), '320 million liters', 'another stop, another claim');
  const dry = p.radio('cool', 'dry');
  dry.checked = true;
  fire(window, dry, 'input');
  eq(value('cooled'), 'None on site; the energy penalty is not in the public record', 'a blank stop prints the row\'s words');
  ok(row(p.root, 'cooled').querySelector('.ladder-mark').hidden, 'and no mark');
  fire(window, p.root.querySelector('[data-reset]'), 'click');
  // Fixed rows: a trend from five claims, and a row of two figures.
  fire(window, row(p.root, 'naics').querySelector('.ladder-label'), 'click');
  eq(p.chips().length, 5, 'a row that cites five claims shows every receipt');
  ok(p.reading.textContent.startsWith('Industry employment: 419.4 to 491.6 thousand jobs, 2021 to 2025'), 'a trend reads as a span');
  ok(row(p.root, 'naics').querySelector('svg.spark path').getAttribute('d').startsWith('M0'), 'a sparkline');
  ok(!p.receipt.hidden, 'several claims: the first opens');
  fire(window, row(p.root, 'montana').querySelector('.ladder-label'), 'click');
  eq(p.facts.querySelectorAll('.plate-values li').length, 2, 'two figures listed');
  ok(p.facts.textContent.includes('at 500 MW') && row(p.root, 'montana').textContent.includes('at 1,000 MW'), 'each named');
  ok(p.reading.textContent.includes('Limit: A modeled hypothetical'), 'a partly figure keeps its limit');
  ok(p.root.querySelector('.plate-foot a').getAttribute('href') === '#sessions', 'a foot link');
  key(window, p.plot, 'Home');
  eq(row(p.root, 'amw').getAttribute('aria-selected'), 'true', 'keys move through the rows');
  eq(errors.join(), '', 'no script errors');
}

async function matrix() {
  const { window, document, errors } = await load('#matrix');
  const p = parts(document, 'matrix-demo');
  eq(p.plot.getAttribute('role'), 'grid', 'the plot is a grid');
  eq(p.plot.querySelector('table').getAttribute('role'), 'none', 'the table lends it rows');
  eq(p.plot.querySelector('tbody tr').getAttribute('role'), 'row', 'rows');
  eq(p.plot.querySelector('tbody th').getAttribute('role'), 'rowheader', 'row headers');
  eq(p.plot.querySelector('thead th').getAttribute('role'), 'columnheader', 'column headers');
  const cell = (k) => row(p.root, k);
  eq(cell('water--national').getAttribute('role'), 'gridcell', 'cells');
  eq(cell('water--national').getAttribute('aria-selected'), 'true', 'default cell');
  eq(p.plot.getAttribute('aria-activedescendant'), cell('water--national').id, 'active cell');
  eq(p.facts.querySelectorAll('.plate-values li').length, 2, 'two figures in the cell');
  ok(p.facts.textContent.includes('about 800 billion liters at power plants'), 'a figure keeps its words');
  eq(p.chips().length, 2, 'a receipt per figure');
  ok(cell('water--national').querySelector('.matrix-figure strong').textContent === '66 billion liters', 'the figure is strong');
  key(window, p.plot, 'ArrowRight');
  eq(cell('water--unit').getAttribute('aria-selected'), 'true', 'right moves a column');
  key(window, p.plot, 'ArrowDown');
  eq(cell('power--unit').getAttribute('aria-selected'), 'true', 'down moves a row');
  ok(cell('power--unit').querySelector('.matrix-figure').classList.contains('is-hollow'), 'a hollow square where modeled');
  ok(!cell('power--unit').classList.contains('matrix-figure') && !p.receipt.hidden, 'one figure opens its receipt');
  key(window, p.plot, 'ArrowUp');
  eq(cell('water--unit').getAttribute('aria-selected'), 'true', 'up moves a row');
  fire(window, cell('water--open').querySelector('p'), 'click');
  ok(p.reading.textContent.startsWith('Water, Open question: Watershed and season.'), 'a word cell has a Reading');
  eq(p.chips().length, 0, 'and no receipt');
  eq(`${p.value.textContent}|${p.unit.textContent}`, '|Watershed and season', 'its words in the readout');
  ok(p.views('table').querySelectorAll('tbody tr').length >= 6, 'the table lists the figures');
  eq(errors.join(), '', 'no script errors');
}

async function countView() {
  const { window, document, errors } = await load('#hour');
  const p = parts(document, 'hour-demo');
  const value = (k) => row(p.root, k).querySelector('.ladder-value').textContent;
  const view = (name) => {
    const radio = p.radio('hour-demo-plot', name);
    radio.checked = true;
    fire(window, radio, 'input');
  };
  const counted = (k) => [...p.plot.querySelectorAll('.count-row')].find((n) => n.dataset.row === k);
  const squares = (k) => (counted(k).querySelector('path')?.getAttribute('d').match(/M/g) || []).length;
  eq(value('chat'), '15 (9.28 to 24) Wh', 'computed from the model at the default');
  eq(value('household'), '28,740 Wh', 'a model input');
  eq(p.value.textContent, '15', 'readout stands alone');
  eq(p.unit.textContent, '(9.28 to 24) Wh', 'its range beside it');
  eq(p.plot.querySelectorAll('.plate-seg, .count-row').length, 0, 'Count waits until asked for');
  eq(p.facts.querySelectorAll('.plate-seg').length, 4, 'a thin segmented bar in the detail');
  ok(p.facts.textContent.includes('Data center, measured') && p.facts.textContent.includes('Router, modeled'), 'each part marked');
  eq(p.chips().length, 2, 'a row that cites two claims shows both');
  ok(p.reading.textContent.includes('or 50 text prompts'), 'a field computed per row');
  const tick = p.plot.querySelector('.ladder-tick');
  ok(tick.textContent.startsWith('Phone video hour, 14.1 Wh') || tick.textContent.startsWith('Phone video hour, 14 Wh'), 'a labeled yardstick');
  ok(p.root.querySelector('.plate-more input[name="device"]'), 'a control in More assumptions');
  ok(!p.root.querySelector('.plate-setting').textContent.includes('View'), 'the plot view stays out of the setting line');
  view('count');
  ok(p.plot.querySelector('.ladder-groups').hidden, 'the ruler steps aside');
  ok(window.location.search.includes('hour-demo-plot=count'), 'the view is in the query');
  eq(squares('chat'), 50, 'one square per 0.30 Wh prompt');
  ok(counted('chat').querySelector('.ladder-value').textContent.startsWith('50 text prompts'), 'the count prints');
  eq(squares('household'), 0, 'a row past the cap draws no squares, so it cannot look like the cap');
  ok(counted('household').querySelector('.count-over').textContent.startsWith('Too large to draw:'), 'and says so');
  eq(counted('household').querySelector('.ladder-num').textContent, '95,800', 'with its count');
  eq(counted('chat').classList.contains('is-on'), true, 'the selection marks the row');
  eq(p.plot.getAttribute('aria-activedescendant'), counted('chat').id, 'keys follow the visible view');
  fire(window, counted('video').querySelector('.ladder-label'), 'click');
  eq(counted('video').getAttribute('aria-selected'), 'true', 'a counted row selects');
  key(window, p.plot, 'ArrowDown');
  eq(counted('charge').getAttribute('aria-selected'), 'true', 'arrows move in Count');
  // The slider moves through the page script's model; both views and the table follow.
  const num = p.root.querySelector('[data-param="prompts"] input[type=number]');
  num.value = '30';
  fire(window, num, 'input');
  eq(squares('chat'), 70, 'Count follows the slider');
  view('ruler');
  ok(!p.plot.querySelector('.ladder-groups').hidden && p.plot.querySelector('.count-rows').hidden, 'back to the ruler');
  eq(value('chat'), '21 (9.28 to 24) Wh', 'the ruler follows the slider');
  const cell = [...p.views('table').querySelectorAll('[data-cell]')].find((td) => td.dataset.cell === 'chat|whole|display');
  eq(cell.textContent, '21 (9.28 to 24) Wh', 'the table follows the slider');
  const fieldCell = [...p.views('table').querySelectorAll('[data-cell]')].find((td) => td.dataset.cell === 'chat|whole|prompts_equal');
  eq(fieldCell.textContent, '70', 'a computed column follows the slider');
  // Presets.
  fire(window, p.root.querySelector('[data-preset="2.52"]'), 'click');
  eq(num.value, '2.52', 'a preset fills the typed field');
  ok(window.location.search.includes('prompts=2.52'), 'a preset off the step is in the query');
  eq(value('chat'), '12.8 (9.28 to 24) Wh', 'a preset moves the row');
  const again = await load('?prompts=2.52#hour');
  eq(again.document.querySelector('[data-param="prompts"] input[type=number]').value, '2.52', 'a preset survives the address');
  const off = await load('?prompts=2.5#hour');
  eq(off.document.querySelector('[data-param="prompts"] input[type=number]').value, '10', 'other values off the step do not');
  // The by control on formula rows.
  const dc = p.radio('edge', 'dc');
  dc.checked = true;
  fire(window, dc, 'input');
  eq(value('charge'), 'Not counted at this boundary', 'an everyday row is not counted');
  ok(value('chat').startsWith('0.756') || value('chat').startsWith('0.76'), 'the formula at this stop');
  eq(errors.join(), '', 'no script errors');
}

async function band() {
  const { window, document, errors } = await load('#cases');
  const p = parts(document, 'cases-demo');
  eq(p.plot.querySelectorAll('.m-band').length, 1, 'a band');
  ok(p.plot.querySelector('.m-band').getAttribute('d').endsWith('Z'), 'a closed wash');
  ok(p.plot.querySelectorAll('.m-band-edge.is-proj').length === 2, 'dashed edges past the last historical year');
  eq(p.plot.querySelectorAll('.m-line.is-on').length, 1, 'one selected line');
  ok(p.plot.querySelector('.m-line.is-on').getAttribute('class').includes('is-proj'), 'projected lines are dashed');
  ok(p.reading.textContent.startsWith('Baseline:'), 'the Reading speaks of the selected case');
  ok(/span [\d.,]+ to [\d.,]+\./.test(p.reading.textContent), 'and the span of the band');
  eq(p.facts.querySelectorAll('.plate-values li').length, 2, 'the facts list every case');
  ok(p.facts.textContent.includes("Servers' share of commercial sales: 7 percent"), 'a figure beside the plot');
  ok(p.chips().some((c) => c.dataset.claim === 'dem-016'), 'with its receipt');
  ok(p.root.querySelector('.plate-legend').textContent.includes('Range of the cases'), 'the band in the legend');
  const radio = p.radio('case', 'High demand');
  radio.checked = true;
  fire(window, radio, 'input');
  ok(p.reading.textContent.startsWith('High demand:'), 'a case control moves the emphasis');
  ok(p.root.querySelector('.plate-legend [data-series="High demand"] .plate-key').classList.contains('is-on'), 'and the legend');
  eq(p.plot.querySelectorAll('.m-line.is-on').length, 1, 'still one');
  key(window, p.plot, 'Home');
  ok(/\b2025\b/.test(p.reading.textContent), 'the needle moves through years');
  eq(errors.join(), '', 'no script errors');
}

async function panels() {
  const { window, document, errors } = await load('#money');
  const p = parts(document, 'money-demo');
  const titles = [...p.plot.querySelectorAll('.m-title')].map((n) => n.textContent);
  eq(titles.length, 3, 'one cell per panel');
  ok(titles[0].includes('billion dollars'), 'each axis says its unit');
  eq(p.plot.querySelectorAll('.m-label.is-lead').length, 3, 'the selected company is labeled in every panel');
  ok(p.reading.textContent.startsWith('Amazon, fiscal 2025 (ends 12/31/2025): capital spending'), 'one sentence for the year');
  ok(p.reading.textContent.includes('operating cash flow') && p.reading.textContent.includes('cash and securities'), 'across the panels');
  eq(p.facts.querySelectorAll('.plate-values li').length, 3, "the year's values for one company");
  ok(p.facts.textContent.includes('Capital spending'), 'named by panel');
  eq(p.chips().length, 3, "that company's receipts");
  const radio = p.radio('company', 'Microsoft');
  radio.checked = true;
  fire(window, radio, 'input');
  ok(p.reading.textContent.startsWith('Microsoft, fiscal 2025 (ends 06/30/2025)'), 'the company changes, the year stays');
  ok(p.chips().every((c) => /fin-00[18]|fin-035/.test(c.dataset.claim)), 'the receipts follow');
  key(window, p.plot, 'End');
  ok(p.reading.textContent.startsWith('Microsoft, fiscal 2026'), 'a later year');
  const apple = p.radio('company', 'Amazon');
  apple.checked = true;
  fire(window, apple, 'input');
  ok(p.reading.textContent.includes('No public measurement') || p.reading.textContent.startsWith('Amazon'), 'a company with no filing for that year says so');
  const cols = [...p.views('table').querySelectorAll('thead th')].map((n) => n.textContent);
  eq(cols.join(), 'Company,Fiscal year,Year ends,Capital spending,Operating cash flow,Cash and securities,Claims', 'a pivoted table');
  eq(p.plot.querySelectorAll('[role="option"]').length > 3, true, 'one option per year');
  eq(errors.join(), '', 'no script errors');
}

async function rulers() {
  const { window, document, errors } = await load('#rulers');
  const p = parts(document, 'rulers-demo');
  const ladders = [...p.plot.querySelectorAll('.ladder')];
  eq(ladders.length, 2, 'two rulers');
  eq(p.plot.querySelectorAll('.ladder-group-label').length, 2, 'each with its label');
  eq(p.plot.querySelectorAll('.ladder-axis').length, 2, 'and its axis');
  eq(ladders[0].dataset.form, 'bar', 'bars on the first');
  eq(ladders[1].dataset.form, 'square', 'squares on the second');
  ok(ladders[0].classList.contains('no-needle') && ladders[1].classList.contains('no-needle'), 'no needle on a bar');
  key(window, p.plot, 'End');
  eq(row(p.root, 'amazon').getAttribute('aria-selected'), 'true', 'keys cross the rulers');
  ok(ladders[0].classList.contains('no-needle') && !ladders[1].classList.contains('no-needle'), 'the needle lives on the ruler of the selection');
  ok(p.reading.textContent.includes('Limit:'), 'a partly row keeps its limit');
  eq(errors.join(), '', 'no script errors');
}

async function pair() {
  const { window, document, errors } = await load('#pair');
  const p = parts(document, 'pair-demo');
  const r = row(p.root, 'amazon');
  ok(!r.querySelector('.ladder-mark.is-b').hidden, 'a second mark');
  ok(!r.querySelector('.ladder-range').hidden, 'a line between');
  ok(r.querySelector('.ladder-value').textContent.includes(' and '), 'both values');
  ok(p.reading.textContent.startsWith('Amazon, fiscal 2025: capital spending'), 'one sentence for the pair');
  eq(p.chips().length, 2, 'both receipts');
  eq(p.facts.querySelectorAll('.plate-values li').length, 2, 'both facts');
  ok(p.root.querySelector('.plate-legend').textContent.includes('Cash and securities'), 'the marks named');
  const before = r.style.getPropertyValue('--x');
  const radio = p.radio('fy', '2023');
  radio.checked = true;
  fire(window, radio, 'input');
  ok(r.style.getPropertyValue('--x') !== before, 'a year stop moves the marks');
  ok(p.reading.textContent.startsWith('Amazon, fiscal 2023'), 'and the sentence');
  eq(errors.join(), '', 'no script errors');
}

async function jobs() {
  const { window, document, errors } = await load('#jobs');
  const p = parts(document, 'jobs-demo');
  const order = (k) => row(p.root, k).style.getPropertyValue('order');
  ok(p.plot.classList.contains('no-needle'), 'no needle on bars');
  eq(row(p.root, 'scientists').querySelector('.ladder-value').textContent, '+34.6 percent', 'a printed sign');
  eq(row(p.root, 'keyers').querySelector('.ladder-value').textContent, '-25.5 percent', 'and a minus');
  ok(row(p.root, 'keyers').classList.contains('is-neg') && row(p.root, 'scientists').classList.contains('is-pos'), 'polarity marked');
  ok(p.plot.querySelector('.ladder').style.getPropertyValue('--z') > 0, 'zero sits inside the ruler');
  ok(p.plot.querySelector('.ladder-grid i.is-zero'), 'a neutral zero');
  ok(p.plot.querySelector('.ladder-bar.is-proj'), 'projected bars carry a cap');
  ok(p.plot.querySelector('.ladder-tick').textContent.startsWith('All occupations, +3.5 percent'), 'a labeled baseline');
  ok(p.plot.querySelector('.ladder-group-label').textContent.includes('Projected'), 'the axis says projected');
  ok(row(p.root, 'electricians').querySelector('.ladder-tag').textContent === 'Buildout trade', 'a tag');
  eq(order('scientists'), '0', 'biggest first');
  eq(order('keyers'), '3', 'smallest last');
  const radio = p.radio('order', 'tag');
  radio.checked = true;
  fire(window, radio, 'input');
  eq(Math.abs(order('electricians') - order('linemen')), 1, 'tagged rows together');
  key(window, p.plot, 'Home');
  key(window, p.plot, 'ArrowDown');
  ok(p.plot.querySelector('[aria-selected="true"]') === p.plot.querySelector(`[id="${p.plot.getAttribute('aria-activedescendant')}"]`), 'keys follow the order');
  const shift = parts(document, 'shift-demo');
  eq(row(shift.root, 'stanford').querySelector('.ladder-value').textContent, '-19 percent', 'a shortfall reads as a minus');
  ok(row(shift.root, 'pwc').querySelector('.ladder-value').textContent.startsWith('+35'), 'a rise as a plus');
  eq(row(shift.root, 'yale').querySelector('.ladder-value').textContent, 'No connection found', 'words in place of a mark');
  ok(row(shift.root, 'yale').querySelector('.ladder-mark').hidden, 'no mark');
  eq(errors.join(), '', 'no script errors');
}

async function points() {
  const { window, document, errors } = await load('#misses');
  const p = parts(document, 'misses-demo');
  const rows = [...p.plot.querySelectorAll('[data-row]')];
  eq(rows.length, 5, 'one target per point');
  eq(p.plot.querySelectorAll('.m-title').length, 2, 'one panel per source');
  ok(p.plot.querySelectorAll('.m-needle').length === 0, 'no needle across panels');
  ok(p.plot.querySelectorAll('.m-dot.is-solo').length >= 4, 'dots always show');
  ok(p.plot.querySelector('.m-range'), 'a range-only edition');
  fire(window, row(p.root, 'bnef-a').querySelector('.m-hit'), 'click');
  ok(p.reading.textContent.startsWith('12/2025 outlook: 106'), 'a point selects');
  ok(p.facts.textContent.includes('Superseded by the 07/2026 outlook.'), 'its note');
  ok(row(p.root, 'bnef-a').querySelector('.m-dot').classList.contains('is-hollow'), 'superseded is hollow');
  key(window, p.plot, 'ArrowDown');
  ok(p.reading.textContent.startsWith('07/2026 outlook'), 'arrows move point to point');
  eq(errors.join(), '', 'no script errors');
}

async function fit() {
  const { window, document } = await load('#project', { wide: true });
  const root = document.getElementById('project-demo');
  ok(root.classList.contains('plate-fit'), 'a fit plate');
  eq(root.style.getPropertyValue('--plate-h'), '860px', 'the first plate runs to the foot of the window');
  window.innerHeight = 1200;
  window.dispatchEvent(new window.Event('resize'));
  eq(root.style.getPropertyValue('--plate-h'), '1160px', 'it follows the window');
  window.innerHeight = 500;
  window.dispatchEvent(new window.Event('resize'));
  eq(root.style.getPropertyValue('--plate-h'), '544px', 'and never gets too short');
  const tab = document.querySelector('a[href="#matrix"]');
  fire(window, tab, 'click');
  ok(document.getElementById('matrix').classList.contains('is-entering'), 'a tab change may move once');
}


module.exports = { groups: { shortDetail, tabs, ladder, preview, live, copy, query, svgPlots, untrusted, api, noScripts, instrument, matrix, count: countView, band, panels, rulers, pair, jobs, points, fit } };
