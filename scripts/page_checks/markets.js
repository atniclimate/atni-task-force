// AI and the Markets (site/ai/markets/, R3 lane ai-markets, 11/17/2026). A brief, then an agenda of four questions: the seven's weight in two benchmarks
// (mk-weight), one-day moves on two days (mk-moves, a ladder with a day setting), the circular arrangements (mk-deals, a matrix), and a list face of questions.
// Below it, four sections with no tab strip: the 2026 tracker (mk-seven), NVIDIA's 8-K, a hand-drawn loop whose figures are all marks in its caption, and the
// About lines. No page stylesheet, no page script, nothing fetched, and no plate offered to the Briefing.
const fs = require('fs');
const path = require('path');
const { JSDOM, ROOT, ok, eq, wait, read, plateFile, receiptsOn, open, fire, key } = require('./lib');

const html = read('site/ai/markets/index.html');
const PAGE = 'http://localhost/site/ai/markets/index.html';
const receipt = receiptsOn('site/ai/markets/sources/index.html');
const CLAIMS = {};
for (const name of fs.readdirSync(path.join(ROOT, 'site/data/claims'))) for (const c of JSON.parse(read(`site/data/claims/${name}`)).claims || []) CLAIMS[c.id] = c;
// The plates in page order, with the rows each definition holds (the matrix's are its rows, not its cells).
const PLATES = { 'mk-weight': 11, 'mk-moves': 4, 'mk-deals': 8, 'mk-seven': 7 };
const FACES = { 'face-weight': 'mk-weight', 'face-moves': 'mk-moves', 'face-deals': 'mk-deals', 'face-ask': null };
const SECTIONS = ['seven', 'nvidia', 'circular', 'about-page'];

const load = (hash = '') => open(html, `${PAGE}${hash}`, (window) => {
  window.fetched = [];
  window.fetch = (url) => { window.fetched.push(String(url)); return Promise.reject(new Error('no fetch on this page')); };
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.ResizeObserver = class { observe() {} };
  window.Element.prototype.scrollIntoView = function () { window.scrolled = this.id; };
});
const row = (root, k) => root.querySelector(`[data-row="${k}"]`);

async function ids() {
  const { window: { document } } = new JSDOM(html);
  const all = [...document.querySelectorAll('[id]')].map((n) => n.id);
  eq(new Set(all).size, all.length, 'no id is used twice');
  eq([...document.querySelectorAll('.agenda-q > a')].map((a) => a.getAttribute('href')).join(','), '#face-weight,#face-moves,#face-deals,#face-ask', 'four questions, in order');
  for (const face of Object.keys(FACES)) ok(document.querySelector(`.agenda-faces > #${face}`), `${face} is a face`);
  eq([...document.querySelectorAll('main > section.wrap:not(.agenda)')].map((s) => s.id).join(','), SECTIONS.join(','), 'the four sections below the agenda, in order');
  ok(!document.querySelector('nav.section-strip'), 'no tab strip');
  eq(document.querySelectorAll('.site-nav [aria-current]').length, 1, 'one current section in the main nav');
  ok(document.querySelector('.site-nav a[href="../../ai/"][aria-current="true"]'), 'AI is the current section');
  for (const id of Object.keys(PLATES)) eq(document.getElementById(`${id}-title`).closest('[data-plate]').id, id, `${id}-title names its plate`);
}

async function content() {
  const { window: { document } } = new JSDOM(html);
  const brief = document.querySelector('main > header.brief');
  ok(brief.querySelector('.brief-name a[href="../"]').textContent === 'AI', 'the name line leads back to AI');
  ok(!/\d/.test(brief.querySelector('.brief-lead').textContent), 'the lead states no figure');
  ok(brief.querySelector('.brief-lead').textContent.split(/(?<=[.?]) /).length <= 2, 'a lead of two sentences at most');
  ok(/11\/17\/2026/.test(brief.querySelector('.brief-meta .figure-num').textContent) && brief.querySelector('.brief-meta a[data-sources][href="sources/"]'), 'one date, then the Sources page');
  ok(document.querySelector('meta[name="description"]').content.length <= 160 && !/\d/.test(document.querySelector('meta[name="description"]').content), 'a description of 160 characters at most, with no figures');
  // Head: the kit only. No page stylesheet, no page script; cite.js comes with the marks.
  eq([...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href').split('/').pop()).join(','), 'tokens.css,site.css', 'tokens then site, and no page stylesheet');
  eq([...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src').split('/').pop()).join(','), 'theme.js,plate-svg.js,plate.js,cite.js', 'the kit scripts in order, then cite.js');
  ok(['plate-svg.js', 'plate.js', 'cite.js'].every((n) => document.querySelector(`script[src$="${n}"]`).defer), 'deferred after theme.js');
  eq([...document.querySelectorAll('script:not([src])')].filter((s) => !/^application\/json$|^speculationrules$/.test(s.type)).length, 0, 'no inline page script');
  ok(!/\bfetch\s*\(/.test(html), 'the page names no fetch');
  eq(document.querySelectorAll('[data-add-briefing]').length, 0, 'no plate is offered to the Briefing');
  // The answers: two follow their plates, two are fixed sentences.
  for (const id of ['mk-weight', 'mk-moves']) ok(document.querySelector(`.agenda-a[data-answer="${id}"]`).textContent.length > 40, `${id}'s answer is built`);
  ok(/questions, not advice\.$/.test(document.querySelector('a[href="#face-ask"] + .agenda-a').textContent), 'the list face says its questions are not advice');
  ok(!/\d/.test(document.querySelector('a[href="#face-deals"] + .agenda-a').textContent), 'the circular answer is fixed and has no figure');
  eq(document.querySelectorAll('#face-ask > ol > li').length, 5, 'five questions on the list face');
  ok(/question for counsel/.test(document.querySelector('#face-ask > ol > li:last-child').textContent), 'the last is a question for counsel');
  // The loop: a drawing with no words a reader needs, every figure a mark in its caption, and no circle (DIRECTION-R2 2.6).
  const loop = document.querySelector('figure.mk-loop');
  const svg = loop.querySelector('svg[aria-hidden="true"][focusable="false"]');
  ok(svg && svg.getAttribute('viewBox') === '0 0 960 220' && svg.getAttribute('width') === '100%', 'the loop is a hidden drawing, 960 by 220');
  eq(svg.querySelectorAll('rect').length, 4, 'four boxes');
  eq([...svg.querySelectorAll('text')].map((t) => t.textContent).slice(0, 4).join(','), '1,2,3,4', 'numbered 1 to 4');
  ok(!svg.querySelector('circle, ellipse') && !/[aA]\s/.test([...svg.querySelectorAll('path')].map((p) => p.getAttribute('d')).join(' ')), 'no circle or arc: right angles only');
  ok([...svg.querySelectorAll('text')].every((t) => /^[A-Za-z0-9 ]+$/.test(t.textContent) && !/\d{2,}/.test(t.textContent)), 'the drawing holds ASCII words and step numbers, no amounts');
  ok(!/FF914C|#ff914c|orange/i.test(svg.outerHTML), 'no orange in the drawing');
  ok(loop.querySelectorAll('figcaption a.cr').length >= 8, `its caption carries the figures as marks (${loop.querySelectorAll('figcaption a.cr').length})`);
  eq(loop.querySelectorAll('figcaption ol > li').length, 4, 'four steps in the caption');
  // Three lists under the loop, each closed and with a summary sentence.
  const lists = [...document.querySelectorAll('#circular .disclosure-grid.rail-details > details.disclosure')];
  eq(lists.map((d) => d.querySelector('summary h3').id).join(','), 'fragile,held-so-far,retellings', 'fragile, held so far, retellings');
  ok(lists.every((d) => d.querySelector('summary > span').textContent.endsWith('.')), 'each summary is a sentence');
  // The 8-K: dates, moves, and the filing's own silence on a reason.
  const ceo = document.getElementById('nvidia').textContent;
  ok(/The filing states no reason\./.test(ceo) && document.querySelector('#nvidia a[href="#face-moves"]'), 'the filing states no reason, and the moves link to their face');
  ok(!/announced|affair|investigation|because|after the resignation/i.test(ceo), 'no reason, and no move tied to the resignation');
  // About: not advice, no position, the disclosure, and the Sources link.
  const about = document.getElementById('about-page').textContent;
  ok(/not investment advice|is investment advice/.test(about) && /ATNI takes no position for or against data centers\./.test(about), 'not advice, and no position');
  ok(/Anthropic is among the companies in these arrangements/.test(about), 'the disclosure sentence is on the page');
  ok(document.querySelector('#about-page a[href="sources/"]').textContent === 'Every source for this page', 'the Sources link');
  ok(!/\bdraft\b|\bunpublished\b|\bheld (?:off|back)\b|\bon hold\b/i.test(document.querySelector('main').textContent.replace(/conference draft/gi, '')), 'no draft, held, or unpublished marker: the page is live (owner ruling, 11/17/2026)');
  // Every mark names a shipped claim and lands on the Sources page.
  const marks = [...document.querySelectorAll('a.cr')];
  ok(marks.length >= 50, `the text carries its marks (${marks.length})`);
  for (const a of marks) ok(CLAIMS[a.dataset.claim] && a.getAttribute('href') === `sources/#src-${a.dataset.claim}` && a.dataset.status, `${a.dataset.claim}: shipped, poured, and linked`);
  ok(document.querySelector('script#cr-data'), 'the prose tip has its data');
}

async function plates() {
  const { window: { document } } = new JSDOM(html);
  eq([...document.querySelectorAll('[data-plate]')].map((n) => n.id).join(','), Object.keys(PLATES).join(','), 'the plates in page order');
  for (const [id, n] of Object.entries(PLATES)) {
    const def = plateFile(id);
    const root = document.getElementById(id);
    eq(def.rows.length, n, `${id}: ${n} rows`);
    const drawn = def.plot.type === 'matrix' ? root.querySelectorAll('.plate-plot tbody > tr').length : root.querySelectorAll('.plate-plot .ladder-row').length;
    eq(drawn, n, `${id}: ${n} rows on the plot`);
    const data = JSON.parse(document.getElementById(`plate-data-${id}`).textContent);
    for (const claim of [...new Set(def.rows.flatMap((r) => [r.claim, ...Object.values(r.claims || {}), ...Object.values(r.cells || {}).flatMap((c) => (Array.isArray(c) ? c.map((f) => f.claim) : []))]).filter(Boolean)), ...(def.cites || [])]) {
      ok(data.receipts[claim] && data.receipts[claim].status === CLAIMS[claim].status, `${id}: ${claim} has its receipt and status`);
      ok(receipt(`${id}-source-${claim}`), `${id}: ${claim} is on the Sources page`);
    }
    ok(root.querySelector('.reading').textContent.length > 20 && root.querySelector('table tbody tr'), `${id}: a Reading and a Table without scripts`);
  }
  // The figures as their claims hold them.
  ok(/38\.33 percent/.test(document.getElementById('mk-weight-title').textContent) && /33\.9 percent/.test(document.getElementById('mk-weight-title').textContent), 'mk-weight\'s title: the fund and the benchmark');
  ok(/-9\.3 percent/.test(document.getElementById('mk-moves-title').textContent) && /-6\.4 percent/.test(document.getElementById('mk-moves-title').textContent), 'mk-moves\' title: 11/05/2026');
  ok(/-16\.3 percent \(NVIDIA\) to \+29\.8 percent \(Apple\)/.test(document.getElementById('mk-seven-title').textContent), 'mk-seven\'s title: the range');
  eq(document.querySelector('#mk-moves .plate-subtitle, #mk-moves .caption').textContent.includes('The record does not say what caused any move.'), true, 'the moves say no cause');
  // The tracker prints derived changes, never closing prices: each row's claim holds its arithmetic.
  for (const r of plateFile('mk-seven').rows) ok(/ \/ .* = /.test(CLAIMS[r.claim].derived || ''), `${r.claim}: the change carries its arithmetic`);
  eq([...document.querySelectorAll('#mk-seven .plate-plot .ladder-row')].map((n) => n.dataset.row).join(','), 'apple,amazon,microsoft,meta,alphabet,tesla,nvidia', 'biggest first');
  ok(!/\d{3}\.\d{2} (USD|dollars)/.test(document.getElementById('mk-seven').textContent), 'no share price on the tracker');
  ok(document.querySelector('#mk-seven a[href="../#companies"]'), 'the tracker links the Companies tab');
  // The three indexes sit within three points of each other, so one stands beside the seven at a time and their names never collide.
  eq(document.querySelectorAll('#mk-seven .ladder-tick').length, 3, 'three index ticks');
  eq([...document.querySelectorAll('#mk-seven .ladder-tick:not([hidden])')].map((t) => t.dataset.mark).join(), 'spx', 'the S&P 500 alone at the start');
}

async function behavior() {
  const d = await load();
  eq(d.errors.join(), '', 'no script errors');
  const tabs = [...d.document.querySelectorAll('.agenda-q > a')];
  ok(tabs.every((t) => t.getAttribute('role') === 'tab'), 'the questions are tabs');
  for (const [i, face] of Object.keys(FACES).entries()) {
    fire(d.window, tabs[i], 'click');
    eq(d.document.getElementById(face).hidden, false, `${face} shows when its question is chosen`);
  }
  key(d.window, tabs[3], 'Home');
  eq(d.document.activeElement, tabs[0], 'Home goes back to the first question');
  await wait(50);
  for (const id of Object.keys(PLATES)) {
    const root = d.document.getElementById(id);
    const plot = root.querySelector('.plate-plot');
    ok(root.classList.contains('is-live'), `${id} is live`);
    ok(/^(listbox|grid)$/.test(plot.getAttribute('role')) && plot.getAttribute('tabindex') === '0', `${id}: the plot is one keyboard stop`);
  }
  // The day setting moves the ladder and the agenda's answer with it.
  const moves = d.document.getElementById('mk-moves');
  const nov12 = moves.querySelector('input[name="move_day"][value="nov12"]');
  nov12.checked = true;
  fire(d.window, nov12, 'input');
  await wait(50);
  ok(moves.querySelector('.readout-value').textContent.includes(String(CLAIMS['mk-028'].value)), `11/12/2026: NVIDIA reads ${CLAIMS['mk-028'].value}`);
  ok(d.document.querySelector('.agenda-a[data-answer="mk-moves"]').textContent.includes('11/12/2026'), 'the answer follows the day');
  eq(d.window.fetched.join(), '', 'nothing fetched');
}

async function landing() {
  const a = await load('#face-moves&move_day=nov12');
  await wait(50);
  const moves = a.document.getElementById('mk-moves');
  ok(!a.document.getElementById('face-moves').hidden, 'the link opens the moves face');
  ok(moves.querySelector('input[name="move_day"][value="nov12"]').checked, '#face-moves&move_day=nov12 selects that stop');
  ok(moves.querySelector('.readout-value').textContent.includes(String(CLAIMS['mk-028'].value)), 'and the plate reads it');
  const b = await load('#fragile');
  ok(b.document.querySelector('#fragile').closest('details').open, 'a link to a list opens it');
  eq(a.errors.join() + b.errors.join(), '', 'no script errors');
}

async function noScripts() {
  const { window: { document } } = new JSDOM(html);
  for (const face of Object.keys(FACES)) ok(document.getElementById(face).textContent.trim().length > 100, `${face} reads without scripts`);
  eq([...document.querySelectorAll('[hidden]:not([data-theme-toggle])')].filter((n) => !n.closest('[data-plate]')).length, 0, 'nothing outside the plates waits on a script');
  eq(document.querySelectorAll('details').length, document.querySelectorAll('details summary').length, 'every disclosure has a summary');
}

module.exports = { groups: { ids, content, plates, behavior, landing, noScripts } };
