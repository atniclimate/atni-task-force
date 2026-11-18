// The AI page with its real data: tabs, selection, every control, the comparison model against the oracle, the Count view, deep links, and the page
// without scripts.
const { execSync } = require('child_process');
const assert = require('assert');
const { JSDOM, ROOT, count, ok, eq, wait, settle, settings, read, fixture, open, fire, key, figures, holds, leads, wordsOnly } = require('./lib');

const PAGE = 'http://localhost/site/ai/index.html';
const html = read('site/ai/index.html');
const oracle = JSON.parse(fixture('work/site-refresh/tmp/ai-oracle.json', 'Rebuild it with python scripts/fixtures/ai_oracle.py.'));
// The last commit before the held slot could have moved: the economics slot stays byte for byte what it was then.
const SLOT_COMMIT = '9405f13';

async function load(query = '', size = { w: 900, h: 620 }, source = html) {
  const page = await open(source, `${PAGE}${query}`, (window) => {
    window.size = size;
    window.innerWidth = 1440;
    window.innerHeight = 900;
    window.observers = [];
    window.ResizeObserver = class { constructor(cb) { window.observers.push(cb); } observe() {} };
    const visible = (el) => !el.closest('[hidden]');
    Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { get() { return visible(this) ? window.size.w : 0; } });
    Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { get() { return visible(this) ? Math.max(parseInt(this.style.minHeight, 10) || 0, window.size.h) : 0; } });
    Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', { get() { return 24; } });
    window.document.elementFromPoint = () => window.under;
    window.Element.prototype.scrollIntoView = function () { window.scrolled = this.id; };
  });
  await wait();
  return page;
}
const near = (a, b, message) => { count(); assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), `${message}: ${a} against ${b}`); };

const plateOf = (document, id) => {
  const root = document.getElementById(id);
  return {
    root, plot: root.querySelector('.plate-plot'), reading: root.querySelector('.reading'), value: root.querySelector('.readout-value'), unit: root.querySelector('.readout-unit'),
    facts: root.querySelector('.plate-facts'), receipt: root.querySelector('.plate-receipt'), table: root.querySelector('.plate-view[data-view="table"]'),
    row: (k) => [...root.querySelectorAll('[data-row]')].find((n) => n.dataset.row === k && !n.closest('[hidden]')),
    chips: () => [...root.querySelectorAll('.plate-evidence .receipt')].flatMap((c) => c.dataset.claims.split(' ')), // the selection's claims, under its publishers' chips
    radio: (name, v) => root.querySelector(`input[name="${name}"][value="${v}"]`),
  };
};
const pick = async (window, input) => {
  input.checked = true;
  fire(window, input, 'input');
  await wait();
};
const slide = async (window, input, v) => {
  input.value = String(v);
  fire(window, input, 'input');
  await wait();
};
const closeWalk = (stored, fresh, where) => {
  for (const [k, v] of Object.entries(stored)) {
    if (v && typeof v === 'object') closeWalk(v, fresh[k], `${where}.${k}`);
    else if (typeof v === 'number' && fresh[k] !== undefined) near(fresh[k], v, `${where}.${k}`);
  }
};
const TABS = ['energy', 'economics', 'companies', 'data-sovereignty', 'working-with-ai', 'youth-education', 'policy-watch'];
const STREAM_WORDS = 'Measured,UK government scenario,Averaged over all traffic';
// The words each first plate moves under itself: the kit keeps one paragraph in the claim zone, and no word leaves the page.
const PROSE = {
  'ai-same-hour': ['This is the hour from the first question', 'each segment labeled measured or modeled', 'This comparison does not decide a proposal', 'Treaty-reserved rights', 'What a building would run'],
  'ai-company-money': ['one scale for all seven', 'share a scale', 'Seven large companies sit at the center', 'Fiscal years differ (Microsoft June, Apple September, NVIDIA January)'],
};

const stripTabs = (document) => [...document.querySelectorAll('.section-strip [role="tab"]')];
const panelsOf = (document) => [...document.querySelectorAll('section.panel')];

async function tabs() {
  const { window, document, errors } = await load();
  const list = document.querySelector('.section-strip [role="tablist"]');
  const links = stripTabs(document);
  const panels = panelsOf(document);
  eq(links.length, 7, 'seven tabs, and no Overview: the agenda is the overview');
  eq(panels.map((p) => p.id).join(), TABS.join(), 'panels in order, Measure then Decide');
  eq(list.getAttribute('aria-label'), 'Sections', 'tab list named');
  eq([...document.querySelectorAll('.section-strip .strip-group')].map((n) => n.textContent).join(), 'Measure,Decide', 'two groups, out of the tab order');
  ok(links.every((a) => a.querySelector('.tab-name') && a.querySelector('.tab-q')), 'each tab is its name over its question');
  eq(links.map((a) => a.querySelector('.tab-name').textContent).join(), 'Energy,Work,Companies,Data Sovereignty,Working with AI,Youth and Education,Policy Watch', 'tab names');
  ok(document.querySelector('.section-strip a.strip-out[data-not-tab][href="sources/"]') && document.querySelector('.section-strip button.paper[data-sheet-open]'), 'Sources and the meeting sheet at the right end');
  ok(!panels[0].hidden && panels.slice(1).every((p) => p.hidden), 'one panel at a time');
  for (let i = 0; i < links.length; i += 1) {
    fire(window, links[i], 'click');
    panels.forEach((p, j) => eq(p.hidden, j !== i, `tab ${i} shows only its panel`));
    eq(window.location.hash, `#${TABS[i]}`, 'hash written');
  }
  fire(window, links[0], 'click');
  key(window, links[0], 'ArrowRight');
  eq(links[1].getAttribute('aria-selected'), 'true', 'arrow right');
  eq(document.activeElement, links[1], 'focus follows');
  key(window, links[1], 'End');
  eq(links.at(-1).getAttribute('aria-selected'), 'true', 'End');
  key(window, links.at(-1), 'ArrowRight');
  eq(links[0].getAttribute('aria-selected'), 'true', 'wraps');
  key(window, links[0], 'Home');
  eq(links[0].getAttribute('aria-selected'), 'true', 'Home');
  eq(errors.join(), '', 'no script errors');
}

// The agenda: three questions, each answered from its face's own state; the hour meter holds its axis; the stair is radios.
async function agenda() {
  const { window, document, errors } = await load();
  const box = document.querySelector('section.agenda#overview');
  ok(box && box.compareDocumentPosition(document.querySelector('.section-strip')) & 4, 'the agenda opens the page, above the strip');
  const qs = [...box.querySelectorAll('.agenda-q > a[role="tab"]')];
  eq(qs.map((a) => a.textContent).join('|'), 'Is everyday AI use the problem?|Who is paying for the buildout?|How does a Tribe keep control of its data?', 'three questions');
  eq(qs.map((a) => a.getAttribute('aria-controls')).join(), 'face-hour,face-buildout,face-tiers', 'each controls its face');
  const answer = (i) => box.querySelectorAll('.agenda-a')[i].textContent;
  eq(answer(0), 'In an hour, ten chat prompts come to about 15 Wh, beside 14 Wh for streamed video and 13 Wh for a short-video feed; agentic coding is 211 Wh (counted: Whole hour).', 'the hour answer, from the meter at its start, with what is counted last');
  ok(leads(answer(1), ['Amazon', '132 billion dollars', '12/31/2025']), `the buildout answer, in whole billions as the title prints them: ${answer(1)}`);
  ok(document.querySelector('section.agenda > h2.sr-only'), 'the agenda has its heading, so face titles sit under an h2');
  ok(/most protective/.test(answer(2)), 'the tiers answer is fixed words');
  ok(!document.getElementById('face-hour').hidden && document.getElementById('face-buildout').hidden, 'the first face shows');
  // The hour meter: one fixed linear scale, the needle moving under it from stop to stop.
  const h = plateOf(document, 'ai-hour');
  eq(h.root.dataset.kind, 'meter', 'a meter');
  const axis = () => [...h.plot.querySelectorAll('.ladder-axis span')].map((n) => n.textContent).join();
  const start = axis();
  ok(start.startsWith('0,') && start.endsWith('25'), `a linear axis from 0 to 25 Wh: ${start}`);
  eq(`${h.value.textContent} ${h.unit.textContent}`, '15 (9.3 to 24) Wh', 'the starting readout');
  ok(h.row('coding').classList.contains('is-off') && leads(h.row('coding').querySelector('.ladder-value').textContent, ['211']), 'agentic coding is past the scale, its figure printed');
  for (const [stop, chat, video] of [['dc', '3', '0.45'], ['adds', '3', '2.1'], ['whole', '15', '14']]) {
    await pick(window, h.radio('counted', stop));
    eq(axis(), start, `the axis holds at ${stop}`);
    eq(h.value.textContent, chat, `the needle reads ${chat} at ${stop}`);
    ok(answer(0).includes(`ten chat prompts come to about ${chat} Wh, beside ${video} Wh for streamed video`), `the answer follows at ${stop}: ${answer(0)}`);
    ok(!/^(Data center|Whole hour)/.test(answer(0)), 'the answer opens on its figures, not a control label');
    ok(!/\(\d/.test(answer(0)), 'the answer prints figures, not spreads');
  }
  await pick(window, h.radio('counted', 'dc'));
  ok(h.plot.querySelector('.meter-part.is-ghost'), 'what a stop leaves out stays as a ghost');
  ok(/^An hour of chat is about 3 Wh.*\(counted: Data center only\)$/.test(h.root.querySelector('.plate-title').textContent), `the title follows the stop: ${h.root.querySelector('.plate-title').textContent}`);
  // The way to the assumptions stands at the window's foot, and lands on their disclosure, open, with focus on its summary.
  const toMore = h.root.querySelector('.plate-detail > .plate-foot a[href="#ai-same-hour-more"]');
  eq(toMore?.textContent, 'Change the assumptions on the Energy tab', 'the assumptions are a link away, at the foot of the window');
  ok(!h.root.querySelector('.plate-claim > .plate-foot'), 'and not a line of the claim zone');
  // A face keeps its state; the second face starts when shown.
  fire(window, qs[1], 'click');
  await wait(30);
  ok(!document.getElementById('face-buildout').hidden && document.getElementById('face-hour').hidden, 'the second face shows');
  ok(answer(0).endsWith('(counted: Data center only).'), 'and the first keeps its state');
  const cc = plateOf(document, 'ai-capex-cash');
  await pick(window, cc.radio('fy', '2022'));
  ok(leads(answer(1), ['Amazon', '64 billion dollars', '12/31/2022']), `the buildout answer follows the year: ${answer(1)}`);
  ok(leads(cc.root.querySelector('.plate-title').textContent, ['Amazon', '2022']), 'and so does the title');
  // NVIDIA has no capital spending for FY2021, only cash: the answer names Amazon's spending, so it never prints cash as spending.
  await pick(window, cc.radio('fy', '2021'));
  fire(window, cc.row('nvidia'), 'click');
  await wait(30);
  ok(leads(answer(1), ['Amazon', '61 billion dollars', '12/31/2021']), `a company with no spending that year leaves the answer on Amazon's: ${answer(1)}`);
  // Followed, the hour face's link opens the assumptions on the Energy tab and focuses their summary.
  window.location.hash = 'ai-same-hour-more';
  window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  await wait(30);
  const more = document.getElementById('ai-same-hour-more');
  ok(more?.matches('#ai-same-hour .plate-claim details.plate-more') && more.open && document.activeElement === more.querySelector('summary'), 'the link opens the assumptions and focuses their summary');
  ok(!document.getElementById('energy').hidden, 'on the Energy tab');
  // The stair, the kit's fieldset.stair: four radios rising from open to restricted, the most protective chosen, each step's detail after its label.
  const stair = document.querySelector('#face-tiers fieldset.stair#tier-grid');
  ok(stair, 'the stair keeps the old tier anchor');
  const radios = [...stair.querySelectorAll('label.stair-step > input.stair-pick[type="radio"][name="tier"]')];
  eq(radios.map((r) => r.value).join(), 't0,t1,t2,t3', 'four steps, rising from open to restricted');
  ok(radios[3].checked && radios.slice(0, 3).every((r) => !r.checked), 'it starts at the most protective tier, where data starts');
  for (const step of stair.querySelectorAll('label.stair-step')) {
    eq(step.nextElementSibling.className, 'stair-detail', `${step.id}: its detail follows it`);
    eq([...step.nextElementSibling.querySelectorAll('dt')].map((n) => n.textContent).join('|'), 'What may touch the data|Who decides|On this site', `${step.id}: three facts`);
  }
  const rule = document.querySelector('#face-tiers > .tier-rule');
  ok(/only/.test(rule.textContent) && /never expose/.test(rule.textContent), 'the rule for moving between tiers');
  eq(errors.join(), '', 'no script errors');
}

async function deepLinks() {
  const targets = {
    energy: 'energy', economics: 'economics', companies: 'companies', 'working-with-ai': 'working-with-ai', 'youth-education': 'youth-education', 'data-sovereignty': 'data-sovereignty', 'policy-watch': 'policy-watch',
    purpose: 'working-with-ai', offloading: 'working-with-ai', 'yf-native': 'youth-education', 'ai-same-hour': 'energy', 'ai-heavy-ai': 'energy', 'ai-scale': 'energy', 'ai-displacement': 'economics', 'ai-holdings': 'companies',
    'ai-adoption-returns': 'economics', 'adoption-rules': 'working-with-ai',
  };
  for (const [hash, panel] of Object.entries(targets)) {
    const { document, errors } = await load(`#${hash}`);
    ok(document.getElementById(hash), `#${hash} exists`);
    eq(document.getElementById(panel).hidden, false, `#${hash} opens ${panel}`);
    eq(panelsOf(document).filter((p) => !p.hidden).length, 1, 'one panel');
    if (document.getElementById(hash).matches('details')) eq(document.getElementById(hash).open, true, `#${hash} opens its disclosure`);
    eq(errors.join(), '', `no script errors at #${hash}`);
  }
  // Old links into the Overview land on the agenda, which replaced it; the old tier anchor opens the stair's face.
  for (const [hash, face] of [['overview', 'face-hour'], ['tier-grid', 'face-tiers'], ['face-buildout', 'face-buildout'], ['ai-capex-cash', 'face-buildout']]) {
    const { document, errors } = await load(`#${hash}`);
    ok(document.getElementById(hash), `#${hash} exists`);
    eq(document.getElementById(face).hidden, false, `#${hash} shows ${face}`);
    eq(errors.join(), '', `no script errors at #${hash}`);
  }
  // A link inside the page moves to another tab.
  const live = await load('#yf-teens');
  live.window.location.hash = '#offloading';
  await wait(20);
  ok(!live.document.getElementById('working-with-ai').hidden && live.document.getElementById('offloading').open, 'a cross-tab link opens the tab and the disclosure');
}

async function model() {
  const { window, document, errors } = await load();
  eq(document.documentElement.dataset.modelCheck, 'passed', 'the page reports its self-check');
  eq(window.aiModel.modelCheck().length, 0, 'computed_defaults reproduce');
  const { BASE, sameHour, perDay, heavy, scale, project } = window.aiModel;
  eq(heavy(BASE).sora2pro_8s.wh, 418.5, 'the model carries the paper mean for Sora');
  eq(heavy(BASE).sora2pro_8s.prompts, 1395, 'and its count of text prompts');
  for (const c of oracle.cases) {
    const s = { ...BASE, ...c.settings };
    for (const which of ['value', 'low', 'high']) closeWalk(c.same_hour[which], sameHour(s, which), `same_hour.${which}`);
    closeWalk(c.per_person_day, perDay(s), 'per_person_day');
    closeWalk(c.heavy_ai, heavy(s), 'heavy_ai');
    closeWalk(c.scale, scale(s), 'scale');
  }
  closeWalk(oracle.project, project(250), 'project');
  eq(errors.join(), '', 'no script errors');
  // A disagreement is reported, not hidden.
  const hostile = html.replace('"video_dc_wh_per_gb":{"value":0.45,"low":0.171', '"video_dc_wh_per_gb":{"value":0.45,"low":0.18');
  ok(hostile !== html, 'test edit applied');
  const bad = await load('', undefined, hostile);
  eq(bad.document.documentElement.dataset.modelCheck, 'failed', 'a changed input fails the self-check');
  ok(bad.errors.join().includes('disagrees with computed_defaults'), 'and says so on the console');
}

async function sameHourPlate() {
  const { window, document, errors } = await load();
  const p = plateOf(document, 'ai-same-hour');
  const num = p.root.querySelector('[data-param="prompts"] input[type=number]');
  const range = p.root.querySelector('[data-param="prompts"] input[type=range]');
  const value = (k) => p.row(k).querySelector('.ladder-value').textContent;
  const ticks = () => [...p.plot.querySelectorAll('.ladder-axis span')].map((n) => n.textContent).join();
  // Defaults, against COMPARISON-METHOD section 5: the whole hour, where the ranges overlap.
  eq(`${p.value.textContent} ${p.unit.textContent}`, '15 (9.3 to 24) Wh', 'default readout');
  eq(value('chat'), '15 (9.3 to 24) Wh', 'chat row');
  eq(value('video'), '14 (7.2 to 203) Wh', 'video row');
  eq(value('short'), '13 (7.3 to 45) Wh', 'short row');
  ok(p.row('chat').querySelector('.ladder-value .ladder-num').textContent === '15' && p.row('chat').querySelector('.ladder-value .ladder-tag').textContent === '(9.3 to 24)', 'the figure and its range are apart');
  ok(p.root.querySelector('.plate-switch [data-param="boundary"]') && !p.root.querySelector('.plate-claim [data-param="boundary"]'), 'the boundary switch sits over the plot');
  for (const name of ['prompts', 'chat_kind', 'device', 'connection']) ok(p.root.querySelector(`.plate-claim [data-param="${name}"]`), `${name} stays in the claim zone`);
  ok(p.plot.classList.contains('has-yard') && ['bulb', 'charge', 'tv', 'household'].every((k) => p.row(k).classList.contains('is-yard')) && !p.row('chat').classList.contains('is-yard'), 'four yardsticks, half the height of the activities');
  eq(p.plot.querySelectorAll('.ladder-row.is-ghost').length, 0, 'the whole hour counts every row');
  eq(p.plot.querySelector('.has-band'), null, 'no bar of parts on a log ruler, where parts do not add');
  ok(!p.row('chat').querySelector('.ladder-tag').hidden && holds(p.row('chat').querySelector('.ladder-tag').textContent, ['3 Wh']), 'what the activity adds is named on its row');
  ok(!p.row('video').querySelector('.ladder-tag').hidden && holds(p.row('video').querySelector('.ladder-tag').textContent, ['2.1 Wh']), 'and on the video row');
  eq(ticks(), '1,10,100,1,000', 'a log ruler in whole decades around the rows, a household day off it');
  ok(leads(p.reading.textContent, ['10 prompts', '15 Wh', '9.3', '24 Wh', '12 Wh']), `default Reading: ${p.reading.textContent}`);
  // Chat and video overlap at the whole hour, and the plate says so in the band, in the Reading, and in the title, with no ratio.
  ok(holds(p.reading.textContent, ['9.3', '24', '7.2', '203']) && /chat and streamed video overlap/.test(p.reading.textContent) && /neither is clearly lighter/.test(p.reading.textContent), `overlap: ${p.reading.textContent}`);
  ok(!/\btimes\b/.test(p.reading.textContent), 'never a ratio');
  const shared = p.plot.querySelector('.ladder-shared');
  ok(shared && !shared.hidden && leads(shared.textContent, ['9.3', '24 Wh']), 'the shared ground is drawn and named');
  ok(Math.abs(shared.style.getPropertyValue('--lo') - Math.log10(9.28) / 3) < 1e-3 && Math.abs(shared.style.getPropertyValue('--hi') - Math.log10(24) / 3) < 1e-3, 'at its place on the ruler');
  eq(p.facts.querySelectorAll('.plate-seg').length, 4, 'the bar holds what this boundary counts, so it adds up to the readout');
  ok(holds(p.facts.textContent, ['3 Wh', '0.0008 Wh', '10 Wh', '2 Wh']), 'its four parts');
  ok(/measured/.test(p.facts.textContent) && /modeled/.test(p.facts.textContent) && /Router/.test(p.facts.textContent), 'each part marked');
  ok(p.receipt.hidden, 'no card is open before the reader asks');
  fire(window, [...p.root.querySelectorAll('.plate-evidence .receipt')].find((c) => c.dataset.claims.split(' ').includes('fp-001')), 'click');
  ok(!p.receipt.hidden && p.receipt.textContent.includes('Measuring the environmental impact'), "a chip opens its source's card in the window");
  ok(holds(p.facts.textContent, ['3 Wh', '12 Wh']), 'the fixed band is named');
  ok(holds(p.root.querySelector('.plate-title').textContent, ['15', '14', '12 Wh']) && /overlap/.test(p.root.querySelector('.plate-title').textContent), 'the title states the overlap and the fixed band');
  eq(p.root.querySelector('.eyebrow').textContent, 'The same hour, modeled 11/2026', 'the model date sits in the eyebrow');
  const line = p.root.querySelector('.plate-evidence-line').textContent;
  ok(/^\d+ verified( \d+ partly verified)?$/.test(line), `the evidence line counts the selection by status: ${line}`);
  const sourced = +p.root.querySelector('.plate-collar .plate-source-line').textContent.match(/^(\d+) sourced figures/)[1];
  eq(sourced, Object.keys(JSON.parse(document.getElementById('plate-data-ai-same-hour').textContent).receipts).length, 'and the collar counts every receipt on the plate');
  eq(p.plot.querySelector('.ladder-tick[data-mark="fixed"]').hidden, false, 'the screen and router stand on the ruler');
  eq(p.chips().includes('fp-001') && p.chips().includes('fp-124'), true, 'receipts follow the row and the setting');
  eq(p.chips().includes('fp-128'), false, 'a mobile receipt stays away on Wi-Fi');
  // One chip per publisher, its count after a comma for repeats; every claim the selection rests on is under one.
  const chipWords = [...p.root.querySelectorAll('.plate-evidence .receipt')].map((c) => c.textContent);
  ok(chipWords.length > 1 && chipWords.every((w) => !/claims$/.test(w)) && new Set(chipWords.map((w) => w.replace(/, \d+$/, ''))).size === chipWords.length, `one chip per publisher: ${chipWords.join(' | ')}`);
  fire(window, p.row('chat').querySelector('.ladder-label'), 'click');
  eq(p.root.dataset.view, 'chart', 'a row keeps the Chart');
  ok(!p.facts.querySelector('.plate-more').open && p.facts.querySelector('.plate-more').textContent.includes('Equation:'), 'how it is modeled waits behind a disclosure');
  // One paragraph beside the plate; the rest in the details grid under it, the foot lines with their links in view.
  const claimWords = (id) => [...document.querySelectorAll(`#${id} .plate-claim > p:not(.eyebrow)`)].map((n) => n.textContent);
  eq(claimWords('ai-same-hour').join('|'), 'Energy for one hour, in watt-hours, one boundary at a time.', 'the Energy claim zone keeps one paragraph');
  const energyNotes = document.querySelector('#energy > .wrap > .disclosure-grid');
  for (const part of PROSE['ai-same-hour']) ok(energyNotes.textContent.includes(part), `under the plate: ${part}`);
  ok(energyNotes.querySelector('.plate-note a[href="../data-centers/#questions"]') && energyNotes.querySelector('.plate-note a[href="../data-centers/#dc-project"]'), 'its two links in view, not behind a disclosure');
  eq(energyNotes.querySelector('details > summary').textContent, 'This is the hour from the first question at the top of the page, with every assumption open to change.', 'a paragraph folds under its first sentence');
  const order = [...p.root.querySelector('.plate-controls').children].map((c) => c.dataset.param || c.tagName);
  eq(order[0], 'ai-same-hour-plot', 'the view control comes first');
  // Every assumption behind one disclosure, in plain words (ai-28); the stop stays over the plot.
  const more = p.root.querySelector('.plate-claim details.plate-more');
  eq(more.querySelector('summary').textContent, 'Change the assumptions', 'one disclosure for the assumptions');
  eq([...more.querySelectorAll('[data-param]')].map((n) => n.dataset.param).join(), 'prompts,chat_kind,device,connection,network_mode,router_allocation,video_dc_intensity,chat_wh_per_prompt', 'every assumption inside it');
  eq([...p.root.querySelectorAll('[data-param="boundary"] span')].map((n) => n.textContent).join(), 'Data center only,Data center and network,Whole hour', 'the stops in plain words');
  const controlWords = [...document.querySelectorAll('#energy :is(.segmented legend, .segmented label span, .slider > label)')].map((n) => n.textContent).join('|');
  ok(!/Boundary|Plus network|Network accounting|DESNZ|Top-down|Yardstick|By time|^Wh per/.test(controlWords), `no jargon in the controls: ${controlWords}`);

  // Each control moves the Reading, and the numbers match the method.
  const moves = [
    ['boundary dc', () => pick(window, p.radio('boundary', 'dc')), /data center/, '3 (2.4 to 6) Wh'],
    ['the data center ruler', async () => {
      eq(ticks(), '0.01,0.1,1,10,100,1,000', 'decades around the numbers: video runs from 0.029 to 165 here, so the ruler spans 0.01 to 1,000');
      eq(p.facts.querySelectorAll('.plate-seg').length, 1, 'one part counted');
      eq(p.plot.querySelector('.ladder-tick[data-mark="fixed"]').hidden, true, 'no fixed band tick at this boundary');
      // A row this stop does not count stays on the plot, with no mark and the plate's words, and takes no selection.
      for (const k of ['bulb', 'charge', 'tv', 'household']) {
        const row = p.plot.querySelector(`.ladder-row[data-row="${k}"]`);
        ok(row.classList.contains('is-ghost') && row.getAttribute('aria-disabled') === 'true' && !row.hidden, `${k} stays as a ghost`);
        eq(row.querySelector('.ladder-value').textContent, 'Not counted at this boundary', `${k} in the plate's words`);
        ok(row.querySelector('.ladder-mark').hidden && !row.style.getPropertyValue('--x'), `${k} with no mark`);
      }
      eq(p.plot.querySelector('.plate-fold'), null, 'there is no foot line');
    }, ['0.0008', '10', '2'], null],
    ['boundary adds', () => pick(window, p.radio('boundary', 'adds')), /network/, '3 (2.4 to 6) Wh'],
    ['the network ruler', async () => {
      eq(value('video'), '2.1 (0.3 to 185) Wh', 'video row');
      eq(value('short'), '0.8 (0.44 to 27) Wh', 'short row');
      eq(ticks(), '0.1,1,10,100,1,000', 'four decades');
      ok(/\bten\b/.test(p.root.querySelector('.plate-under > .caption').textContent), 'the caption says so, under the axis');
      ok(p.row('chat').querySelector('.ladder-tag').hidden, 'the value already says what it adds');
      eq(p.facts.querySelectorAll('.plate-seg').length, 2, 'two parts counted');
      ok(holds(p.facts.textContent, ['3 Wh', '0.0008 Wh']) && !/Router/.test(p.facts.textContent), 'each part marked; the rest stay out');
    }, ['10 prompts', '3 Wh', '2.4', '6 Wh', '10', '2'], null],
    ['boundary whole', () => pick(window, p.radio('boundary', 'whole')), /whole/, '15 (9.3 to 24) Wh'],
    ['the fixed band', async () => {
      const tick = p.plot.querySelector('.ladder-tick[data-mark="fixed"]');
      eq(tick.hidden, false, 'fixed band tick at whole hour');
      ok(leads(tick.querySelector('span').textContent, ['12 Wh']), 'tick label');
      ok(!p.row('household').classList.contains('is-gap'), 'a yardstick shows');
      eq(ticks(), '1,10,100,1,000', 'a log ruler, because the rows run from 5.9 to 203');
      eq(p.facts.querySelectorAll('.plate-seg').length, 4, 'all four parts count');
      ok(holds(value('household'), ['28,740', 'off this ruler']), 'a household day stays off it, in words');
      ok(p.row('household').querySelector('.ladder-mark').hidden && !p.row('household').style.getPropertyValue('--x'), 'with no mark');
      const onRuler = (k, part) => +p.row(k).style.getPropertyValue(part);
      const log = (v) => Math.log10(v) / 3;
      ok(Math.abs(onRuler('tv', '--x') - log(100)) < 1e-9 && Math.abs(tick.style.getPropertyValue('--x') - log(12)) < 1e-9, 'positions are on the log ruler');
      ok(Math.abs(onRuler('bulb', '--hi') - log(10.5)) < 1e-9, 'a claim row moves to this ruler too');
    }, /whole/, null],
    ['kind medium', () => pick(window, p.radio('chat_kind', 'medium_prompt')), ['24 Wh'], null],
    ['kind reasoning', () => pick(window, p.radio('chat_kind', 'reasoning')), ['51 Wh'], null],
    ['kind high', () => pick(window, p.radio('chat_kind', 'high_reasoning')), ['184 Wh'], null],
    ['kind short', () => pick(window, p.radio('chat_kind', 'short_text')), ['15 Wh'], null],
    ['device tv', () => pick(window, p.radio('device', 'tv')), ['10 prompts', '113 Wh'], null],
    ['device laptop', () => pick(window, p.radio('device', 'laptop')), ['10 prompts', '35 Wh'], null],
    ['device phone', () => pick(window, p.radio('device', 'phone')), /phone/, null],
    ['cellular', () => pick(window, p.radio('connection', 'cellular')), ['5 Wh'], null],
    ['wifi', () => pick(window, p.radio('connection', 'wifi')), ['15 Wh'], null],
    ['router by data', () => pick(window, p.radio('router_allocation', 'by_data')), ['5 Wh'], null],
    ['router excluded', () => pick(window, p.radio('router_allocation', 'excluded')), ['5 Wh', '2 Wh of that is your own screen.'], null],
    ['router by time', () => pick(window, p.radio('router_allocation', 'by_time')), ['15 Wh', '12 Wh of that is your own screen and router'], null],
  ];
  for (const [name, move, want, row] of moves) {
    await move();
    ok(Array.isArray(want) ? holds(p.reading.textContent, want) : want.test(p.reading.textContent), `${name}: ${p.reading.textContent}`);
    if (row) eq(value('chat'), row, `${name} row`);
  }
  // Settings that move other rows.
  fire(window, p.row('video').querySelector('.ladder-label'), 'click');
  ok(holds(p.reading.textContent, ['14 Wh']), 'click selects video');
  ok(/streamed video and chat overlap/.test(p.reading.textContent), 'the overlap reads from the selected row');
  await pick(window, p.radio('network_mode', 'marginal'));
  ok(holds(p.reading.textContent, ['13 Wh']) && holds(p.facts.textContent, ['0.13']), `marginal: ${p.reading.textContent}`);
  await pick(window, p.radio('network_mode', 'average'));
  await pick(window, p.radio('video_dc_intensity', 'desnz_followup'));
  ok(holds(p.reading.textContent, ['14 Wh']) && holds(p.facts.textContent, ['0.17']), `DESNZ follow-up: ${p.reading.textContent}`);
  ok(/scenario/.test(p.facts.textContent), 'the segment says so');
  ok(p.chips().includes('fp-141'), 'and its receipt shows');
  await pick(window, p.radio('video_dc_intensity', 'top_down'));
  ok(holds(p.reading.textContent, ['69 Wh']) && holds(p.facts.textContent, ['55']), `top-down: ${p.reading.textContent}`);
  ok(/a scenario at the top of an unsettled allocation/.test(p.facts.textContent), 'the top-down reading says it is a scenario, not a bound');
  ok(p.chips().includes('fp-150'), 'and its limit has a receipt');
  await pick(window, p.radio('video_dc_intensity', 'measured_delivery'));
  key(window, p.plot, 'Home');
  ok(holds(p.reading.textContent, ['10 prompts']), 'Home returns to chat');
  // Prompts: slider, typed field, presets, and the setting that cannot move a measure says so.
  await slide(window, range, 30);
  eq(num.value, '30', 'the number follows the slider');
  ok(holds(p.reading.textContent, ['30 prompts', '21 Wh']) && holds(p.facts.textContent, ['9']), `slider: ${p.reading.textContent}`);
  eq(p.row('chat').querySelector('.ladder-label').firstChild.nodeValue, 'Chat, 30 prompts', 'the row label follows');
  ok(holds(p.row('chat').querySelector('.ladder-tag').textContent, ['9 Wh']), 'the tag follows');
  await settle();
  ok(!settings(window).includes('prompts='), 'a dragged figure stays out of the address (owner ruling 29)');
  await slide(window, num, 60);
  ok(holds(p.reading.textContent, ['60 prompts', '30 Wh']), 'typed field');
  eq(p.root.querySelector('[data-preset="2.52"]').textContent, 'Average conversation, 2.52', 'the first preset says what it is');
  fire(window, p.root.querySelector('[data-preset="2.52"]'), 'click');
  await wait();
  ok(holds(p.reading.textContent, ['2.52 prompts']), 'preset');
  ok(p.chips().includes('fp-095'), 'the preset brings its receipt');
  const wh = p.root.querySelector('[data-param="chat_wh_per_prompt"] input[type=range]');
  fire(window, p.root.querySelector('[data-preset="10"]'), 'click');
  await wait();
  await slide(window, wh, 0.6);
  ok(holds(p.facts.textContent, ['6']), `Wh per prompt: ${p.facts.textContent}`);
  await pick(window, p.radio('chat_kind', 'reasoning'));
  ok(/does not move/.test(p.facts.textContent), 'a setting that cannot move a measure says so');
  ok(value('chat').includes('(') && !holds(value('chat'), ['24']), `kind range: ${value('chat')}`);
  eq(p.chips().includes('fp-019'), true, 'the kind brings its receipt');
  await pick(window, p.radio('chat_kind', 'high_reasoning'));
  ok(holds(p.facts.textContent, ['4', '20']), 'the preprint dispute is printed');
  // The table follows.
  const cell = p.table.querySelector('[data-cell="chat|whole|display"]');
  eq(cell.textContent, value('chat'), 'table cell follows');
  ok(cell.parentElement.children[2].textContent === '172', `segment cell follows: ${cell.parentElement.children[2].textContent}`);
  fire(window, p.root.querySelector('[data-reset]'), 'click');
  await settle();
  eq(settings(window), '', 'Reset clears the address');
  eq(value('chat'), '15 (9.3 to 24) Wh', 'Reset restores');
  ok(holds(p.reading.textContent, ['10 prompts', '15 Wh']), 'Reset restores the Reading');
  // Everyday rows.
  await pick(window, p.radio('boundary', 'whole'));
  fire(window, p.row('household').querySelector('.ladder-label'), 'click');
  ok(/US home/.test(p.reading.textContent) && !/for the hour/.test(p.reading.textContent), `an everyday row, which is not an hour: ${p.reading.textContent}`);
  eq(`${p.value.textContent} ${p.unit.textContent}`, '28,740 Wh', 'household readout');
  ok(p.chips().includes('fp-075'), 'household receipt');
  fire(window, p.row('bulb').querySelector('.ladder-label'), 'click');
  eq(value('bulb'), '10.5 (5.9 to 10.5) Wh', 'bulb');
  await pick(window, p.radio('boundary', 'dc'));
  ok(p.plot.querySelector('.ladder-row[data-row="bulb"]').classList.contains('is-ghost'), 'at the data center the bulb is a ghost');
  ok(holds(p.reading.textContent, ['10 prompts']), 'and the selection returns to the first row');
  await settle();
  ok(!settings(window).includes('ai-same-hour=bulb'), 'the address follows');
  fire(window, p.plot.querySelector('.ladder-row[data-row="bulb"] .ladder-label'), 'click');
  ok(holds(p.reading.textContent, ['10 prompts']), 'a ghost takes no click');
  key(window, p.plot, 'End');
  ok(/short-video/.test(p.reading.textContent), 'and the arrow keys stop short of the ghosts');
  key(window, p.plot, 'Home');
  await pick(window, p.radio('boundary', 'whole'));
  // Copy keeps working through the page script's sentence.
  ok(p.reading.textContent.length > 0, 'still reads');
  eq(errors.join(), '', 'no script errors');
}

async function rulersHold() {
  const { window, document, errors } = await load();
  const p = plateOf(document, 'ai-same-hour');
  const num = p.root.querySelector('[data-param="prompts"] input[type=number]');
  for (const boundary of ['dc', 'adds', 'whole']) {
    await pick(window, p.radio('boundary', boundary));
    for (const device of ['phone', 'tv']) {
      await pick(window, p.radio('device', device));
      for (const connection of ['wifi', 'cellular']) {
        await pick(window, p.radio('connection', connection));
        for (const kind of ['short_text', 'high_reasoning']) {
          await pick(window, p.radio('chat_kind', kind));
          for (const count of [1, 60]) {
            await slide(window, num, count);
            for (const row of p.plot.querySelectorAll('.ladder-row:not([hidden])')) {
              for (const part of ['--x', '--lo', '--hi']) {
                const raw = row.style.getPropertyValue(part);
                if (raw === '') continue;
                const where = `${row.dataset.row} ${part} at ${boundary}, ${device}, ${connection}, ${kind}, ${count} prompts: ${raw}`;
                ok(+raw > 0 && +raw < 1 + 1e-9, `on the ruler, not clipped: ${where}`);
              }
            }
          }
        }
      }
    }
  }
  eq(errors.join(), '', 'no script errors');
}

async function countView() {
  const { window, document, errors } = await load();
  const p = plateOf(document, 'ai-same-hour');
  const num = p.root.querySelector('[data-param="prompts"] input[type=number]');
  const squares = (k, cls) => [...p.row(k).querySelectorAll(`path.m-count${cls ? `.${cls}` : ''}`)].reduce((sum, path) => sum + (path.getAttribute('d').match(/M/g) || []).length, 0);
  eq(p.plot.querySelector('.count-rows'), null, 'Count waits until asked for');
  ok(p.plot.querySelector('.count-key').hidden, 'its key too');
  await pick(window, p.radio('boundary', 'whole'));
  await pick(window, p.radio('ai-same-hour-plot', 'count'));
  ok(p.plot.querySelector('.ladder-groups').hidden, 'the ruler steps aside');
  ok(!p.plot.querySelector('.count-rows').hidden && !p.plot.querySelector('.count-key').hidden, 'the squares and their key show');
  ok(p.root.querySelector('.plate-under > .caption').hidden, 'the ruler\'s caption goes with the ruler');
  await settle();
  ok(settings(window).includes('ai-same-hour-plot=count'), 'the view is in the address');
  eq(squares('chat', 'seg-dc'), 10, 'one square per prompt in the data center');
  eq(squares('chat', 'seg-band'), 34 + 7, 'router and device: 33.3 and 6.67 squares, with their slivers');
  eq(squares('video', 'seg-dc'), 2, 'video data center: 1.5 squares');
  eq(squares('video', 'seg-net'), 6, 'video network: 5.33 squares');
  ok(leads(p.row('chat').querySelector('.ladder-value').textContent, ['50']), 'the count prints');
  eq(squares('household'), 0, 'a row past the cap draws no squares, so it cannot look like another row');
  ok(holds(p.row('household').querySelector('.count-over').textContent, ['192', '500 squares']), 'it says so');
  eq(p.row('household').querySelector('.ladder-num').textContent, '95,800', 'with its count');
  eq(squares('tv'), 334, 'television in full: 333 squares and a sliver');
  const lefts = p.row('tv').querySelector('path').getAttribute('d').match(/M\d+/g).map((m) => +m.slice(1));
  eq(lefts.slice(0, 25).filter((x, i) => i && x > lefts[i - 1]).length, 24, 'twenty-five squares to a row');
  eq(lefts[25], 0, 'then a new row');
  ok(p.row('chat').classList.contains('is-on'), 'the selection marks the row');
  ok(holds(p.row('chat').querySelector('.ladder-label').textContent, ['10 prompts']), 'its label is live');
  eq(p.row('chat').querySelector('path.seg-dc').classList.contains('is-hollow'), false, 'measured data center is filled');
  eq(p.row('video').querySelector('path.seg-dc').classList.contains('is-hollow'), true, 'modeled data center is hollow');
  // Keys and clicks work here, and the Reading follows.
  key(window, p.plot, 'ArrowDown');
  ok(p.row('video').classList.contains('is-on') && /video/.test(p.reading.textContent), 'arrows move in Count');
  fire(window, p.row('short').querySelector('.ladder-label'), 'click');
  ok(/short-video/.test(p.reading.textContent), 'click selects in Count');
  key(window, p.plot, 'Home');
  // Settings move the squares.
  num.value = '30';
  fire(window, num, 'input');
  await wait();
  eq(squares('chat', 'seg-dc'), 30, 'squares follow the prompts');
  await pick(window, p.radio('chat_kind', 'reasoning'));
  ok(p.row('chat').querySelector('path.seg-dc').classList.contains('is-hollow'), 'a modeled kind is hollow');
  await pick(window, p.radio('chat_kind', 'high_reasoning'));
  eq(squares('chat'), 0, 'an activity past the cap draws none');
  ok(p.row('chat').querySelector('.count-over').textContent.trim().length > 0, 'and says so');
  await pick(window, p.radio('chat_kind', 'short_text'));
  await pick(window, p.radio('boundary', 'dc'));
  eq(squares('chat', 'seg-band'), 0, 'no fixed band at the data center boundary');
  ok(p.plot.querySelector('.count-row[data-row="household"]').classList.contains('is-ghost'), 'an everyday row is a ghost here');
  eq(p.plot.querySelector('.count-row[data-row="household"] .ladder-value').textContent, 'Not counted at this boundary', 'in the plate\'s words');
  await pick(window, p.radio('connection', 'cellular'));
  await pick(window, p.radio('boundary', 'whole'));
  eq(squares('chat', 'seg-band') > 0, true, 'the device stays on cellular');
  await pick(window, p.radio('ai-same-hour-plot', 'ruler'));
  ok(p.plot.querySelector('.count-rows').hidden && !p.plot.querySelector('.ladder-groups').hidden, 'back to the ruler');
  ok(p.plot.querySelector('.count-key').hidden, 'its key goes');
  // A size change redraws at a larger square, filling the zone.
  await pick(window, p.radio('ai-same-hour-plot', 'count'));
  const size = () => +p.row('chat').querySelector('path').getAttribute('d').match(/h(\d+)v/)[1];
  const small = size();
  window.size = { w: 1200, h: 900 };
  window.observers.forEach((cb) => cb());
  await wait(40);
  ok(size() > small, `squares grow with the zone: ${small} to ${size()}`);
  const direct = await load('?ai-same-hour-plot=count&boundary=adds');
  const q = plateOf(direct.document, 'ai-same-hour');
  ok(!q.plot.querySelector('.count-rows').hidden, 'Count opens from the address');
  ok(q.plot.querySelector('.count-row[data-row="bulb"]').classList.contains('is-ghost'), 'with this stop\'s ghosts');
  eq(q.radio('boundary', 'adds').checked, true, 'with its boundary');
  eq(errors.join() + direct.errors.join(), '', 'no script errors');
}

// Selection fills the detail panel and each control changes the Reading, on every other plate.
async function otherPlates() {
  const { window, document, errors } = await load();
  const open = async (tab) => {
    fire(window, document.querySelector(`a[href="#${tab}"]`), 'click');
    window.observers.forEach((cb) => cb());
    await wait(30);
  };
  const walk = (p, id) => {
    const seen = new Set();
    key(window, p.plot, 'Home');
    for (let i = 0; i < 40; i += 1) {
      const text = p.reading.textContent;
      ok(text.length > 10, `${id} reads`);
      seen.add(text);
      key(window, p.plot, 'ArrowDown');
    }
    ok(seen.size > 1, `${id}: arrows change the Reading`);
    key(window, p.plot, 'Home');
    ok(p.plot.getAttribute('aria-activedescendant'), `${id}: an active row`);
    ok(p.chips().length >= 0 && p.root.querySelector(`.plate-sources-link a[href="sources/#${id}"]`), `${id}: its receipts are a link away`);
  };
  const moved = async (p, id, name, values) => {
    const seen = new Set([p.reading.textContent]);
    for (const v of values) {
      await pick(window, p.radio(name, v));
      seen.add(p.reading.textContent);
    }
    ok(seen.size > 1, `${id}: ${name} changes the Reading`);
    await pick(window, p.radio(name, values[0]));
  };

  await open('energy');
  const hv = plateOf(document, 'ai-heavy-ai');
  ok(hv.root.querySelector('.plate-switch [data-param="yard"]'), 'the yardstick switch sits over the plot');
  walk(hv, 'ai-heavy-ai');
  key(window, hv.plot, 'Home');
  ok(leads(hv.reading.textContent, ['0.3 Wh', '1', '77 seconds']), `heavy default: ${hv.reading.textContent}`);
  eq(hv.row('prompt').querySelector('.ladder-value > .ladder-tag.ladder-eq').textContent, '77 seconds', 'streaming time, a tag under the Wh value');
  ok(hv.row('prompt').querySelector('.ladder-value').textContent.startsWith('0.3 Wh '), 'with the Wh first, a word apart');
  ok(hv.row('veo').querySelector('.ladder-value').textContent.endsWith(' 2.2 hours') && hv.row('veo').querySelectorAll('.ladder-eq').length === 1, 'after the range, and once');
  ok(hv.row('veo').querySelector('.ladder-eq').textContent === '2.2 hours', 'clip in hours');
  ok(hv.row('ccday').querySelector('.ladder-eq').textContent === '214 hours', 'agent day in hours');
  ok(!hv.plot.querySelector('.ladder-tick[data-mark="y-same"]').hidden && hv.plot.querySelector('.ladder-tick[data-mark="y-pub"]').hidden, 'one yardstick shows');
  await pick(window, hv.radio('yard', 'pub'));
  ok(holds(hv.reading.textContent, ['5.7 seconds']), `published: ${hv.reading.textContent}`);
  eq(hv.row('veo').querySelector('.ladder-eq').textContent, '9.8 minutes', 'Veo on the published hour');
  ok(hv.plot.querySelector('.ladder-tick[data-mark="y-pub"] span').textContent.includes('188'), 'its tick');
  await pick(window, hv.radio('yard', 'dc'));
  ok(holds(hv.reading.textContent, ['40 minutes']) , `data center: ${hv.reading.textContent}`);
  await pick(window, hv.radio('heavy_intensity', 'desnz_followup'));
  ok(hv.reading.textContent.includes('1.8 hours'), `DESNZ follow-up yardstick: ${hv.reading.textContent}`);
  await pick(window, hv.radio('heavy_intensity', 'measured_delivery'));
  await pick(window, hv.radio('yard', 'same'));
  await pick(window, hv.radio('heavy_device', 'tv'));
  ok(/television/.test(hv.reading.textContent), `device: ${hv.reading.textContent}`);
  await pick(window, hv.radio('heavy_device', 'phone'));
  key(window, hv.plot, 'End');
  ok(hv.reading.textContent.includes('Limit:'), 'a partly row keeps its limit');
  ok(hv.chips().includes('fp-139'), 'its receipt');

  const pd = plateOf(document, 'ai-per-day');
  walk(pd, 'ai-per-day');
  ok(holds(pd.reading.textContent, ['1.1', '0.86', '4.8) Wh']) && holds(pd.reading.textContent, ['0.0038 percent']), `per day: ${pd.reading.textContent}`);
  await moved(pd, 'ai-per-day', 'day_count', ['mean', 'eight']);
  await pick(window, pd.radio('day_count', 'panel'));
  ok(holds(pd.reading.textContent, ['1.3']), `Epoch panel count: ${pd.reading.textContent}`);
  await pick(window, pd.radio('day_count', 'mean'));
  await pick(window, pd.radio('day_intensity', 'desnz_followup'));
  ok(/video rows/.test(pd.facts.textContent), 'a setting that cannot move the chat row says so');
  await pick(window, pd.radio('day_intensity', 'measured_delivery'));
  fire(window, pd.row('yt').querySelector('.ladder-label'), 'click');
  await moved(pd, 'ai-per-day', 'day_intensity', ['measured_delivery', 'top_down']);
  await pick(window, pd.radio('day_intensity', 'desnz_followup'));
  ok(pd.reading.textContent.includes('0.25'), `DESNZ follow-up day: ${pd.reading.textContent}`);
  await pick(window, pd.radio('day_intensity', 'top_down'));
  ok(holds(pd.reading.textContent, ['81']) && /a scenario at the top of an unsettled allocation/.test(pd.facts.textContent), `top-down day: ${pd.reading.textContent}`);
  // A spread the model does not compute at this setting is not printed (ai-05).
  for (const k of ['yt', 'ig']) {
    ok(!/\(/.test(pd.row(k).querySelector('.ladder-value').textContent) && pd.row(k).querySelector('.ladder-range').hidden, `${k}: no spread at the top-down setting: ${pd.row(k).querySelector('.ladder-value').textContent}`);
  }
  ok(!/\(/.test(pd.reading.textContent) && /Range not computed for this setting/.test(pd.facts.textContent), `and the Reading says so: ${pd.reading.textContent}`);
  await pick(window, pd.radio('day_intensity', 'measured_delivery'));
  ok(/\(/.test(pd.row('yt').querySelector('.ladder-value').textContent) && !pd.row('yt').querySelector('.ladder-range').hidden, 'the spread returns on measured delivery');
  fire(window, pd.row('chat').querySelector('.ladder-label'), 'click');
  await slide(window, pd.root.querySelector('[data-param="day_wh"] input[type=range]'), 0.6);
  ok(pd.reading.textContent.includes('2.2'), `Wh per prompt: ${pd.reading.textContent}`);
  fire(window, pd.row('meta').querySelector('.ladder-label'), 'click');
  ok(pd.reading.textContent.includes('15.1') && pd.chips().includes('fp-060'), 'Meta row');

  const sc = plateOf(document, 'ai-scale');
  walk(sc, 'ai-scale');
  ok(sc.reading.textContent.includes('0.27 (0.22 to 0.55) TWh'), `scale: ${sc.reading.textContent}`);
  await moved(sc, 'ai-scale', 'scale_wh', ['value', 'low', 'mean', 'high']);
  fire(window, sc.row('ytdc').querySelector('.ladder-label'), 'click');
  await moved(sc, 'ai-scale', 'scale_intensity', ['m', 'd']);
  fire(window, sc.row('iea30').querySelector('.ladder-label'), 'click');
  ok(sc.reading.textContent.includes('945'), 'projection row');
  ok(sc.row('iea30').querySelector('.ladder-mark').classList.contains('is-hollow'), 'projection hollow');
  ok(sc.row('lbnl30').querySelector('.ladder-range').classList.contains('is-proj'), 'projection dashed');

  await open('economics');
  const oc = plateOf(document, 'ai-occupations');
  walk(oc, 'ai-occupations');
  for (const id of ['ai-occupations', 'ai-jobs-sector']) eq(document.querySelector(`#${id} .plate-under .plate-legend`).textContent, 'Dashed outline: BLS projection, 2025 to 2035', `${id}: the key says what the dashes mean`);
  ok(document.querySelector('#ai-occupations .plate-under .plate-square.is-proj'), 'with the same dashed outline on a square');
  // jsdom loads no CSS, so the rule is held as text: the occupations key stands in the kit's under area, in reading order (a11y A4); the Table is a button over the plot.
  const aiCss = read('site/assets/css/ai.css');
  ok(!/#ai-occupations[^{,]*> \.plate-under \{[^}]*(display: contents|order|grid-row)/.test(aiCss) && document.querySelector('#ai-occupations .plate-views [data-view="table"]'), 'the occupations key keeps its place under the plot, and the Table its button');
  eq(oc.row('jb-007').querySelector('.ladder-value').textContent, '-25.5 percent', 'a printed minus');
  eq(oc.row('jb-002').querySelector('.ladder-value').textContent, '+34.6 percent', 'a printed plus');
  ok(oc.row('jb-007').classList.contains('is-neg') && oc.row('jb-002').classList.contains('is-pos'), 'polarity');
  ok(leads(oc.plot.querySelector('.ladder-tick').textContent, ['+3.5 percent']), 'baseline');
  ok(oc.plot.querySelector('.ladder-bar.is-proj'), 'dashed cap: every bar a projection');
  const before = oc.row('jb-013').style.getPropertyValue('order');
  await pick(window, oc.radio('occ_sort', 'tag'));
  ok(oc.row('jb-013').style.getPropertyValue('order') !== before, 'sort by group reorders');
  await pick(window, oc.radio('occ_sort', 'value'));
  fire(window, oc.row('jb-011').querySelector('.ladder-label'), 'click');
  ok(oc.facts.textContent.includes('72,700') && oc.chips().includes('jb-012'), 'electricians carry their openings');

  const dp = plateOf(document, 'ai-displacement');
  walk(dp, 'ai-displacement');
  eq(dp.row('stanford').querySelector('.ladder-value').textContent, '-19 percent', 'a shortfall reads as a minus');
  eq(dp.row('imf').querySelector('.ladder-value').textContent, '-10 percent', 'postings too');
  ok(dp.row('pwcopen').querySelector('.ladder-value').textContent.startsWith('+35'), 'a rise as a plus');
  ok(wordsOnly(dp.row('yale').querySelector('.ladder-value').textContent), 'words');
  ok(dp.row('yale').querySelector('.ladder-mark').hidden, 'no mark');
  fire(window, dp.row('imf').querySelector('.ladder-label'), 'click');
  ok(dp.reading.textContent.includes('Limit:'), 'partly limit');
  ok(dp.facts.textContent.includes('Goldman') && dp.facts.textContent.includes('120,136') && holds(dp.facts.textContent, ['15 percent']), 'context figures in the detail');

  const ar = plateOf(document, 'ai-adoption-returns');
  walk(ar, 'ai-adoption-returns');
  const agentic = ar.row('agentic');
  ok(agentic.querySelector('.ladder-mark').classList.contains('is-hollow') && !agentic.querySelector('.ladder-mark').hidden, 'a forecast is hollow, and its floor has a mark');
  ok(agentic.querySelector('.ladder-value').textContent.startsWith('over'), 'a floor reads over, as its source says');
  eq(ar.plot.querySelectorAll('.ladder').length, 2, 'two rulers: shares, and with AI against without');
  ok(ar.facts.textContent.includes('high-skill services'), 'the figures beside it');

  await open('companies');
  const mo = plateOf(document, 'ai-company-money');
  const claimWords = (id) => [...document.querySelectorAll(`#${id} .plate-claim > p:not(.eyebrow)`)].map((n) => n.textContent);
  const moPanels = () => [...mo.plot.querySelectorAll('.plate-svg > g')];
  eq(mo.plot.querySelectorAll('.m-title').length, 7, 'the share panel, then six');
  ok(/share of operating cash flow/.test(moPanels()[0].querySelector('.m-title').textContent), 'the share panel comes first');
  eq(moPanels()[0].querySelector('.m-line.is-on') !== null && moPanels()[0].querySelectorAll('.m-line').length, 7, 'seven companies on one scale, one in orange');
  // 131.82 billion over 139.51 billion: Amazon's fiscal 2025, fin-003 over fin-010.
  eq(`${mo.value.textContent} ${mo.unit.textContent}`, '94.5 percent', "the readout is the first panel's figure");
  ok(leads(mo.reading.textContent, ['Amazon', '2025', '12/31/2025', '131.82', '139.51', '94.5 percent']), `money: ${mo.reading.textContent}`);
  ok(mo.facts.textContent.includes('131.82 / 139.51 = 94.5 percent'), 'its arithmetic');
  ok(mo.chips().includes('fin-003') && mo.chips().includes('fin-010'), 'its two claims');
  ok(holds(mo.root.querySelector('.plate-title').textContent, ['176 billion dollars', '114']) && holds(mo.root.querySelector('.plate-claim').textContent, ['176 billion dollars', '114', '09/30/2026', '132', '127']), 'title and the line under it, from the filings');
  eq(claimWords('ai-company-money').length, 1, 'Companies keeps one paragraph beside the plate');
  ok(claimWords('ai-company-money')[0].endsWith('The chart shows full fiscal years.') && claimWords('ai-company-money')[0].split(/(?<=\.) /).length === 3, 'of three sentences');
  const moneyNotes = document.querySelector('#ai-company-money ~ .plate-notes');
  eq(moneyNotes.previousElementSibling, mo.root, 'and the rest stand directly under its plate');
  for (const part of PROSE['ai-company-money']) ok(moneyNotes.textContent.includes(part), `under the plate: ${part}`);
  ok(holds(mo.reading.textContent, ['Amazon', '-42 billion dollars', '09/30/2026']) && !mo.root.querySelector('.plate-title').textContent.includes('free cash flow'), 'the free cash flow figure reads in the Reading, not the title');
  ok(mo.chips().includes('fin-057'), 'with its receipt');
  const topTick = (i) => Math.max(...[...moPanels()[i].querySelectorAll('.m-tick')].map((n) => +n.textContent.replace(/,/g, '')).filter((v) => v < 2000));
  eq(topTick(1), topTick(2), 'capital spending and operating cash flow share one scale');
  // The first panel's division, by hand, against its place on the plot; and each panel's needle stands at its own year.
  const shareCell = (company, year) => [...mo.table.querySelectorAll('tbody tr')].find((tr) => tr.children[0].textContent === company && tr.children[1].textContent === year);
  const headCells = [...mo.table.querySelectorAll('thead th')];
  ok(/share of operating cash flow/.test(headCells.at(-2).textContent) && headCells.at(-1).textContent === 'Claims', 'the table has a column for the first panel, before the claims');
  eq(shareCell('Amazon', '2025').children[headCells.length - 2].textContent, '94.5', 'its cell');
  eq(shareCell('Amazon', '2022').children[headCells.length - 2].textContent, '136', 'a year past even');
  eq(shareCell('Tesla', '2018').children[headCells.length - 2].textContent, '100', 'and one at it');
  const needlesAt = (year) => moPanels().slice(1).every((g) => g.style.getPropertyValue('--at') === `${g.querySelector(`[data-row="${year}"]`).dataset.nx}px`);
  ok(needlesAt('2025'), 'each panel has its own needle');
  key(window, mo.plot, 'ArrowLeft');
  ok(leads(mo.reading.textContent, ['Amazon', '2024']), 'the needle moves through years');
  ok(needlesAt('2024'), 'in every panel');
  ok(mo.plot.querySelector('.m-line.is-on'), 'a highlighted line');
  // A name at a line's end picks that company, and the orange moves everywhere.
  const named = moPanels()[0].querySelector('.m-label.m-end');
  const pickedName = named.textContent;
  fire(window, named, 'click');
  await wait();
  ok(mo.radio('company', pickedName).checked && leads(mo.reading.textContent, [pickedName, '2024']), 'a name picks its company');
  ok(moPanels().slice(0, 2).every((g) => g.querySelector('.m-label.is-lead')?.textContent === pickedName), 'and the panels follow');
  await pick(window, mo.radio('company', 'Amazon'));
  // The first panel names the selected company and the highest and lowest line at their last shares, from the table's own column; each of the six names only the selected.
  const lastShares = new Map();
  for (const tr of mo.table.querySelectorAll('tbody tr')) if (tr.children[headCells.length - 2].textContent) lastShares.set(tr.children[0].textContent, +tr.children[headCells.length - 2].textContent.replace(/,/g, ''));
  const byShare = [...lastShares.keys()].sort((a, b) => lastShares.get(b) - lastShares.get(a));
  eq(byShare.length, 7, 'seven companies in the share column');
  const namesFollow = (name) => {
    const [first, ...six] = moPanels();
    const names = [...first.querySelectorAll('.m-label')];
    eq(names.filter((n) => n.classList.contains('is-lead')).map((n) => n.textContent).join(), name, `${name} is the lead at the right end`);
    eq(names.map((n) => n.textContent).sort().join(), [...new Set([name, byShare[0], byShare.at(-1)])].sort().join(), `${name}, the highest, and the lowest, and no other name`);
    const heights = names.map((n) => +n.getAttribute('y')).sort((a, b) => a - b);
    ok(heights.every((h, i) => !i || h - heights[i - 1] >= 17.99), `names moved apart: ${heights}`);
    eq(six.length, 6, 'six multiples');
    for (const panel of six) ok([...panel.querySelectorAll('.m-label')].every((n) => n.textContent === name) && panel.querySelectorAll('.m-label').length <= 1 && !panel.querySelector('.m-end'), `the multiples name only ${name}`);
    eq(six.filter((panel) => panel.querySelector('.m-line.is-on')).length, six.filter((panel) => panel.querySelector('.m-label')).length, `${name} is named where it has a line, and only there`);
  };
  namesFollow('Amazon');
  for (const name of ['Microsoft', 'Alphabet', 'Meta', 'Apple', 'NVIDIA', 'Tesla']) {
    await pick(window, mo.radio('company', name));
    ok(mo.reading.textContent.startsWith(`${name}, fiscal 2024`) || mo.reading.textContent.includes(name), `${name} reads`);
    ok(mo.chips().length > 0, `${name} receipts`);
    namesFollow(name);
  }
  ok(/not reported/.test(mo.reading.textContent), `Tesla buybacks: ${mo.reading.textContent}`);
  ok(!mo.reading.textContent.includes('free cash flow') && !mo.chips().includes('fin-057'), "Amazon's free cash flow reads only under Amazon");
  await pick(window, mo.radio('company', 'Amazon'));

  fire(window, document.getElementById('q-buildout'), 'click'); // the agenda's second face holds it now
  await wait(30);
  const cc = plateOf(document, 'ai-capex-cash');
  ok(figures(cc.row('amazon').querySelector('.ladder-value').textContent).length >= 2, 'both values');
  ok(!cc.row('amazon').querySelector('.ladder-mark.is-b').hidden, 'a second mark');
  ok(leads(cc.reading.textContent, ['Amazon', '2025', '12/31/2025', '131.82 billion', '123.03 billion']), `capex: ${cc.reading.textContent}`);
  ok(cc.facts.textContent.includes('131.82 / 123.03 = 1.07'), `ratio: ${cc.facts.textContent}`);
  const x0 = cc.row('amazon').style.getPropertyValue('--x');
  await pick(window, cc.radio('fy', '2022'));
  ok(cc.row('amazon').style.getPropertyValue('--x') !== x0 && leads(cc.reading.textContent, ['Amazon', '2022']), 'a year stop moves the marks');
  await pick(window, cc.radio('fy', 'latest'));
  walk(cc, 'ai-capex-cash');
  ok(holds(cc.root.querySelector('.plate-title').textContent, ['123 billion']) && holds(cc.root.querySelector('.plate-title').textContent, ['Apple', '9', '137']), 'title on the fiscal-year basis');

  const fo = plateOf(document, 'ai-company-footprint');
  eq(fo.plot.querySelectorAll('.m-title').length, 4, 'four panels');
  ok(holds(fo.root.querySelector('.plate-title').textContent, ['37 percent', '2025', '43.6 TWh']), `footprint title: ${fo.root.querySelector('.plate-title').textContent}`);
  ok(leads(fo.reading.textContent, ['Alphabet', '2025', '43.6']), `footprint: ${fo.reading.textContent}`);
  ok(holds(fo.facts.textContent, ['2']), 'the exclusion is stated');
  await pick(window, fo.radio('foot_co', 'Amazon'));
  ok(/none reported/.test(fo.reading.textContent) && fo.reading.textContent.includes('21.82'), `Amazon: ${fo.reading.textContent}`);
  await pick(window, fo.radio('foot_co', 'Tesla'));
  ok(fo.reading.textContent.includes('Tesla, 2025') && fo.reading.textContent.includes('2.53'), `Tesla: ${fo.reading.textContent}`);
  key(window, fo.plot, 'ArrowLeft');
  ok(fo.reading.textContent.includes('2024'), 'years move');

  const gd = plateOf(document, 'ai-guidance-2026');
  walk(gd, 'ai-guidance-2026');
  fire(window, gd.row('tesla').querySelector('.ladder-label'), 'click');
  eq(gd.row('tesla').querySelector('.ladder-value').textContent, 'at least 20 billion dollars', 'a floor');
  ok(!gd.row('tesla').querySelector('.ladder-mark').hidden, 'with its mark');
  ok(gd.row('tesla').querySelector('.ladder-mark').classList.contains('is-hollow'), 'hollow');
  ok(wordsOnly(gd.row('apple').querySelector('.ladder-value').textContent), 'words');
  fire(window, gd.row('microsoft').querySelector('.ladder-label'), 'click');
  ok(gd.reading.textContent.includes('Limit:'), 'partly limit');
  ok(gd.facts.textContent.includes('45.2') && gd.chips().includes('fin-053'), 'latest quarter');

  const ho = plateOf(document, 'ai-holdings');
  walk(ho, 'ai-holdings');
  eq(ho.plot.querySelectorAll('.ladder').length, 3, 'three rulers');
  eq(ho.plot.querySelectorAll('.ladder')[0].dataset.form, 'bar', 'bars first');
  fire(window, ho.row('amazon-anthropic').querySelector('.ladder-label'), 'click');
  ok(ho.reading.textContent.includes('238.7') && ho.reading.textContent.includes('Limit:'), 'stake with its limit');
  key(window, ho.plot, 'Home');
  ok(leads(ho.reading.textContent, ['Apple', '5,008.2 billion dollars']) && /partly verified/.test(ho.reading.textContent) && ho.reading.textContent.includes('Limit:'), `a market value keeps its status and limit: ${ho.reading.textContent}`);
  ok(ho.reading.textContent.length < 900, 'with the long boundary left to Sources');
  ok(read('site/ai/sources/index.html').includes('Share counts are dated'), 'where it stands in full, on the Sources page');
  eq(errors.join(), '', 'no script errors');
}

async function noScripts() {
  const { window: { document } } = new JSDOM(html);
  eq(document.querySelectorAll('section.panel').length, 7, 'all panels in the page');
  eq(document.querySelectorAll('[data-plate]').length, 14, 'fourteen plates');
  ok(!document.querySelector('[role="tablist"]') && document.querySelector('.section-strip a[href="#economics"]'), 'the strip is a jump list');
  for (const plate of document.querySelectorAll('[data-plate]')) {
    ok(plate.querySelector('.reading').textContent.length > 10, `${plate.id} has a default Reading`);
    ok(plate.querySelector('.plate-title').textContent.length <= 120, `${plate.id}: a title of at most 120 characters, four lines at 1440`);
    ok(plate.querySelector('.plate-controls') === null || plate.querySelector('.plate-controls').matches('[data-js]'), `${plate.id} controls wait for scripts (html:not(.js) [data-js] hides them)`);
    ok(plate.querySelectorAll('table.plate-table tbody tr').length > 0, `${plate.id} has its table`);
    ok(plate.querySelector(`.plate-sources-link a[href="sources/#${plate.id}"]`) && !plate.querySelector('ol.plate-sources'), `${plate.id} links its sources, and keeps no list`);
    ok([...plate.querySelectorAll('.plate-table a')].every((a) => a.getAttribute('href').startsWith(`sources/#${plate.id}-source-`)), `${plate.id}: its Table links reach its receipts`);
    ok(plate.querySelector('.plate-plot').children.length > 0, `${plate.id} has a static plot`);
  }
  ok(/Counted: Whole hour/.test(document.querySelector('#ai-same-hour .plate-setting').textContent), 'a line names the setting shown');
  ok(document.querySelector('#ai-same-hour .plate-facts details.plate-more').textContent.includes('Equation:'), 'without scripts how it is modeled is on the page');
  ok(document.querySelector('#ai-heavy-ai [data-row="sora"] .ladder-value').textContent.startsWith('418.5'), 'Sora at the paper mean');
  eq(['energy', 'economics', 'companies'].filter((id) => document.querySelector(`#${id} .panel-title.is-tab-label`)).length, 3, 'titles that repeat the tab');
  eq(document.querySelector('#economics .panel-title').textContent, 'Work', 'the Work tab keeps its name');
  // One Coming line per tab, and no unfinished folds (ai-31).
  eq(document.querySelectorAll('.slot-fold').length, 0, 'no folded status notes');
  ok(document.querySelector('#economics > .wrap > .slot') && document.querySelectorAll('#economics .slot').length === 1, 'Work: the held slot is its one Coming line');
  eq(document.querySelectorAll('#youth-education .slot').length, 1, 'Youth: one Coming line');
  // The brief, and the agenda under it; without scripts the faces stack, whole, and the questions are jump links.
  const brief = document.querySelector('main > header.brief.photo-ai');
  eq(brief.querySelector('.brief-name').textContent, 'AI', 'the name line, as the nav names the page');
  eq(brief.querySelector('h1').textContent, 'Who an AI tool serves, what it uses, and whether the Tribe controls it', 'the h1 says what the page settles');
  ok(brief.querySelector('.brief-lead').textContent.split(/(?<=[.?]) /).length <= 2, 'a lead of two sentences at most');
  eq(brief.querySelector('.brief-meta .figure-num + .figure-label').textContent, 'Sources checked', 'the date and its label');
  ok(brief.querySelector('.brief-meta a[data-sources][href="sources/"]') && brief.querySelector('.brief-meta a[href*="2026-039"]'), 'the Sources page and the resolution');
  ok(!brief.querySelector('[data-pour], .cr') && !/\d+(\.\d+)? Wh/.test(brief.textContent), 'no figures in the brief');
  ok(brief.querySelector('.photo-credit'), 'the photograph is credited');
  const agenda = document.querySelector('section.agenda#overview');
  eq([...agenda.querySelectorAll('.agenda-q > a')].map((a) => a.getAttribute('href')).join(), '#face-hour,#face-buildout,#face-tiers', 'the questions link their faces');
  ok(agenda.querySelector('#face-hour #ai-hour') && agenda.querySelector('#face-buildout #ai-capex-cash') && agenda.querySelector('#face-tiers fieldset.stair'), 'each face in place');
  ok([...agenda.querySelectorAll('.agenda-a')].every((n) => n.textContent.length > 20 && !n.children.length), 'each answer is built in, as plain text');
  eq(agenda.querySelectorAll('#face-tiers .stair-detail').length, 4, 'every step keeps its facts');
  // The text tabs: prose bands, no tier table and no second stair (ai-26).
  for (const id of ['working-with-ai', 'youth-education', 'data-sovereignty']) {
    ok(document.querySelector(`#${id} .ai-band > .ai-lede > h2.panel-title`), `${id}: its words lead a band`);
    eq(document.querySelectorAll(`#${id} .ai-lede details`).length, 0, `${id}: no disclosure in the lede`);
  }
  eq(document.querySelectorAll('.tier-grid, .tier-stair, figure.evidence-key, [data-library-feed]').length, 0, 'the tier table, the old stair, the evidence key, and the library feed are gone');
  ok(document.querySelector('#data-sovereignty a[href="#face-tiers"]') && document.querySelector('#data-sovereignty .ai-side > .named-risks'), 'Data Sovereignty points to the stair, and keeps what the resolution names');
  eq([...document.querySelectorAll('#working-with-ai .ai-band > .disclosure-grid > details.disclosure')].map((d) => d.id).join(), 'purpose,building-tools,offloading,task-force-questions', 'the purpose and three disclosures beside the lede');
  // Before a Tribe adopts an AI tool: the page's one form, each question once, with its principle.
  eq(document.querySelectorAll('form.asks[data-sheet]').length, 1, 'one form of questions');
  const set = document.querySelector('#working-with-ai form.asks fieldset.ask-set#q-adopt');
  eq(set.querySelector('legend').textContent, 'Before a Tribe adopts an AI tool', 'its set');
  const boxes = [...set.querySelectorAll('li > label > input[type="checkbox"][name="ask"] + span.ask-q')];
  eq(boxes.length, 10, 'ten questions');
  eq([...set.querySelectorAll('input[name="ask"]')].map((b) => b.value).join(), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `q-adopt-${n}`).join(), 'named for the address');
  ok(document.querySelector('#working-with-ai > .wrap > .disclosure-grid > details#adoption-rules a[href="#policy-watch"]'), 'the rules sit after the form, outside the band, and point to Policy Watch');
  ok(document.querySelector('#economics .disclosure-grid > details#expert-roles .cr[data-claim="ad-021"]'), 'Work: the expert-roles disclosure, with its projection');
  ok(!/no Pacific Northwest grid factor/.test(html), 'the carbon sentence names the factors the record holds');
  ok([...set.querySelectorAll('li')].every((li) => li.querySelector('details.ask-why > summary') && li.querySelector('details.ask-why > p')), 'each with its principle and evidence');
  ok(boxes.every((q) => q.textContent.endsWith('?') && !/\bour\b/i.test(q.textContent)), 'questions, never in the voice of a Nation');
  // Youth: findings under their rating, and a row for what no study covers (ai-25).
  eq([...document.querySelectorAll('#youth-education .evidence-row .evidence-name strong')].map((n) => n.textContent).join(), 'Strong,Moderate,Early,Advocacy,Record,Not yet studied', 'ratings, then the gap');
  eq([...document.querySelectorAll('#youth-education .evidence-row.is-strong details')].map((d) => d.id).join(), 'yf-teens,yf-design', 'strong findings sit under Strong');
  eq(document.querySelector('#youth-education .evidence-row.is-none details').id, 'yf-native', 'the missing Native evidence is its own row');
  eq(document.querySelectorAll('#youth-education details.disclosure[id^="yf-"]').length, 14, 'all fourteen findings');
  // Without scripts a claim zone keeps all its words.
  for (const [id, words] of Object.entries(PROSE)) for (const part of words) ok(document.querySelector(`#${id} .plate-claim`).textContent.includes(part), `${id} without scripts: ${part}`);
  // The streaming stops say the same three things on every plate.
  for (const [plate, name] of [['ai-heavy-ai', 'heavy_intensity'], ['ai-per-day', 'day_intensity'], ['ai-scale', 'scale_intensity'], ['ai-same-hour', 'video_dc_intensity']]) eq([...document.querySelectorAll(`#${plate} [data-param="${name}"] span`)].map((n) => n.textContent).join(), STREAM_WORDS, `${plate}: one set of stop words`);
  // One rule for a computed figure, the same without scripts as with them.
  eq(document.querySelector('#ai-same-hour .ladder-row[data-row="video"] .ladder-value').textContent, '14 (7.2 to 203) Wh', 'video at the whole hour without scripts');
  ok(/(^|\s)\.climate-lockup \{[^}]*height: 40px/m.test(read('site/assets/css/site.css')), 'one size for the Climate lockup, 40px');
  ok(document.querySelector('#youth-education .ai-lede a[href*="2026-051"]') && document.querySelector('#data-sovereignty .ai-lede a[href*="2026-034"]') && document.querySelector('.brief-meta a[href*="2026-039"]'), 'each resolution is linked where it matters');
  // Place 2 of the direction's three, and only on the page ground.
  eq(document.querySelectorAll('#policy-watch .climate-voice > img.climate-lockup').length, 2, 'the Climate lockup, one per theme');
  ok(document.querySelector('#policy-watch .climate-voice a[href*="policy-sentinel"]'), 'beside the source it names');
  eq(document.querySelectorAll('.plate .climate-voice, .plate-detail .climate-voice').length, 0, 'never on a plate');
  eq(document.querySelectorAll('#policy-watch .climate-voice > p').length, 1, 'the Climate rule runs beside the source line only');
  ok(!document.querySelector('#policy-watch ol') && document.querySelector('#policy-watch a[href="sources/#policy-sentinel"]') && document.querySelector('#policy-watch a[href="../data/policy-sentinel/follow-ai.json"][download]'), 'the import steps are on the Sources page, the follow list a download here');
  ok(read('site/ai/sources/index.html').includes('id="policy-sentinel"'), 'where they stand');
  // A tier is a category: no sequential ramp on it, and the squares carry the state. The rating's key is on the page for print.
  ok(!/--stage-|--tier/.test(read('site/assets/css/ai.css')), 'no stage ramp on a tier');
  ok(holds(document.querySelector('.youth-evidence > .caption').textContent, ['Three bars, Strong', 'two, Moderate', 'one, Early', 'a flat line, Advocacy or Record']), 'the rating has its key');
  ok(document.querySelector('#youth-education .ai-band.youth-band > .youth-do') && !document.querySelector('#youth-education .ai-band.youth-do'), 'what the resolution asks shares the band, under the lede, beside the evidence');
  ok(!/\.evidence-meter[^{]*\{[^}]*border/.test(read('site/assets/css/ai.css')), 'a rating draws bars, never the hollow squares that mean modeled');
  for (const id of ['ai-occupations', 'ai-jobs-sector']) eq(document.querySelector(`#${id} .plate-legend`).textContent, 'Dashed outline: BLS projection, 2025 to 2035', `${id}: the dashes are named without scripts`);
  eq(document.querySelector('#ai-holdings .plate-legend').textContent, 'As the filing states itComputed here from a filing: its share count times a closing price', 'the holdings key says what a hollow bar is');
  for (const name of ['atni-climate-lockup-on-dark.svg', 'atni-climate-lockup.svg']) ok(read(`site/assets/img/${name}`).startsWith('<'), `${name} is on the site`);
  ok(/prefill/i.test(document.querySelector('#policy-watch [data-prefill-note] summary').textContent) && !document.querySelector('p.notice[data-prefill-note]'), 'the prefill notice folds');
  ok(!document.querySelector('#ai-occupations .plate-claim').textContent.includes('in development'), 'no status note in a claim zone');
  eq(document.querySelectorAll('#ai-same-hour .plate-facts .plate-seg').length, 4, 'without scripts the bar holds what the default boundary counts');
  for (const id of ['overview', 'purpose', 'working-with-ai', 'youth-education', 'data-sovereignty', 'economics', 'policy-watch', 'tier-grid']) ok(document.getElementById(id), `old id ${id}`);
  eq(document.querySelector('[data-policy-watch="ai"] [data-policy-searches]') !== null, true, 'policy hooks');
  ok(html.includes('<!-- policy:watch -->') && html.indexOf('<!-- policy:watch -->') < html.indexOf('data-policy-searches') && html.indexOf('data-policy-follow') < html.indexOf('<!-- /policy:watch -->'), 'the list sits between its markers');
  ok(!/library\.js/.test(html), 'no library feed script');
  ok(!document.querySelector('[data-pour] ') || ![...document.querySelectorAll('[data-pour]')].some((n) => n.textContent === 'x'), 'every figure is poured');
  // The held slot is byte for byte what was committed.
  const committed = execSync(`git show ${SLOT_COMMIT}:site/ai/index.html`, { cwd: ROOT, encoding: 'utf8' });
  const slot = (raw) => { const text = raw.replace(/\r\n/g, '\n'); return text.slice(text.indexOf('          <!-- SLOT:ai:economics-frontier -->'), text.indexOf('<!-- /SLOT -->', text.indexOf('SLOT:ai:economics-frontier')) + 14); };
  ok(slot(committed).length > 100, 'found the committed slot');
  eq(slot(html), slot(committed), 'the economics slot is untouched');
  ok(html.replace(/\r\n/g, '\n').includes(slot(committed)), 'and in place');
  const js = read('site/assets/js/ai.js');
  ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|fetch\(/.test(js), 'no markup strings or fetches in ai.js');
  ok(!/\u2014| -- /.test(js) && !/\u2014| -- /.test(read('site/assets/css/ai.css')), 'no em dashes');
}


module.exports = { groups: { tabs, agenda, deepLinks, model, sameHourPlate, rulersHold, countView, otherPlates, noScripts } };
