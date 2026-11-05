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

// The build copies plot keys through to the data block, so a page gets these exactly as this fixture does.
function withData(id, change) {
  const out = html.replace(new RegExp(`(id="plate-data-${id}">)(.*?)(</script>)`, 's'), (m, a, body, c) => {
    const data = JSON.parse(body);
    change(data);
    return a + JSON.stringify(data).replace(/</g, '\\u003c').replace(/--/g, '-\\u002d') + c;
  });
  ok(out !== html, `the fixture changed ${id}`);
  return out;
}
const pick = (window, radio) => {
  radio.checked = true;
  fire(window, radio, 'input');
};

async function tabs() {
  const { window, document, errors } = await load();
  const list = document.querySelector('[role="tablist"]');
  const links = [...document.querySelectorAll('[role="tab"]')];
  const panels = [...document.querySelectorAll('[role="tabpanel"]')];
  ok(list && links.length === 14 && panels.length === 14, 'tab list and panels');
  eq(list.getAttribute('aria-label'), 'Demonstration sections', 'tab list named');
  // A strip that scrolls says so while more waits past its edge.
  Object.defineProperty(list, 'scrollWidth', { value: 900 });
  Object.defineProperty(list, 'clientWidth', { value: 300 });
  fire(window, list, 'scroll');
  ok(list.classList.contains('is-cut'), 'the strip fades while cut');
  list.scrollLeft = 600;
  fire(window, list, 'scroll');
  ok(!list.classList.contains('is-cut'), 'and not at its end');
  list.scrollLeft = 0;
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
  // Space is the one action on a link's own keydown, and takes the page scroll with it; Alt+Left stays the browser's Back.
  const hash = window.location.hash;
  ok(key(window, links[0], ' ').defaultPrevented, 'Space does not scroll the page');
  eq(document.getElementById(hash.slice(1) || 'sessions').hidden, false, 'Space keeps the panel');
  eq(links[0].getAttribute('aria-selected'), 'true', 'Space keeps the tab');
  ok(!fire(window, links[0], 'keydown', { key: 'ArrowLeft', altKey: true }).defaultPrevented, 'Alt+Left is not a tab key');
  eq(links[0].getAttribute('aria-selected'), 'true', 'and moves nothing');
  ok(links.every((a, i) => a.getAttribute('aria-controls') === panels[i].id && panels[i].getAttribute('aria-labelledby') === a.id), 'tabs and panels name each other');
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
  eq(bands.at(-1).getAttribute('role'), 'option', 'a band is an option, so its name is spoken');
  eq(bands.at(-1).getAttribute('aria-label'), p.reading.textContent, 'the selected band is named with the Reading');
  ok(bands[1].getAttribute('aria-label').includes('2021'), 'and each other band with its own');
  eq(p.plot.getAttribute('aria-orientation'), 'horizontal', 'years run across');
  ok(p.plot.querySelector('.m-label').getAttribute('aria-hidden') === 'true', 'a line name stays out of the list');
  eq(bands.at(-1).getAttribute('aria-selected'), 'true', 'latest year by default');
  ok(p.plot.style.getPropertyValue('--at').endsWith('px'), 'needle in pixels');
  eq(+bands[0].dataset.nx - +p.plot.querySelector('.m-grid').getAttribute('x1'), 24, 'the first year stands 24px in from the ticks, so a needle there never reads as the y axis');
  eq([...p.plot.querySelectorAll('.m-tick')].map((n) => n.textContent).filter((t) => /^20\d\d$/.test(t)).sort()[0], bands[0].dataset.row, 'and it stays the first label');
  eq(p.facts.querySelectorAll('li').length, 2, 'every series at that year listed');
  eq(p.facts.querySelector('li').textContent.endsWith('Google'), true, 'series keep the plate order');
  eq(bands.map((b) => b.dataset.row).join(), '2020,2021,2022,2023,2024,2025', 'years in order');
  ok(p.facts.querySelector('.plate-square') && !p.facts.querySelector('.plate-key') && p.facts.querySelector('strong'), 'value first, keyed by a square, as every figure list is');
  ok(p.facts.querySelectorAll('.plate-square.is-on').length <= 1, 'orange for the selected series alone');
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
  ok(y2024.slice(1).every((n) => n.getAttribute('aria-hidden') === 'true' && !n.hasAttribute('aria-label') && !n.hasAttribute('role')), 'the rest stand behind it, with no name to conflict');
  eq(y2024[0].parentElement.getAttribute('role'), 'none', 'a cell group between the svg and its option gets out of the way, or Chrome hides the option');
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
  eq(document.querySelector('.plate-note a[href="#sessions"]').closest('figure'), null, 'a foot link reads under the plate');
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
  key(window, p.plot, 'ArrowUp');
  eq(cell('water--unit').getAttribute('aria-selected'), 'true', 'a grid stops at its top edge');
  key(window, p.plot, 'Home');
  eq(cell('water--national').getAttribute('aria-selected'), 'true', 'Home goes to the start of the row');
  key(window, p.plot, 'ArrowLeft');
  eq(cell('water--national').getAttribute('aria-selected'), 'true', 'a grid stops at its left edge');
  key(window, p.plot, 'End');
  eq(cell('water--open').getAttribute('aria-selected'), 'true', 'End goes to the end of the row');
  key(window, p.plot, 'ArrowRight');
  eq(cell('water--open').getAttribute('aria-selected'), 'true', 'and Right does not wrap to the next row');
  fire(window, p.plot, 'keydown', { key: 'End', ctrlKey: true });
  const lastCell = [...p.plot.querySelectorAll('td[data-row]')].at(-1);
  eq(lastCell.getAttribute('aria-selected'), 'true', 'Ctrl+End goes to the last cell');
  key(window, p.plot, 'ArrowDown');
  eq(lastCell.getAttribute('aria-selected'), 'true', 'a grid stops at its foot, in its own column');
  fire(window, p.plot, 'keydown', { key: 'Home', ctrlKey: true });
  eq(cell('water--national').getAttribute('aria-selected'), 'true', 'Ctrl+Home goes to the first cell');
  ok(!fire(window, p.plot, 'keydown', { key: 'ArrowRight', altKey: true }).defaultPrevented, 'browser shortcuts pass through');
  eq(p.plot.querySelectorAll('[role="columnheader"]').length, [...p.plot.querySelectorAll('thead :is(th, td)')].filter((n) => n.textContent.trim()).length, 'an empty corner is no column header');
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
  eq(value('chat'), '15 (9.3 to 24) Wh', 'computed from the model at the default');
  eq(value('household'), '28,740 Wh', 'a model input');
  eq(p.value.textContent, '15', 'readout stands alone');
  eq(p.unit.textContent, '(9.3 to 24) Wh', 'its range beside it');
  eq(p.plot.querySelectorAll('.plate-seg, .count-row').length, 0, 'Count waits until asked for');
  eq(p.facts.querySelectorAll('.plate-seg').length, 4, 'a thin segmented bar in the detail');
  ok(p.facts.textContent.includes('Data center, measured') && p.facts.textContent.includes('Router, modeled'), 'each part marked');
  eq(p.chips().length, 2, 'a row that cites two claims shows both');
  ok(p.reading.textContent.includes('or 50 text prompts'), 'a field computed per row');
  const tick = p.plot.querySelector('.ladder-tick');
  ok(tick.textContent.startsWith('Phone video hour, 14.1 Wh') || tick.textContent.startsWith('Phone video hour, 14 Wh'), 'a labeled yardstick'); // the frozen fixture's mark holds its built words
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
  eq(value('chat'), '21 (9.3 to 24) Wh', 'the ruler follows the slider');
  const cell = [...p.views('table').querySelectorAll('[data-cell]')].find((td) => td.dataset.cell === 'chat|whole|display');
  eq(cell.textContent, '21 (9.3 to 24) Wh', 'the table follows the slider');
  const fieldCell = [...p.views('table').querySelectorAll('[data-cell]')].find((td) => td.dataset.cell === 'chat|whole|prompts_equal');
  eq(fieldCell.textContent, '70', 'a computed column follows the slider');
  // Presets.
  fire(window, p.root.querySelector('[data-preset="2.52"]'), 'click');
  eq(num.value, '2.52', 'a preset fills the typed field');
  ok(window.location.search.includes('prompts=2.52'), 'a preset off the step is in the query');
  eq(value('chat'), '13 (9.3 to 24) Wh', 'a preset moves the row');
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

// No zone is a scroller: the plate grows with a zone that needs more room, so nothing is cut, and there is nothing to reach by a second tab stop.
async function zones() {
  const { document } = await load();
  const root = document.getElementById('session-energy');
  for (const zone of [root.querySelector('.plate-claim'), root.querySelector('.plate-detail')]) {
    eq(zone.getAttribute('tabindex'), null, 'no zone takes a tab stop');
    ok(!zone.classList.contains('has-more'), 'and none fades');
  }
  const css = read('site/assets/css/site.css');
  ok(css.includes('.plate.is-live { --h: var(--plate-h, max(34rem, 72vh)); min-height: var(--h); }'), 'a live plate has a least height, not a height');
  ok(!/\.plate[^{}]*\{[^{}]*overflow-y: auto/.test(css), 'and no zone scrolls on its own');
  ok(!/has-more|is-short/.test(read('site/assets/js/plate.js')), 'nothing is left of the old bargain');
}

// The Reading view ends at Copy, Reset, and one line of receipts. Chips, the open receipt, and the list live in the Sources view, whose tab carries the count.
async function detailViews() {
  const { window, document, errors } = await load();
  const p = parts(document, 'session-energy');
  const reading = p.views('reading');
  const sources = p.views('sources');
  const chipsBox = p.root.querySelector('.plate-chips');
  ok(sources.contains(chipsBox) && sources.contains(p.receipt) && sources.querySelector('.plate-sources'), 'chips, receipt, and list are in Sources');
  ok(!reading.contains(chipsBox) && !reading.contains(p.receipt) && !reading.querySelector('.plate-sources'), 'and none in the Reading');
  ok(chipsBox.compareDocumentPosition(p.receipt) === 4 && p.receipt.compareDocumentPosition(sources.querySelector('.plate-sources')) === 4, 'the receipt opens right under its chips, above the list');
  eq(p.root.querySelector('.plate-views input[value="sources"] + span').textContent, 'Sources (5)', 'the tab carries the count of receipts');
  const tally = reading.querySelector('.plate-tally');
  eq(tally.previousElementSibling, p.root.querySelector('.plate-actions'), 'the line of receipts follows Copy and Reset');
  eq(tally.textContent, 'This row: 1 verified; 5 sources on the plate', 'the selection by status, then the count the tab carries');
  pick(window, p.radio('boundary', 'full'));
  key(window, p.plot, 'ArrowDown');
  key(window, p.plot, 'ArrowDown');
  ok(p.reading.textContent.includes('Limit:'), 'a partly row');
  eq(tally.textContent, 'This row: 1 partly verified; 5 sources on the plate', 'its line says partly');
  fire(window, tally, 'click');
  eq(p.root.dataset.view, 'sources', 'the line opens Sources');
  ok(!sources.hidden && reading.hidden, 'and only Sources');
  eq(document.activeElement, p.radio('session-energy-view', 'sources'), 'focus goes to the view switch, since the line left with its view');
  key(window, p.plot, 'Home');
  // A chip pressed: focus goes to what opened, and Escape comes back to the chip.
  const [chip] = p.chips();
  fire(window, chip, 'click');
  ok(p.receipt.hidden, 'the first press closes the receipt open since the selection');
  eq(document.activeElement === p.receipt, false, 'and leaves focus alone');
  chip.focus();
  fire(window, chip, 'click');
  ok(!p.receipt.hidden, 'the next opens it');
  eq(chip.getAttribute('aria-expanded'), 'true', 'the chip says so');
  eq(document.activeElement, p.receipt, 'focus moves to the receipt');
  eq(p.receipt.getAttribute('role'), 'group', 'a group');
  eq(p.receipt.getAttribute('aria-label'), 'Source', 'named');
  eq(window.scrolled === undefined, false, 'and it is brought into view');
  key(window, p.receipt, 'Escape');
  ok(p.receipt.hidden, 'Escape closes it');
  eq(document.activeElement, chip, 'and returns to the chip');
  eq(chip.getAttribute('aria-expanded'), 'false', 'which says so');
  // A link from another page may open a view; anything else opens the Reading.
  eq((await load('?session-energy-view=sources')).document.getElementById('session-energy').dataset.view, 'sources', 'the view comes from the address');
  eq((await load('?session-energy-view=bogus')).document.getElementById('session-energy').dataset.view, 'reading', 'a bad one is the Reading');
  eq(errors.join(), '', 'no script errors');
}

// A row this stop does not count stays on the plot, with no mark and no selection.
async function ghosts() {
  const { window, document, errors } = await load('#hour');
  const p = parts(document, 'hour-demo');
  const charge = row(p.root, 'charge');
  const selected = () => p.plot.querySelector('[aria-selected="true"]').dataset.row;
  ok(!charge.classList.contains('is-ghost') && !charge.hasAttribute('aria-disabled'), 'a counted row is no ghost');
  pick(window, p.radio('edge', 'dc'));
  ok(charge.classList.contains('is-ghost') && !charge.hidden, 'it stays on the plot');
  eq(charge.getAttribute('aria-disabled'), 'true', 'disabled, which is why its 40 percent label may be under the contrast floor');
  ok(charge.querySelector('.ladder-mark').hidden, 'no mark');
  eq(charge.querySelector('.ladder-value').textContent, 'Not counted at this boundary', 'and the plate\'s own words');
  eq(p.root.querySelectorAll('.plate-fold').length, 0, 'there is no foot sentence');
  key(window, p.plot, 'End');
  eq(selected(), 'video', 'arrows pass over a ghost');
  fire(window, charge.querySelector('.ladder-label'), 'click');
  eq(selected(), 'video', 'a press does nothing');
  window.under = charge;
  fire(window, p.plot, 'pointermove');
  await frame();
  ok(p.reading.textContent.startsWith('Streamed') || row(p.root, 'video').classList.contains('is-on'), 'and neither does a hover');
  pick(window, p.radio('edge', 'whole'));
  ok(!charge.classList.contains('is-ghost') && !charge.hasAttribute('aria-disabled'), 'back at a stop that counts it, it is a row again');
  fire(window, charge.querySelector('.ladder-label'), 'click');
  eq(selected(), 'charge', 'and takes a selection');
  pick(window, p.radio('edge', 'dc'));
  eq(selected(), 'chat', 'a selected row that turns to a ghost gives the selection back to the default');
  ok(!window.location.search.includes('hour-demo=charge'), 'and the address follows');
  // Count holds the same row the same way.
  pick(window, p.radio('hour-demo-plot', 'count'));
  ok([...p.plot.querySelectorAll('.count-row')].find((n) => n.dataset.row === 'charge').classList.contains('is-ghost'), 'in both views');
  eq(errors.join(), '', 'no script errors');
}

// plot.fit "data": whole decades around what this stop counts, and a row named in plot.off_ruler stays off, in words.
async function fitData() {
  const { window, document, errors } = await load('#hour', { source: withData('hour-demo', (d) => Object.assign(d.plot, { fit: 'data', off_ruler: ['household'] })) });
  const p = parts(document, 'hour-demo');
  const ticks = () => [...p.plot.querySelectorAll('.ladder-axis span')].map((n) => n.textContent).join();
  const at = (k) => +row(p.root, k).style.getPropertyValue('--x');
  eq(ticks(), '1,10,100,1,000', 'the whole hour runs 1 to 1,000');
  eq(p.plot.querySelectorAll('.ladder-grid i:not(.ladder-needle):not(.ladder-tick)').length, 4, 'one grid line per tick');
  ok(Math.abs(at('chat') - Math.log10(15.0008) / 3) < 1e-3, 'a formula row sits on the new ruler');
  ok(Math.abs(at('charge') - Math.log10(19) / 3) < 1e-3, 'and so does a claim row');
  eq(row(p.root, 'charge').querySelector('.ladder-value').textContent, '19 Wh', 'whose words the ruler does not change');
  eq(row(p.root, 'household').querySelector('.ladder-value').textContent, '28,740 (off this ruler) Wh', 'a day in a household stays off it');
  eq(row(p.root, 'household').querySelector('.ladder-tag').textContent, '(off this ruler)', 'on the range line');
  ok(row(p.root, 'household').querySelector('.ladder-mark').hidden && !row(p.root, 'household').classList.contains('is-gap'), 'with no mark, and it is no gap');
  const tick = p.plot.querySelector('.ladder-tick');
  ok(Math.abs(+tick.style.getPropertyValue('--x') - Math.log10(14.05) / 3) < 1e-2, 'a tick moves with the ruler');
  ok(tick.classList.contains('is-right'), 'and its name reads away from a needle at its right');
  fire(window, row(p.root, 'video').querySelector('.ladder-label'), 'click');
  ok(!tick.classList.contains('is-right'), 'or at its left');
  ok(/^Each mark is ten times/.test(p.root.querySelector('.plate-under .caption').textContent), 'its caption is the axis caption');
  ok(![...p.root.querySelectorAll('.plate-claim > .caption')].some((n) => n.textContent.startsWith('Each mark')), 'and has left the claim');
  pick(window, p.radio('hour-demo-plot', 'count'));
  ok(p.root.querySelector('.plate-under .caption').hidden, 'squares have no ruler to caption');
  pick(window, p.radio('hour-demo-plot', 'ruler'));
  ok(!p.root.querySelector('.plate-under .caption').hidden, 'the ruler gets it back');
  pick(window, p.radio('edge', 'dc'));
  eq(ticks(), '0.01,0.1,1,10,100', 'the next stop gets the decades around its own numbers');
  ok(Math.abs(at('chat') - (Math.log10(3) + 2) / 4) < 1e-3, 'and its places');
  eq(errors.join(), '', 'no script errors');
}

// plot.shared: where the selected row's range overlaps, one band and one sentence. Never a ratio.
async function sharedGround() {
  const options = { fit: 'data', off_ruler: ['household'], shared: { word: 'lighter', at: { whole: 'the whole hour' } } };
  const { window, document, errors } = await load('#hour', { source: withData('hour-demo', (d) => Object.assign(d.plot, options)) });
  const p = parts(document, 'hour-demo');
  const band = () => p.plot.querySelector('.ladder-shared');
  ok(!band().hidden && p.plot.querySelector('.ladder-grid').contains(band()), 'a band under the rows');
  eq(band().textContent, 'Shared ground, 9.3 to 24 Wh', 'it says what it spans, from the rows\' own figures');
  ok(Math.abs(+band().style.getPropertyValue('--lo') - Math.log10(9.28008) / 3) < 1e-3 && Math.abs(+band().style.getPropertyValue('--hi') - Math.log10(24.0325) / 3) < 1e-3, 'and spans it');
  ok(p.reading.textContent.endsWith('At the whole hour, chat and streamed video overlap (9.3 to 24 against 7.2 to 128); neither is clearly lighter.'), `the Reading says so: ${p.reading.textContent}`);
  ok(!/\btimes\b|ratio/i.test(p.reading.textContent.slice(p.reading.textContent.indexOf('At the whole hour'))), 'with no ratio');
  // The band's name reads to its right while it fits, and turns back where it would not or past 0.6.
  const grid = p.plot.querySelector('.ladder-grid');
  Object.defineProperty(grid, 'clientWidth', { value: 1000, configurable: true });
  Object.defineProperty(band().firstElementChild, 'offsetWidth', { value: 196 });
  key(window, p.plot, 'Home');
  ok(!band().classList.contains('is-flip'), 'beside the band while it fits');
  Object.defineProperty(grid, 'clientWidth', { value: 300, configurable: true });
  key(window, p.plot, 'Home');
  ok(band().classList.contains('is-flip'), 'and back where it would not');
  Object.defineProperty(grid, 'clientWidth', { value: 1000, configurable: true });
  key(window, p.plot, 'ArrowDown');
  ok(p.reading.textContent.endsWith('At the whole hour, streamed video and chat overlap (7.2 to 128 against 9.3 to 24); neither is clearly lighter.'), 'it follows the selection');
  fire(window, row(p.root, 'charge').querySelector('.ladder-label'), 'click');
  ok(band().hidden, 'a row with no range shares nothing');
  ok(!p.reading.textContent.includes('overlap'), 'and says nothing of it');
  pick(window, p.radio('edge', 'dc'));
  eq(band().textContent, 'Shared ground, 2.4 to 6 Wh', 'each stop finds its own');
  ok(+band().style.getPropertyValue('--hi') > 0.6 && band().classList.contains('is-flip'), 'past 0.6 its name turns back, as the needle does');
  ok(p.reading.textContent.includes('At this setting, chat and streamed video overlap'), 'a stop with no words of its own still reads');
  // The sentence that carries the readout's figure keeps heading ink; the words stay the same words.
  const carried = p.reading.querySelectorAll('b');
  ok(carried.length === 1 && carried[0].textContent.includes(p.value.textContent), 'one sentence is marked, the one with the figure');
  const box = document.createElement('p');
  window.plate.readingInto(box, 'In 2015 it was 150. Now about 15 Wh. Limit: 1.5 and 15/2026.', '15');
  eq(box.querySelector('b').textContent, 'Now about 15 Wh.', 'a figure is matched whole, never inside another number');
  eq(box.textContent, 'In 2015 it was 150. Now about 15 Wh. Limit: 1.5 and 15/2026.', 'and the words are unchanged');
  window.plate.readingInto(box, 'No such figure.', '15');
  eq(box.querySelector('b'), null, 'no figure, no mark');
  // A wide range can touch two rows that do not touch each other: the ground holds what it can, in row order.
  const wide = await load('#hour', { source: withData('hour-demo', (d) => {
    Object.assign(d.plot, options);
    Object.assign(d.rows.find((r) => r.key === 'charge'), { low: 100, high: 200 });
  }) });
  const q = parts(wide.document, 'hour-demo');
  fire(wide.window, row(q.root, 'video').querySelector('.ladder-label'), 'click');
  eq(q.plot.querySelector('.ladder-shared').textContent, 'Shared ground, 9.3 to 24 Wh', 'the row that would empty the ground is left out');
  // A yardstick is context: it neither makes the band nor narrows it.
  const yard = await load('#hour', { source: withData('hour-demo', (d) => Object.assign(d.plot, options, { yard: ['video', 'charge', 'household'] })) });
  const y = parts(yard.document, 'hour-demo');
  ok(!y.plot.querySelector('.ladder-shared') || y.plot.querySelector('.ladder-shared').hidden, 'a yardstick does not count');
  ok(y.plot.classList.contains('has-yard') && row(y.root, 'video').classList.contains('is-yard') && !row(y.root, 'chat').classList.contains('is-yard'), 'and is marked for its height');
  // With no plot.shared there is no band: only a plate whose rows measure one thing may claim shared ground.
  ok(!(await load('#hour')).document.querySelector('#hour-demo .ladder-shared'), 'a plate opts in');
  eq(errors.join() + wide.errors.join() + yard.errors.join(), '', 'no script errors');
}

// The needle's name at its top; "your setting" once any setting has moved.
async function needleLabel() {
  const { window, document, errors } = await load('#hour');
  const p = parts(document, 'hour-demo');
  const label = () => p.plot.querySelector('.ladder-needle .needle-label').textContent;
  eq(label(), 'Chat, at the prompts set', 'the selected row, at the defaults');
  fire(window, row(p.root, 'video').querySelector('.ladder-label'), 'click');
  eq(label(), 'Streamed video, one hour', 'it follows the selection');
  const num = p.root.querySelector('[data-param="prompts"] input[type=number]');
  num.value = '30';
  fire(window, num, 'input');
  ok(label().endsWith(', your setting'), 'a moved setting says so');
  fire(window, p.root.querySelector('[data-reset]'), 'click');
  eq(label(), 'Chat, at the prompts set', 'Reset takes it back');
  pick(window, p.radio('hour-demo-plot', 'count'));
  pick(window, p.radio('hour-demo-plot', 'ruler'));
  eq(label(), 'Chat, at the prompts set', 'a view is not a setting');
  // A drawn plot names the year.
  const lines = await load('#electricity');
  const q = parts(lines.document, 'company-electricity');
  const text = q.plot.querySelector('.m-needle-label');
  eq(text.textContent, q.plot.querySelector('[aria-selected="true"]').dataset.row, 'a drawn needle is named with its year');
  eq(text.getAttribute('aria-hidden'), 'true', 'the band has said it');
  ok(['start', 'end'].includes(text.getAttribute('text-anchor')), 'and it keeps inside the plot');
  // An instrument's needle stands at one row's place across every row.
  const inst = await load('#project', { source: withData('project-demo', (d) => { d.plot.needle = 'amw'; }) });
  const r = parts(inst.document, 'project-demo');
  const stand = r.plot.querySelector('.instrument > .needle');
  ok(stand && !r.plot.classList.contains('no-needle'), 'plot.needle draws one');
  eq(stand.getAttribute('aria-hidden'), 'true', 'hidden from the list box');
  eq(r.plot.style.getPropertyValue('--at'), row(r.root, 'amw').style.getPropertyValue('--x'), 'at that row\'s place');
  fire(inst.window, row(r.root, 'twh').querySelector('.ladder-label'), 'click');
  eq(r.plot.style.getPropertyValue('--at'), row(r.root, 'amw').style.getPropertyValue('--x'), 'whichever row is selected');
  const mw = r.root.querySelector('[data-param="mw"] input[type=range]');
  const before = r.plot.style.getPropertyValue('--at');
  mw.value = '200';
  fire(inst.window, mw, 'input');
  ok(r.plot.style.getPropertyValue('--at') !== before, 'and moves with the reader\'s number');
  eq(stand.querySelector('.needle-label'), null, 'the row it stands on names it, so the words do not print twice');
  eq(errors.join() + lines.errors.join() + inst.errors.join(), '', 'no script errors');
}

// plot.switch: a control that is part of the picture sits over the plot; the key sits under it. Neither is inside the list box.
async function arranged() {
  const { window, document, errors } = await load('#hour', { source: withData('hour-demo', (d) => { d.plot.switch = 'edge'; }) });
  const p = parts(document, 'hour-demo');
  const box = p.root.querySelector('.plate-switch [data-param="edge"]');
  ok(box && !p.root.querySelector('.plate-claim [data-param="edge"]'), 'the control left the claim');
  eq(p.root.querySelector('.plate-switch').nextElementSibling, p.plot, 'for the place above the plot');
  ok(p.root.classList.contains('has-switch') && p.root.classList.contains('has-under'), 'the plate knows');
  ok(!p.plot.contains(box), 'outside the list box');
  pick(window, p.radio('edge', 'dc'));
  ok(window.location.search.includes('edge=dc') && row(p.root, 'chat').querySelector('.ladder-value').textContent.startsWith('3 '), 'and it still drives the plate');
  ok(p.root.querySelector('.plate-under .plate-legend') && !p.root.querySelector('.plate-claim .plate-legend'), 'the key reads under the axis');
  eq(p.root.querySelector('.plate-under').previousElementSibling, p.plot, 'right under it');
  ok(!p.root.querySelector('.plate-under .caption'), 'a ruler that does not redraw keeps its caption in the claim');
  ok(!p.plot.querySelector('.plate-under, .plate-switch'), 'nothing but rows in the list box');
  // data-rows draws part of a plate's rows on another page: the same data, not a second chart.
  const part = await load('#hour', { source: html.replace('data-plate="hour-demo"', 'data-plate="hour-demo" data-rows="video,charge"') });
  const q = parts(part.document, 'hour-demo');
  eq([...q.plot.querySelectorAll('.ladder-row')].map((n) => n.dataset.row).join(), 'video,charge', 'only those rows');
  eq(q.plot.querySelector('[aria-selected="true"]').dataset.row, 'video', 'the first stands for a default that is not among them');
  key(part.window, q.plot, 'End');
  eq(q.plot.querySelector('[aria-selected="true"]').dataset.row, 'charge', 'and the keys know no others');
  // In a panel the claim zone keeps one paragraph; the rest reads under the plate, every word of it. A foot that is only a link stays.
  const kept = '<p class="caption">One boundary at a time, on one log ruler.</p>';
  const prose = html.replace(kept, `${kept}<p>First sentence here. And a second. And a third.</p><p>One sentence alone.</p><p class="caption plate-foot">A foot. Of two sentences. <a href="#x">Its link</a></p><p class="caption plate-foot"> <a href="#y">Only a link</a></p>`);
  ok(prose !== html, 'the fixture holds the paragraph');
  const moved = await load('#hour', { source: prose });
  const m = moved.document.getElementById('hour-demo');
  const claim = () => [...m.querySelectorAll('.plate-claim > p:not(.eyebrow)')].map((n) => n.textContent.trim());
  eq(claim().sort().join('|'), 'Each mark is ten times the last.|One boundary at a time, on one log ruler.|Only a link', 'the claim zone keeps the first paragraph, the axis caption, and the bare link');
  const grid = m.nextElementSibling;
  ok(grid.matches('.disclosure-grid.plate-notes'), 'the rest stands directly under the plate');
  eq(grid.querySelector('details > summary').textContent, 'First sentence here.', 'a summary is the paragraph\'s first sentence');
  eq(grid.querySelector('details > p').textContent, 'And a second. And a third.', 'and the rest of it is behind it');
  eq([...grid.querySelectorAll(':scope > .plate-note')].map((n) => n.textContent).join('|'), 'One sentence alone.|A foot. Of two sentences. Its link', 'a single sentence and a foot line stand as they are');
  ok(grid.querySelector('.plate-note a[href="#x"]'), 'with the link');
  const after = '<!-- /plate:hour-demo -->';
  const beside = await load('#hour', { source: prose.replace(after, `${after}<div class="disclosure-grid" id="own"><details class="disclosure"><summary>Its own.</summary></details></div>`) });
  const own = beside.document.getElementById('own');
  ok(!beside.document.querySelector('#hour .plate-notes'), 'a details grid that follows the plate takes them');
  eq(own.firstElementChild.querySelector('summary').textContent, 'First sentence here.', 'ahead of its own');
  eq(own.lastElementChild.querySelector('summary').textContent, 'Its own.', 'which keep their place');
  const outside = await load('#sessions', { source: html.replace('<section id="hour" class="section panel">', '<section id="hour" class="section">') });
  ok(outside.document.querySelector('#session-energy .plate-claim > p:not([class])'), 'outside a panel nothing moves');
  eq(errors.join() + part.errors.join() + moved.errors.join() + beside.errors.join() + outside.errors.join(), '', 'no script errors');
}

// The readout: the figure, its unit on the baseline, the range under them, in the same words as ever; and a value cell splits the same way.
async function figures() {
  const { window, document, errors } = await load('#hour');
  const p = parts(document, 'hour-demo');
  eq(p.value.textContent, '15', 'the figure');
  eq(p.unit.querySelector('.readout-range').textContent, '(9.3 to 24)', 'the range apart');
  eq(p.unit.querySelector('.readout-u').textContent, 'Wh', 'the unit apart');
  eq(p.unit.textContent, '(9.3 to 24) Wh', 'in the words a reader and a screen reader get');
  await frame();
  eq(p.value.parentElement.style.getPropertyValue('--chars'), '2', 'CSS knows how long the figure is');
  fire(window, row(p.root, 'charge').querySelector('.ladder-label'), 'click');
  eq(p.unit.textContent, 'Wh', 'no range, no range line');
  ok(!p.unit.querySelector('.readout-range'), 'and no empty node');
  const cell = (k) => row(p.root, k).querySelector('.ladder-value');
  eq(cell('charge').querySelector('.ladder-num').textContent, '19', 'a plain figure is large');
  eq(cell('charge').querySelector('.ladder-unit').textContent, 'Wh', 'and its unit small');
  eq(cell('charge').textContent, '19 Wh', 'the same words');
  const inst = await load('#project');
  const site = row(parts(inst.document, 'project-demo').root, 'site').querySelector('.ladder-value');
  eq(site.querySelector('.ladder-num').textContent, '240 to 320', 'a spread is a figure');
  eq(site.textContent, '240 to 320 million liters', 'and reads as one');
  const words = row(parts(inst.document, 'project-demo').root, 'plantwater').querySelector('.ladder-value');
  ok(!words.querySelector('.ladder-num'), 'words stay words');
  eq(errors.join() + inst.errors.join(), '', 'no script errors');
}

// #checklists opens its panel and its first disclosure.
async function checklists() {
  const source = html.replace(/(<section id="spending"[^>]*>)/, '$1<div id="checklists"><details id="first"><summary>One</summary></details><details id="second"><summary>Two</summary></details></div>');
  ok(source !== html, 'the fixture holds the panel');
  const { window, document } = await load('#checklists', { source });
  ok(!document.getElementById('spending').hidden, 'its panel shows');
  ok(document.getElementById('first').open && !document.getElementById('second').open, 'the first disclosure opens, and only that');
  eq(window.scrolled, 'checklists', 'and it is scrolled to');
  const other = await load('#history', { source });
  ok(!other.document.getElementById('first').open, 'another address leaves it closed');
}

// The strip: built from a list a generator writes, so without scripts it is that list.
function stripPage(rows, checked = -7) {
  const day = (offset) => { const n = new Date(); n.setDate(n.getDate() + offset); return [n.getFullYear(), n.getMonth() + 1, n.getDate()].map((v) => String(v).padStart(2, '0')).join('-'); };
  const items = rows.map(([offset, name]) => `<li class="strip-row" data-date="${day(offset)}"><a class="strip-name" href="#${name}">${name}</a><span class="strip-what">What is due</span></li>`).join('');
  return { day, html: `<!doctype html><html><body><main><div class="strip" data-strip data-from="${day(-7)}" data-to="${day(723)}" data-checked="${day(checked)}"><ol class="strip-rows">${items}</ol>
<div class="strip-lane"><h4 class="strip-lane-title">No date in the catalog</h4><ul class="strip-undated"><li><a href="#undated">Undated</a></li></ul></div>
<p class="caption strip-foot">Statuses checked<span data-strip-age></span>; confirm each with the agency.</p></div></main>
<script defer src="/site/assets/js/plate-svg.js"></script><script defer src="/site/assets/js/plate.js"></script></body></html>` };
}
async function strip() {
  const us = (iso) => { const [y, m, d] = iso.split('-'); return `${m}/${d}/${y}`; };
  const page = stripPage([[104, 'later'], [0, 'now'], [36, 'soonish'], [1, 'tomorrow'], [-3, 'gone'], [900, 'far']]);
  const noJs = new JSDOM(page.html).window.document;
  eq(noJs.querySelectorAll('.strip-row a').length, 6, 'without scripts every row is in the list');
  const { window, document, errors } = await open(page.html, 'http://localhost/strip.html');
  const root = document.querySelector('[data-strip]');
  ok(root.classList.contains('is-live'), 'a live strip is marked');
  const rows = [...document.querySelectorAll('.strip-rows .strip-row')];
  eq(rows.map((n) => n.querySelector('a').textContent).join(), 'now,tomorrow,soonish,later', 'soonest first, whatever the order written');
  const days = (n) => n.querySelector('.strip-body').textContent;
  eq(rows[0].querySelector('.strip-n').textContent, 'today', 'zero prints today');
  ok(!rows[0].querySelector('.strip-unit'), 'with no unit');
  eq(`${rows[1].querySelector('.strip-n').textContent} ${rows[1].querySelector('.strip-unit').textContent}`, '1 day', 'one day');
  eq(`${rows[2].querySelector('.strip-n').textContent} ${rows[2].querySelector('.strip-unit').textContent}`, '36 days', 'many');
  ok(days(rows[2]).includes('What is due'), 'the catalog\'s words stay');
  const marks = [...document.querySelectorAll('.strip-track .strip-mark')];
  eq(marks.length, 4, 'one mark for each row on the track');
  eq(marks.filter((n) => n.classList.contains('is-soon')).length, 2, 'inside 14 days it fills orange, and only then');
  ok(rows[0].classList.contains('is-soon') && !rows[2].classList.contains('is-soon'), 'the row knows too');
  const place = (n) => +n.style.getPropertyValue('--t');
  ok(place(rows[0]) < place(rows[1]) && place(rows[1]) < place(rows[3]) && place(rows[3]) < 1, 'rows sit in date order on the track');
  eq(place(marks[0]), place(rows[0]), 'mark and row share a place');
  eq(rows.map((n) => n.style.getPropertyValue('--i')).join(), '3,2,1,0', 'each stem knows how far it runs');
  eq(document.querySelector('.strip .needle .needle-label').textContent, `today, ${us(page.day(0))}`, 'the needle says today');
  ok(Math.abs(+document.querySelector('.strip .needle').style.getPropertyValue('--t') - 7 / 730) < 1e-2, 'at its place');
  eq(document.querySelector('.strip-track').getAttribute('aria-hidden'), 'true', 'the track is drawing; the rows hold the words');
  const months = [...document.querySelectorAll('.strip-months span')].map((n) => n.textContent);
  ok(months.length >= 3 && months.every((m) => /^(01|07)\/\d{4}$/.test(m)), `half-year labels: ${months}`);
  ok(document.querySelectorAll('.strip-track i').length >= 23, 'a tick for every month');
  const lane = [...document.querySelectorAll('.strip-undated li')].map((n) => n.textContent);
  ok(lane.includes('Undated'), 'an undated program stays in the lane');
  ok(lane.includes(`gone passed ${us(page.day(-3))}; confirm with the agency`), `a passed deadline moves there and says what to do: ${lane}`);
  ok(document.querySelector('.strip-undated a[href="#gone"]'), 'with its link');
  eq(document.querySelector('.strip-beyond a').getAttribute('href'), '#far', 'past the track, the cell at the end');
  ok(document.querySelector('.strip-beyond').textContent.startsWith('Beyond two years'), 'says so');
  eq(document.querySelector('.strip-foot').textContent.trim(), 'Statuses checked, 7 days ago; confirm each with the agency.', 'the foot counts its days');
  eq(typeof window.plate.strip, 'function', 'a page may build one late');
  const stale = stripPage([[10, 'x']], -40);
  const old = await open(stale.html, 'http://localhost/strip.html');
  ok(old.document.querySelector('.strip-foot').textContent.startsWith('Stale: Statuses checked, 40 days ago'), 'past 30 days the foot says Stale, in words');
  eq(errors.join() + old.errors.join(), '', 'no script errors');
}

// Tokens: every Energy orange pairing, in both themes, at the numbers that fail silently.
async function contrast() {
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const css = read('site/assets/css/site.css');
  const tokens = read('site/assets/css/tokens.css');
  const token = (name) => new RegExp(`--atni-color-${name}: (#[0-9A-Fa-f]{6})`).exec(tokens)[1];
  const block = (head) => {
    const body = css.slice(css.indexOf(head));
    return (name) => new RegExp(`--energy-${name}: (#[0-9A-Fa-f]{6})`).exec(body)[1];
  };
  const dark = block(':root, [data-theme="dark"] {');
  const light = block('[data-theme="light"] {');
  const auto = block('[data-theme="auto"] {');
  const print = block('@media print {\n  :root, [data-theme] {');
  const grounds = {
    dark: [token('core-black-bg'), token('core-grey-element'), token('core-grey-overlay'), dark('wash')],
    light: [token('core-surface'), token('core-surface-tint'), token('support-tag-neutral-bg'), light('wash')],
  };
  for (const theme of ['dark', 'light']) {
    const t = theme === 'dark' ? dark : light;
    for (const ground of grounds[theme]) {
      ok(ratio(t('text'), ground) >= 4.5, `${theme} --energy-text on ${ground}`);
      ok(ratio(t('hover'), ground) >= 4.5, `${theme} --energy-hover on ${ground}`);
      ok(ratio(t('mark'), ground) >= 3, `${theme} --energy-mark on ${ground}`);
      ok(ratio(t('fill'), ground) >= 3, `${theme} --energy-fill on ${ground}`);
    }
    ok(ratio(t('on-fill'), t('fill')) >= 4.5, `${theme} ink on the fill`);
    ok(ratio(t('on-fill'), t('hover')) >= 4.5, `${theme} ink on the hover`);
  }
  for (const name of ['text', 'mark', 'fill', 'hover', 'wash', 'on-fill']) eq(auto(name), light(name), `auto light repeats --energy-${name}`);
  eq(print('text'), light('text'), 'print text is the light step');
  ok(ratio(print('mark'), light('wash')) >= 3, 'print mark on the wash');
  // The ATNI Climate voice, on the base ground only, as the direction asks before it ships.
  ok(ratio(token('program-red-element'), token('core-black-bg')) >= 3, 'the 2px Climate rule on the dark base');
  ok(ratio(token('program-red-element'), token('core-surface-tint')) >= 3, 'and on the light base');
  ok(ratio(token('core-red-on-dark'), token('core-black-bg')) >= 4.5, 'a Climate link on the dark base');
  ok(ratio(token('core-red-alt'), token('core-surface-tint')) >= 4.5, 'and on the light base');
}

// Rules that only a browser applies, held as text here; scripts/a11y_check.js runs the rest.
async function printAndMotion() {
  const css = read('site/assets/css/site.css');
  ok(/@media \(prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after \{ transition-duration: 0ms !important; animation-duration: 0ms !important;/.test(css), 'reduced motion zeroes every transition and animation');
  ok(/\[role="tabpanel"\]\[hidden\]/.test(css) && /\.plate-view\[hidden\] \{ display: grid !important; \}/.test(css), 'print opens every panel and view');
  ok(/details::details-content \{ display: block;/.test(css), 'print opens every disclosure');
  ok(css.includes('@media screen and (min-width: 1100px) {\n  .plate {'), 'the plate grid and its fixed height are for the screen, so print can never clip a zone');
  ok(/@media print \{\s*\.plate-controls, \.plate-switch,/.test(css), 'a switch stays off paper, as other controls do');
  ok(/@media print \{[^@]*\.plate \{ padding: 12pt; border: 1px solid var\(--rule\); \}/.test(css), 'a plate keeps a frame on paper');
  ok(/@keyframes needle-draw/.test(css) && /\.needle, \.ladder-needle, \.ladder-mark, \.ladder-range, \.ladder-shared \{ transition: left 160ms ease-out, width 160ms ease-out; \}/.test(css), 'the one stroke and the 160ms slide');
}

// The floor and the marks, as text: a size a browser would apply and no check could see. The direction states them; these hold them.
async function tokens() {
  const css = read('site/assets/css/site.css');
  const rule = (selector) => { const at = css.indexOf(`${selector} {`); ok(at >= 0, `${selector} has a rule`); return css.slice(at, css.indexOf('}', at)); };
  ok(rule('.plate').includes('--row-min: 56px') && rule('.plate').includes('--mark: clamp(16px, 1vw + 5px, 26px)'), 'rows and marks at their stated sizes');
  ok(!/--row-min: 32px/.test(css), 'and no smaller row for a mouse');
  ok(css.includes('--poster: clamp(6rem, 2.5rem + 5vw, 8.5rem)') && rule('.readout-value').includes('var(--poster)'), 'the poster readout');
  ok(rule('.ladder-range').includes('height: 8px') && rule('.ladder-range').includes('opacity: 0.4'), 'the range band');
  ok(rule('.ladder-mark.is-hollow').includes('border: 2.5px solid'), 'the hollow ring');
  ok(rule('.plate-title').includes('font-size: 1.5rem') && rule('.ladder-label').includes('font-size: 1.125rem') && rule('.ladder-value').includes('font-size: 1.5rem'), 'the type scale on a plate');
  ok(!/font-size: 0\.75rem/.test(css), 'nothing at 0.75rem');
  const small = css.split('\n').filter((line) => /font-size: 0\.8125rem/.test(line));
  ok(small.length > 0 && small.every((line) => /plate-sources|plate-receipt|plate-quote|plate-table/.test(line)), `0.8125rem survives in Sources and Table alone: ${small.join(' | ')}`);
  ok(!/text-transform: uppercase/.test(css), 'no tracked capitals');
  // High Contrast: the rules moved here from the Explorer's sheet, since every page has tabs and options.
  ok(/@media \(forced-colors: active\) \{[^}]*\.segmented span[^}]*border-bottom-color: Canvas; \}\s*\.segmented input:checked \+ span[^}]*border-bottom-color: Highlight; \}/.test(css), 'High Contrast tells the selected option apart, site-wide');
  ok(!read('site/assets/css/explorer.css').includes('border-bottom-color: Canvas'), 'and once');
}

// One rule for a figure's words, in every place the kit prints one.
async function trailingZero() {
  const { window, document, errors } = await load('#hour', { source: withData('hour-demo', (d) => Object.assign(d.plot, { shared: { word: 'lighter', at: {} } })) });
  const p = parts(document, 'hour-demo');
  pick(window, p.radio('edge', 'dc'));
  eq(row(p.root, 'chat').querySelector('.ladder-value').textContent, '3 (2.4 to 6) Wh', 'a row: 3, not 3.0, and 6, not 6.0');
  eq(p.value.textContent, '3', 'the readout');
  eq(p.plot.querySelector('.ladder-shared').textContent, 'Shared ground, 2.4 to 6 Wh', 'the shared ground');
  ok(p.reading.textContent.includes('(2.4 to 6 against'), `the Reading: ${p.reading.textContent}`);
  ok([...p.root.querySelectorAll('[data-cell]')].every((td) => !/\d\.0(?!\d)/.test(td.textContent)), 'the Table');
  eq(errors.join(), '', 'no script errors');
}

// What leaves the page: a file the reader's own browser writes, from the plate's own data. Nothing is sent anywhere.
function catchFiles(window) {
  window.files = [];
  window.URL.createObjectURL = (blob) => { window.files.push({ blob }); return 'blob:file'; };
  window.URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = function () { window.files.at(-1).name = this.download; };
}
const fileText = (window, { blob }) => new Promise((resolve) => {
  const reader = new window.FileReader();
  reader.onload = () => resolve(reader.result);
  reader.readAsText(blob);
});

async function downloads() {
  const { window, document, errors } = await load('#hour');
  catchFiles(window);
  const p = parts(document, 'hour-demo');
  const actions = p.root.querySelector('.plate-actions');
  ok(actions.contains(p.root.querySelector('[data-csv]')) && actions.contains(p.root.querySelector('[data-print-plate]')) && actions.contains(p.root.querySelector('[data-copy]')), 'beside Copy Reading');
  ok(p.root.querySelector('[data-svg]').hidden, 'no SVG for a plot that is not one');
  const num = p.root.querySelector('[data-param="prompts"] input[type=number]');
  num.value = '30';
  fire(window, num, 'input');
  fire(window, p.root.querySelector('[data-csv]'), 'click');
  const [csv] = window.files;
  ok(/^hour-demo-\d{2}-\d{2}-\d{4}\.csv$/.test(csv.name), `named for the plate and the day: ${csv.name}`);
  const text = await fileText(window, csv);
  const lines = text.replace(/^﻿/, '').trim().split(/\r\n/);
  const heads = [...p.root.querySelectorAll('.plate-table thead th')].map((n) => n.textContent.trim());
  eq(lines[0], [...heads, 'claim_ids', 'status', 'limit'].map((h) => (h.includes(',') ? `"${h}"` : h)).join(','), 'a header first, the view\'s columns and the three of the record');
  eq(lines.length, p.root.querySelectorAll('.plate-table tbody tr').length + 3, 'a line per row, and the two at the foot');
  ok(lines.some((l) => l.includes('21 (9.3 to 24) Wh')), 'at the settings the reader set');
  ok(lines.some((l) => l.includes('"Chat, at the prompts set"') || l.includes('"Chat,')), 'a comma is quoted');
  ok(lines.at(-2).startsWith('settings,') && lines.at(-2).includes('30'), `what it was set to: ${lines.at(-2)}`);
  ok(lines.at(-1).startsWith('checked,'), 'and when its sources were checked');
  const chart = await load('#electricity');
  catchFiles(chart.window);
  const q = parts(chart.document, 'company-electricity');
  const svgOut = q.root.querySelector('[data-svg]');
  ok(!svgOut.hidden, 'a drawn plot can be downloaded as a drawing');
  fire(chart.window, svgOut, 'click');
  ok(/^company-electricity-\d{2}-\d{2}-\d{4}\.svg$/.test(chart.window.files[0].name), 'named for the plate and the day');
  const svgText = await fileText(chart.window, chart.window.files[0]);
  const root = new chart.window.DOMParser().parseFromString(svgText, 'image/svg+xml').documentElement;
  eq(root.namespaceURI, 'http://www.w3.org/2000/svg', 'a file that stands alone');
  eq(root.querySelector('title').textContent, q.root.querySelector('.plate-title').textContent, 'titled with the claim sentence');
  ok(root.querySelector('desc').textContent.startsWith('Settings chosen by the reader') && root.querySelector('desc').textContent.includes('does not decide') && root.querySelector('desc').textContent.includes(Object.keys(JSON.parse(chart.document.getElementById('plate-data-company-electricity').textContent).receipts)[0]), 'with the guard lines and the claim ids');
  eq(root.children[2].tagName, 'rect', 'on its own ground');
  ok(root.getAttribute('width') && root.getAttribute('height'), 'at its size');
  ok(!/\s(aria-[a-z]+|role|data-[a-z-]+|tabindex|class)="/.test(svgText), 'with none of the page\'s roles, names, or classes');
  ok(root.querySelector('.m-hit') === null && !svgText.includes('fill:transparent;'), 'and none of its hit targets');
  ok(/style="[^"]*stroke/.test(svgText), 'each mark keeps its computed style');
  eq(errors.join() + chart.errors.join(), '', 'no script errors');
}

// One plate, one sheet, and Ctrl+P on its own still prints the page.
async function printOne() {
  const { window, document, errors } = await load('#hour');
  const p = parts(document, 'hour-demo');
  const html = document.documentElement;
  const title = p.root.querySelector('.plate-title');
  const before = title.textContent;
  const seen = [];
  window.print = () => seen.push({ attr: html.dataset.printOne, on: p.root.classList.contains('is-print-one'), head: p.root.querySelector('.plate-print-head')?.textContent, foot: p.root.querySelector('.plate-print-foot')?.textContent, title: title.textContent });
  ok(!html.dataset.printOne, 'nothing is marked before the press');
  const press = p.root.querySelector('[data-print-plate]');
  fire(window, press, 'click');
  eq(seen[0].attr, 'hour-demo', 'the press names the plate on the root');
  ok(seen[0].on, 'and marks it');
  ok(seen[0].head.includes('Settings chosen by the reader') && seen[0].foot === 'This comparison does not decide a proposal.', 'it carries the guard lines');
  eq(seen[0].title, before, 'at the defaults the title is the finding');
  window.dispatchEvent(new window.Event('afterprint'));
  ok(!html.dataset.printOne && !p.root.classList.contains('is-print-one') && !p.root.querySelector('.plate-print-head, .plate-print-foot'), 'and all of it goes when the dialog closes');
  const num = p.root.querySelector('[data-param="prompts"] input[type=number]');
  num.value = '30';
  fire(window, num, 'input');
  fire(window, press, 'click');
  ok(seen[1].title !== before && p.reading.textContent.startsWith(seen[1].title), `moved off the defaults, the title is the Reading's first sentence: ${seen[1].title}`);
  window.dispatchEvent(new window.Event('afterprint'));
  eq(title.textContent, before, 'and the page gets its own back');
  const css = read('site/assets/css/site.css');
  ok(css.includes('html[data-print-one] main *:not(:has(.is-print-one), .is-print-one, .is-print-one *)'), 'print shows that plate and nothing else in the page');
  ok(/\.is-print-one \.plate-sources li > p:nth-of-type[^}]*\.plate-quote[^}]*display: none/.test(css), 'its Sources drop the quotes, which stay on the site');
  eq(errors.join(), '', 'no script errors');
}

// A plate page keeps its settings in the address and says so; the briefing keeps nothing there.
async function address() {
  const typed = (doc) => doc.querySelector('#session-energy input[type=number]');
  const plain = await load('#hour');
  ok(plain.document.querySelector('#session-energy .plate-link-note').textContent.includes('private figures'), 'a plate with a typed control says what its link carries');
  ok(!plain.document.querySelector('#company-electricity .plate-link-note'), 'one with none has nothing to say');
  const source = html.replace(/<html\b/, '<html data-address="none"');
  ok(source !== html, 'the fixture takes the flag');
  const { window, document, errors } = await load('?boundary=full&use=5&session-energy=video', { source });
  const p = parts(document, 'session-energy');
  eq(p.radio('boundary', 'full').checked, true, 'a link may still name a stop');
  eq(typed(document).value, '1', 'but not a typed figure');
  eq(row(p.root, 'video').getAttribute('aria-selected'), 'true', 'and may name a row');
  const before = window.location.href;
  key(window, p.plot, 'ArrowDown');
  const range = p.root.querySelector('input[type=range]');
  range.value = '20';
  fire(window, range, 'input');
  eq(window.location.href, before, 'nothing the reader sets reaches the address');
  ok(p.reading.textContent.startsWith(p.root.querySelector('.plate-title').textContent), 'the title follows the settings, since this page is the document');
  ok(!document.querySelector('.plate-link-note'), 'and no sentence warns of a link there is not');
  const r = window.plate.read('session-energy');
  eq(r.state.use, 20, 'a page can read a plate\'s state');
  ok(r.changed && r.settings.some((s) => s.name === 'use' && s.word === 20 && s.changed), 'and which settings moved');
  ok(p.root.querySelector('.plate-title').textContent === r.title, 'the title it reads is the one printed');
  fire(window, p.root.querySelector('[data-copy]'), 'click');
  await wait(20);
  ok(!/https?:|localhost/.test(window.clip), `Copy Reading carries no link: ${window.clip.slice(0, 80)}`);
  eq(p.status.textContent, 'Copied with its sources.', 'and says so');
  window.plate.reset('session-energy');
  ok(!window.plate.read('session-energy').changed, 'a page can put a plate back');
  eq(window.location.href, before, 'still with nothing in the address');
  eq(errors.join() + plain.errors.join(), '', 'no script errors');
}

module.exports = { groups: { tabs, ladder, preview, live, copy, query, svgPlots, untrusted, api, noScripts, instrument, matrix, count: countView, band, panels, rulers, pair, jobs, points, fit, zones, detailViews, ghosts, fitData, sharedGround, needleLabel, arranged, figures, checklists, strip, contrast, printAndMotion, tokens, trailingZero, downloads, printOne, address } };
