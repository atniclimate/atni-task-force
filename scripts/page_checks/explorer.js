// The Explorer with its real data: every one of Python's 300 cases through the page's controls, then tabs, keyboard, selection, the Settings drawer, Your Use,
// the office builder, the honesty rules, the self-check, and the page without scripts and in print. The disclaimer and the honesty sentences stay exact.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { JSDOM, ROOT, count, ok, eq, wait, read, fixture, open, fire, key } = require('./lib');

const PAGE = 'http://localhost/site/explorer/index.html';
const html = read('site/explorer/index.html');
const oracle = JSON.parse(fixture('work/site-refresh/tmp/explorer-oracle.json', 'Rebuild it with python scripts/resource_model.py --oracle.'));
const near = (a, b, message) => { count(); assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1e-6, Math.abs(b)) + 1e-12, `${message}: ${a} against ${b}`); };
// The same shape as Python's answer, every number within the tolerance and every word exact.
const deepNear = (a, b, message) => {
  if (typeof b === 'number') { near(a, b, message); return; }
  if (b === null || typeof b !== 'object') { eq(a, b, message); return; }
  eq(Object.keys(a).sort().join(), Object.keys(b).sort().join(), `${message}: its keys`);
  for (const k of Object.keys(b)) deepNear(a[k], b[k], `${message}.${k}`);
};

async function load(query = '', source = html) {
  const page = await open(source, `${PAGE}${query}`, (window) => {
    window.innerWidth = 1440;
    window.innerHeight = 900;
    window.ResizeObserver = class { observe() {} }; // plate.js watches its strips
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
  ok(!/font-size: 0\.(75|8125)rem/.test(css), 'nothing on a first screen is under the floor');
  ok(!/--atni-color-chart|--stage-|#2F7FC1/i.test(css), 'the Wall carries no chromatic ink but the selection');
  ok(/@container \(max-width: 120px\) \{ \.wall-axis-left span \{ display: none; \}/.test(css), 'a left side under 120px drops its ticks, by a container query that needs no script');
  ok(/@media print[\s\S]*\.x-plate \[data-d="sources"\] \{ display: none; \}/.test(css), 'every receipt prints once, under All Sources');
  ok(!/\.section-strip > \.wrap \{ flex-wrap: nowrap/.test(css), 'on a phone the Settings button wraps under the tabs and never lies over them');
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
  ok(/bottom-up process model, checked against published figures/.test(text(document.querySelector('.x-band'))) && /bottom-up process model, units of work times published coefficients, checked against published figures/.test(text(document.getElementById('method'))), 'the model is named as the owner ruled on every tab, and in Method with what it multiplies');
  const whatItIs = text(document.getElementById('method'));
  eq(whatItIs.match(/that is the point/g).length, 1, 'Method says what the tool is for once');
  eq(whatItIs.match(/Change a setting and the answer changes/g).length, 1, 'and its setting sentence once');
  ok(/has no published measurement behind it yet\./.test(whatItIs), 'and still says the idle term is unmeasured');
  ok(/It is not an econometric model; it estimates no coefficient, and its ranges are spreads/.test(whatItIs), 'and what it is not');
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
  eq([...document.querySelectorAll('#your-use .wall-key li')].map(text).join('|'), 'Your device, Home router|Network, Data center or node|Spread, not a confidence interval', 'the key names each layer and the spread');
  eq([...document.querySelectorAll('#your-use .wall-key-steps')].map((steps) => [...steps.children].map((c) => c.className.replace('plate-square w-key-', '')).join()).join('|'), 'dev,rou|net,dc', 'its swatches stand as the bar does, a pair on each side');
  ok(document.querySelectorAll('tr[data-tr]').length > 80, 'tables hold every row');
  ok(document.getElementById('settings') && !document.getElementById('settings').hidden, 'settings read as a list');
  ok(document.querySelectorAll('#settings input[data-setting]').length >= 60, 'every option prints');
  ok(document.querySelectorAll('.x-sources > li').length > 80, 'receipts print');
  for (const a of document.querySelectorAll('a[href^="#src-"]')) ok(document.getElementById(a.getAttribute('href').slice(1)), `receipt for ${a.getAttribute('href')}`);
  ok(document.querySelectorAll('.x-waffle').length === 4, 'all four waffles print');
  ok(document.querySelectorAll('.x-place').length === 5, 'the place strip prints');
  // The direction's first screen, and that nothing waits on a script: four inputs in the grid, all nine in the page, every disclosure of the plate open.
  const fieldsIn = (selector) => [...document.querySelectorAll(`${selector} input[data-field]`)].map((n) => n.dataset.field).filter((k) => k !== 'seats');
  eq(fieldsIn('#your-use .plate-controls > .x-fields').join(), 'screen,chat,coding,streaming', 'the four that move the number most lead');
  eq(fieldsIn('#your-use .x-more-inputs').join(), 'images,clips,searches,social,gb', 'the other five follow');
  ok(document.querySelector('.x-more-inputs').open, 'open without scripts, so all nine show');
  ok([...document.querySelectorAll('.x-plate .x-modeled')].every((n) => n.open), 'and How this is modeled too');
  ok(!/Model default/.test(text(document.getElementById('your-use'))), 'no default under each field');
  eq(text(document.querySelector('#your-use .x-defaults')), 'Defaults: 7 screen hours, 10 prompts, 1 coding hour, 1 streaming hour', 'the defaults print once, under the grid');
  const bandFigures = [...document.querySelectorAll('.page-band-figures > li')];
  eq(bandFigures.length, 3, 'three figures in the band');
  for (const li of bandFigures) {
    ok(li.querySelector('.figure-num [data-m]') && li.querySelector('.figure-label'), 'poured, with a label');
    const ids = [...li.querySelectorAll('.figure-label a[href^="#src-"]')].map((a) => a.getAttribute('href').slice(1));
    ok(ids.length > 1 && ids.every((id) => document.getElementById(id)), `${text(li.querySelector('.figure-num'))} in the band carries its claims, each with a receipt`);
  }
  ok(!document.querySelector('.x-band').closest('.x-plate') && !document.querySelector('.key-facts, .x-facts'), 'the band has no box, and the notice is one line');
  ok(document.querySelector('[data-d="week"]').closest('.plate-view').dataset.view === 'table', 'the week across the rows moves to the Table view');
  ok(/7 hours/.test(text(row(document, 'use.screen'))), 'the screen row');
  ok(/coding hour/.test(text(document.querySelector('[data-title="use"]'))), 'the claim sentence is poured');
  for (const n of document.querySelectorAll('main [data-m]')) ok(text(n) !== 'x' && text(n) !== '', `poured ${n.dataset.m}`);
  for (const q of document.querySelectorAll('.x-sources > li')) {
    const hasStatus = /Partly verified\. Limit: \S|Verified against the source\./.test(text(q));
    ok(hasStatus, `${q.id} states its status and any limit`);
  }
  ok(!/\bFor scale\b/.test(text(document.getElementById('project-scale'))), 'project scale fills in no sentence for scale');
  ok(document.querySelectorAll('#project-scale input[value]:not([value=""])').length === 0, 'project scale has no defaults');
  // Its one example waits on a script, and its numbers are the plate's it names and the claim's it cites.
  const example = document.querySelector('#project-scale [data-example]');
  ok(example.closest('[data-js]').hidden && document.querySelector('.x-project-form').hidden, 'the example and the form wait on a script');
  const projectControls = Object.fromEntries(JSON.parse(read('site/data/plates/dc-project.json')).controls.map((c) => [c.name, c.default]));
  const demand = JSON.parse(read('site/data/claims/demand.json')).claims.find((c) => c.id === 'dem-058');
  const model = JSON.parse(read('site/data/resource-model.json'));
  eq(text(example), `Try the Data Centers example: ${projectControls.p_mw} MW at ${projectControls.p_lf}`, 'the button says what it fills');
  eq(`${example.dataset.mw} ${example.dataset.lf}`, `${projectControls.p_mw} ${projectControls.p_lf}`, 'at the plate\'s defaults');
  eq(example.dataset.wue, String(model.inputs.wue_site.value), 'the operator average, the preset\'s own figure');
  eq(demand.unit, 'aMW', 'the claim is in average megawatts');
  eq(example.dataset.load, String(demand.value * 8760), 'the load is the region\'s, in the field\'s MWh a year');
  const exampleNote = text(document.querySelector('#project-scale .plate-plot .x-start'));
  ok(exampleNote.includes(`${demand.value.toLocaleString('en-US')} aMW`) && exampleNote.includes(`${(demand.value * 8760).toLocaleString('en-US')} MWh`) && /dem-058: verified against the source/.test(exampleNote) && demand.status === 'verified', 'its sentence shows the arithmetic, the claim, and its status');
  ok(/not a proposal/.test(exampleNote) && /picks no feed/.test(exampleNote), 'and says it is no proposal and picks no feed');
  ok(document.querySelector('#project-scale .x-start a[href="#src-dem-058"]') && /Verified against the source/.test(text(document.getElementById('src-dem-058'))), 'with its receipt');
  // Method: the first sentence is the bold one, and the words stay the model's.
  eq(text(document.querySelector('.x-disclaimer')), model.disclaimer.replace(/\s+/g, ' ').trim(), 'the disclaimer is word for word');
  eq(text(document.querySelector('.x-disclaimer strong')), `${model.disclaimer.split('. ')[0]}.`, 'and only its first sentence is bold');
  // The Catalog: the price basis under the label, the figure and its spread in the value cell.
  for (const r of document.querySelectorAll('#catalog .plate-plot [data-row]')) {
    ok(r.querySelector('.ladder-label .ladder-tag'), `${r.dataset.row} names its price basis under its label`);
    ok(!/list|revenue|no price/.test(text(r.querySelector('.ladder-value'))), `${r.dataset.row}: and the value cell does not`);
  }
  eq(text(row(document, 'catalog.video_hour').querySelector('.ladder-label .ladder-tag')), 'platform revenue, not a cost', 'revenue says so on the row');
  ok(/^\S+ Wh \(\S+ to \S+\)$/.test(text(row(document, 'catalog.video_hour').querySelector('.ladder-value'))), 'the value cell keeps the figure and its spread');
  ok(!row(document, 'use.chat').querySelector('.ladder-label .ladder-tag'), 'Your Use has no such tag');
  // Levers: two words in the key, the ruler's sentence on its own line.
  eq([...document.querySelectorAll('#levers .plate-plot .wall-key li')].map(text).join('|'), 'Before|After, at the same setting', 'the key holds the two marks');
  eq(text(document.querySelector('#levers .plate-plot .x-lever-note')), 'The line runs left for a saving and right for a cost; each row has its own ruler from zero.', 'the rest is the ruler\'s caption');
  ok(document.querySelector('.x-lever-note').classList.contains('caption'), 'set as a caption');

  // The second version, without scripts: every word a reader needs is on the page, and no control pretends to work.
  ok(/The public site receives nothing\./.test(text(document.querySelector('.x-band'))), 'the band says the public site receives nothing, on every tab');
  ok(/The public site receives nothing you type or load\./.test(text(document.getElementById('method'))), 'and so does Method');
  for (const file of ['docs/FIELD-PROTOCOL.md', 'scripts/fit_idle.py']) {
    ok(fs.existsSync(path.join(ROOT, file)), `${file} is in the repository`);
    eq(document.querySelectorAll(`#method a[href$="${file}"], #settings a[href$="${file}"]`).length, 2, `${file} is reachable from Method and from Settings`);
    ok(document.querySelector(`a[href="https://github.com/atniclimate/atni-task-force/blob/main/${file}"]`), `${file} at its public address`);
  }
  ok(document.getElementById('architectures').querySelector('[data-group="comparison:E"].plate-title'), 'comparison E has its claim sentence');
  eq([...document.querySelectorAll('[data-board="arch.E"] .wall-group')].map((n) => n.dataset.phase).join(), 'move,year', 'its one-time rows and year rows stand apart without scripts');
  ok(document.querySelector('[data-board="arch.E"]').classList.contains('is-plain'), 'and on no hour axis');
  const keysOf = (selector) => [...document.querySelectorAll(selector)].map((n) => n.dataset.row);
  eq(keysOf('[data-board="arch.E"] .wall-row:not([hidden])').join(), ['move_s3_node', 'move_s3_federated', 'year_s3', 'year_node', 'year_federated'].map((k) => `arch.E.${k}`).join(), 'one store stands for all three on energy');
  ok(/same from R2 or B2/.test(text(document.querySelector('[data-board="arch.E"] [data-phase="move"]'))), 'and the head says so');
  ok(document.querySelectorAll('.x-paybacks [data-payback]').length === 6 && /never/.test(text(document.querySelector('[data-payback="federated_vs_r2"]'))), 'the paybacks print, never as words');
  ok(document.querySelector('.x-paybacks').closest('.plate-view').dataset.view === 'table', 'all six stand in the Table view');
  ok(/^One copy on the Nation's node pays back against S3 in .+; against R2 .+; against B2 .+\. Each range is one change at a time\.$/.test(text(document.querySelector('[data-payback-line]'))) && document.querySelector('[data-payback-line]').closest('.plate-view').dataset.view === 'reading', 'and the Reading carries one holder\'s three in one sentence');
  ok(/^Rows that leave, each with why it does not meet the rule$/.test(text(document.querySelector('.x-custody-block .x-custody-grid .label'))), 'the list of rows that leave is labeled');
  ok(/mostly people's time/.test(text(document.querySelector('.disclosure[data-group="comparison:E"]'))) && /never subtracted/.test(text(document.querySelector('.disclosure[data-group="comparison:E"]'))), 'the plain account of comparison E prints');
  eq(text(document.querySelector('.x-custody-line')), model.custody.fixed_line, 'the fixed line stands with the setting, word for word');
  ok(document.querySelector('[data-custody]').closest('[data-js]').hidden, 'the custody control waits on a script');
  const rules = document.querySelectorAll('.x-custody-block');
  eq(rules.length, 10, 'what each rule leaves out prints for every comparison, without scripts');
  for (const block of rules) ok(block.querySelector('li') && /Where this data may be held: /.test(text(block)), `${block.dataset.group}: names its rule and lists what leaves`);
  ok(/Held on a vendor's drives under the vendor's contract\./.test(text(document.querySelector('.x-custody'))), 'with its reason');
  eq(document.querySelectorAll('#settings [data-measured]').length, 18, 'eighteen inputs take a reading');
  for (const input of document.querySelectorAll('#settings [data-measured]')) {
    ok(input.hidden, `${input.dataset.measured}: the field waits on a script`);
    ok(/^Model /.test(text(input.parentElement.querySelector('.caption'))) && input.parentElement.querySelector('label').getAttribute('for') === input.id, `${input.dataset.measured}: and the model's figure stands beside it`);
  }
  ok(document.querySelector('[data-scenario-save]').closest('[data-js]').hidden, 'the scenario file waits on a script');
  ok(/Illustrative Carbon Damage, Off by Default/.test(text(document.getElementById('method'))) && /not a damage estimate/.test(text(document.getElementById('method'))), 'the damage families print in Method, each saying what it is');
  ok(document.querySelector('[data-damage]').closest('[data-js]').hidden && document.querySelector('[data-d="damage"]').hidden, 'and the control and its line wait on a script');
  ok(document.getElementById('src-mv-001') && document.getElementById('src-ex-002') && document.getElementById('src-mv-005'), 'the second version\'s receipts ship');
  ok(document.querySelector('a[href="#src-mv-004"]') && /sf-035/.test(text(document.querySelector('#not-the-building .x-picture:last-child'))), 'the spread of a session and the cloud share name their claims');
  ok(!/twenty watts|a hundred watts|about three times|doubles the coding/.test(text(document.getElementById('method'))), 'the sentences the rerun overturned are gone');
  ok(/halves at 19 W and doubles at 82 W/.test(text(document.getElementById('method'))) && /misses by 3\.2 times/.test(text(document.getElementById('method'))) && /1\.9 times and the coding hour's 1\.7 times/.test(text(document.getElementById('method'))), 'and their replacements are poured');
  ok(/vendor's app sends its readings to that vendor/.test(text(document.getElementById('method'))), 'and the smart plug says a vendor\'s app sends the readings on');
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
    S.custody = c.custody_rule;
    S.m = ['wh', 'g', 'ml', 'usd'][i % 4];
    // The last control goes through the page, so the whole refresh runs as it does for a reader.
    setRadio(window, setting(document, name, c.settings[name]));
    const flat = ex.flatten(V.t);
    for (const [k, v] of Object.entries(c.tree)) near(flat[k], v, `case ${i} ${k}`);
    eq(Object.keys(flat).length, Object.keys(c.tree).length, `case ${i} tree size`);
    // The custody rule: Python's words and figures, and the rows it leaves out drawn as ghosts, with no mark and no figure, on the plate and in its table.
    const rule = ex.custodyView(ex.data, V.t, c.custody_rule);
    deepNear(rule, c.custody, `case ${i} custody`);
    for (const view of Object.values(c.custody.comparisons)) {
      for (const { key } of view.left) {
        const n = row(document, key);
        ok(n.hidden || (n.classList.contains('is-ghost') && [...n.querySelectorAll('.w, .wall-range, .wall-needle')].every((p) => p.hidden) && text(n.querySelector('.ladder-value')).startsWith(`${ex.data.words.ghost}: `)), `case ${i} ${key} leaves the plate, or stays as a ghost with no figure`);
        const tr = document.querySelector(`tr[data-tr="${key}"]`);
        ok(tr.classList.contains('is-ghost') && text(tr.querySelector('[data-c="usd"]')) === '', `case ${i} ${key} keeps no figure in the table`);
      }
    }
    for (const [k, [value, low, high, never]] of Object.entries(c.payback)) {
      const x = V.run.crossover(k, ['arch', 'E', 'payback']);
      for (const [mine, want] of [[x.value, value], [x.low, low], [x.high, high]]) { if (want === null) eq(mine, null, `case ${i} payback ${k}`); else near(mine, want, `case ${i} payback ${k}`); }
      eq(x.never.length, never, `case ${i} payback ${k} never`);
      eq(text(document.querySelector(`[data-payback="${k}"]`)), ex.words(V.crossWords(x, 'years')), `case ${i} payback ${k} prints`);
    }
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
      const f = V.cell('use.chat', 'wh', V.boardScale('use', 'wh'));
      eq(text(row(document, 'use.chat').querySelector('.ladder-value')), [f.num, f.unit, f.tag].filter(Boolean).join(' '), `case ${i} chat row`);
      eq(document.querySelector('[data-board="use"] .wall-off').hidden, !document.querySelector('[data-board="use"] .wall-row:not([hidden]) .wall-range:not([hidden]):is(.is-off, .is-off-left)'), `case ${i} the ruler's caption follows its rows`);
      ok(text(document.querySelector('[data-title="use"]')).includes(ex.plainFig(w.screen, 'wh')), `case ${i} the title refills`);
    }
  }
  console.log(JSON.stringify({ oracle_checks: count(0) - before, oracle_cases: oracle.cases.length, table_cells_read: dom, ms: Date.now() - t0 }));
}

// Every option of every setting, one at a time, against the rows Python prints for it in the public file: comparison E among them. That file holds six significant figures, so the tolerance here is its rounding.
async function everyOption() {
  const { window } = await load();
  const ex = window.explorer;
  const D = ex.data;
  const { selectors } = JSON.parse(read('site/data/resource-model.json')).computed_defaults;
  const within = (a, b, message) => { count(); assert.ok(Math.abs(a - b) <= 1e-5 * Math.abs(b) + 1e-9, `${message}: ${a} against ${b}`); };
  let options = 0;
  let rows = 0;
  let exit = 0;
  for (const [name, byOption] of Object.entries(selectors)) {
    eq(Object.keys(byOption).sort().join(), Object.keys(D.sel[name].opts).sort().join(), `${name}: the page offers Python's options`);
    for (const [option, changed] of Object.entries(byOption)) {
      options += 1;
      const { tree } = new ex.Run(D, { [name]: option }, {});
      for (const [key, row] of Object.entries(changed)) {
        rows += 1;
        if (key.startsWith('arch.E.')) exit += 1;
        const mine = key.split('.').reduce((o, part) => o[part], tree);
        for (const m of ex.MS) { if (row[m] === null) ok(mine[m] === null || mine[m] === undefined, `${name}=${option} ${key} ${m}: no figure`); else within(mine[m], row[m], `${name}=${option} ${key} ${m}`); }
      }
    }
  }
  ok(options === Object.values(D.sel).reduce((n, s) => n + Object.keys(s.opts).length, 0) && options > 41, 'every option of every setting ran');
  ok(exit > 0, 'and comparison E moved with them');
  console.log(JSON.stringify({ options, rows_compared: rows, exit_rows: exit }));
}

// Python's typed values, refusals, and damage figures, through the page's own functions --------------------
async function measuredOracle() {
  const { window } = await load();
  const ex = window.explorer;
  const D = ex.data;
  const before = ex.flatten(new ex.Run(D, null, {}).tree);
  for (const c of oracle.measured_cases) {
    const name = Object.keys(c.typed).join();
    const { values, records } = ex.applyMeasured(D, c.typed);
    deepNear(records, c.records, `${name}: the records`);
    eq(ex.measuredLine(D, records), c.line, `${name}: the one sentence`);
    eq(ex.measuredLine(D, records, false), c.line_unused, `${name}: the sentence where no row uses it`);
    const run = new ex.Run(D, null, {}, values);
    const flat = ex.flatten(run.tree);
    eq(ex.movedRows(before, flat).join(), c.moved.join(), `${name}: the rows it moved`);
    for (const [k, v] of Object.entries(c.tree)) near(flat[k], v, `${name}: ${k}`);
    for (const key of Object.keys(values)) ok(!run.swept.includes(key), `${name}: a typed value takes no spread`);
    for (const [k, [lo, hi]] of Object.entries(c.ranges)) {
      const [a, b] = run.spread(`oracle:${k}`, (t) => k.split('.').reduce((o, part) => (o === undefined || o === null ? o : o[part]), t));
      near(a, lo, `${name}: low ${k}`);
      near(b, hi, `${name}: high ${k}`);
    }
  }
  ok(oracle.measured_cases.length >= 5 && oracle.measured_refused.length >= 7, 'the oracle holds typed values and refusals');
  for (const typed of oracle.measured_refused) {
    count(1);
    assert.throws(() => ex.applyMeasured(D, typed), undefined, `${JSON.stringify(typed)} is refused`);
  }
  for (const bad of [{ node_w: '' }, { node_w: null }, { node_w: [40] }, { node_w: '0x10' }, { node_w: NaN }, { node_w: Infinity }, { ['__proto__']: 1 }, { toString: 1 }]) {
    count(1);
    assert.throws(() => ex.applyMeasured(D, bad), undefined, `${JSON.stringify(bad)} is refused`);
  }
  eq(ex.applyMeasured(D, { node_w: '62' }).values.node_w, 62, 'typed text reads as a number');
  eq(ex.measuredLine(D, []), '', 'no reading, no sentence');
  for (const c of oracle.damage_cases) {
    const got = ex.carbonDamage(c.g, D.carbon_damage.families[c.family]);
    for (const k of ['low', 'central', 'high']) { if (c[k] === null) eq(got[k], null, `${c.family}: no central is invented`); else near(got[k], c[k], `${c.family} ${k}`); }
    eq(ex.damageColumn(D, c.g, c.family).column, c.column, `${c.family}: the head Python gives it`);
  }
  ok(oracle.damage_cases.length >= 12, 'the oracle holds the damage families');
  eq(ex.damageColumn(D, 73), null, 'the column is off by default');
  eq(ex.damageColumn(D, 73, 'off'), null, 'and off when asked');
  const on = ex.damageColumn(D, 73, 'epa_2020');
  eq(on.column, 'illustrative damage, not a price, not federal policy', 'the column reads as asked');
  near(on.central, 73 / 1e6 * 190, 'a coding hour at the central value');
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
    for (const td of tr.querySelectorAll('[data-c]:not([data-damage-col])')) eq(text(td), text(other.querySelector(`[data-c="${td.dataset.c}"]`)), `static and live table ${tr.dataset.tr} ${td.dataset.c}`);
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
  ok(screenRange.classList.contains('is-off-left') && !document.querySelector('[data-board="use"] .wall-off').hidden && /runs off this ruler/.test(text(document.querySelector('[data-board="use"] .wall-off'))), 'a spread past the left edge says so once, under the ruler, with its left end open');
  ok(![...document.querySelectorAll('.plate-plot [data-row] .ladder-value')].some((n) => /runs off this ruler/.test(text(n))), 'and never row by row');
  eq(still.querySelector('[data-board="use"] .wall-off').hidden, false, 'without scripts too');
  ok(/\(\S+ to \S+\)/.test(text(row(document, 'use.screen').querySelector('.ladder-value'))), 'the row prints the whole spread in words');
  ok(![...document.querySelectorAll('.wall-axis span')].some((n) => /^0( |$)/.test(text(n))), 'the wall itself is the zero');
  ok(/ Wh$/.test([...document.querySelectorAll('[data-board="use"] .wall-axis span')].reduce((a, b) => (+b.style.getPropertyValue('--x') > +a.style.getPropertyValue('--x') ? b : a)).textContent), 'the far tick carries the unit');
  ok(/side/i.test(text(document.querySelector('[data-board="use"] .wall-sides > span:first-child'))), 'the left head');
  // One ruler across the wall: a watt-hour is as long on both sides, and one step runs out both ways.
  const V0 = ex.view;
  const useLay = V0.layout(V0.boardKeys('use', 'wh'), 'wh', false, V0.boardScale('use', 'wh'));
  const screenParts = V0.parts('use.screen', 'wh');
  const codingParts = V0.parts('use.coding', 'wh');
  near((useLay.items['use.screen'].dev[1] + useLay.items['use.screen'].rou[1]) / (screenParts.dev + screenParts.rou), (useLay.items['use.coding'].net[1] + useLay.items['use.coding'].dc[1]) / (codingParts.net + codingParts.dc), 'one scale on both sides of the wall');
  ok(!document.querySelector('[data-board="use"] .wall-axis-left span'), 'at one step no tick stands under the screen bar');
  eq(text(document.querySelector('[data-board="use"] .wall-axis-left i')), 'One scale, both ways', 'and the axis says the left side reads on the same ruler');
  const whereLay = V0.layout(V0.boardKeys('where.prompt', 'wh'), 'wh', false, V0.boardScale('where.prompt', 'wh'));
  const whereLeft = whereLay.ticks.filter((t) => t.left);
  const whereRight = whereLay.ticks.filter((t) => !t.left);
  near(whereLay.wall - whereLeft[0].x, whereRight[0].x - whereLay.wall, 'the first tick either side stands as far from the wall');
  near(whereRight[1].x - whereRight[0].x, whereRight[0].x - whereLay.wall, 'at the same step');
  eq(text(document.querySelector('[data-board="where.prompt"] .wall-axis-left span')), `${whereRight[0].t} Wh, your side`, 'a left tick names its unit and its side');
  eq([...document.querySelectorAll('[data-board="where.prompt"] .wall-axis > span')].map(text).join(), whereRight.map((t) => t.t).join(), 'and the right side keeps its own');
  for (const wall of document.querySelectorAll('.wall')) {
    const mine = still.querySelector(`.wall[data-board="${wall.dataset.board}"] .wall-axis`);
    eq(text(wall.querySelector('.wall-axis')), text(mine), `static and live axis ${wall.dataset.board}`);
    eq(wall.querySelector('.wall-axis-left') === null, wall.classList.contains('is-plain'), `${wall.dataset.board}: a side box wherever a wall stands`);
  }
  eq(ex.num(0.0008), '0.0008', 'no trailing zero below 1');
  eq(ex.usd(0.04), '$0.04', 'in dollars too');
  eq(ex.usd(0.2), '$0.20', 'and money keeps its cents');
  eq(ex.usd(0.004), '$0.004', 'below a cent it shows what it has');
  eq(ex.usd(0), '$0', 'and nothing is nothing');
  eq(ex.num(3), '3', 'no trailing zero at 1 and above either, as the plates print');
  eq(ex.num(0.996), '1', 'and a figure that rounds up to 1 prints as 1');
  eq(ex.num(2.4), '2.4', 'two figures stay two figures');

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
  const useChips = [...document.querySelectorAll('[data-plate-x="use"] [data-d="chips"] .receipt')];
  ok(useChips.length > 0 && useChips.every((c) => c.closest('.plate-view').dataset.view === 'sources'), 'receipts reach the detail, in its Sources view');
  ok(!document.querySelector('[data-plate-x="use"] .plate-view[data-view="reading"] .receipt'), 'and the Reading view holds no chip');
  const useTally = document.querySelector('[data-plate-x="use"] [data-tally]');
  const partlyChips = useChips.filter((c) => c.classList.contains('is-hollow')).length;
  const plateSources = (name) => new Set([...document.querySelectorAll(`[data-plate-x="${name}"] .plate-plot [data-row]`)].flatMap((r) => [...document.getElementById(ex.data.rows[r.dataset.row].note).querySelectorAll('.receipt')].map((c) => c.getAttribute('href'))));
  const useSources = plateSources('use');
  ok(useSources.size > useChips.length, 'a plate holds more sources than a row');
  eq(text(useTally), `This row: ${[useChips.length - partlyChips && `${useChips.length - partlyChips} verified`, partlyChips && `${partlyChips} partly verified`].filter(Boolean).join(', ')}; ${useSources.size} sources on the plate`, 'one line counts the row by status and names the plate\'s count');
  eq(text(document.querySelector('[data-plate-x="use"] .plate-views input[value="sources"] + span')), `Sources (${useSources.size})`, 'the same count as the view\'s name');
  eq(document.querySelectorAll('[data-plate-x="use"] [data-d="sources"] > li').length, useSources.size, 'and the view lists that many');
  for (const name of ['where', 'arch', 'lever', 'cross', 'catalog']) {
    const n = plateSources(name).size;
    const plate = document.querySelector(`[data-plate-x="${name}"]`);
    eq(text(plate.querySelector('.plate-views input[value="sources"] + span')), `Sources (${n})`, `${name}: the view's name counts the plate`);
    eq(plate.querySelectorAll('[data-d="sources"] > li').length, n, `${name}: and it lists them`);
    ok(new RegExp(`^This row: .*; ${n} sources on the plate$`).test(text(plate.querySelector('[data-tally]'))), `${name}: and the line says the same`);
  }
  fire(window, useTally, 'click');
  ok(!document.querySelector('[data-plate-x="use"] .plate-view[data-view="sources"]').hidden, 'the line opens Sources');
  eq(document.activeElement, document.querySelector('[data-plate-x="use"] .plate-views input[value="sources"]'), 'with focus on the view switch');
  document.querySelector('[data-plate-x="use"] .plate-views input[value="reading"]').checked = true;
  fire(window, document.querySelector('[data-plate-x="use"] .plate-views input[value="reading"]'), 'change');
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
  const chip = document.querySelector('[data-plate-x="use"] [data-d="chips"] .receipt');
  fire(window, chip, 'click');
  const receipt = document.querySelector('[data-plate-x="use"] [data-d="receipt"]');
  ok(!receipt.hidden && /(Verified against the source|Partly verified)/.test(text(receipt)), 'a chip opens its receipt in place');
  ok(!receipt.closest('.plate-view').hidden && receipt.closest('.plate-view').dataset.view === 'sources', 'in the Sources view');
  eq(document.activeElement, receipt, 'with focus in it');
  key(window, plot, 'Escape');
  ok(receipt.hidden, 'Escape closes it');
  eq(document.activeElement, chip, 'and focus returns to the chip');

  // Views.
  const views = document.querySelectorAll('[data-plate-x="use"] .plate-views input');
  views[2].checked = true;
  fire(window, views[2], 'change');
  ok(!document.querySelector('[data-plate-x="use"] .plate-view[data-view="table"]').hidden && document.querySelector('[data-plate-x="use"] .plate-view[data-view="reading"]').hidden, 'Table view');
  views[1].checked = true;
  fire(window, views[1], 'change');
  ok(document.querySelectorAll('[data-plate-x="use"] [data-d="sources"] li').length > 0, 'Sources view lists the plate\'s sources');
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
  ok(/API list/.test(text(row(document, 'catalog.chat_hour').querySelector('.ladder-value'))), 'a Catalog price too, in its own cell, so the tag under the label can step aside');
  ok(/\[data-measure="usd"\] \.ladder-label > \.ladder-tag \{ display: none; \}/.test(read('site/assets/css/explorer.css')), 'and it does');
  ok(!document.querySelector('[data-board="use"] .wall-group[data-basis="revenue_standin"]').hidden, 'rows group by basis');
  ok(+row(document, 'use.streaming').style.order > +row(document, 'use.chat').style.order, 'with a rule between groups');
  setRadio(window, measure(document, 'catalog', 'ml'));
  const hourRow = row(document, 'catalog.chat_hour');
  ok(/two basins, never summed/.test(text(hourRow.querySelector('.ladder-value'))), 'a whole-chain row keeps two basins');
  const t = ex.view.t.catalog.chat_hour;
  ok(!text(hourRow.querySelector('.ladder-value')).includes(ex.num(t.ml)), 'no water total prints');
  ok(![...document.querySelectorAll('[data-plate-x="catalog"] [data-d="water"] strong')].some((n) => text(n).startsWith(ex.num(t.ml))), 'nor in the detail');
  ok(/home basin/.test(text(document.querySelector('[data-plate-x="catalog"] [data-d="water"]'))), 'each figure names its basin');
  ok(/home basin, Columbia convention/.test(text(document.querySelector('[data-plate-x="catalog"] [data-d="water-basis"]'))), 'and each basin names its convention');
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
  const waffleDetail = document.querySelector('[data-plate-x="building"] .plate-detail [data-group="waffle:epri_today"]');
  ok(!waffleDetail.hidden && [...document.querySelectorAll('[data-plate-x="building"] .plate-detail [data-group]')].filter((n) => !n.hidden).length === 1, 'the detail follows it');
  eq(text(waffleDetail.querySelector('.readout-value')), '15 to 25', 'with the figure at poster size');
  ok(/Workload class/.test(text(waffleDetail)), 'with its definition');
  ok(/Limit:/.test(text(waffleDetail)), 'a partly claim prints its limit');
  ok(waffleDetail.querySelector('a.x-c[href="#src-lf-002"]'), 'and its claim id, plain, to its receipt');
  ok(document.getElementById('src-lf-002'), 'which ships');
  ok(!document.querySelector('[data-plate-x="building"] .plate-detail :is(.receipt, .plate-chips)'), 'no chip box on this panel');
  const waffleClaims = {};
  for (const name of fs.readdirSync(path.join(ROOT, 'site/data/claims'))) for (const c of JSON.parse(read(`site/data/claims/${name}`)).claims || []) waffleClaims[c.id] = c;
  const buildingPanel = document.getElementById('not-the-building');
  const buildingHidden = buildingPanel.hidden;
  buildingPanel.hidden = false; // nothing in a hidden tab takes focus
  for (const group of document.querySelectorAll('[data-plate-x="building"] .plate-detail [data-group]')) {
    setRadio(window, document.querySelector(`input[name="waffle"][value="${group.dataset.group.split(':')[1]}"]`));
    const line = group.querySelector('.x-this-figure');
    const id = line.querySelector('a.x-c').getAttribute('href').slice(5);
    eq(text(line), `This figure: 1 ${waffleClaims[id].status === 'partly' ? 'partly verified' : 'verified'}; ${id}`, `${group.dataset.group}: the line says its status and its id`);
    if (waffleClaims[id].status === 'partly') ok(/Limit:/.test(text(group)), `${group.dataset.group}: with its limit`);
    const about = group.querySelector('details');
    eq(line.querySelector('[data-about]').getAttribute('href'), `#${about.id}`, `${group.dataset.group}: the line links to its own About this figure`);
    ok(!about.open, `${group.dataset.group}: folded at first`);
    line.querySelector('[data-about]').click();
    ok(about.open, `${group.dataset.group}: the line opens it`);
    eq(document.activeElement, about.querySelector('summary'), `${group.dataset.group}: and the keyboard goes to it`);
  }
  buildingPanel.hidden = buildingHidden;
  setRadio(window, document.querySelector('input[name="waffle"][value="epri_today"]'));
  ok(/not split in the record/.test(text(document.querySelector('.x-waffle:not([hidden])'))), 'no invented segments');
  eq(document.querySelectorAll('.x-places > .x-place svg').length, 5, 'five places in one row');
  ok(document.querySelector('.x-places .x-place svg').getAttribute('viewBox').startsWith('0 0 68 '), 'at 12px squares on a 14px pitch');
  ok(/PUE/.test(text(document.querySelector('.x-place-notes'))) && /Small model/.test(text(document.querySelector('.x-place-notes'))), 'and what each assumes under them');

  // Project scale: nothing until entered, then the formula.
  const pf = (k) => document.querySelector(`[data-pf="${k}"]`);
  for (const k of ['mwh', 'water', 'co2', 'share']) eq(text(document.querySelector(`[data-po="${k}"]`)), '–', `no output before input: ${k}`);
  eq(text(document.querySelector('[data-po-poster]')), '', 'and no figure on the poster');
  ok(!document.querySelector('[data-project-hint]').hidden && /megawatts/.test(text(document.querySelector('[data-project-hint]'))), 'one line says what to enter');
  setField(window, pf('mw'), 100);
  setField(window, pf('lf'), 1);
  eq(text(document.querySelector('[data-po="mwh"]')), '876,000 MWh', 'MWh a year');
  eq(`${text(document.querySelector('[data-po-poster]'))} ${text(document.querySelector('[data-po-unit]'))}`, '876,000 MWh', 'on the poster too');
  ok(document.querySelector('[data-project-hint]').hidden, 'and goes when the year prints');
  eq(text(document.querySelector('[data-po="co2"]')), 'Choose a feed', 'an empty row then says what it waits for');
  eq(text(document.querySelector('[data-po="water"]')), 'Enter site water', 'each in its own words');
  eq(text(document.querySelector('[data-po="share"]')), 'Enter a load to compare', 'all three');
  fire(window, document.querySelector('[data-preset][data-for="wue"]:nth-of-type(2)'), 'click');
  eq(text(document.querySelector('[data-po="water"]')), '315,000,000 liters', 'site liters');
  pf('grid').value = '350';
  fire(window, pf('grid'), 'input');
  eq(text(document.querySelector('[data-po="co2"]')), '307,000 tonnes CO2e', 'tonnes');
  setField(window, pf('load'), 2000000);
  eq(text(document.querySelector('[data-po="share"]')), '44 percent', 'share of the entered load');

  // The one example: it fills what it names, picks no feed, stays off the address, and Reset takes the panel back to blank.
  const blankProject = (message) => {
    for (const k of ['mw', 'lf', 'wue', 'grid', 'load']) eq(pf(k).value, '', `${message}: ${k}`);
    for (const k of ['mwh', 'water', 'co2', 'share']) eq(text(document.querySelector(`[data-po="${k}"]`)), '–', `${message}: ${k} prints no figure`);
    eq(text(document.querySelector('[data-po-poster]')), '', `${message}: and no poster`);
    ok(!document.querySelector('[data-project-hint]').hidden, `${message}: and the hint is back`);
  };
  const projectReset = document.querySelector('[data-plate-x="project"] [data-reset]');
  fire(window, projectReset, 'click');
  blankProject('Reset clears what was typed');
  ok(/default settings/.test(text(document.querySelector('[data-plate-x="project"] .plate-status'))), 'and says so');
  const tryExample = document.querySelector('[data-plate-x="project"] [data-example]');
  ok(!tryExample.closest('[data-js]').hidden, 'the example shows with scripts');
  fire(window, tryExample, 'click');
  eq(`${pf('mw').value} ${pf('lf').value} ${pf('wue').value} ${pf('load').value}`, `125 0.8 0.36 ${22000 * 8760}`, 'the example fills megawatts, load factor, the operator average, and the load');
  eq(pf('grid').value, '', 'and no feed');
  eq(text(document.querySelector('[data-po="mwh"]')), '876,000 MWh', 'the year prints');
  eq(`${text(document.querySelector('[data-po-poster]'))} ${text(document.querySelector('[data-po-unit]'))}`, '876,000 MWh', 'on the poster');
  eq(text(document.querySelector('[data-po="water"]')), '315,000,000 liters', 'the water');
  eq(text(document.querySelector('[data-po="co2"]')), 'Choose a feed', 'CO2e waits for a feed');
  eq(text(document.querySelector('[data-po="share"]')), '0.45 percent', 'and the share of the region is the one the home page states');
  eq(window.location.search, '', 'a project stays off the address');
  fire(window, projectReset, 'click');
  blankProject('Reset clears the example');

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
  ok(box.closest('.plate-view').dataset.view === 'table', 'the line waits in the Table view');
  ok(document.querySelector('[data-check-top]').hidden, 'and nothing stands over the panels');
  const data = JSON.parse(html.match(/<script type="application\/json" id="explorer-data">([\s\S]*?)<\/script>/)[1]);
  data.inputs.e_prompt[0] *= 1.5;
  const tampered = html.replace(/(<script type="application\/json" id="explorer-data">)[\s\S]*?(<\/script>)/, (m, a, b) => a + JSON.stringify(data).replace(/</g, '\\u003c') + b);
  const broken = await load('', tampered);
  const warn = broken.document.querySelector('[data-plate-x="use"] [data-check]');
  ok(warn.classList.contains('is-warn') && /does not match the model/.test(text(warn)) && /catalog\.chat_prompt/.test(text(warn)), 'a mismatch warns and names the row');
  ok(!/Builder matches/.test(text(warn)), 'and never says it matches');
  const warnTop = broken.document.querySelector('[data-check-top]');
  ok(!warnTop.hidden && warnTop.closest('[role="tabpanel"]') === null && /does not match the model/.test(text(warnTop)), 'a warning does not wait in a view: it stands over every panel');

  // Print: the content is in the page whichever tab is open.
  ok(document.querySelectorAll('[data-setting-list] li').length === 21, 'the settings list prints');
  ok(document.querySelector('.wall-row .w-dc[style]'), 'print has the Wall');
}

// Comparison E, the custody setting, a reader's own reading, the damage control, and the scenario file ------------------
async function secondVersion() {
  const { window, document } = await load();
  const ex = window.explorer;
  const V = ex.view;
  const S = ex.state;
  const D = ex.data;
  const compare = (v) => setRadio(window, document.querySelector(`input[name="comparison"][value="${v}"]`));
  const archM = (m) => setRadio(window, measure(document, 'arch', m));
  const label = D.measured.label;
  const flatNow = () => JSON.stringify(ex.flatten(V.t));
  const home = flatNow();

  // Comparison E: a row or a comparison on the tab that fits, no new tab.
  eq(document.querySelectorAll('input[name="comparison"]').length, 5, 'five comparisons on the Architectures tab');
  eq(document.querySelectorAll('.section-strip [role="tab"]').length, 9, 'and no new tab');
  compare('E');
  ok(!document.querySelector('[data-group="comparison:E"].plate-title').hidden && document.querySelector('[data-group="comparison:A"].plate-title').hidden, 'E takes the title');
  ok(!document.querySelector('.x-admin-note[data-group="comparison:E"]').hidden, 'and its typed fields');
  const board = document.querySelector('[data-board="arch.E"]');
  const shownRows = () => [...board.querySelectorAll('.wall-row:not([hidden])')].sort((a, b) => a.style.order - b.style.order).map((n) => n.dataset.row);
  const moves = ['s3', 'r2', 'b2'].flatMap((s) => [`arch.E.move_${s}_node`, `arch.E.move_${s}_federated`]);
  eq(shownRows().join(), ['move_s3_node', 'move_s3_federated', 'year_s3', 'year_node', 'year_federated'].map((k) => `arch.E.${k}`).join(), 'energy: the two moves, then the three years');
  const moveHead = board.querySelector('[data-phase="move"]');
  const yearHead = board.querySelector('[data-phase="year"]');
  ok(!moveHead.hidden && !yearHead.hidden, 'each under its own head');
  ok(+moveHead.style.order < +row(document, 'arch.E.move_s3_node').style.order && +row(document, 'arch.E.move_s3_federated').style.order < +yearHead.style.order && +yearHead.style.order < +row(document, 'arch.E.year_s3').style.order, 'one time above, one year below, with the head between');
  eq(moveHead.getAttribute('role'), 'none', 'a head is no option in the list box');
  ok(!moves.some((key) => /\byear\b/.test(text(row(document, key).querySelector('.ladder-label')))), 'no move row calls itself a year');
  near(V.val('arch.E.move_s3_node', 'wh'), V.val('arch.E.move_r2_node', 'wh'), 'free egress is a price, not zero energy');
  // The arrows step the rows in the order they stand.
  const plot = document.querySelector('[data-plate-x="arch"] .plate-plot');
  key(window, plot, 'Home');
  eq(S.sel.arch, 'arch.E.move_s3_node', 'Home lands on the first move');
  key(window, plot, 'End');
  eq(S.sel.arch, 'arch.E.year_federated', 'End on the last year');
  fire(window, row(document, 'arch.E.year_node'), 'click');
  ok(/one copy on the Nation's node/.test(text(document.querySelector('[data-plate-x="arch"] [data-d="reading"]'))), 'the Reading follows');
  const hoursFig = document.querySelector('[data-plate-x="arch"] [data-d="hours"]');
  ok(hoursFig.hidden, 'a year row prints no move hours');
  fire(window, row(document, 'arch.E.move_s3_node'), 'click');
  eq(`${text(hoursFig.querySelector('.x-big'))} / ${text(hoursFig.querySelector('.caption'))}`, `${ex.num(V.t.upkeep.E.move_s3_node.admin_h)} hours / assumed, no source`, 'a move prints its paid hours beside its figures, as assumed');
  ok(!hoursFig.hidden, 'on the first screen');
  fire(window, row(document, 'arch.E.move_s3_federated'), 'click');
  ok(/^Three copies across Nations' nodes pays back/.test(text(document.querySelector('[data-payback-line]'))), 'the payback sentence follows the selected row\'s holder');
  fire(window, row(document, 'arch.E.year_node'), 'click');
  // Price: every store, no bar, each row's basis in its own words.
  archM('usd');
  eq(shownRows().length, 11, 'price shows every store');
  ok(row(document, 'arch.E.year_cloud_same_grid').hidden, 'and no duplicate row');
  ok(/list egress plus the assumed hours/.test(text(moveHead)) && !/list egress/.test(text(row(document, 'arch.E.move_s3_node').querySelector('.ladder-value'))), 'the move head names what its price holds, once');
  ok(row(document, 'arch.E.move_s3_node').classList.contains('is-one-line') && /^\$3,300 \(\$\S+ to \$\S+\)$/.test(text(row(document, 'arch.E.move_s3_node').querySelector('.ladder-value'))), 'so a move prints its price and spread on one line');
  ok(!row(document, 'arch.E.year_node').classList.contains('is-one-line'), 'and a year row keeps its basis line');
  ok(/self-run/.test(text(row(document, 'arch.E.year_node').querySelector('.ladder-value'))) && /API list/.test(text(row(document, 'arch.E.year_s3').querySelector('.ladder-value'))), 'a year names its basis');
  for (const s of board.querySelectorAll('.wall-row:not([hidden]) .w')) ok(s.hidden, 'no price bar');
  ok(/price basis/.test(text(yearHead)), 'the head says so');
  eq(row(document, 'arch.E.move_s3_node').querySelector('.ladder-num').textContent, '$3,300', 'the move from S3');
  eq(row(document, 'arch.E.year_node').querySelector('.ladder-num').textContent, '$902', 'a year on the node');
  // Carbon: the year rows on one grid, the moves on another with no bar.
  archM('g');
  ok(!row(document, 'arch.E.year_cloud_same_grid').hidden && !row(document, 'arch.E.year_cloud_same_grid').querySelector('.w-dc').hidden, 'carbon draws against the same grid');
  ok(row(document, 'arch.E.year_s3').hidden, 'and leaves the other out');
  ok(!/on another grid/.test(text(row(document, 'arch.E.move_s3_node'))) && /network's grid: no bar/.test(text(moveHead)), 'a move on the network\'s grid: its head says so once, and the row prints its figure');
  ok(row(document, 'arch.E.move_s3_node').querySelector('.w-net').hidden, 'with no bar');
  archM('wh');
  // What prints beside the rows names its own unit.
  ok(/days$/.test(text(document.querySelector('[data-reading="arch.E.readings.transfer_days_one_copy"]'))), 'days on the wire read as days');
  eq(text(document.querySelector('[data-reading="arch.E.readings.copies.node"]')), '1 (1 to 2) copies', 'copies read as copies');
  ok(/19\.5 W/.test(text(document.querySelector('[data-reading="arch.E.readings.node_w_at_energy_tie"]'))), 'the tie reads in watts');
  ok(/kg CO2e/.test(text(document.querySelector('[data-reading="arch.E.readings.cloud_service_boundary_g"]'))), 'the ceiling in kilograms');
  for (const [k, words] of Object.entries({ node_vs_s3: /^1\.3 \(0\.35 to 4\.2\) years$/, node_vs_r2: /or never/, federated_vs_r2: /^never/ })) ok(words.test(text(document.querySelector(`[data-payback="${k}"]`))), `the payback ${k} prints as a crossover does`);
  // The typed fields: Nation-size figures, off the address.
  const tb = document.getElementById('e-exit_tb');
  eq(tb.value, '10', 'ten terabytes, an illustration');
  ok(/no Nation's holdings/.test(text(document.querySelector('.x-admin-note[data-group="comparison:E"]'))) && /have no source: labeled assumptions/.test(text(document.querySelector('.x-admin-note[data-group="comparison:E"]'))), 'and the note says what is assumed');
  const s3Before = V.val('arch.E.year_s3', 'usd');
  setField(window, tb, 20);
  ok(V.val('arch.E.year_s3', 'usd') > s3Before, 'a typed size recomputes');
  eq(window.location.search, '', 'and stays off the address');
  setField(window, tb, -1);
  eq(tb.getAttribute('aria-invalid'), 'true', 'a bad size says so');
  ok(/zero or above/.test(text(document.querySelector('.x-admin-note[data-group="comparison:E"] [data-input-why]'))), 'in its own note');
  near(V.p.exit_tb, 20, 'and keeps the last good value');
  setField(window, tb, 10);
  fire(window, tb, 'change');
  setField(window, document.getElementById('e-exit_admin_h'), 80);
  near(V.val('arch.E.move_s3_node', 'usd'), 900 + 80 * 60, 'hours at the wage, plus list egress');
  setField(window, document.getElementById('e-exit_admin_h'), 40);
  delete S.inputs.exit_tb;
  delete S.inputs.exit_admin_h;

  // The custody setting: on the Architectures tab, off the address, and a filter that moves no figure.
  const rule = (v) => setRadio(window, document.querySelector(`input[data-custody][value="${v}"]`));
  setRadio(window, document.querySelector('input[data-custody][value="any"]'));
  ok(document.getElementById('architectures').querySelector('.x-custody-setting input[data-custody]'), 'the control stands on the Architectures tab');
  ok(document.querySelector('input[data-custody][value="any"]').checked, 'at any place by default');
  eq(document.querySelectorAll('input[data-custody]').length, 3, 'three options');
  ok(!(Object.hasOwn(D.sel, 'custody')), 'not one of the global selectors');
  eq(text(document.querySelector('.x-custody-line')), D.custody.fixed_line, 'the fixed line stays with it');
  ok(/Each Nation decides for itself\./.test(text(document.querySelector('.x-custody-line'))), 'and says each Nation decides for itself');
  ok(/No row leaves this comparison/.test(text(document.querySelector('.x-custody-block:not([hidden])'))), 'with no rule, nothing leaves, and the block says so');
  eq(text(document.querySelector('[data-custody-now]')), '', 'and the plot says nothing');
  const untouched = flatNow();
  rule('node');
  eq(flatNow(), untouched, 'a rule moves no figure');
  eq(window.location.search, '', 'and stays off the address');
  for (const letter of Object.keys(D.comparisons)) {
    compare(letter);
    for (const name of Object.keys(D.custody.options)) {
      rule(name);
      const view = ex.custodyView(D, V.t, name).comparisons[letter];
      for (const m of ['wh', 'usd', 'g', 'ml']) {
        archM(m);
        const here = [...document.querySelectorAll(`[data-board="arch.${letter}"] .wall-row:not([hidden]):not(.is-ghost)`)].map((n) => n.dataset.row);
        ok(here.length > 0, `${letter} under ${name} at ${m}: a row stays`);
        for (const { key: left } of view.left) {
          ok(!here.includes(left), `${letter} under ${name} at ${m}: ${left} left the plate`);
          const ghost = row(document, left);
          ok(ghost.hidden || (ghost.getAttribute('aria-disabled') === 'true' && /^leaves at this rule: \S/.test(text(ghost.querySelector('.ladder-value')))), `${letter} under ${name} at ${m}: ${left} keeps its place as a ghost, with its reason`);
        }
        ok(here.includes(S.sel.arch) || (D.boards[`arch.${letter}`].scenario || []).includes(S.sel.arch), `${letter} under ${name} at ${m}: the selection stands on a row that stayed`);
        ok(!/undefined|NaN/.test(text(document.querySelector('[data-plate-x="arch"] [data-d="reading"]'))), `${letter} under ${name} at ${m}: the Reading reads`);
      }
      archM('wh');
      const block = document.querySelector(`.x-custody-block[data-group="comparison:${letter}"]`);
      ok(!block.hidden, `${letter} under ${name}: the block stands under the plate`);
      eq(block.closest('.x-custody').previousElementSibling.tagName, 'FIGURE', `${letter}: directly below the plate`);
      eq(block.querySelectorAll('.x-custody-grid > div:first-child > ul:first-of-type > li').length, view.left.length, `${letter} under ${name}: every row that left is listed`);
      for (const { key: left, reason } of view.left) {
        ok(text(block).includes(reason), `${left}: with its reason`);
        ok(document.querySelector(`tr[data-tr="${left}"]`).classList.contains('is-ghost'), `${left}: and its table row keeps no figure`);
      }
      if (view.left.length) ok(block.querySelector('table') && /stay/.test(text(block.querySelector('thead'))), `${letter} under ${name}: and what the rule costs`);
      else ok(/No row leaves/.test(text(block)), `${letter} under ${name}: or that nothing left`);
    }
    rule('any');
  }
  compare('C');
  rule('node');
  const cBlock = document.querySelector('.x-custody-block[data-group="comparison:C"]');
  ok(/Lowest figure against lowest figure, the rows that stay run higher on idle watts, paid hours, price, and energy\. A vendor's figure may count fewer items than a node's; the plate's boundary note says what each row counts\./.test(text(cBlock)), 'it names where the rows that stay run higher, and that the two sides may count different things');
  ok(/^Rows that leave, each with why it does not meet the rule$/.test(text(cBlock.querySelector('.label'))), 'and labels the rows that leave');
  key(window, plot, 'Home');
  key(window, plot, 'End');
  ok(!row(document, S.sel.arch).classList.contains('is-ghost'), 'the arrows step past a ghost');
  fire(window, row(document, 'arch.C.central_s3'), 'click');
  ok(S.sel.arch !== 'arch.C.central_s3', 'and a click on one selects nothing');
  ok(/rows leave this comparison at this setting/.test(text(document.querySelector('[data-custody-now]'))), 'and the plot says rows have left, and where they are listed');
  compare('E');
  const eBlock = document.querySelector('.x-custody-block[data-group="comparison:E"]');
  ok(/higher on idle watts and energy, and lower on price/.test(text(eBlock)), 'and where they run lower, at the settings shown');
  ok(/The move itself, one time and never added to a year/.test(text(eBlock)), 'and keeps the one-time rows apart');
  ok(/until the last copy is checked/.test(text(eBlock)), 'and prints the note on a row that stays');
  ok(row(document, 'arch.E.year_s3').classList.contains('is-ghost'), 'the store left the plate, and its ghost keeps its place');
  fire(window, document.querySelector('[data-plate-x="arch"] [data-reset]'), 'click');
  eq(S.custody, 'any', 'Reset takes the rule back');
  ok(document.querySelector('input[data-custody][value="any"]').checked, 'and its radio');
  compare('E');

  // A reader's own reading: the field beside the figure, the label from the model, and off the address.
  const tabs = [...document.querySelectorAll('.section-strip [role="tab"]')];
  fire(window, tabs[8], 'click');
  const opener = document.querySelector('#method [data-at="readings"]');
  ok(!opener.closest('[data-js]').hidden, 'Method offers the way in');
  fire(window, opener, 'click');
  eq(document.activeElement, document.getElementById('readings'), 'the Method link opens Settings at the readings');
  key(window, document.getElementById('settings'), 'Escape');
  eq(document.activeElement, opener, 'and Escape comes back to it');
  fire(window, tabs[3], 'click');
  const reading = (k) => document.querySelector(`[data-measured="${k}"]`);
  const foot = (name) => document.querySelector(`[data-plate-x="${name}"] [data-measured-line]`);
  ok(!reading('node_w').hidden && reading('node_w').value === '', 'the field shows, empty');
  eq(reading('node_w').max, '100000', 'with the model\'s bounds');
  ok(foot('arch').hidden, 'and no line until a value is typed');
  const moved = (k) => !!row(document, k).querySelector('.x-measured-tag');
  ok(!moved('arch.D.node_100k'), 'no label before a reading');
  setField(window, reading('node_w'), 62);
  near(V.p.node_w, 62, 'a reading recomputes');
  ok(moved('arch.D.node_100k'), 'a moved row carries the label');
  eq(text(row(document, 'arch.D.node_100k').querySelector('.x-measured-tag')), label, 'in the model\'s words');
  eq(text(document.querySelector('tr[data-tr="arch.D.node_100k"] .x-measured-tag')), label, 'in its table row too');
  ok(!moved('arch.D.hyper'), 'a row it did not move carries none');
  ok(moved('cross.prompts_energy_vs_hyper'), 'a crossover it moved carries it');
  ok(!V.run.swept.includes('node_w'), 'it takes no spread');
  const want = oracle.measured_cases.find((c) => c.typed.node_w === 62);
  eq(text(foot('arch')), want.line, 'the foot of the plate holds Python\'s sentence');
  for (const name of ['where', 'lever', 'cross', 'catalog']) {
    const holds = [...document.querySelectorAll(`[data-plate-x="${name}"] .plate-plot [data-row]`)].some((n) => V.isMoved(n.dataset.row));
    ok(!foot(name).hidden && text(foot(name)) === (holds ? want.line : `${want.line_unused} No row on this plate uses it.`), `the foot of ${name} holds it, in the form for ${holds ? 'a plate it moved' : 'a plate it did not move'}`);
  }
  eq(text(foot('use')), `${want.line_unused} No row on this plate uses it.`, 'and a plate with no moved row names the reading without saying it includes it');
  ok(/Includes your measurement, not verified by ATNI/.test(text(document.querySelector('[data-measured-why]'))), 'Settings confirms it');
  eq(window.location.search, '', 'it stays off the address');
  eq(document.querySelector('[data-setting-line]').textContent.includes('62'), false, 'and out of the setting line');
  // A setting cannot overwrite it, and a change of settings keeps the label true.
  setRadio(window, setting(document, 'device', 'laptop'));
  near(V.p.node_w, 62, 'no setting overwrites a reading');
  ok(moved('arch.D.node_100k'), 'and the label stays');
  setRadio(window, setting(document, 'device', 'phone'));
  // Copy Reading: the line on a moved row, none on a row it did not move.
  compare('D');
  fire(window, row(document, 'arch.D.node_100k'), 'click');
  ok(text(document.querySelector('[data-plate-x="arch"] [data-d="reading"]')).endsWith(want.line), 'the Reading on screen ends with the line');
  fire(window, document.querySelector('[data-plate-x="arch"] [data-copy]'), 'click');
  await wait();
  ok(window.copied.includes(want.line), 'Copy Reading carries it');
  fire(window, row(document, 'arch.D.hyper'), 'click');
  fire(window, document.querySelector('[data-plate-x="arch"] [data-copy]'), 'click');
  await wait();
  ok(!window.copied.includes(want.line), 'and leaves it off a row it did not move');
  // CSV: the line first, the label on every moved row.
  fire(window, document.querySelector('[data-outputs]'), 'click');
  const csv = (await window.lastBlob.text()).split('\n');
  eq(csv[0], `"# ${want.line}"`, 'the CSV opens with the line, quoted');
  ok(csv[1].endsWith(',measured'), 'and a measured column');
  ok(csv.some((l) => l.startsWith('arch.D.node_100k,wh,') && l.endsWith(`,"${label}"`)), 'the label sits on a moved row');
  ok(csv.some((l) => l.startsWith('arch.D.hyper,wh,') && l.endsWith(',')), 'and not on the others');
  for (const k of want.moved) ok(csv.some((l) => l.startsWith(`${k},wh,`) && l.endsWith(`,"${label}"`)), `${k}: every row Python says it moved`);
  // Bad values say what is allowed and keep the last good one.
  setField(window, reading('node_w'), -5);
  eq(reading('node_w').getAttribute('aria-invalid'), 'true', 'a bad reading says so');
  ok(/AI node idle takes a number from 0 to 100000 W/.test(text(document.querySelector('[data-measured-why]'))), 'and says what is allowed');
  near(V.p.node_w, 62, 'and keeps the last good value');
  fire(window, reading('node_w'), 'change');
  eq(reading('node_w').value, '62', 'the field returns to it');
  setField(window, reading('u_room'), 0);
  ok(reading('u_room').getAttribute('aria-invalid') === 'true' && !Object.hasOwn(S.measured, 'u_room'), 'a zero utilization is refused');
  fire(window, reading('u_room'), 'change');
  // Your Use moves too.
  setField(window, reading('dev_phone'), 3.2);
  ok(moved('use.screen') && !moved('use.chat'), 'a device reading labels the screen row, and only it');
  // Clearing goes back to the model.
  setField(window, reading('dev_phone'), '');
  ok(!Object.hasOwn(S.measured, 'dev_phone') && !moved('use.screen'), 'a cleared field goes back to the model');
  const clear = document.querySelector('[data-clear-measured]');
  ok(!clear.hidden, 'a clear button stands while a reading is in use');
  fire(window, clear, 'click');
  eq(Object.keys(S.measured).length, 0, 'and clears them');
  ok(clear.hidden && foot('arch').hidden, 'the line and the button go');
  eq(reading('node_w').value, '', 'and the field empties');
  eq(flatNow(), untouched, 'and every figure is the model\'s again');

  // The damage control: off by default, its own column, and it moves nothing else.
  const damage = document.querySelector('[data-damage]');
  eq(damage.value, 'off', 'the damage control starts off');
  eq(text(damage.closest('.x-field').querySelector('label')), D.carbon_damage.label, 'named as the model names it');
  ok(document.querySelector('[data-plate-x="arch"] [data-d="damage"]').hidden, 'no damage line');
  ok([...document.querySelectorAll('th[data-damage-col]')].every((n) => n.hidden), 'no column');
  const setDamage = (v) => { damage.value = v; fire(window, damage, 'input'); };
  fire(window, row(document, 'arch.D.hyper'), 'click');
  setDamage('epa_2020');
  eq(flatNow(), untouched, 'it moves no figure');
  eq(window.location.search, '', 'and stays off the address');
  const line = document.querySelector('[data-plate-x="arch"] [data-d="damage"]');
  ok(!line.hidden, 'the line shows');
  eq(text(line.querySelector('.x-damage-head')), `${D.carbon_damage.column}, as of ${D.carbon_damage.as_of}`, 'it says what it is, dated');
  const g = V.val('arch.D.hyper', 'g');
  const fam = D.carbon_damage.families.epa_2020;
  eq(text(line.querySelector('.x-damage-figures')), `${fam.label}, an estimate: $${ex.num(g / 1e6 * fam.central)} (${ex.num(g / 1e6 * fam.low)} to ${ex.num(g / 1e6 * fam.high)}), 2020 USD, for this row's CO2e`, 'whose estimate, of what: central, low, and high, never one number, in its own currency and year');
  ok(line.querySelector('a.x-c[href="#src-ex-001"]') && document.getElementById('src-ex-001'), 'with its receipts');
  ok(/Applied here to CO2e/.test(text(line)), 'and its limit');
  ok(!document.querySelector('[data-plate-x="arch"] [data-d="price"]').textContent.includes('Low'), 'the price stays the price');
  const damageHead = document.querySelector('#architectures [data-group="comparison:D"] th[data-damage-col]');
  ok(!damageHead.hidden && text(damageHead) === 'Damage, 2020 USD', 'its own column in the Table view, its head the currency');
  const damageCaption = damageHead.closest('table').querySelector('caption [data-damage-col]');
  ok(!damageCaption.hidden && text(damageCaption).includes(fam.label) && /not a price/.test(text(damageCaption)), 'and the caption names the family once, and says it is not a price');
  ok(/^\$\S+ \(\S+ to \S+\)$/.test(text(document.querySelector('tr[data-tr="arch.D.hyper"] td[data-c="damage"]'))), 'a cell for each row, on one line');
  eq(text(document.querySelector('tr[data-tr="arch.D.hyper"] td[data-c="usd"]')), V.table('arch.D.hyper').usd, 'never in the price cell');
  setDamage('epa_2017_domestic');
  ok(/no central in the source/.test(text(line.querySelector('.x-damage-figures'))), 'a family with no central invents none');
  setDamage('uba');
  ok(/2020 EUR/.test(text(line.querySelector('.x-damage-figures'))) && !/\$/.test(text(line.querySelector('.x-damage-figures'))), 'euros stay euros');
  setDamage('ec_2019');
  eq(text(line.querySelector('.x-damage-head')), `${D.carbon_damage.column_avoidance}, as of ${D.carbon_damage.as_of}`, 'an avoidance cost never wears the damage head');
  ok(/^Not a price\./.test(text(line.querySelector('.caption'))) && /an avoidance cost:/.test(text(line.querySelector('.x-damage-figures'))), 'and its note opens by saying it is not a price');
  // A project shows its tonnes first.
  const pf = (k) => document.querySelector(`[data-pf="${k}"]`);
  const damageRow = document.querySelector('[data-po-damage-row]');
  setField(window, pf('mw'), 100);
  setField(window, pf('lf'), 1);
  ok(damageRow.hidden, 'no dollar before the tonnes');
  pf('grid').value = '350';
  fire(window, pf('grid'), 'input');
  ok(!damageRow.hidden, 'then beside them');
  setDamage('epa_2020');
  eq(text(document.querySelector('[data-po="damage"]')), `${D.carbon_damage.families.epa_2020.label}, an estimate: $${ex.num(306600 * 190)} (${ex.num(306600 * 120)} to ${ex.num(306600 * 340)}), 2020 USD, for this project's CO2e`, 'at the model\'s own arithmetic');
  setDamage('off');
  ok(damageRow.hidden && line.hidden && [...document.querySelectorAll('th[data-damage-col]')].every((n) => n.hidden), 'off again, it all goes');
  fire(window, document.querySelector('[data-plate-x="project"] [data-reset]'), 'click');
  compare('D');

  // The scenario file: a warning before the file exists, a local file, and nothing in the address.
  fire(window, document.querySelector('.x-settings-button'), 'click');
  const save = document.querySelector('[data-scenario-save]');
  const warn = document.querySelector('[data-scenario-warn]');
  const status = document.querySelector('[data-scenario-status]');
  ok(warn.hidden, 'the warning waits for the button');
  window.lastBlob = null;
  fire(window, save, 'click');
  ok(!warn.hidden, 'Save warns first');
  eq(text(warn.querySelector('strong')), 'This file may hold your Nation\'s figures.', 'in the words asked for');
  eq(window.lastBlob, null, 'and no file exists yet');
  eq(document.activeElement, document.querySelector('[data-scenario-confirm]'), 'focus goes to the choice');
  eq(document.querySelector('[data-scenario-confirm]').getAttribute('aria-describedby'), warn.id, 'which a screen reader hears with the warning');
  fire(window, document.querySelector('[data-scenario-cancel]'), 'click');
  ok(warn.hidden && window.lastBlob === null, 'Cancel saves nothing');
  eq(document.activeElement, save, 'and comes back');
  // A whole scenario: settings, wage and tariff, Your Use, typed values, a reading, the rule, and the damage family.
  setRadio(window, setting(document, 'device', 'laptop'));
  setRadio(window, setting(document, 'wage', '25'));
  setRadio(window, setting(document, 'tariff', 'bpa_wholesale'));
  setRadio(window, document.querySelector('input[data-opt="mode"][value="office"]'));
  setField(window, document.querySelector('input[data-field="seats"]'), 12);
  setField(window, document.querySelector('input[data-field="chat"]'), 33);
  setField(window, document.getElementById('a-admin'), 9);
  setField(window, document.getElementById('e-exit_tb'), 25);
  setField(window, reading('node_w'), 62);
  rule('federated');
  setDamage('uba');
  eq(window.location.search, '?device=laptop', 'the address holds the global selector, and nothing else');
  const stateNow = () => JSON.stringify([S.settings, S.fields, S.inputs, S.measured, S.mode, S.seats, S.custody, S.damage]);
  const whole = stateNow();
  const wholeTree = flatNow();
  fire(window, save, 'click');
  fire(window, document.querySelector('[data-scenario-confirm]'), 'click');
  ok(window.lastBlob && window.lastBlob.type === 'application/json', 'the file is made in the browser');
  ok(warn.hidden && /to this machine\. Nothing was sent anywhere\./.test(text(status)), 'and the page says where it went');
  const saved = await window.lastBlob.text();
  const file = JSON.parse(saved);
  eq(`${file.kind} ${file.schema}`, `${ex.SCENARIO_KIND} 1`, 'it says what it is');
  eq(file.notice, ex.SCENARIO_WARNING, 'and carries the warning');
  ok(/^\d{2}\/\d{2}\/\d{4}$/.test(file.saved), 'dated MM/DD/YYYY');
  eq(file.measured.node_w, 62, 'typed values stand under their input names');
  eq(file.settings.wage, '25', 'wage travels in the file, where the address never carries it');
  ok(!saved.includes(label), 'no label is written, so none can be read back');
  eq(window.location.search, '?device=laptop', 'saving changes no address');
  const choose = async (text_, name = 'scenario.json') => {
    const input = document.querySelector('[data-scenario-load]');
    Object.defineProperty(input, 'files', { configurable: true, value: [new window.File([text_], name, { type: 'application/json' })] });
    fire(window, input, 'change');
    await wait(20);
  };
  fire(window, document.querySelector('[data-plate-x="arch"] [data-reset]'), 'click');
  eq(window.location.search, '', 'Reset clears the address');
  eq(flatNow(), untouched, 'and the figures');
  ok(foot('arch').hidden, 'and the line');
  await choose(saved);
  eq(stateNow(), whole, 'the file loads back whole');
  eq(flatNow(), wholeTree, 'to the same figures');
  eq(window.location.search, '?device=laptop', 'the query string keeps the global selectors only');
  ok(/Scenario loaded from your own machine\./.test(text(status)) && text(status).includes(label), 'the page says so, and the reading is stamped again');
  eq(text(foot('arch')), `Includes ${label}: AI node idle 62 W (model 40).`, 'by the model, not the file');
  eq(document.querySelector('input[data-custody]:checked').value, 'federated', 'the controls follow');
  eq(damage.value, 'uba', 'all of them');
  eq(document.getElementById('e-exit_tb').value, '25', 'to the typed fields');
  eq(reading('node_w').value, '62', 'and the readings');
  // A file from another build says so, and a file's own words reach nothing.
  await choose(JSON.stringify({ ...file, model_hash: 'other', notice: 'Verified by ATNI', saved: '<img src=x onerror=alert(1)>' }));
  ok(/another build of the model/.test(text(status)), 'another build is named');
  ok(!/Verified by ATNI|onerror/.test(text(document.body)) && !document.querySelector('img[src="x"]'), 'and a file\'s own words reach nothing');
  // Untrusted input: each of these is refused whole, says why, and changes nothing.
  const refused = {
    'not JSON': 'not json {',
    'an array': '[1,2]',
    'null': 'null',
    'a number': '7',
    'another kind of file': JSON.stringify({ ...file, kind: 'other' }),
    'another schema': JSON.stringify({ ...file, schema: 2 }),
    'an unknown entry': JSON.stringify({ ...file, label: 'verified by ATNI' }),
    'an unknown setting': JSON.stringify({ ...file, settings: { ...file.settings, toaster: 'on' } }),
    'a prototype name as a setting': `{"kind":"${ex.SCENARIO_KIND}","schema":1,"settings":{"__proto__":{"polluted":1}}}`,
    'a constructor option': JSON.stringify({ ...file, settings: { ...file.settings, device: 'constructor' } }),
    'an option that is no string': JSON.stringify({ ...file, settings: { ...file.settings, device: ['phone'] } }),
    'settings that are a list': JSON.stringify({ ...file, settings: ['device'] }),
    'a negative count': JSON.stringify({ ...file, fields: { ...file.fields, chat: -1 } }),
    'a count in words': JSON.stringify({ ...file, fields: { ...file.fields, chat: '10' } }),
    'an unknown count': JSON.stringify({ ...file, fields: { ...file.fields, nope: 1 } }),
    'an endless count': `{"kind":"${ex.SCENARIO_KIND}","schema":1,"fields":{"chat":1e999}}`,
    'a model input no field takes': JSON.stringify({ ...file, inputs: { p_in: 3 } }),
    'a typed value in words': JSON.stringify({ ...file, inputs: { exit_tb: '10' } }),
    'a reading out of bounds': JSON.stringify({ ...file, measured: { u_room: 0 } }),
    'a reading that is true': JSON.stringify({ ...file, measured: { node_w: true } }),
    'a reading with a label of its own': JSON.stringify({ ...file, measured: { node_w: { value: 62, label: 'verified by ATNI' } } }),
    'a reading in text': JSON.stringify({ ...file, measured: { node_w: '62' } }),
    'a reading of an input no one can measure': JSON.stringify({ ...file, measured: { p_in: 3 } }),
    'an unknown who': JSON.stringify({ ...file, mode: 'admin' }),
    'no seats': JSON.stringify({ ...file, seats: 0 }),
    'an unknown rule': JSON.stringify({ ...file, custody: 'nowhere' }),
    'a prototype rule': JSON.stringify({ ...file, custody: '__proto__' }),
    'an unknown family': JSON.stringify({ ...file, damage: 'toString' }),
  };
  const heldState = stateNow();
  const heldTree = flatNow();
  for (const [name, body] of Object.entries(refused)) {
    await choose(body);
    ok(/was not loaded|nothing was changed/.test(text(status)), `${name}: refused, and it says so`);
    eq(stateNow(), heldState, `${name}: nothing changed`);
    eq(flatNow(), heldTree, `${name}: no figure moved`);
    eq(({}).polluted, undefined, `${name}: nothing reached a prototype`);
    eq(window.Object.prototype.polluted, undefined, `${name}: in the page either`);
  }
  await choose(JSON.stringify({ kind: ex.SCENARIO_KIND, schema: 1, fields: { chat: -1 }, measured: { u_room: 0 }, seats: 0 }));
  eq(status.querySelectorAll('li').length, 3, 'it lists each problem, not the first alone');
  const large = `${JSON.stringify(file)}${' '.repeat(70000)}`;
  await choose(large);
  ok(/too large/.test(text(status)), 'a file too large is refused before it is read');
  eq(stateNow(), heldState, 'and changes nothing');
  await choose(JSON.stringify({ kind: ex.SCENARIO_KIND, schema: 1 }));
  eq(S.settings.device, D.sel.device.def, 'a file naming no settings loads the defaults');
  eq(window.location.search, '', 'and the address follows');
  fire(window, document.querySelector('[data-plate-x="arch"] [data-reset]'), 'click');
  eq(flatNow(), home, 'the figures end where they began');

  // The damage layer lifts out: a page built without it runs, with no control to reach it.
  const data = JSON.parse(html.match(/<script type="application\/json" id="explorer-data">([\s\S]*?)<\/script>/)[1]);
  delete data.carbon_damage;
  const without = await load('', html.replace(/(<script type="application\/json" id="explorer-data">)[\s\S]*?(<\/script>)/, (m, a, b) => a + JSON.stringify(data).replace(/</g, '\\u003c') + b));
  ok(!without.document.querySelector('th[data-damage-col]'), 'without the damage layer no column stands');
  ok(ex.readScenario(data, JSON.stringify({ kind: ex.SCENARIO_KIND, schema: 1, damage: 'uba' })).problems.length === 1, 'and a file cannot ask for it');
}

// The home page's instrument: the Explorer's model at its defaults, poured, with its two controls, and every link off the first screen landing where it says -------------
const HOME = 'http://localhost/site/index.html';
const asPlatePage = (window) => { // what a plate page needs from a browser, as ai.js and dc.js give it
  window.innerWidth = 1440;
  window.innerHeight = 900;
  window.ResizeObserver = class { observe() {} };
  const visible = (el) => !el.closest('[hidden]');
  Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', { get() { return visible(this) ? window.document.body : null; } });
  Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { get() { return visible(this) ? 900 : 0; } });
  Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { get() { return visible(this) ? 600 : 0; } });
  window.Element.prototype.scrollIntoView = function () { window.scrolled = this.id; };
};
const openLink = async (href) => {
  const url = new URL(href, HOME);
  const page = await open(read(`${decodeURI(url.pathname).slice(1)}index.html`), url.href, asPlatePage);
  await wait();
  return page;
};
const shownPanel = (document) => [...document.querySelectorAll('[role="tabpanel"]')].filter((n) => !n.hidden).map((n) => n.id).join();

async function homeBand() {
  const home = read('site/index.html');
  const still = new JSDOM(home).window.document;
  const band = still.querySelector('.home-instrument');
  const panel = still.getElementById('home-receipts');
  ok(band && band.previousElementSibling.classList.contains('home-door'), 'the instrument stands under the door');
  eq(still.querySelector('.home-links a[href="explorer/"]').textContent, 'Open the Resource Use Explorer', 'with a link in');
  ok(still.querySelector('.site-nav a[href="explorer/"]'), 'and the Explorer is in the nav');
  ok(/bottom-up process model, checked against published figures/.test(text(panel)) && /not measurements/.test(text(panel)), 'the receipts say what the figure is');
  ok(/Nothing you enter leaves your browser/.test(text(panel)), 'and that nothing a reader enters leaves the browser');
  ok(/Modeled, \d{2}\/\d{4}/.test(text(band.querySelector('.home-read'))), 'the figure says it is modeled, and when');
  ok(!/<script[^>]+(resource-model|plate\.js)|id="explorer-data"/.test(home), 'the home page loads no model and no kit');
  for (const name of ['band', 'receipts']) ok(Buffer.byteLength(home.match(new RegExp(`<!-- explorer:home:${name} -->[\\s\\S]*<!-- /explorer:home:${name} -->`))[0]) < 8192, `and the ${name} block stays small`);
  ok(/<!-- SLOT:home:whats-new -->[\s\S]*?whats-new-rows[\s\S]*?<!-- \/SLOT -->/.test(home), 'the What\'s New band holds its rows in its marked place');
  ok(/<!-- SLOT:home:photo-band -->\s*<!-- \/SLOT -->/.test(home), 'the photograph band has its marked place, empty');
  ok(!still.querySelector('main img') && still.querySelector('.wordmark img[src$="atni-energy-header-on-dark.svg"]') && still.querySelector('.wordmark img[src$="atni-energy-header.svg"]'), 'the logo is the header\'s, per theme; the large lockup belongs to About and print');

  // Numbers: every row at every boundary is the model's, and each sentence reads the model.
  const pure = require(path.join(ROOT, 'site/assets/js/resource-model.js'));
  const D = JSON.parse(html.match(/<script type="application\/json" id="explorer-data">([\s\S]*?)<\/script>/)[1]);
  const V = pure.Views(D);
  V.set(V.fresh());
  const claims = {};
  for (const name of fs.readdirSync(path.join(ROOT, 'site/data/claims'))) for (const c of JSON.parse(read(`site/data/claims/${name}`)).claims || []) claims[c.id] = c;
  const { stops: poured, tier, schema } = JSON.parse(still.getElementById('home-ladder').textContent);
  eq(`${tier} ${schema}`, 'T0 1', 'the block has its tier and schema');
  const LAYERS = { dc: (l) => l.data_center, adds: (l) => l.data_center + l.network, whole: (l) => l.data_center + l.network + l.router + l.device };
  const rows = [...band.querySelectorAll('[data-row]')];
  eq(rows.map((n) => n.dataset.row).join(), 'chat_hour,video_hour,short_hour,coding_hour', 'four rows, chat first');
  eq(Object.keys(poured).join(), 'dc,adds,whole', 'three boundaries');
  for (const [stop, of] of Object.entries(LAYERS)) {
    const at = poured[stop];
    const ends = [];
    for (const row of rows) {
      const k = row.dataset.row;
      const whose = (t) => of(t.catalog[k].layers);
      const [lo, hi] = V.run.spread(`check:${k}:${stop}`, whose);
      const f = pure.figure(whose(V.t), lo, hi, 'wh');
      eq(`${at.rows[k].num} ${at.rows[k].tag}`, `${f.num} ${f.tag}`, `${k} at ${stop}: the figure and its range are the model's`);
      eq(f.unit, 'Wh', `${k} at ${stop}: and the unit`);
      ends.push(whose(V.t), lo, hi);
      const { router, device } = V.t.catalog[k].layers;
      const tail = stop === 'whole' ? `, and ${pure.num(router + device)} of them go to your own screen and router.` : '; your own screen and router are not counted here.';
      ok(at.rows[k].reading.includes(`about ${f.num} watt-hours ${f.tag}${tail}`), `${k} at ${stop}: the sentence reads the model`);
      ok(/on a phone over Wi-Fi/.test(at.rows[k].reading), `${k} at ${stop}: and names its setting`);
    }
    // The ruler is in whole decades around what the stop counts, and holds it.
    const decade = (v) => Math.log10(v);
    eq(at.ticks[0][1], new Intl.NumberFormat('en-US').format(10 ** Math.floor(decade(Math.min(...ends)))), `${stop}: the ruler starts at the decade under the lowest figure`);
    eq(at.ticks.at(-1)[1], new Intl.NumberFormat('en-US').format(10 ** Math.ceil(decade(Math.max(...ends)))), `${stop}: and ends at the decade over the highest`);
    for (const r of Object.values(at.rows)) ok([r.x, r.lo, r.hi].every((x) => x >= 0 && x <= 1) && r.lo <= r.x && r.x <= r.hi, `${stop}: a mark sits inside its range, on the ruler`);
  }
  eq(poured.whole.ticks.map((t) => t[1]).join(), '1,10,100,1,000', 'the whole hour runs 1 to 1,000, as the direction says');
  // Shared ground: as the kit's rule, and it says the words the figures say.
  const ground = poured.whole.rows.chat_hour.shared;
  eq(ground.say, `Shared ground, ${pure.num(V.run.spread('check:chat_hour:whole', (t) => LAYERS.whole(t.catalog.chat_hour.layers))[0])} to ${pure.num(V.run.spread('check:chat_hour:whole', (t) => LAYERS.whole(t.catalog.chat_hour.layers))[1])} Wh`, 'chat\'s shared ground is chat\'s own range, since video and short video run past it');
  eq(`${ground.from} ${ground.to}`, '0 2', 'across chat, video, and short video; agentic coding sits above it');
  eq(`${poured.whole.rows.coding_hour.shared.from} ${poured.whole.rows.coding_hour.shared.to}`, '1 3', 'agentic coding shares ground only with the widest row');

  // The static page is the whole hour.
  const first = rows[0];
  eq(text(band.querySelector('.readout-value')), poured.whole.rows.chat_hour.num, 'the poster is the first row');
  eq(text(band.querySelector('.reading')), poured.whole.rows.chat_hour.reading, 'with its sentence');
  ok(first.classList.contains('is-on') && band.querySelector('.ladder').style.getPropertyValue('--at') === String(poured.whole.rows.chat_hour.x), 'and the needle stands at it');
  for (const row of rows) {
    const r = poured.whole.rows[row.dataset.row];
    eq(row.style.getPropertyValue('--x'), String(r.x), `${row.dataset.row}: placed from the block`);
    eq(`${text(row.querySelector('.ladder-num'))} ${text(row.querySelector('.ladder-tag'))}`, `${r.num} ${r.tag}`, `${row.dataset.row}: figures from the block`);
  }

  // Provenance: every row carries its claims, their status, and their limits, and the table holds every boundary.
  const trs = [...panel.querySelectorAll('[data-stop]')];
  eq(trs.length, 4, 'four rows of receipts');
  for (const tr of trs) {
    const key = tr.dataset.stop;
    eq([...tr.querySelectorAll('td')].slice(0, 3).map(text).join('|'), ['dc', 'adds', 'whole'].map((s) => `${poured[s].rows[key].num} ${poured[s].rows[key].tag}`).join('|'), `${key}: the table holds every boundary`);
    const ids = [...tr.querySelectorAll('a[href^="explorer/#src-"]')].map((a) => a.getAttribute('href').slice('explorer/#src-'.length));
    ok(ids.length > 1, `${key}: carries its claims`);
    for (const id of ids) {
      ok(/^(verified|partly)$/.test(claims[id].status) && html.includes(`id="src-${id}"`), `${key}: ${id} ships and has its receipt`);
      if (claims[id].status === 'partly') ok(text(tr).includes(`${id}: partly verified. Limit: `), `${key}: ${id} states its limit`);
    }
    ok(/verified against the source/.test(text(tr)) || /partly verified/.test(text(tr)), `${key}: states a status`);
  }

  // The door: figures poured from the plates they name, each with its claim.
  const dcPage = read('site/data-centers/index.html');
  const project = JSON.parse(dcPage.match(/<script type="application\/json" id="plate-data-dc-project">([\s\S]*?)<\/script>/)[1]);
  const projectRow = (k) => project.rows.find((r) => r.key === k);
  const controls = Object.fromEntries(JSON.parse(read('site/data/plates/dc-project.json')).controls.map((c) => [c.name, c.default]));
  const questions = [...still.querySelectorAll('.home-questions li')];
  eq(questions.length, 3, 'three questions');
  const figure = (spec) => text(still.querySelector(`[data-m="${spec}"]`));
  eq(figure('q:chat'), poured.whole.rows.chat_hour.num, 'the first answer is the ladder\'s chat');
  eq(figure('q:video'), poured.whole.rows.video_hour.num, 'and the ladder\'s video');
  eq(figure('q:mw'), String(controls.p_mw), 'the second answer is the plate\'s default megawatts');
  eq(figure('q:lf'), String(controls.p_lf), 'and its load factor');
  eq(figure('q:twh'), projectRow('twh').text, 'and what the plate prints for the year');
  eq(figure('q:share'), projectRow('share').text, 'and for the region');
  const region = claims['dem-058'];
  ok(/dem-058/.test(text(questions[1])) && text(panel).includes(`dem-058: verified against the source.`) && region.status === 'verified' && text(panel).includes(`${region.value.toLocaleString('en-US')} aMW`), 'with its claim and status in the receipts');
  ok(/fp-001/.test(text(questions[0])) && /fp-001/.test(text(panel)), 'and the first answer\'s claim is in the receipts');
  const exits = questions.map((li) => li.querySelector('p > a:last-child'));
  eq(exits.map(text).join(), 'fp-001 and more,dem-058,Open the checklists', 'the three stubs end the same way: a claim id, a claim id, and the way to the checklists');
  eq(exits.map((a) => a.getAttribute('href')).join(), '#home-receipts,#home-receipts,data-centers/#checklists', 'the claim ids open the receipts, and the third goes where its question goes');
  ok(exits.every((a) => !a.className && !a.children.length) && !still.querySelector('.home-door .receipt'), 'plain link text: the door holds no box');
  ok(still.querySelector('.home-links').firstElementChild.matches('[data-receipts]'), 'Receipts is the first way out on the foot line');
  const checklists = [...dcPage.matchAll(/<details class="disclosure" id="q-([a-z]+)"/g)].map((m) => m[1]);
  ok(text(questions[2]).includes(`${claims['lc-061'].value} checklists: ${checklists.slice(0, -1).join(', ')}, ${checklists.at(-1)}.`) && checklists.length === claims['lc-061'].value, 'the third answer names the checklists the page holds, and its count is the claim');
  ok(text(questions[1].querySelector('p')).startsWith('Example, at settings you can change:'), 'the second answer reads as an example');

  // Without scripts every figure is on the page and no control pretends to work.
  ok(still.querySelector('.home-foot fieldset').hidden && [...band.querySelectorAll('[data-row] input')].every((n) => n.hidden) && still.querySelector('[data-receipts]').hidden, 'without scripts the controls wait');
  ok(!panel.hidden, 'and the receipts show');

  // With scripts.
  const page = await open(home, HOME);
  await wait();
  eq(page.errors.length, 0, `page errors: ${page.errors.slice(0, 3).join(' | ')}`);
  const live = page.document.querySelector('.home-instrument');
  const foot = page.document.querySelector('.home-foot');
  const receipts = page.document.getElementById('home-receipts');
  const button = page.document.querySelector('[data-receipts]');
  const poster = () => text(live.querySelector('.readout-value'));
  const reading = () => text(live.querySelector('.reading'));
  const needleName = () => text(live.querySelector('.needle-label'));
  const choose = (name, value) => {
    const radio = (name === 'home-boundary' ? foot : live).querySelector(`input[name="${name}"][value="${value}"]`);
    radio.checked = true;
    fire(page.window, radio, 'change');
  };
  ok(!foot.querySelector('fieldset').hidden && !button.hidden, 'the controls show with scripts');
  ok([...live.querySelectorAll('[data-row] input')].every((n) => !n.hidden && n.type === 'radio' && n.closest('label')), 'and each row is a native radio inside its label');
  eq(live.querySelector('.ladder legend').textContent, 'One hour of', 'in a named group');
  ok(receipts.hidden && button.getAttribute('aria-expanded') === 'false', 'receipts wait for a reader');
  eq(poster(), poured.whole.rows.chat_hour.num, 'whole hour, chat first');
  eq(foot.querySelector('input:checked').value, 'whole', 'the whole hour is the default');
  eq(needleName(), 'Chat, 10 prompts', 'the needle names the row, at no setting of the reader\'s');
  ok(!live.querySelector('.ladder-shared').hidden, 'the shared ground shows');
  eq(text(live.querySelector('.ladder-shared-label')), poured.whole.rows.chat_hour.shared.say, 'and says what it spans');
  eq(['--from', '--to', '--rows'].map((name) => live.querySelector('.ladder-shared').style.getPropertyValue(name)).join(), `${ground.from},${ground.to},${rows.length}`, 'and stands across the rows it says');

  choose('home-row', 'coding_hour');
  eq(poster(), poured.whole.rows.coding_hour.num, 'a row moves the poster');
  eq(reading(), poured.whole.rows.coding_hour.reading, 'and the Reading');
  eq(live.querySelector('.ladder').style.getPropertyValue('--at'), String(poured.whole.rows.coding_hour.x), 'and the needle');
  eq(needleName(), 'Agentic coding', 'and its name');
  ok(live.querySelector('.ladder-needle').classList.contains('is-flip'), 'which reads back from the far end');
  ok(/agentic coding/.test(text(live.querySelector('[data-band-status]'))), 'and the new figure is announced');
  ok(live.querySelector('[data-row="coding_hour"]').classList.contains('is-on') && !live.querySelector('[data-row="chat_hour"]').classList.contains('is-on'), 'one row is selected');

  choose('home-boundary', 'dc');
  eq(poster(), poured.dc.rows.coding_hour.num, 'the boundary moves the poster');
  eq(reading(), poured.dc.rows.coding_hour.reading, 'and the Reading, which says what it leaves out');
  ok(/not counted here/.test(reading()), 'in words');
  eq(needleName(), 'Agentic coding, your setting', 'and the needle says the reader moved it');
  eq([...live.querySelectorAll('.ladder-axis span')].map(text).join(), poured.dc.ticks.map((t) => t[1]).join(), 'the ruler refits');
  eq(live.querySelectorAll('.ladder-grid > i:not(.ladder-needle):not(.ladder-tick)').length, poured.dc.ticks.length, 'with its grid');
  ok(live.querySelector('.ladder-tick').hidden, 'the screen and router line leaves with what it counts');
  for (const row of live.querySelectorAll('[data-row]')) {
    const r = poured.dc.rows[row.dataset.row];
    eq(row.style.getPropertyValue('--x'), String(r.x), `${row.dataset.row}: the mark moves`);
    eq(`${text(row.querySelector('.ladder-num'))} ${text(row.querySelector('.ladder-tag'))}`, `${r.num} ${r.tag}`, `${row.dataset.row}: and its figures`);
  }
  choose('home-boundary', 'whole');
  ok(!live.querySelector('.ladder-tick').hidden, 'the line comes back at the whole hour');
  eq(needleName(), 'Agentic coding', 'and the setting is the default again');

  const over = live.querySelector('[data-row="short_hour"]');
  fire(page.window, over.querySelector('.ladder-label'), 'pointerover');
  eq(poster(), poured.whole.rows.short_hour.num, 'a row under the pointer shows');
  eq(live.querySelector('input:checked').value, 'coding_hour', 'and selects nothing');
  fire(page.window, live.querySelector('.ladder'), 'pointerleave');
  eq(poster(), poured.whole.rows.coding_hour.num, 'and the selected row comes back');

  fire(page.window, button, 'click');
  ok(!receipts.hidden && button.getAttribute('aria-expanded') === 'true' && text(button) === 'Hide receipts', 'the button opens the receipts');
  fire(page.window, button, 'click');
  ok(receipts.hidden && text(button) === 'Receipts', 'and closes them');
  const claimLink = page.document.querySelector('.home-questions a[href="#home-receipts"]');
  claimLink.focus();
  fire(page.window, claimLink, 'click');
  ok(!receipts.hidden && page.document.activeElement === receipts, 'a claim id opens them, with focus');
  key(page.window, receipts, 'Escape');
  ok(receipts.hidden && page.document.activeElement === button, 'and Escape closes them, back to the button');
  const deep = await open(home, `${HOME}#home-receipts`);
  await wait();
  ok(!deep.document.getElementById('home-receipts').hidden, 'a deep link to the receipts opens them');

  // Every link off the first screen lands where it says, with the setting it says.
  const hrefOf = (n) => still.querySelector(`.home-questions li:nth-child(${n}) .home-q`).getAttribute('href');
  eq([1, 2, 3].map(hrefOf).join(), 'ai/#overview,data-centers/#questions,data-centers/#checklists', 'each question has the direction\'s link');
  ok(new JSDOM(dcPage).window.document.querySelector('#questions #checklists details#q-consent'), 'and the checklists are in the Questions panel, Consent first');
  const q1 = await openLink(hrefOf(1));
  eq(q1.errors.length, 0, `question 1: ${q1.errors.slice(0, 2).join(' | ')}`);
  eq(shownPanel(q1.document), 'overview', 'question 1 opens the Overview');
  ok(q1.document.getElementById('overview').contains(q1.document.getElementById('ai-same-hour')), 'which holds the comparison plate');
  eq(q1.document.querySelector('#ai-same-hour input[name="boundary"]:checked').value, 'whole', 'at the whole hour');
  eq(q1.document.querySelector('#ai-same-hour input[name="device"]:checked').value, 'phone', 'on a phone');
  ok(/\b10\b/.test(q1.document.querySelector('#ai-same-hour .ladder-row[data-row="chat"] .ladder-label').textContent), 'at ten prompts');
  eq(text(q1.document.querySelector('#ai-same-hour .readout-value')).split('.')[0], figure('q:chat'), 'and it opens on the figure the answer gives');
  const q2 = await openLink(hrefOf(2));
  eq(q2.errors.length, 0, `question 2: ${q2.errors.slice(0, 2).join(' | ')}`);
  eq(shownPanel(q2.document), 'questions', 'question 2 opens Questions');
  ok(q2.document.getElementById('questions').contains(q2.document.getElementById('dc-project')), 'which holds the project plate');
  eq(q2.document.querySelector('#dc-project [data-param="p_mw"] input').value, String(controls.p_mw), 'at the answer\'s megawatts');
  eq(q2.document.querySelector('#dc-project [data-param="p_lf"] input').value, String(controls.p_lf), 'and load factor');
  const q3 = await openLink(hrefOf(3));
  eq(q3.errors.length, 0, `question 3: ${q3.errors.slice(0, 2).join(' | ')}`);
  eq(shownPanel(q3.document), 'questions', 'question 3 opens Questions');
  ok(q3.document.querySelector('details#q-consent').open, 'with the first checklist open');
  eq(q3.window.scrolled, 'checklists', 'and in view');

  // The figures the page holds without scripts are the data files', and the dataset the first one names agrees with the file its script counts.
  const library = JSON.parse(read('site/data/library.json'));
  const funding = JSON.parse(read('site/data/energy-funding.json'));
  const potential = JSON.parse(read('site/data/energy-potential.json'));
  const forces = Object.values(JSON.parse(read('site/data/policy-watch.json')).task_forces);
  const held = (name) => text(still.querySelector(`[data-figure="${name}"]`));
  eq(held('library'), library.entries.length.toLocaleString('en-US'), 'library entries, without scripts');
  eq(held('library-tribal'), String(library.entries.filter((e) => e.tribal_specific).length), 'Tribal-specific entries');
  eq(held('library-date'), library.updated.replace(/(\d+)-(\d+)-(\d+)/, '$2/$3/$1'), 'the library\'s date');
  eq(held('fund-programs'), String(funding.programs.length), 'funding programs');
  eq(held('fund-open'), String(funding.programs.filter((p) => p.status === 'open').length), 'open programs');
  eq(held('fund-tribes'), String(potential.tribes.length), 'Tribes, in the dataset of record');
  eq(held('fund-tribes'), String(funding.tribes.length), 'and in the file the script counts');
  eq(held('fund-tribes-with'), String(potential.tribes.filter((t) => t.top.length).length), 'Tribes with a finding, in the dataset of record');
  eq(held('fund-tribes-with'), String(funding.tribes.filter((t) => t.matches.length).length), 'and in the file the script counts');
  eq(held('policy-follow'), String(forces.reduce((n, t) => n + t.follow.length, 0)), 'policy items');
  eq(held('policy-searches'), String(forces.reduce((n, t) => n + t.searches.length, 0)), 'saved searches');

  // And the figures, each to its list or plate.
  const figureLinks = [...still.querySelectorAll('.home-figures a[href]')].map((a) => a.getAttribute('href'));
  ok(still.querySelectorAll('.home-figures .figure-go').length === 5, 'five figures, each a way in');
  for (const a of still.querySelectorAll('.home-figures .figure-go')) ok(a.querySelector('.figure-value') && a.querySelector('.figure-label') && (new URL(a.getAttribute('href'), HOME).hash || new URL(a.getAttribute('href'), HOME).search || a.getAttribute('href') === 'library/'), `${a.getAttribute('href')}: the number is the link, to a place`);
  const filter = (rel, id, value) => ok(new JSDOM(read(rel)).window.document.querySelector(`#${id} option[value="${value}"]`), `${rel} has the filter ${id}=${value}`);
  ok(figureLinks.includes('energy/potential/?has=yes#tribes'), 'the Tribes with a finding open at that filter');
  filter('site/energy/potential/index.html', 'filter-has', 'yes');
  ok(figureLinks.includes('energy/funding/?status=open#catalog') && /CATALOG = \['type', 'cooling', 'status'\]/.test(read('site/assets/js/energy-funding.js')), 'the open programs open at that filter');
  ok(figureLinks.includes('library/?tribal=yes'), 'the Tribal-specific sources open at that filter');
  filter('site/library/index.html', 'filter-tribal', 'yes');
  const load = await openLink('data-centers/?dc-pnw-load=2030#dc-pnw-load');
  eq(load.errors.length, 0, `the load figure: ${load.errors.slice(0, 2).join(' | ')}`);
  eq(shownPanel(load.document), 'overview', 'the load figure opens the Overview');
  ok(load.document.querySelector('#dc-pnw-load .readout-value').textContent.includes(figure('fig:value')), 'with its plate on 2030, the figure the tile gives');
  eq(figure('fig:value'), claims['dem-073'].value.toLocaleString('en-US'), 'the tile is the claim');
  eq(`${figure('fig:low')} ${figure('fig:high')}`, `${claims['dem-073'].low.toLocaleString('en-US')} ${claims['dem-073'].high.toLocaleString('en-US')}`, 'with its range');
  eq(claims['dem-073'].status, 'verified', 'and its status, printed');
  // Each figure that has a claim carries it, with its status and its limit; the counts are the claims'.
  const limitsNow = still.getElementById('home-figure-limits');
  const chips = [...still.querySelectorAll('.home-figures .figure-claims .receipt')];
  eq(chips.map(text).join(), 'ep-002,ep-001,ef-001,ef-002,lc-051,lc-052,lc-001,lc-002,dem-073', 'the figures name their claims');
  for (const c of chips) {
    const id = text(c);
    eq(c.getAttribute('href'), '#home-figure-limits', `${id}: its chip goes to the limits`);
    eq(c.classList.contains('is-hollow'), claims[id].status === 'partly', `${id}: its square says its status`);
    ok(/^(verified|partly)$/.test(claims[id].status), `${id}: ships as verified or partly`);
    ok(text(limitsNow).includes(claims[id].status === 'partly' ? `${id}: partly verified. Limit: ` : `${id}: verified against the source.`), `${id}: its status is printed`);
    if (claims[id].status === 'partly') ok(claims[id].limit && text(limitsNow).includes(claims[id].limit.replace(/\s+/g, ' ').trim()), `${id}: and its limit`);
    ok(text(limitsNow).includes(claims[id].source.publisher), `${id}: and its publisher`);
  }
  eq(held('fund-tribes'), String(claims['ep-002'].value), 'the Tribes are the claim');
  eq(held('fund-tribes-with'), String(claims['ep-001'].value), 'and those with a finding');
  eq(held('fund-programs'), String(claims['ef-001'].value), 'and the programs');
  eq(held('fund-open'), String(claims['ef-002'].value), 'and those open');
  eq(held('policy-follow'), String(claims['lc-051'].value), 'and the policy items');
  eq(held('policy-searches'), String(claims['lc-052'].value), 'and the saved searches');
  eq(held('library'), claims['lc-001'].value.toLocaleString('en-US'), 'and the library entries');
  eq(held('library-tribal'), String(claims['lc-002'].value), 'and those that are Tribal-specific');
  eq([...still.querySelectorAll('.home-figures .figure')].filter((n) => !n.querySelector('.figure-claims')).length, 0, 'every figure carries a claim');
}

module.exports = { groups: { staticRules, noScript, homeBand, behavior, secondVersion, measuredOracle, everyOption, cases } };
