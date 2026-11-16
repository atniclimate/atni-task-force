// The Energy pages with their real scripts and data (DIRECTION-R2 section 4, P-energy): the overview's agenda with nothing fetched, the stage bars, the
// countdown by keyboard, Funding's catalog as one list box with marks that never hide a program, the Tribe picker, Potential's Tribe-by-type grid, and what
// shows without scripts. jsdom cannot run a module, so each page's module runs here as a plain script with util.js inlined. The clock is fixed.
const { JSDOM, ok, eq, read, receiptsOn, open, fire, key, wait, settings } = require('./lib');

const util = read('site/assets/js/util.js').replace(/^export (async function|function|const) /gm, '$1 ').replace('import.meta.url', "'http://localhost/site/assets/js/util.js'");
const classic = (rel) => read(rel).replace(/^import .*$/m, '');
const claims = Object.fromEntries(['potential', 'funding'].flatMap((name) => JSON.parse(read(`site/data/claims/${name}.json`)).claims.map((c) => [c.id, c])));
const POTENTIAL = JSON.parse(read('site/data/energy-potential.json'));
const FUNDING = JSON.parse(read('site/data/energy-funding.json'));
const SCRIPTS = ['energy-potential.js', 'energy-funding.js', 'policy-watch.js'];

function page(rel, modules) {
  const others = /<script type="module"[^>]*><\/script>\s*/g;
  const inline = modules.map((name) => `<script>document.addEventListener('DOMContentLoaded', () => { ${util}\n${classic(`site/assets/js/${name}`)} });</script>`).join('\n');
  return read(rel).replace(others, '').replace('</body>', `${inline}</body>`);
}

async function load(rel, modules, hash = '', today = [2026, 10, 16]) {
  const loaded = await open(page(rel, modules), `http://localhost/${rel}${hash}`, (window) => {
    const Real = window.Date;
    const now = new Real(...today, 12).getTime();
    window.Date = class extends Real {
      constructor(...args) { super(...(args.length ? args : [now])); }
      static now() { return now; }
    };
    window.ResizeObserver = class { observe() {} };
    window.Element.prototype.scrollIntoView = function () { window.scrolled = this.id || this.dataset?.tribe || this.tagName; };
    window.fetched = [];
    window.fetch = async (url) => { window.fetched.push(String(url)); throw new Error(`fetched ${url}`); };
    window.CSS = window.CSS || {};
    window.CSS.escape = window.CSS.escape || ((s) => String(s).replace(/[^\w-]/g, (c) => `\\${c}`));
  });
  await wait(20);
  return loaded;
}
const overview = (hash, today) => load('site/energy/index.html', ['energy-potential.js'], hash, today);
const funding = (hash, today) => load('site/energy/funding/index.html', ['energy-funding.js'], hash, today);
const potential = (hash) => load('site/energy/potential/index.html', ['energy-potential.js'], hash);
const row = (root, name) => root.querySelector(`[data-row="${name}"]`);
const reading = (root) => root.querySelector('.reading').textContent;

// Without scripts every page reads in full: the agenda's faces stack, each plate shows its plot, Reading and Table, the catalog lists every program and
// then each detail, and the grid is a table with every passage after it.
async function noScripts() {
  const doc = (rel) => new JSDOM(read(rel)).window.document;
  const energy = doc('site/energy/index.html');
  eq(energy.querySelectorAll('.agenda-q').length, 3, 'three questions on the overview');
  for (const face of ['face-plans', 'face-money', 'face-work']) ok(energy.getElementById(face), `${face} stands`);
  ok(!energy.querySelector('.section-strip') && energy.querySelectorAll('.brief-name a').length === 3, 'the family row replaces the section strip');
  ok(!energy.querySelector('[data-library-feed], .energy-bench, .bench-row'), 'the library feed and the climate row are gone');
  ok(energy.querySelector('a[href="../data-centers/#climate"]'), 'the climate figure is a link to its Where tab');
  eq(energy.querySelectorAll('.climate-voice').length, 1, 'one Climate mark on the page (energy-18)');
  eq(energy.querySelectorAll('.agenda-a[data-answer]').length, 2, 'two answers read from their plates');
  ok([...energy.querySelectorAll('.agenda-a[data-answer]')].every((p) => p.textContent.trim()), 'each holds its starting answer');
  const types = energy.getElementById('energy-types-by-stage');
  eq(types.querySelectorAll('.ladder-row').length, 13, 'every type is in the list');
  ok(row(types, 'efficiency').textContent.includes(`${claims['ep-032'].value} Tribes`), 'each row prints its count');
  eq(row(types, 'offshore-wind').querySelector('.ladder-value').textContent, '0 Tribes', 'a row with no finding prints 0');
  eq(types.querySelectorAll('.plate-legend li').length, 4, 'the key of the stages is built');
  const top = JSON.parse(energy.getElementById('plate-data-energy-types-by-stage').textContent).plot.domain[1];
  ok(top / claims['ep-032'].value <= 1.25, `the axis ends near the longest bar: ${top} for ${claims['ep-032'].value} (energy-06)`);
  ok(!types.querySelector('.ladder-needle:not([hidden])') || types.querySelector('.plate-plot').classList.contains('no-needle'), 'no line stands across the bars');
  ok(/machine-assisted reading of public plans/.test(types.textContent) && /absence is not evidence/.test(types.textContent), 'the caveats are on the plate');
  ok(!POTENTIAL.tribes.some((t) => types.textContent.includes(t.name)), 'no Tribe is named on the plate');
  const money = energy.getElementById('energy-deadlines');
  eq(money.dataset.kind, 'countdown', 'the deadlines are a countdown');
  for (const date of ['11/05/2026', '12/11/2026', '02/17/2027', '08/31/2028']) ok(money.querySelector('.plate-plot').textContent.includes(date), `the static page shows ${date}`);
  ok(!/the first on/.test(money.querySelector('.plate-title').textContent), 'the title says nothing the clock can change');
  eq(energy.querySelectorAll('[data-policy-searches] .watch-item').length, 13, 'the saved searches are on the page');
  eq(energy.querySelectorAll('[data-policy-follow] .watch-item').length, 12, 'and the follow list');
  ok(!energy.querySelector('[data-prefill-note]'), 'no development note');
  for (const script of ['energy-funding.js', 'policy-watch.js', 'library.js']) ok(!read('site/energy/index.html').includes(`assets/js/${script}`), `the overview loads no ${script}`);

  const fund = doc('site/energy/funding/index.html');
  eq(fund.querySelectorAll('.catalog-item').length, FUNDING.programs.length, 'every program is in the list');
  eq(fund.querySelectorAll('.catalog-details > .program').length, FUNDING.programs.length, 'and each has its detail');
  ok([...fund.querySelectorAll('.catalog-item a.catalog-pick')].every((a) => fund.getElementById(a.getAttribute('href').slice(1))), 'each row links to its detail');
  const statuses = [...fund.querySelectorAll('.catalog-item')].map((li) => li.dataset.status);
  const firstClosed = statuses.indexOf('closed');
  ok(firstClosed > 0 && statuses.slice(firstClosed).every((s) => s === 'closed') && fund.querySelectorAll('.catalog-item.is-closed').length === statuses.filter((s) => s === 'closed').length, 'closed programs come last, marked');
  ok(fund.querySelectorAll('.pays').length >= 4 && [...fund.querySelectorAll('.pays-list a')].every((a) => fund.getElementById(a.getAttribute('href').slice(1))), 'open programs by how they pay, each linking to its detail');
  ok(fund.querySelectorAll('#filter-type option').length > 5 && fund.querySelectorAll('#filter-status option').length > 2, 'the filters are whole before scripts');
  eq(fund.querySelectorAll('#pick-tribe option').length, FUNDING.tribes.length + 1, 'every Tribe is a choice');
  ok(!fund.getElementById('tribe-results').hasAttribute('aria-live'), 'the Tribe list is not a live region (energy-12)');
  eq(fund.getElementById('tribe-status').getAttribute('role'), 'status', 'its one-line status is');
  eq(fund.querySelectorAll('.notice-list > .record').length, FUNDING.live.opportunities.length || 1, 'the Grants.gov notices are on the page');
  ok(receiptsOn('site/energy/funding/sources/index.html')('energy-deadlines-catalog-source-ef-012'), 'a deadline\'s receipt is on the Sources page');
  const fundSources = doc('site/energy/funding/sources/index.html');
  ok(FUNDING.programs.every((p) => fundSources.getElementById(`prog-${p.id}`)), 'each program\'s sources have an anchor on the Sources page');
  ok(fundSources.getElementById('method') && fundSources.getElementById('grants-gov'), 'the method and the search moved there');

  const plans = doc('site/energy/potential/index.html');
  const grid = plans.getElementById('tt-grid');
  eq(grid.tBodies[0].rows.length, POTENTIAL.tribes.length, 'one row per Tribe');
  eq(grid.tHead.rows[0].cells.length - 1, POTENTIAL.method.energy_types.length, 'one column per type');
  const names = [...grid.tBodies[0].rows].map((r) => r.querySelector('th a').textContent);
  eq(names.join('|'), [...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).join('|'), 'A to Z, never ranked');
  eq(grid.querySelectorAll('td[data-stage]').length, POTENTIAL.tribes.reduce((n, t) => n + t.top.length, 0), 'a mark for every finding');
  const order = [...grid.tHead.rows[0].cells].slice(1).map((th) => th.dataset.type);
  const bars = JSON.parse(read('site/data/plates/energy-types-by-stage-plans.json')).rows.map((r) => r.id);
  eq(order.join(), bars.join(), 'the columns run in the bars\' order, so each bar totals its column');
  eq(plans.querySelectorAll('.tt-tribe').length, POTENTIAL.tribes.length, 'every Tribe\'s passages follow');
  eq(plans.querySelectorAll('.tt-tribe blockquote').length, POTENTIAL.tribes.reduce((n, t) => n + t.top.reduce((m, f) => m + f.citations.length, 0), 0), 'every cited excerpt');
  ok(![...plans.querySelectorAll('blockquote')].some((b) => /[�]/.test(b.textContent)), 'no stray symbol-font bullet or replacement character');
  ok(!plans.getElementById('read-first') && plans.querySelector('.brief-lead a[href="sources/#method"]'), 'Read This First is one sentence and a link (energy-23)');
  const plansSources = doc('site/energy/potential/sources/index.html');
  ok(plansSources.getElementById('method') && plansSources.getElementById('corrections'), 'the method and corrections are on the Sources page');
  ok(POTENTIAL.tribes.filter((t) => t.documents.length).every((t) => plansSources.getElementById(`docs-${t.slug}`)), 'each Tribe\'s documents read have an anchor there');

  for (const name of SCRIPTS) ok(!/\bfetch\(|getJSON\(/.test(read(`site/assets/js/${name}`)), `${name} fetches nothing`);
}

// The overview: nothing fetched, the stages over the bars, the answers following their plates, and the countdown as a list box.
async function overviewPage() {
  const { window, document, errors } = await overview();
  eq(errors.join(), '', 'no script errors');
  eq(window.fetched.length, 0, 'nothing is fetched on /energy/ (energy-01)');
  const plate = document.getElementById('energy-types-by-stage');
  const parts = [...row(plate, 'efficiency').querySelectorAll('.stack-bar i')];
  const stages = claims['ep-032'].stages;
  eq(parts.length, Object.values(stages).filter(Boolean).length, 'one segment per stage with a count');
  eq(parts.reduce((sum, p) => sum + Number(p.textContent), 0), claims['ep-032'].value, 'the counts add to the total');
  eq(parts[0].className, 'stage-4', 'installed first');
  eq(row(plate, 'efficiency').querySelector('.stack-bar').getAttribute('aria-hidden'), 'true', 'the row\'s words carry it aloud');
  ok(!row(plate, 'marine').querySelector('.stack-bar'), 'a zero row draws nothing');
  eq(document.querySelectorAll('.stack-bar').length, 11, 'once, however often the plate draws');
  const answer = document.querySelector('.agenda-a[data-answer="energy-types-by-stage"]');
  const plot = plate.querySelector('.plate-plot');
  plot.focus();
  key(window, plot, 'ArrowDown');
  await wait(0);
  ok(reading(plate).startsWith('Solar'), 'arrow keys step the bars');
  ok(row(plate, 'solar').classList.contains('is-on'), 'the selection is on the row');
  ok(answer.textContent.startsWith('Solar: 30 Tribes'), `the answer follows the plate: ${answer.textContent}`);
  fire(window, row(plate, 'wind'), 'click');
  await wait(300); // the kit writes the address a quarter second after a change
  ok(settings(window).includes('energy-types-by-stage=wind'), 'a chosen row rides in the address');
  const money = document.getElementById('energy-deadlines');
  ok(money.closest('[hidden]') || !money.closest('.agenda-faces > :first-child'), 'the second face waits, so its plate starts when shown');
  fire(window, document.querySelector('.agenda-q a[href="#face-money"]'), 'click');
  await wait(0);
  const list = money.querySelector('.plate-plot');
  eq(list.getAttribute('role'), 'listbox', 'the countdown is one list box');
  eq(list.getAttribute('tabindex'), '0', 'one Tab stop');
  ok(reading(money).startsWith('Tribal HEEHR'), 'it starts on the next deadline');
  key(window, list, 'ArrowDown');
  ok(reading(money).startsWith('Grid Resilience'), 'the arrows choose');
  key(window, list, 'End');
  ok(row(money, 'irs-elective-pay').classList.contains('is-on'), 'End reaches the last program with no date');
  key(window, list, 'Home');
  ok(reading(money).startsWith('BPA Tribal efficiency grants') && row(money, 'bpa-tribal-iq').classList.contains('is-passed'), 'Home the first, passed by the fixed day');
  ok(money.querySelector('.countdown').classList.contains('has-today'), 'today stands on the ruler');
  ok(document.querySelector('.agenda-a[data-answer="energy-deadlines"]').textContent.includes(`${claims['ef-002'].value} of ${claims['ef-001'].value} programs`), 'the money answer counts from its claims');
}

// Funding: the catalog list box, marks, a #prog- link that clears what would dim it, the passed date said once, and the Tribe picker.
async function fundingPage() {
  const { window, document, errors } = await funding();
  eq(errors.join(), '', 'no script errors');
  eq(window.fetched.length, 0, 'nothing is fetched');
  const list = document.getElementById('catalog-list');
  eq(list.getAttribute('role'), 'listbox', 'the catalog is one list box');
  eq(list.querySelectorAll('[role="option"]').length, FUNDING.programs.length, 'every program an option');
  eq(list.querySelectorAll('a').length, 0, 'with no link inside an option');
  const shown = () => [...document.querySelectorAll('.catalog-details > .program.is-on')].map((a) => a.id);
  eq(shown().length, 1, 'one detail shows');
  const first = list.querySelector('[aria-selected="true"]');
  eq(shown()[0], `prog-${first.dataset.program}`, 'the chosen one');
  key(window, list, 'ArrowDown');
  const second = list.querySelector('[aria-selected="true"]');
  ok(second !== first && shown()[0] === `prog-${second.dataset.program}`, 'the arrows choose the next');
  eq(list.getAttribute('aria-activedescendant'), second.id, 'and name it');
  const field = (name) => document.getElementById(`filter-${name}`);
  field('status').value = 'closed';
  fire(window, field('status'), 'change');
  const dim = list.querySelectorAll('.is-dim').length;
  eq(dim, FUNDING.programs.filter((p) => p.status !== 'closed').length, 'a mark dims the rest');
  eq(list.querySelectorAll('.catalog-item').length, FUNDING.programs.length, 'and removes none');
  ok(settings(window).includes('status=closed'), 'it rides in the address');
  const link = document.querySelector('.pays-list a[href="#prog-doe_wap"]');
  fire(window, link, 'click');
  eq(shown()[0], 'prog-doe_wap', 'a #prog- link opens its program');
  eq(field('status').value, '', 'a mark that would dim it is cleared');
  ok(document.getElementById('catalog-status').textContent.startsWith('Marks cleared to show Weatherization Assistance Program.'), 'and the status says so (energy-08)');
  eq(document.activeElement.id, 'prog-doe_wap', 'focus goes to the program');
  const bpaDue = document.querySelector('#prog-bpa_tribal_iq .program-due');
  ok(bpaDue.classList.contains('is-passed') && bpaDue.textContent.startsWith('Passed 11/05/2026:'), 'BPA\'s date reads passed in its detail');
  ok(list.querySelector('[data-program="bpa_tribal_iq"] .catalog-date').textContent === '11/05/2026, passed' && list.querySelector('[data-program="bpa_tribal_iq"] .tag').textContent === 'Open', 'and in the list, with its status open (energy-14)');
  ok(document.querySelector('#energy-deadlines-catalog [data-row="bpa-tribal-iq"]').classList.contains('is-passed'), 'as the countdown says');

  const deep = await funding('#prog-hud_ihbg&status=closed');
  eq([...deep.document.querySelectorAll('.catalog-details > .program.is-on')].map((a) => a.id).join(), 'prog-hud_ihbg', 'a shared link with a mark lands on its program');
  ok(deep.document.getElementById('catalog-status').textContent.includes('Marks cleared'), 'and says the mark was cleared');
  eq(deep.errors.join(), '', 'no script errors');

  const pick = document.getElementById('pick-tribe');
  const tribe = FUNDING.tribes.find((t) => t.matches.length >= 3);
  pick.value = tribe.slug;
  fire(window, pick, 'change');
  const status = document.getElementById('tribe-status').textContent;
  ok(status.startsWith(`${tribe.name}: ${tribe.matches.length} energy types in its public plans;`), `one line of status: ${status}`);
  const links = [...document.querySelectorAll('#tribe-results a')].map((a) => a.getAttribute('href'));
  eq(new Set(links).size, links.length, 'each program once (energy-21)');
  ok(links.every((h) => document.getElementById(h.slice(1))), 'each linking to its detail');
  ok(settings(window).includes(`tribe=${tribe.slug}`), 'the Tribe rides in the address');
  const lens = await funding(`#face-fit&tribe=${tribe.slug}`);
  ok(lens.document.getElementById('tribe-status').textContent.startsWith(tribe.name), 'a link from Potential opens with its Tribe');
}

// Potential: one Tab stop in the grid, arrows, Home, End, Ctrl+Home, Ctrl+End; Enter goes to the passages; marks highlight; links land.
async function potentialPage() {
  const { window, document, errors } = await potential();
  eq(errors.join(), '', 'no script errors');
  eq(window.fetched.length, 0, 'nothing is fetched');
  const grid = document.getElementById('tt-grid');
  eq(grid.getAttribute('role'), 'grid', 'the table is a grid');
  eq(grid.querySelectorAll('[tabindex="0"]').length, 1, 'one Tab stop');
  const on = () => grid.querySelector('td.is-on');
  const side = document.getElementById('tt-side');
  const firstTribe = [...POTENTIAL.tribes].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())).find((t) => t.top.length);
  ok(on().dataset.tt.startsWith(`${firstTribe.slug}--`), 'it starts on the first finding, A to Z');
  eq(side.querySelector('.tt-side-title').textContent, firstTribe.name, 'the side column names its Tribe');
  ok(side.querySelector('blockquote'), 'with the passages behind the cell');
  ok(side.querySelector('.record-links a[href^="sources/#docs-"]'), 'and the way to its documents');
  ok(!side.querySelector('[id]:not(#tt-side-title)'), 'a copy keeps no id');
  const start = on();
  key(window, start, 'ArrowRight');
  ok(on() !== start && on().parentElement === start.parentElement, 'Right moves along the row');
  key(window, on(), 'ArrowDown');
  ok(on().parentElement === start.parentElement.nextElementSibling, 'Down to the next Tribe');
  key(window, on(), 'Home');
  eq(on(), on().parentElement.querySelector('td'), 'Home to the row\'s first cell');
  key(window, on(), 'End');
  eq(on(), [...on().parentElement.querySelectorAll('td')].at(-1), 'End to its last');
  fire(window, on(), 'keydown', { key: 'End', ctrlKey: true });
  eq(on(), [...grid.querySelectorAll('td')].at(-1), 'Ctrl+End to the last cell');
  fire(window, on(), 'keydown', { key: 'Home', ctrlKey: true });
  eq(on(), grid.querySelector('tbody td'), 'Ctrl+Home to the first');
  eq(grid.querySelectorAll('[tabindex="0"]').length, 1, 'still one Tab stop');
  eq(document.activeElement, on(), 'focus follows');
  ok(side.textContent.includes('not evidence of opposition or disinterest') || side.querySelector('blockquote'), 'an empty cell says what absence means');
  const finding = grid.querySelector('td[data-stage]');
  fire(window, finding, 'click');
  key(window, finding, 'Enter');
  eq(document.activeElement, side.querySelector('.tt-side-title'), 'Enter goes to the passages');
  key(window, side.querySelector('.tt-side-title'), 'Escape');
  eq(document.activeElement, finding, 'Escape returns to the cell');
  ok(settings(window).includes(`tt=${finding.dataset.tt}`), 'the cell rides in the address');
  const form = document.getElementById('tt-filters');
  form.elements.namedItem('state').value = 'ID';
  fire(window, form.elements.namedItem('state'), 'change');
  const idaho = POTENTIAL.tribes.filter((t) => t.states.includes('ID')).length;
  eq(grid.querySelectorAll('tbody tr:not(.is-dim)').length, idaho, 'a state mark leaves its Tribes in ink');
  eq(grid.tBodies[0].rows.length, POTENTIAL.tribes.length, 'and removes none (energy-09)');
  ok(document.getElementById('tt-status').textContent.includes(`${idaho} Tribes of ${POTENTIAL.tribes.length} marked in Idaho`), 'the status says so');
  form.elements.namedItem('type').value = 'solar';
  fire(window, form.elements.namedItem('type'), 'change');
  ok(grid.querySelector('th[data-type="solar"]').classList.contains('is-mark'), 'a type mark names its column');
  ok(settings(window).includes('state=ID') && settings(window).includes('type=solar'), 'marks ride in the address');
  const link = grid.querySelector('tbody tr.is-dim th a');
  fire(window, link, 'click');
  eq(form.elements.namedItem('state').value, 'ID', 'a Tribe link keeps the marks');
  ok(on().closest('tr') === link.closest('tr'), 'and chooses its row');
  const byState = form.querySelector('input[name="order"][value="state"]');
  byState.checked = true;
  fire(window, byState, 'change');
  ok(grid.querySelectorAll('tr.is-group').length >= 5, 'by state, with a heading row per state');
  eq(grid.querySelectorAll('tbody tr:not(.is-group)').length, POTENTIAL.tribes.length, 'every Tribe still there');

  const tribe = POTENTIAL.tribes.find((t) => t.top.length >= 2);
  const deep = await potential(`#${tribe.slug}`);
  ok(deep.document.querySelector('#tt-grid td.is-on').dataset.tt.startsWith(`${tribe.slug}--`), 'an old link to a Tribe\'s entry chooses its row');
  eq(deep.document.activeElement, deep.document.querySelector('#tt-grid td.is-on'), 'with focus there');
  const cell = `${tribe.slug}--${tribe.top[1].type}`;
  const exact = await potential(`#${cell}`);
  eq(exact.document.querySelector('#tt-grid td.is-on').dataset.tt, cell, 'a link to one finding chooses its cell');
  eq(exact.errors.join(), '', 'no script errors');
}

// Policy Watch is built into each task force page; the script that once filled it only hides a development note now (data-centers-18).
async function policyWatch() {
  for (const [rel, force] of [['site/ai/index.html', 'ai'], ['site/data-centers/index.html', 'data-centers'], ['site/energy/index.html', 'energy-feasibility']]) {
    const text = read(rel);
    if (!text.includes('<!-- policy:watch -->')) continue;
    const { document } = new JSDOM(text).window;
    const expected = JSON.parse(read('site/data/policy-watch.json')).task_forces[force];
    const built = document.querySelectorAll('[data-policy-searches] .watch-item').length;
    if (built) eq(built, expected.searches.length, `${rel}: every saved search is built in`);
  }
  const { document } = new JSDOM('<details data-prefill-note><summary>x</summary></details>', { runScripts: 'outside-only' }).window;
  document.defaultView.eval(read('site/assets/js/policy-watch.js'));
  ok(document.querySelector('[data-prefill-note]').hidden, 'the prefill note hides');
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
  // A count's ink on its segment (energy.css): 4.5:1 on every step of both ramps.
  const ink = { dark: ['#FFFFFF', '#010B13', '#010B13', '#010B13'], light: ['#010B13', '#FFFFFF', '#FFFFFF', '#FFFFFF'] };
  for (const [theme, ramp] of [['dark', dark], ['light', light]]) ramp.forEach((step, i) => ok(ratio(step, ink[theme][i]) >= 4.5, `${theme} count on stage ${i + 1}: ${ratio(step, ink[theme][i]).toFixed(2)}`));
  ok(!css.includes('[data-theme="auto"] {'), 'nothing sets auto, so no ramp waits for it (home-shell-11)');
  eq(steps('@media print {\n  :root, [data-theme] {').join(), light.join(), 'print repeats it');
}

module.exports = { groups: { noScripts, overviewPage, fundingPage, potentialPage, policyWatch, stageRamp } };
