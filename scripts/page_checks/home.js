// The home page (site/index.html, filled by scripts/build_home.py): the first screen's instrument, the Explorer's model at its defaults, poured, with its two
// controls; its receipts; the figures its own words name; and every link off the first screen landing where it says. Moved from page_checks/explorer.js.
const fs = require('fs');
const path = require('path');
const { JSDOM, ROOT, ok, eq, wait, read, open, fire, key } = require('./lib');

const html = read('site/explorer/index.html'); // the model's data block, as the Explorer ships it
const listed = read('site/explorer/sources/index.html');
const claimOf = (a) => a.getAttribute('href').split('#src-')[1];
const text = (node) => node.textContent.replace(/\s+/g, ' ').trim();

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
  ok(/an open-book model, checked against published figures/.test(text(panel)) && /not measurements/.test(text(panel)) && !/process model/i.test(home), 'the receipts say what the figure is, by the model\'s public name');
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
    const ids = [...tr.querySelectorAll('a[href^="explorer/sources/#src-"]')].map(claimOf);
    ok(ids.length > 1, `${key}: carries its claims`);
    for (const id of ids) {
      ok(/^(verified|partly)$/.test(claims[id].status) && listed.includes(`id="src-${id}"`), `${key}: ${id} ships and has its receipt on the Explorer's Sources page`);
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

module.exports = { groups: { homeBand } };
