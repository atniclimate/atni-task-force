// The Explorer with its real data: every one of Python's 300 cases through the page's controls, then tabs, keyboard, selection, the Settings drawer, Your Use,
// the office builder, the honesty rules, the self-check, and the page without scripts and in print. The disclaimer and the honesty sentences stay exact.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { JSDOM, ROOT, count, ok, eq, wait, read, fixture, open, fire, key } = require('./lib');

const PAGE = 'http://localhost/site/explorer/index.html';
const html = read('site/explorer/index.html');
const oracle = JSON.parse(fixture('work/site-refresh/tmp/explorer-oracle.json', 'Rebuild it with python scripts/resource_model.py --export.'));
const near = (a, b, message) => { count(); assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1e-6, Math.abs(b)) + 1e-12, `${message}: ${a} against ${b}`); };

async function load(query = '', source = html) {
  const page = await open(source, `${PAGE}${query}`, (window) => {
    window.innerWidth = 1440;
    window.innerHeight = 900;
    window.Element.prototype.scrollIntoView = function () { window.scrolled = this.id; };
    window.URL.createObjectURL = (blob) => { window.lastBlob = blob; return 'blob:x'; };
    window.navigator.clipboard = { writeText: async (t) => { window.copied = t; } };
  });
  await wait();
  eq(page.errors.length, 0, `page errors: ${page.errors.slice(0, 3).join(' | ')}`);
  return page;
}

const text = (node) => node.textContent.replace(/\s+/g, ' ').trim();
const setRadio = (window, node) => { node.checked = true; fire(window, node, 'input'); };
const setField = (window, node, v) => { node.value = String(v); fire(window, node, 'input'); };
const setting = (document, name, v) => document.querySelector(`#settings input[data-setting="${name}"][value="${v}"]`);
const measure = (document, tab, v) => document.querySelector(`input[name="m-${tab}"][value="${v}"]`);
const row = (document, k) => document.querySelector(`.plate-plot [data-row="${k}"]`);
// Two printed figures agree when their words match and each number is within one unit of its last printed place: Python rounds at 12 digits, so a boundary can tip.
const NUM = /\$?[\d,]*\.?\d+/g;
const ulp = (s) => { const t = s.replace(/[$,]/g, ''); return t.includes('.') ? 10 ** -t.split('.')[1].length : 10 ** (t.length - t.replace(/0+$/, '').length); };
const sameRounded = (shown, want, message) => {
  count(1);
  const a = shown.match(NUM) || [];
  const b = want.match(NUM) || [];
  const ok_ = shown.replace(NUM, '#') === want.replace(NUM, '#') && a.length === b.length && a.every((x, i) => Math.abs(+x.replace(/[$,]/g, '') - +b[i].replace(/[$,]/g, '')) <= 1.0001 * Math.max(ulp(x), ulp(b[i])));
  assert.ok(ok_, `${message}: ${shown} against ${want}`);
};

// Bytes and rules on the shipped files ---------------------------------------------------------------
function staticRules() {
  const js = read('site/assets/js/explorer.js');
  const model = read('site/assets/js/resource-model.js');
  ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function|\bfetch\(/.test(js + model), 'the scripts write text only and fetch nothing');
  ok(!/https?:\/\//.test(js + model), 'no address in the scripts');
  ok(!/XMLHttpRequest|sendBeacon|WebSocket|new Image\b|localStorage|sessionStorage|document\.cookie/.test(js + model), 'nothing a reader enters leaves the browser or stays behind, as the home band says');
  ok(!/\bdocument\.|\blocation\.|\bhistory\.|\bnavigator\.|\blocalStorage\b|\bsetTimeout\b/.test(model), 'the model uses no page');
  ok(!/\bcompute\(|\bidleMult\b|\btokensWh\b/.test(js), 'the page holds no model');
  const pure = require(path.join(ROOT, 'site/assets/js/resource-model.js'));
  ok(typeof pure.compute === 'function' && typeof pure.Views === 'function' && typeof pure.Run === 'function', 'node loads the model the page loads');
  const scale = pure.projectScale(100, 1, 0.36, 350, 2000000); // Python's self-test: project_scale
  near(scale.mwh, 876000, 'project scale, MWh');
  near(scale.water, 315360000, 'project scale, liters');
  near(scale.co2, 306600, 'project scale, tonnes');
  near(scale.share, 0.438, 'project scale, share');
  eq(pure.projectScale(null, 1, 0.36, 350, 2000000).water, null, 'a blank in leaves its outputs blank');
  ok(!/https?:\/\/[^"']*\.(js|css|woff2?)/.test(html.replace(/<li id="src-[\s\S]*?<\/li>/g, '')), 'no external script, stylesheet, or font');
  ok(!/<iframe|<script[^>]+src="http|<link(?![^>]+rel="canonical")[^>]+href="http/.test(html), 'no outside load'); // a canonical link names this page and loads nothing
  ok(!/\u2014| -- /.test(html) && !/\u2014| -- /.test(js + model), 'no em dash');
  const css = read('site/assets/css/explorer.css');
  ok(/@media print/.test(css) && /\[data-group\]\[hidden\]/.test(css), 'print opens every comparison');
  ok(/@media print[\s\S]*\.x-backtest table, \.plate-table \{ min-width: 0; \}/.test(css), 'and no table keeps a screen width on paper');
  ok(/@media \(prefers-reduced-motion: reduce\) \{\s*\.w,/.test(css), 'explorer.css has its own reduced-motion guard');
  ok(/prefers-reduced-motion/.test(read('site/assets/css/site.css')), 'reduced motion takes transitions to zero');
  const site = read('site/assets/css/site.css');
  ok(/\[role="tabpanel"\]\[hidden\]/.test(site), 'print shows every panel');
  const sizes = {};
  for (const rel of ['site/explorer/index.html', 'site/assets/js/explorer.js', 'site/assets/js/resource-model.js', 'site/assets/css/explorer.css']) {
    const raw = fs.readFileSync(path.join(ROOT, rel));
    sizes[rel] = [raw.length, zlib.gzipSync(raw, { level: 9 }).length];
  }
  console.log(JSON.stringify({ sizes }));
}

// The page without scripts ---------------------------------------------------------------------------
function noScript() {
  const { window } = new JSDOM(html);
  const { document } = window;
  const panels = ['your-use', 'not-the-building', 'where-it-runs', 'architectures', 'levers', 'crossovers', 'catalog', 'project-scale', 'method'];
  for (const id of panels) {
    const panel = document.getElementById(id);
    ok(panel && !panel.hidden && !panel.closest('[hidden]'), `panel ${id} shows without scripts`);
    ok(text(panel).length > 200, `panel ${id} has content without scripts`);
  }
  eq([...document.querySelectorAll('.section-strip a')].map((a) => a.getAttribute('href').slice(1)).join(), panels.join(), 'the tabs follow the spec\'s nine, in order');
  eq([...document.querySelectorAll('section.panel')].map((n) => n.id).join(), panels.join(), 'and so do the panels');
  ok(/Modeled estimates, not measurements\. Ranges are spreads, not confidence intervals\./.test(text(document.querySelector('.x-band'))), 'disclaimer band');
  ok(/It is not an econometric model/.test(text(document.getElementById('method'))), 'the disclaimer is verbatim');
  // Owner rulings of 11/04/2026.
  ok(/bottom-up process model, checked against published figures/.test(text(document.querySelector('.x-band'))) && /bottom-up process model, checked against published figures/.test(text(document.getElementById('method'))), 'the model is named as the owner ruled, on every tab and in Method');
  for (const r of document.querySelectorAll('.plate-plot [data-row]')) if (/hydro/i.test(text(r.querySelector('.ladder-label')))) ok(/scenario/i.test(text(r.querySelector('.ladder-label'))), `${r.dataset.row} is labeled a scenario`);
  for (const k of ['arch.A.local_hydro', 'arch.D.node_100k_hydro', 'arch.D.node_1m_hydro']) ok(row(document, k).hidden, `${k} is not in the main comparison`);
  for (const q of document.querySelectorAll('.x-pairs li > span:first-child')) if (/hydro/.test(text(q))) ok(/scenario/.test(text(q)), `a hydro pair says scenario: ${text(q)}`);
  ok(/declared clean feed, a scenario/.test(text(document.querySelector('.x-arch-words[data-group="comparison:A"]'))), 'the office row\'s clean feed says scenario');
  const admin = text(document.querySelector('.x-admin-note'));
  ok(/2 paid hours a month/.test(admin) && /flips by 14/.test(admin) && /tie at about 3\.1 hours/.test(admin), 'the two admin hours print beside the flip point');
  ok(!/Potawatomi|Data Holdings/.test(html), 'the facility is anonymized');
  ok(/one self-reports a power usage effectiveness \(PUE\) of 1\.28 in its public sustainability report/.test(text(document.getElementById('where-it-runs'))), 'and its figure attributed to its public source');
  ok(/Partly verified\. Limit: One operator/.test(text(document.getElementById('src-lf-059'))) && /sustainability report/i.test(text(document.getElementById('src-lf-059'))), 'with its receipt, status, and limit');
  ok(document.querySelectorAll('[data-row]').length > 80, 'rows print');
  for (const r of document.querySelectorAll('.plate-plot [data-row]')) ok(text(r.querySelector('.ladder-value')).length > 0, `${r.dataset.row} shows a value without scripts`);
  ok(document.querySelectorAll('.wall-row .w:not([hidden])').length > 40, 'the Wall is drawn without scripts');
  ok(document.querySelector('#your-use .wall-track .w-rou:not([hidden])'), 'the router sits left of the wall');
  ok(document.querySelectorAll('tr[data-tr]').length > 80, 'tables hold every row');
  ok(document.getElementById('settings') && !document.getElementById('settings').hidden, 'settings read as a list');
  ok(document.querySelectorAll('#settings input[data-setting]').length >= 60, 'every option prints');
  ok(document.querySelectorAll('.x-sources > li').length > 80, 'receipts print');
  for (const a of document.querySelectorAll('a[href^="#src-"]')) ok(document.getElementById(a.getAttribute('href').slice(1)), `receipt for ${a.getAttribute('href')}`);
  ok(document.querySelectorAll('.x-waffle').length === 4, 'all four waffles print');
  ok(document.querySelectorAll('.x-place').length === 5, 'the place strip prints');
  ok(/7 hours/.test(text(row(document, 'use.screen'))), 'the screen row');
  ok(/coding hour/.test(text(document.querySelector('[data-title="use"]'))), 'the claim sentence is poured');
  for (const n of document.querySelectorAll('main [data-m]')) ok(text(n) !== 'x' && text(n) !== '', `poured ${n.dataset.m}`);
  for (const q of document.querySelectorAll('.x-sources > li')) {
    const hasStatus = /Partly verified\. Limit: \S|Verified against the source\./.test(text(q));
    ok(hasStatus, `${q.id} states its status and any limit`);
  }
  ok(!/\bFor scale\b/.test(text(document.getElementById('project-scale'))), 'project scale prints no example');
  ok(document.querySelectorAll('#project-scale input[value]:not([value=""])').length === 0, 'project scale has no defaults');
}

// Python's 300 cases through the real controls --------------------------------------------------------
async function cases() {
  const { window, document } = await load();
  const ex = window.explorer;
  const V = ex.view;
  const S = ex.state;
  const catalogKeys = [...document.querySelectorAll('#catalog tr[data-tr]')].map((n) => n.dataset.tr);
  let dom = 0;
  const before = count(0);
  const t0 = Date.now();
  // ORACLE_LIMIT runs the first few cases while working; the check of record runs them all.
  for (const [i, c] of oracle.cases.slice(0, +process.env.ORACLE_LIMIT || undefined).entries()) {
    const name = Object.keys(c.settings)[i % 21];
    Object.assign(S.settings, c.settings);
    Object.assign(S.fields, Object.fromEntries(Object.entries(c.fields).filter(([k]) => k !== 'mode' && k !== 'seats')));
    S.mode = c.fields.mode;
    S.seats = c.fields.seats;
    S.m = ['wh', 'g', 'ml', 'usd'][i % 4];
    // The last control goes through the page, so the whole refresh runs as it does for a reader.
    setRadio(window, setting(document, name, c.settings[name]));
    const flat = ex.flatten(V.t);
    for (const [k, v] of Object.entries(c.tree)) near(flat[k], v, `case ${i} ${k}`);
    eq(Object.keys(flat).length, Object.keys(c.tree).length, `case ${i} tree size`);
    for (const k of catalogKeys) {
      const tr = document.querySelector(`#catalog tr[data-tr="${k}"]`);
      for (const m of ['wh', 'g']) {
        const want = ex.words(ex.figure(c.tree[`${k}.${m}`], ...(c.ranges[`${k}.${m}`] || [null, null]), m));
        sameRounded(text(tr.querySelector(`[data-c="${m}"]`)), want, `case ${i} ${k} ${m} cell`);
        dom += 1;
      }
      const usdWant = c.tree[`${k}.usd`];
      if (usdWant !== undefined) sameRounded(text(tr.querySelector('[data-c="usd"]')).split(',')[0].split(' ')[0], ex.figure(usdWant, null, null, 'usd').num.split(',')[0], `case ${i} ${k} price cell`);
      if (c.tree[`${k}.ml`] === undefined) ok(/no figure/.test(text(tr.querySelector('[data-c="ml"]'))), `case ${i} ${k} no water figure`);
    }
    for (const [k, [lo, hi]] of Object.entries(c.ranges)) {
      const parts = k.split('.');
      const [a, b] = V.run.spread(`oracle:${k}`, (t) => V.at(t, parts.join('.')));
      near(a, lo, `case ${i} low ${k}`);
      near(b, hi, `case ${i} high ${k}`);
    }
    for (const [k, names] of Object.entries(c.drivers)) {
      const mine = V.run.drivers((t) => V.at(t, k)).slice(0, 3).map((e) => e.name);
      eq(mine.join(), names.join(), `case ${i} drivers ${k}`);
    }
    for (const [k, [value, low, high, never]] of Object.entries(c.crossovers)) {
      const x = V.run.crossover(k);
      for (const [mine, want] of [[x.value, value], [x.low, low], [x.high, high]]) { if (want === null) eq(mine, null, `case ${i} crossover ${k}`); else near(mine, want, `case ${i} crossover ${k}`); }
      eq(x.never.length, never, `case ${i} crossover ${k} never`);
      eq(text(document.querySelector(`tr[data-tr="cross.${k}"] [data-c="count"]`)), ex.words(V.crossWords(x, k.startsWith('views') ? 'views a year' : 'prompts a year')), `case ${i} crossover ${k} cell`);
    }
    // Your Use: Python's formulas, written apart from the page's code, by layer.
    for (const [k, r] of Object.entries(c.your_use)) {
      for (const tag of ['dev', 'rou', 'net', 'dc']) {
        if (!r[tag]) continue;
        for (const m of ['wh', 'g']) near(V.parts(`use.${k}`, m)[tag], r[tag][m], `case ${i} your use ${k} ${tag} ${m}`);
        if (r[tag].ml !== null && V.at(V.t, `use.${k}`).by[tag]) near(V.parts(`use.${k}`, 'ml')[tag], r[tag].ml, `case ${i} your use ${k} ${tag} ml`);
      }
      if (r.usd !== undefined) near(V.val(`use.${k}`, 'usd'), r.usd, `case ${i} your use ${k} price`);
    }
    if (S.m === 'wh') {
      const w = V.week();
      const f = V.rowCell('use.chat', 'wh', V.boardScale('use', 'wh'));
      const off = row(document, 'use.chat').querySelector('.wall-range:not([hidden]).is-off') ? 'runs off this ruler' : '';
      eq(text(row(document, 'use.chat').querySelector('.ladder-value')), [f.num, f.unit, f.tag, off].filter(Boolean).join(' '), `case ${i} chat row`);
      ok(text(document.querySelector('[data-title="use"]')).includes(ex.plainFig(w.screen, 'wh')), `case ${i} the title refills`);
    }
  }
  console.log(JSON.stringify({ oracle_checks: count(0) - before, oracle_cases: oracle.cases.length, table_cells_read: dom, ms: Date.now() - t0 }));
}

// Tabs, keyboard, selection, drawer, and the rest -------------------------------------------------------
async function behavior() {
  const { window, document } = await load();
  const ex = window.explorer;
  // Static and live agree at the defaults.
  const still = new JSDOM(html).window.document;
  for (const r of document.querySelectorAll('.plate-plot [data-row]')) {
    if (r.hidden) continue;
    eq(text(r.querySelector('.ladder-value')), text(still.querySelector(`[data-row="${r.dataset.row}"] .ladder-value`)), `static and live ${r.dataset.row}`);
    eq(text(r.querySelector('.ladder-label')), text(still.querySelector(`[data-row="${r.dataset.row}"] .ladder-label`)), `static and live label ${r.dataset.row}`);
  }
  for (const tr of document.querySelectorAll('tr[data-tr]')) {
    if (tr.hidden) continue;
    const other = still.querySelector(`tr[data-tr="${tr.dataset.tr}"]`);
    for (const td of tr.querySelectorAll('[data-c]')) eq(text(td), text(other.querySelector(`[data-c="${td.dataset.c}"]`)), `static and live table ${tr.dataset.tr} ${td.dataset.c}`);
  }
  eq(text(document.querySelector('[data-title="use"]')), text(still.querySelector('[data-title="use"]')), 'static and live title');
  for (const n of ['value', 'unit', 'qual', 'price', 'co2', 'reading', 'spread', 'moves']) eq(text(document.querySelector(`[data-plate-x="use"] [data-d="${n}"]`)), text(still.querySelector(`[data-plate-x="use"] [data-d="${n}"]`)), `static and live detail ${n}`);
  for (const plate of ['where', 'arch', 'catalog', 'lever', 'cross']) for (const n of ['value', 'unit', 'qual', 'reading']) eq(text(document.querySelector(`[data-plate-x="${plate}"] [data-d="${n}"]`)), text(still.querySelector(`[data-plate-x="${plate}"] [data-d="${n}"]`)), `static and live readout ${plate} ${n}`);

  // Critique 1: the page opens on the screen row, the unit beside the figure, and no undefined anywhere.
  ok(row(document, 'use.screen').classList.contains('is-on'), 'the screen and router row is selected on load');
  eq(text(document.querySelector('[data-plate-x="use"] [data-d="unit"]')), 'Wh', 'the unit sits beside the figure');
  ok(/^in the week, \S+ to \S+$/.test(text(document.querySelector('[data-plate-x="use"] [data-d="qual"]'))), 'the qualifier sits under it');
  ok(!/\bundefined\b|\bNaN\b/.test(text(document.body)) && !/\bundefined\b|\bNaN\b/.test(text(still.body)), 'no undefined or NaN on the page, live or static');
  ok(/basin/.test(ex.view.basin('fixed')), 'the hyperscale row names its basin');
  ok(!document.querySelector('.wall-row .wall-track[style]') && !document.querySelector('.wall-row[style*="--lo"]'), 'no wash runs the height of a wall row');
  const screenRange = row(document, 'use.screen').querySelector('.wall-range');
  const needleAt = parseFloat(row(document, 'use.screen').querySelector('.wall-needle').style.left);
  ok(!screenRange.hidden && parseFloat(screenRange.style.left) <= needleAt && needleAt <= parseFloat(screenRange.style.left) + parseFloat(screenRange.style.width), 'a row on the reader\'s side keeps its needle inside its spread');
  ok(/runs off this ruler/.test(text(row(document, 'use.screen').querySelector('.ladder-value'))) && screenRange.classList.contains('is-off-left'), 'a spread past the left edge says so, with its left end open');
  ok(![...document.querySelectorAll('.wall-axis span')].some((n) => /^0( |$)/.test(text(n))), 'the wall itself is the zero');
  ok(/ Wh$/.test([...document.querySelectorAll('[data-board="use"] .wall-axis span')].reduce((a, b) => (+b.style.getPropertyValue('--x') > +a.style.getPropertyValue('--x') ? b : a)).textContent), 'the far tick carries the unit');
  ok(/side/i.test(text(document.querySelector('[data-board="use"] .wall-sides > span:first-child'))), 'the left head');
  eq(ex.num(0.0008), '0.0008', 'no trailing zero below 1');
  eq(ex.usd(0.04), '$0.04', 'in dollars too');
  eq(ex.usd(0.2), '$0.20', 'and money keeps its cents');
  eq(ex.usd(0.004), '$0.004', 'below a cent it shows what it has');
  eq(ex.usd(0), '$0', 'and nothing is nothing');
  eq(ex.num(3), '3.0', 'two figures at 1 and above');
  eq(ex.num(0.996), '1.0', 'a figure that rounds up to 1 keeps two figures');

  // Tabs.
  const strip = document.querySelector('.section-strip');
  const tabs = [...strip.querySelectorAll('[role="tab"]')];
  eq(tabs.length, 9, 'nine tabs');
  eq(strip.querySelector('[role="tablist"]') !== null, true, 'a tab list');
  eq(tabs[0].getAttribute('aria-selected'), 'true', 'Your Use leads');
  ok(!document.getElementById('your-use').hidden && document.getElementById('method').hidden, 'one panel at a time');
  key(window, tabs[0], 'ArrowRight');
  ok(!document.getElementById('not-the-building').hidden && document.getElementById('your-use').hidden, 'arrow moves the tab');
  eq(document.activeElement, tabs[1], 'focus follows');
  key(window, tabs[1], 'End');
  ok(!document.getElementById('method').hidden, 'End');
  key(window, tabs[8], 'Home');
  ok(!document.getElementById('your-use').hidden, 'Home');
  fire(window, tabs[3], 'click');
  eq(window.location.hash, '#architectures', 'the hash follows');
  fire(window, tabs[0], 'click');
  ok(document.querySelector('.x-band').closest('[role="tabpanel"]') === null, 'the band stays on every tab');

  // The Wall: one stop, arrows select, the detail follows.
  const plot = document.querySelector('[data-plate-x="use"] .plate-plot');
  eq(plot.getAttribute('tabindex'), '0', 'the Wall is one stop');
  eq(plot.getAttribute('role'), 'listbox', 'the Wall is a list box');
  eq(plot.getAttribute('aria-activedescendant'), row(document, 'use.screen').id, 'the selected row is announced');
  key(window, plot, 'ArrowDown');
  ok(row(document, 'use.chat').classList.contains('is-on'), 'arrow selects');
  eq(window.scrolled, row(document, 'use.chat').id, 'and the row it reaches comes into view');
  key(window, plot, 'ArrowDown');
  ok(row(document, 'use.coding').classList.contains('is-on'), 'and again');
  eq(row(document, 'use.coding').getAttribute('aria-selected'), 'true', 'aria-selected');
  ok(/coding, 1 hour/.test(text(document.querySelector('[data-plate-x="use"] [data-d="reading"]'))), 'the Reading follows');
  ok(/Modeled, not measured/.test(text(document.querySelector('[data-plate-x="use"] [data-d="reading"]'))), 'the Reading says modeled');
  ok(document.querySelector('[data-plate-x="use"] [data-d="note"] .receipt'), 'receipts reach the detail');
  ok(text(document.querySelector('[data-plate-x="use"] [data-d="moves"]')).length > 0, 'what moves it most');
  ok(!document.querySelector('[data-plate-x="use"] [data-d="tokens"]').hidden, 'AI rows read per million tokens');
  ok(/No vetted standard/.test(text(document.querySelector('[data-plate-x="use"] [data-d="tokens"]'))), 'the token warning prints');
  key(window, plot, 'End');
  ok(row(document, 'use.gb').classList.contains('is-on'), 'End stops at the last row shown');
  key(window, plot, 'Home');
  ok(row(document, 'use.screen').classList.contains('is-on'), 'Home');
  ok(document.querySelector('[data-plate-x="use"] [data-d="tokens"]').hidden, 'the screen row reads no tokens');
  fire(window, row(document, 'use.streaming'), 'click');
  ok(row(document, 'use.streaming').classList.contains('is-on'), 'click selects');
  eq(window.location.search, '', 'a selection stays off the address');
  fire(window, row(document, 'use.coding'), 'pointerover');
  ok(/coding/.test(text(document.querySelector('[data-plate-x="use"] [data-d="reading"]'))), 'hover previews');
  fire(window, plot, 'pointerleave');
  ok(/Streaming, 1 hour \(phone\)/.test(text(document.querySelector('[data-plate-x="use"] [data-d="reading"]'))), 'leaving returns to the selection');
  ok(/Instagram or TikTok/.test(text(document.getElementById('f-social').closest('.x-field'))) && /Netflix or YouTube/.test(text(document.getElementById('f-streaming').closest('.x-field'))), 'the fields name the platforms');
  const chip = document.querySelector('[data-plate-x="use"] [data-d="note"] .receipt');
  fire(window, chip, 'click');
  const receipt = document.querySelector('[data-plate-x="use"] [data-d="receipt"]');
  ok(!receipt.hidden && /(Verified against the source|Partly verified)/.test(text(receipt)), 'a chip opens its receipt in place');
  key(window, plot, 'Escape');
  ok(receipt.hidden, 'Escape closes it');

  // Views.
  const views = document.querySelectorAll('[data-plate-x="use"] .plate-views input');
  views[2].checked = true;
  fire(window, views[2], 'change');
  ok(!document.querySelector('[data-plate-x="use"] .plate-view[data-view="table"]').hidden && document.querySelector('[data-plate-x="use"] .plate-view[data-view="reading"]').hidden, 'Table view');
  views[1].checked = true;
  fire(window, views[1], 'change');
  ok(document.querySelectorAll('[data-plate-x="use"] [data-d="sources"] li').length > 0, 'Sources view lists the row\'s sources');
  views[0].checked = true;
  fire(window, views[0], 'change');

  // The drawer.
  const opener = document.querySelector('[data-plate-x="use"] [data-open-settings]');
  const drawer = document.getElementById('settings');
  ok(drawer.hidden, 'the drawer starts closed');
  opener.focus();
  fire(window, opener, 'click');
  ok(!drawer.hidden, 'Change opens the drawer');
  ok(document.documentElement.classList.contains('has-drawer'), 'and the plates compress beside it');
  eq(document.activeElement, drawer, 'focus moves in');
  setRadio(window, setting(document, 'device', 'laptop'));
  ok(!drawer.hidden, 'a setting keeps the drawer open');
  ok(/device=laptop/.test(window.location.search), 'settings live in the query string');
  ok(/^Laptop, Wi-Fi/.test(text(document.querySelector('[data-setting-line]'))), 'the setting line follows');
  ok(/laptop/.test(text(row(document, 'catalog.video_hour').querySelector('.ladder-label'))), 'row labels follow the device');
  key(window, drawer, 'Escape');
  ok(drawer.hidden, 'Escape closes');
  ok(!document.documentElement.classList.contains('has-drawer'), 'the plates take the width back');
  eq(document.activeElement, opener, 'focus returns to the link');
  for (const b of document.querySelectorAll('[data-open-settings]')) ok(b, 'every plate reaches Settings');
  ok(document.querySelectorAll('[data-plate-x] [data-open-settings]').length >= 6, 'a Change link on every model plate');
  setRadio(window, setting(document, 'device', 'phone'));

  // Every option of every setting moves through the page without error, and what it changes reaches a row.
  for (const n of document.querySelectorAll('#settings input[data-setting]')) setRadio(window, n);
  for (const name of Object.keys(ex.data.sel)) setRadio(window, setting(document, name, ex.data.sel[name].def));
  eq(window.location.search, '', 'defaults leave the address');

  // Your Use: fields, time counted once, three price lines, water by basin.
  const screen = row(document, 'use.screen');
  ok(!screen.querySelector('.w-rou').hidden && !screen.querySelector('.w-dev').hidden, 'router and device on the screen row');
  for (const k of ['chat', 'coding', 'images', 'streaming']) ok(row(document, `use.${k}`).querySelector('.w-rou').hidden && row(document, `use.${k}`).querySelector('.w-dev').hidden, `no device or router on ${k}: time is counted once`);
  const hours = document.querySelector('input[data-field="screen"]');
  setField(window, hours, 14);
  ok(/14 hours/.test(text(screen)), 'the screen row counts');
  ok(/14 screen hours/.test(text(document.querySelector('[data-title="use"]'))), 'the claim sentence refills');
  eq(window.location.search, '', 'a typed number stays off the address');
  setField(window, hours, -3);
  eq(hours.getAttribute('aria-invalid'), 'true', 'a bad field says so');
  ok(/zero/.test(text(document.querySelector('[data-why]'))), 'and how to fix it');
  ok(/14 hours/.test(text(screen)), 'the Wall keeps the last good value');
  fire(window, hours, 'change');
  eq(hours.value, '14', 'the field returns to it');
  setField(window, hours, 7);
  const prompts = document.querySelector('input[data-field="chat"]');
  fire(window, prompts, 'focusin');
  ok(text(document.querySelector('[data-why]')).length > 20, 'a why on focus');
  setField(window, prompts, 20);
  const chatWh = ex.view.val('use.chat', 'wh');
  setField(window, prompts, 10);
  near(chatWh, 2 * ex.view.val('use.chat', 'wh'), 'twice the prompts, twice the row');
  near(ex.view.val('use.chat', 'wh'), ex.view.t.same_hour.chat.activity_added, 'at the defaults a row equals the model\'s activity term');
  near(ex.view.val('use.coding', 'wh'), ex.view.t.catalog.coding_hour.wh - ex.view.t.catalog.coding_hour.layers.router - ex.view.t.catalog.coding_hour.layers.device, 'the coding row is the hour less the screen and router');
  const week = document.querySelector('[data-d="week"]');
  ok(/At API list/.test(text(week)) && /revenue, not a cost/.test(text(week)), 'price in lines by basis');
  ok(!/total/i.test(text(week)), 'no total in the week');
  ok(document.querySelector('[data-w="seat"]').parentElement.hidden, 'no seat line for one person');

  // The office builder.
  const office = document.querySelector('input[data-opt="mode"][value="office"]');
  setRadio(window, office);
  ok(!row(document, 'use.seat').hidden, 'Office adds the seat row');
  ok(!document.querySelector('[data-field="seats"]').closest('[data-office]').hidden, 'and the seats field');
  ok(/50 seats/.test(text(document.querySelector('[data-title="use"]'))), 'the sentence names the seats');
  near(ex.view.val('use.chat', 'wh'), 50 * ex.view.t.same_hour.chat.activity_added, 'seats multiply');
  const seats = document.querySelector('input[data-field="seats"]');
  setField(window, seats, 10);
  near(ex.view.val('use.chat', 'wh'), 10 * ex.view.t.same_hour.chat.activity_added, 'the seats field reaches every row');
  ok(!document.querySelector('[data-w="seat"]').parentElement.hidden, 'the seat and storage line prints');
  ok(/illustrative/.test(text(row(document, 'use.seat').querySelector('.ladder-label'))), 'the seat row is illustrative');
  eq(ex.state.fields.gb, ex.data.inputs.seat_gb[0], 'storage takes the model\'s seat default');
  ok(row(document, 'use.gb').classList.contains('is-beside') && /printed beside, not added/.test(text(row(document, 'use.gb'))), 'storage prints beside the seats, not added: the seat figure holds it');
  const w = ex.view.week();
  near(w.added, ['chat', 'coding', 'images', 'clips', 'searches', 'social', 'streaming', 'seat'].reduce((s, k) => s + ex.view.val(`use.${k}`, 'wh'), 0), 'the activities exclude the storage row in Office');
  eq(window.location.search, '', 'an office and its size stay off the address');
  setRadio(window, document.querySelector('input[data-opt="mode"][value="person"]'));
  ok(row(document, 'use.seat').hidden, 'One person drops the seat row');
  eq(ex.state.fields.gb, 0, 'and the storage default returns');

  // Measures: price never a bar, water never a total, carbon names its grid.
  setRadio(window, measure(document, 'use', 'usd'));
  ok(document.querySelector('[data-board="use"]').dataset.measure === 'usd', 'Price measure');
  for (const s of document.querySelectorAll('[data-board="use"] .wall-row:not([hidden]) .w')) ok(s.hidden, 'no price bar');
  ok(/revenue, not a cost/.test(text(row(document, 'use.streaming').querySelector('.ladder-value'))), 'revenue rows say so');
  eq(new Set([...document.querySelectorAll('[data-board="arch.A"] .wall-row:not([hidden]) .ladder-unit')].map(text)).size <= 1, true, 'one unit down a board');
  ok(/API list/.test(text(row(document, 'use.chat').querySelector('.ladder-value'))), 'every price names its basis');
  ok(!document.querySelector('[data-board="use"] .wall-group[data-basis="revenue_standin"]').hidden, 'rows group by basis');
  ok(+row(document, 'use.streaming').style.order > +row(document, 'use.chat').style.order, 'with a rule between groups');
  setRadio(window, measure(document, 'catalog', 'ml'));
  const hourRow = row(document, 'catalog.chat_hour');
  ok(/two basins, never summed/.test(text(hourRow.querySelector('.ladder-value'))), 'a whole-chain row keeps two basins');
  const t = ex.view.t.catalog.chat_hour;
  ok(!text(hourRow.querySelector('.ladder-value')).includes(ex.num(t.ml)), 'no water total prints');
  ok(![...document.querySelectorAll('[data-plate-x="catalog"] [data-d="water"] strong')].some((n) => text(n).startsWith(ex.num(t.ml))), 'nor in the detail');
  ok(/home basin, Columbia convention/.test(text(document.querySelector('[data-plate-x="catalog"] [data-d="water"]'))), 'each basin names its convention');
  setRadio(window, measure(document, 'catalog', 'g'));
  ok(/350 g per kWh/.test(text(document.querySelector('[data-plate-x="catalog"] [data-d="co2-tag"]'))), 'carbon names its grid');
  ok(/location-based/.test(text(document.querySelector('[data-plate-x="catalog"] [data-d="co2-tag"]'))), 'and that it is location-based');

  // Carbon only on one grid; hydro in a scenario group.
  const compare = (v) => setRadio(window, document.querySelector(`input[name="comparison"][value="${v}"]`));
  compare('B');
  ok(row(document, 'arch.B.platform').querySelector('.w-dc').hidden, 'different grids: no carbon bar');
  ok(/on another grid/.test(text(row(document, 'arch.B.platform'))), 'in words instead');
  ok(!document.querySelector('[data-board="arch.B"] .wall-gridnote').hidden, 'with the reason and the fix');
  setRadio(window, setting(document, 'grid_dc', 'nwpp'));
  ok(!row(document, 'arch.B.platform').querySelector('.w-dc').hidden, 'one feed on both sides draws the bars');
  setRadio(window, setting(document, 'grid_dc', 'us'));
  compare('D');
  ok(!row(document, 'arch.D.hyper_same_grid').hidden && !row(document, 'arch.D.hyper_same_grid').querySelector('.w-dc').hidden, 'the same-grid row is drawn');
  ok(!document.querySelector('[data-board="arch.D"] .wall-group[data-scenario]').hidden, 'a scenario group under carbon');
  ok(!row(document, 'arch.D.node_1m_hydro').hidden, 'hydro rows sit in it');
  ok(/declared hydro feed/.test(text(row(document, 'arch.D.node_1m_hydro').querySelector('.ladder-label'))), 'and say so');
  ok(+row(document, 'arch.D.node_1m_hydro').style.order > +row(document, 'arch.D.node_100k').style.order, 'under the rule');
  ok(!ex.data.boards['arch.D'].scenario.includes(ex.state.sel.arch), 'a change of measure never lands the selection in the scenario group');
  fire(window, row(document, 'arch.D.node_1m_hydro'), 'click');
  eq(ex.state.sel.arch, 'arch.D.node_1m_hydro', 'a reader\'s own click may');
  setRadio(window, measure(document, 'arch', 'wh'));
  ok(document.querySelector('[data-board="arch.D"] .wall-group[data-scenario]').hidden, 'no scenario group under energy');
  ok(row(document, 'arch.D.hyper_same_grid').hidden, 'energy drops the duplicate row');
  ok(!row(document, 'arch.D.laptop').querySelector('.w-dev').hidden, 'a laptop sits on the reader\'s side of the wall');
  compare('C');
  ok(document.querySelector('[data-board="arch.C"]').classList.contains('is-plain'), 'comparison C has no hour axis and no wall');
  ok(!document.querySelector('.x-alternatives[data-group="comparison:C"]').hidden && document.querySelector('.x-alternatives[data-group="comparison:A"]').hidden, 'named alternatives follow the comparison');
  compare('A');
  const alt = text(document.querySelector('.x-alternatives[data-group="comparison:A"]'));
  ok(/ONLYOFFICE/.test(alt) && /Collabora/.test(alt) && /labeled by the vendor as in development/.test(alt) && /No vendor is endorsed/.test(alt), 'alternatives named neutrally');
  ok(/reverses/.test(text(document.querySelector('.x-reversals[data-group="comparison:A"]'))), 'each pair prints what reverses it');
  const pairs = [...document.querySelectorAll('.x-reversals[data-group="comparison:D"] li')];
  ok(pairs.length > 5 && pairs.some((n) => !n.hidden) && pairs.every((n) => n.hidden === (n.dataset.pairM !== ex.state.m)), 'one measure\'s pairs at a time');
  setRadio(window, measure(document, 'arch', 'usd'));
  ok(pairs.every((n) => n.hidden === (n.dataset.pairM !== 'usd')) && pairs.some((n) => !n.hidden), 'and the measure moves them');
  setRadio(window, measure(document, 'arch', 'wh'));
  setRadio(window, document.querySelector('input[name="arch-wage"][value="25"]'));
  eq(ex.state.settings.wage, '25', 'the wage control sets the setting');
  ok(document.querySelector('#settings input[data-setting="wage"][value="25"]').checked, 'and the drawer agrees');
  ok(/\$25 an hour/.test(text(document.querySelector('[data-setting-line]'))), 'and the setting line');
  eq(window.location.search, '', 'and the wage stays off the address');
  setRadio(window, setting(document, 'wage', '60'));

  // The two admin hours: a visible input, off the address, with the flip beside it.
  const adminField = document.getElementById('a-admin');
  ok(!adminField.closest('[data-js]').hidden, 'the admin hours are a visible input');
  eq(adminField.value, '2', 'at the model\'s two hours');
  const tie = ex.view.adminTie();
  setField(window, adminField, tie);
  near(ex.view.t.arch.A.cloud.usd, ex.view.t.arch.A.local.usd, 'at the printed tie the two prices meet');
  setField(window, adminField, 14);
  ok(ex.view.t.arch.A.cloud.usd > ex.view.t.arch.A.local.usd, 'by the printed flip the local suite is the cheaper');
  eq(window.location.search, '', 'the typed hours stay off the address');
  ok(/tie at about 3\.1 hours/.test(text(document.querySelector('.x-admin-note'))), 'the tie does not depend on the hours typed');
  setRadio(window, document.querySelector('input[name="arch-wage"][value="25"]'));
  ok(/cheaper at any number of cloud hours/.test(text(document.querySelector('.x-admin-note'))), 'where no tie exists the note says so');
  setRadio(window, setting(document, 'wage', '60'));
  setField(window, adminField, -1);
  eq(adminField.getAttribute('aria-invalid'), 'true', 'a bad admin count says so');
  near(ex.view.p.cloud_admin_h_month, 14, 'and keeps the last good value');
  setField(window, adminField, 2);
  near(ex.view.p.cloud_admin_h_month, 2, 'back to the model');

  // Where it runs: a device on the reader's side; the node unpriced.
  setRadio(window, document.querySelector('input[name="workload"][value="clip"]'));
  ok(!document.querySelector('[data-group="workload:clip"]').hidden && document.querySelector('[data-group="workload:prompt"]').hidden, 'workload switches');
  ok(!row(document, 'where.clip.device').querySelector('.w-dev').hidden, 'the device row sits left of the wall');
  ok(!row(document, 'where.clip.node').querySelector('.w-dc').hidden, 'the node right of it');
  eq(ex.state.sel.where, 'where.clip.hyper', 'the selection keeps its place');
  setRadio(window, measure(document, 'where', 'usd'));
  ok(/no price a self-run price needs a yearly count; see Architectures/.test(text(row(document, 'where.clip.node').querySelector('.ladder-value'))), 'the node carries no price here, and says why');
  setRadio(window, measure(document, 'where', 'wh'));
  setRadio(window, document.querySelector('input[name="workload"][value="prompt"]'));

  // Levers and crossovers.
  const lever = row(document, 'lever.reasoning_off');
  ok(/upper bound/.test(text(lever.querySelector('.ladder-label'))), 'reasoning off is an upper bound');
  ok(/before/.test(text(lever.querySelector('.ladder-value'))), 'after over before prints');
  fire(window, lever, 'click');
  ok(/energy/.test(text(document.querySelector('[data-plate-x="lever"] [data-d="qual"]'))), 'lever detail');
  setRadio(window, document.querySelector('input[name="crossover"][value="views"]'));
  ok(!document.querySelector('[data-board="cross.views"]').hidden && document.querySelector('[data-board="cross.prompts"]').hidden, 'crossover group switches');
  eq(text(row(document, 'cross.views_measured_same_network').querySelector('.ladder-num')), 'never', 'never prints as words');
  ok(row(document, 'cross.views_measured_same_network').querySelector('.ladder-mark').hidden, 'with no square');
  fire(window, row(document, 'cross.views_measured_network_credit'), 'click');
  ok(/or never/.test(text(row(document, 'cross.views_measured_network_credit').querySelector('.ladder-value'))), 'or never at the row end');
  ok(/Low end: .* High end: /.test(text(document.querySelector('[data-plate-x="cross"] [data-d="ends"]'))), 'the input at each end');
  setRadio(window, document.querySelector('input[name="crossover"][value="prompts"]'));
  ok(/or never/.test(text(row(document, 'cross.prompts_energy_vs_hyper').querySelector('.ladder-value'))), 'a crossover prints as a range');
  for (const k of ['cross.prompts_energy_vs_hyper', 'cross.prompts_carbon_same_grid', 'cross.views_measured_network_credit']) {
    ok(row(document, k).classList.contains('is-or-never') && !row(document, k).querySelector('.x-or-never').hidden && text(row(document, k).querySelector('.x-or-never')) === 'or never', `${k}: open at the right, with the words on the track`);
  }
  ok(!row(document, 'cross.prompts_price_vs_hyper_list').classList.contains('is-or-never') && row(document, 'cross.prompts_price_vs_hyper_list').querySelector('.x-or-never').hidden, 'a closed range stays closed');
  for (const k of ['cross.prompts_energy_vs_hyper', 'cross.views_desnz_same_network']) ok((!!still.querySelector(`[data-row="${k}"] .x-or-never`)) === row(document, k).classList.contains('is-or-never'), `${k}: static and live agree on or never`);

  // The Catalog's two rulers are two views, and the arrows step the one shown.
  const catalogPlot = document.querySelector('[data-plate-x="catalog"] .plate-plot');
  ok(!document.querySelector('[data-group="scale:hour"]').hidden && document.querySelector('[data-group="scale:unit"]').hidden, 'By the hour leads');
  key(window, catalogPlot, 'End');
  ok(!ex.state.sel.catalog.includes('chat_prompt') && ex.data.boards['catalog.hour'].rows.includes(ex.state.sel.catalog), 'the arrows stay in the view shown');
  setRadio(window, document.querySelector('input[name="scale"][value="unit"]'));
  ok(document.querySelector('[data-group="scale:hour"]').hidden && !document.querySelector('[data-group="scale:unit"]').hidden, 'By the unit takes the zone');
  ok(ex.data.boards['catalog.unit'].rows.includes(ex.state.sel.catalog), 'and the selection moves with it');
  eq(window.location.search, '', 'a view stays off the address');
  setRadio(window, document.querySelector('input[name="scale"][value="hour"]'));
  fire(window, row(document, 'catalog.chat_hour'), 'click');
  ok(/scenario/i.test(text(document.querySelector('[data-board="cross.prompts"] .wall-group[data-scenario]'))), 'hydro lines in a scenario group');

  // The waffles never mix definitions.
  setRadio(window, document.querySelector('input[name="waffle"][value="epri_today"]'));
  eq([...document.querySelectorAll('.x-waffle')].filter((n) => !n.hidden).length, 1, 'one waffle at a time');
  ok(/Workload class/.test(text(document.querySelector('.x-waffle:not([hidden])'))), 'with its definition');
  ok(/Limit:/.test(text(document.querySelector('.x-waffle:not([hidden])'))), 'a partly claim prints its limit');
  ok(document.querySelector('.x-waffle:not([hidden]) .receipt'), 'and its receipt');
  ok(/not split in the record/.test(text(document.querySelector('.x-waffle:not([hidden])'))), 'no invented segments');

  // Project scale: nothing until entered, then the formula.
  const pf = (k) => document.querySelector(`[data-pf="${k}"]`);
  for (const k of ['mwh', 'water', 'co2', 'share']) eq(text(document.querySelector(`[data-po="${k}"]`)), '–', `no output before input: ${k}`);
  ok(!document.querySelector('[data-project-hint]').hidden && /megawatts/.test(text(document.querySelector('[data-project-hint]'))), 'one line says what to enter');
  setField(window, pf('mw'), 100);
  setField(window, pf('lf'), 1);
  eq(text(document.querySelector('[data-po="mwh"]')), '876,000 MWh', 'MWh a year');
  ok(document.querySelector('[data-project-hint]').hidden, 'and goes when the year prints');
  fire(window, document.querySelector('[data-preset][data-for="wue"]:nth-of-type(2)'), 'click');
  eq(text(document.querySelector('[data-po="water"]')), '315,000,000 liters', 'site liters');
  pf('grid').value = '350';
  fire(window, pf('grid'), 'input');
  eq(text(document.querySelector('[data-po="co2"]')), '307,000 tonnes CO2e', 'tonnes');
  setField(window, pf('load'), 2000000);
  eq(text(document.querySelector('[data-po="share"]')), '44 percent', 'share of the entered load');

  // Reset, copy, downloads, deep links.
  setRadio(window, setting(document, 'tariff', 'bpa_wholesale'));
  eq(window.location.search, '', 'the tariff stays off the address');
  setRadio(window, setting(document, 'device', 'laptop'));
  setField(window, adminField, 9);
  eq(window.location.search, '?device=laptop', 'only the selector reaches it');
  fire(window, document.querySelector('[data-plate-x="use"] [data-reset]'), 'click');
  eq(window.location.search, '', 'Reset clears the address');
  eq(ex.state.settings.tariff, ex.data.sel.tariff.def, 'and the settings');
  ok(document.querySelector('#settings input[data-setting="tariff"]:checked').value === ex.data.sel.tariff.def, 'and the radios');
  eq(adminField.value, '2', 'and the typed admin hours');
  fire(window, document.querySelector('[data-plate-x="use"] [data-copy]'), 'click');
  await wait();
  ok(/Modeled, not measured/.test(window.copied) && /Sources: /.test(window.copied) && /localhost/.test(window.copied), 'Copy Reading carries the sentence, the link, and the sources');
  fire(window, document.querySelector('[data-outputs]'), 'click');
  ok(window.lastBlob, 'outputs.csv is built in the browser');
  const csv = await window.lastBlob.text();
  ok(/^row,measure,value,low,high,price_basis,settings/.test(csv) && /catalog\.chat_hour,wh,/.test(csv), 'outputs.csv holds every row');
  const deep = await load('?device=laptop&grid_dc=nwpp#architectures');
  ok(!deep.document.getElementById('architectures').hidden, 'a deep link opens its tab');
  eq(deep.window.explorer.state.settings.device, 'laptop', 'and its settings');
  ok(deep.document.querySelector('#settings input[data-setting="grid_dc"][value="nwpp"]').checked, 'the radios agree');
  eq(deep.window.location.search, '?device=laptop&grid_dc=nwpp', 'the address round-trips');
  eq(deep.window.location.hash, '#architectures', 'with its hash');
  for (const name of Object.keys(deep.window.explorer.data.sel)) {
    if (name === 'wage' || name === 'tariff') continue;
    const other = Object.keys(deep.window.explorer.data.sel[name].opts).find((o) => o !== deep.window.explorer.data.sel[name].def);
    setRadio(deep.window, setting(deep.document, name, other));
    ok(new URLSearchParams(deep.window.location.search).get(name) === other, `${name} reaches the address`);
    setRadio(deep.window, setting(deep.document, name, deep.window.explorer.data.sel[name].def));
    ok(!new URLSearchParams(deep.window.location.search).has(name), `and leaves it at its default`);
  }
  // Back within the page: the address holds the truth for the selectors, typed numbers stay as typed, and no hash means the first tab.
  setField(deep.window, deep.document.querySelector('input[data-field="chat"]'), 33);
  deep.window.history.replaceState(null, '', '?device=tv&grid_dc=__proto__#architectures');
  fire(deep.window, deep.window, 'popstate');
  eq(deep.window.explorer.state.settings.device, 'tv', 'Back re-reads the address');
  eq(deep.window.explorer.state.settings.grid_dc, deep.window.explorer.data.sel.grid_dc.def, 'a selector it no longer names returns to its default');
  ok(deep.document.querySelector('#settings input[data-setting="device"][value="tv"]').checked, 'and the radios follow');
  eq(deep.window.explorer.state.fields.chat, 33, 'a typed number is not in the address, so Back leaves it alone');
  deep.window.history.replaceState(null, '', '?device=tv#levers');
  fire(deep.window, deep.window, 'popstate');
  ok(!deep.document.getElementById('levers').hidden, 'Back moves the tab with the address, and Chrome fires no hashchange when the query differs too');
  deep.window.location.hash = '';
  await wait(20);
  ok(!deep.document.getElementById('your-use').hidden && deep.document.getElementById('architectures').hidden, 'Back to no hash shows the first tab');
  // A link is untrusted: bad options and prototype names do nothing, and no figure of a Nation's rides in on one, or stays in the address.
  const bad = await load('?device=toaster&grid_dc=__proto__&connection=constructor&network_mode=toString&wage=25&tariff=bpa_wholesale&f_chat=40&f_screen=-4&mode=office&seats=12&row_use=use.coding&m=g&comparison=D&cloud_admin_h_month=14&nope=1#levers');
  const badState = bad.window.explorer.state;
  const defaults = bad.window.explorer.data.sel;
  for (const name of Object.keys(defaults)) eq(badState.settings[name], defaults[name].def, `a link cannot set ${name} to that`);
  eq(badState.fields.chat, 10, 'nor a field');
  eq(badState.fields.screen, 7, 'nor a bad field');
  eq(badState.mode, 'person', 'nor an office');
  eq(badState.seats, bad.window.explorer.data.scenario.office_users, 'nor its size');
  eq(badState.m, 'wh', 'nor a measure');
  eq(badState.opts.comparison, 'A', 'nor a comparison');
  eq(badState.sel.use, 'use.screen', 'nor a selection');
  eq(Object.keys(badState.inputs).length, 0, 'nor a model input');
  eq(bad.window.location.search, '', 'and the address drops what it did not read');
  eq(bad.window.location.hash, '#levers', 'keeping the tab');
  ok(!/\bfunction\b|\bobject\b/.test(text(bad.document.querySelector('[data-setting-line]'))), 'the setting line reads as words');
  const drawerLink = await load('#settings');
  ok(!drawerLink.document.getElementById('settings').hidden, 'a link to Settings opens the drawer');

  // The self-check, true and tampered.
  const box = document.querySelector('[data-plate-x="use"] [data-check]');
  ok(/^Builder matches the model: [\d,]+ figures within 0\.5 percent/.test(text(box)), 'the page says it matches the model');
  ok(!box.classList.contains('is-warn'), 'with no warning');
  const data = JSON.parse(html.match(/<script type="application\/json" id="explorer-data">([\s\S]*?)<\/script>/)[1]);
  data.inputs.e_prompt[0] *= 1.5;
  const tampered = html.replace(/(<script type="application\/json" id="explorer-data">)[\s\S]*?(<\/script>)/, (m, a, b) => a + JSON.stringify(data).replace(/</g, '\\u003c') + b);
  const broken = await load('', tampered);
  const warn = broken.document.querySelector('[data-plate-x="use"] [data-check]');
  ok(warn.classList.contains('is-warn') && /does not match the model/.test(text(warn)) && /catalog\.chat_prompt/.test(text(warn)), 'a mismatch warns and names the row');
  ok(!/Builder matches/.test(text(warn)), 'and never says it matches');

  // Print: the content is in the page whichever tab is open.
  ok(document.querySelectorAll('[data-setting-list] li').length === 21, 'the settings list prints');
  ok(document.querySelector('.wall-row .w-dc[style]'), 'print has the Wall');
}

// The home band: the Explorer's model at its defaults, poured, with its one control ----------------------
async function homeBand() {
  const home = read('site/index.html');
  const still = new JSDOM(home).window.document;
  const band = still.querySelector('.explorer-band');
  ok(band && band.previousElementSibling.classList.contains('hero'), 'the band stands under the hero');
  eq(band.querySelector('a.button').getAttribute('href'), 'explorer/', 'with a link in');
  ok(/bottom-up process model, checked against published figures/.test(text(band)) && /not measurements/.test(text(band)), 'and says what the figure is');
  ok(!/<script[^>]+resource-model|id="explorer-data"/.test(home), 'the home page loads no model');
  ok(Buffer.byteLength(home.match(/<!-- explorer:home:band -->[\s\S]*<!-- \/explorer:home:band -->/)[0]) < 8192, 'and the block stays small');
  const pure = require(path.join(ROOT, 'site/assets/js/resource-model.js'));
  const D = JSON.parse(html.match(/<script type="application\/json" id="explorer-data">([\s\S]*?)<\/script>/)[1]);
  const V = pure.Views(D);
  V.set(V.fresh());
  const claims = {};
  for (const name of fs.readdirSync(path.join(ROOT, 'site/data/claims'))) for (const c of JSON.parse(read(`site/data/claims/${name}`)).claims || []) claims[c.id] = c;
  const stops = [...band.querySelectorAll('[data-stop]')];
  eq(stops.length, 4, 'four stops');
  ok(band.querySelector('fieldset').hidden && stops.every((n) => !n.hidden), 'without scripts every stop shows');
  for (const stop of stops) {
    const key = `catalog.${stop.dataset.stop}`;
    const f = V.cell(key, 'wh');
    eq(text(stop.querySelector('.readout-value')), f.num, `${key}: the figure is the model's`);
    eq(text(stop.querySelector('.explorer-band-unit')), f.unit, `${key}: and the unit`);
    const { router, device } = V.t.catalog[stop.dataset.stop].layers;
    ok(text(stop).includes(`about ${f.num} watt-hours ${f.tag}, and ${pure.num(router + device)} of them go to your own screen and router`), `${key}: the sentence reads the model`);
    const ids = [...stop.querySelectorAll('a[href^="explorer/#src-"]')].map((a) => a.getAttribute('href').slice('explorer/#src-'.length));
    ok(ids.length > 1, `${key}: carries its claims`);
    for (const id of ids) {
      ok(/^(verified|partly)$/.test(claims[id].status) && html.includes(`id="src-${id}"`), `${key}: ${id} ships and has its receipt`);
      if (claims[id].status === 'partly') ok(text(stop).includes(`${id}: partly verified. Limit: `), `${key}: ${id} states its limit`);
    }
    ok(/verified against the source/.test(text(stop)) || /partly verified/.test(text(stop)), `${key}: states a status`);
  }
  const page = await open(home, 'http://localhost/site/index.html');
  await wait();
  eq(page.errors.length, 0, `page errors: ${page.errors.slice(0, 3).join(' | ')}`);
  const live = page.document.querySelector('.explorer-band');
  const shown = () => [...live.querySelectorAll('[data-stop]')].filter((n) => !n.hidden).map((n) => n.dataset.stop).join();
  ok(!live.querySelector('fieldset').hidden, 'the control shows with scripts');
  eq(shown(), 'chat_hour', 'one stop at a time, chat first');
  const radio = live.querySelector('input[value="coding_hour"]');
  radio.checked = true;
  fire(page.window, radio, 'change');
  eq(shown(), 'coding_hour', 'the control moves the figure');
  ok(/agentic coding/.test(text(live.querySelector('[data-band-status]'))), 'and the new figure is announced');
}

module.exports = { groups: { staticRules, noScript, homeBand, behavior, cases } };
