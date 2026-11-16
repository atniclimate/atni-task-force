// The home page (site/index.html; its faces filled by scripts/build_home.py, its answers by build_plates.py): a brief, then an agenda of four questions whose
// faces are copies of the plates that answer them, built on their own pages, and the Data Center page's question sets. Without scripts every face stands
// whole; with them the questions are a vertical tablist, each answer follows its plate, the hour meter's axis holds across its stops, and nothing is fetched.
const { JSDOM, ok, eq, wait, read, open, fire, key } = require('./lib');

const HOME = 'http://localhost/site/index.html';
const html = read('site/index.html');
const text = (node) => node.textContent.replace(/\s+/g, ' ').trim();
const FACES = { 'face-hour': 'ai-hour', 'face-project': 'dc-project', 'face-deadlines': 'energy-deadlines' };
const QUESTIONS = ['Is everyday AI use the problem?', 'What would one data center draw here?', 'What can a Tribe apply for, and by when?', 'What should leaders ask a developer?'];

// What a plate page needs from a browser, as plate.js's checks give it, and a record of anything the page asks the network for.
const asBrowser = (window) => {
  window.innerWidth = 1440;
  window.innerHeight = 900;
  window.fetched = [];
  window.fetch = (url) => { window.fetched.push(String(url)); return Promise.reject(new Error('home fetches nothing')); };
  const send = window.XMLHttpRequest.prototype.open;
  window.XMLHttpRequest.prototype.open = function (method, url, ...rest) { window.fetched.push(String(url)); return send.call(this, method, url, ...rest); };
  window.ResizeObserver = class { observe() {} };
  const visible = (el) => !el.closest('[hidden]');
  Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', { get() { return visible(this) ? window.document.body : null; } });
  Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { get() { return visible(this) ? 900 : 0; } });
  Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { get() { return visible(this) ? 400 : 0; } });
  window.Element.prototype.scrollIntoView = function () { window.scrolled = this.id; };
};
const load = async (hash = '') => {
  const page = await open(html, `${HOME}${hash}`, asBrowser);
  await wait();
  return page;
};
const pick = (window, input, value) => {
  if (value !== undefined) input.value = value;
  else input.checked = true;
  fire(window, input, 'input');
};

// Without scripts: the questions are jump links, every face stands whole, and each copy is its own page's, reaching that page's Sources page.
async function homeStatic() {
  const { document } = new JSDOM(html).window;
  const qs = [...document.querySelectorAll('.agenda-q > a')];
  eq(qs.map(text).join('|'), QUESTIONS.join('|'), 'the four questions, in the direction\'s words');
  ok(qs.every((a) => document.getElementById(a.hash.slice(1))?.parentElement.matches('.agenda-faces') && !a.hasAttribute('role')), 'each a jump link to its face');
  ok(document.querySelector('.brief').compareDocumentPosition(document.querySelector('.agenda')) & 4, 'the brief, then the agenda');
  for (const [face, id] of Object.entries(FACES)) {
    const copy = document.querySelector(`#${face} > .home-copy`);
    const where = copy.dataset.copyOf.split('#')[0];
    eq(copy.dataset.copyOf, `${where}#${id}`, `${id}: marked as its page's copy`);
    ok(copy.querySelector(`figure.plate#${id}`) && copy.querySelector(`script#plate-data-${id}`), `${id}: the figure and its data, as its page built them`);
    ok(read(`site/${where}index.html`).includes(`id="plate-data-${id}"`), `${id}: and that page builds it`);
    const sources = copy.querySelector('.plate-sources-link a').getAttribute('href');
    eq(sources, `${where}sources/#${id}`, `${id}: its collar reaches its own page's Sources page`);
    const shell = read(`site/${where}sources/index.html`);
    ok(shell.includes(`id="${id}"`), `${id}: where its section stands`);
    const receipts = Object.keys(JSON.parse(copy.querySelector(`script#plate-data-${id}`).textContent).receipts || {});
    ok(receipts.length && receipts.every((c) => shell.includes(`id="${id}-source-${c}"`)), `${id}: each of its ${receipts.length} claims has its receipt there`);
    for (const a of copy.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href');
      if (/^(https?:|mailto:)/.test(href)) continue;
      const [path, hash] = href.split('#');
      if (!path) { ok(document.getElementById(hash.split('&')[0]), `${id}: ${href} stays in the copy`); continue; }
      ok(!path.startsWith('../') && !path.startsWith('/'), `${id}: ${href} is written from the root`);
    }
  }
  const asks = document.getElementById('face-asks');
  eq(asks.querySelectorAll('input, button').length, 0, 'the question sets have no checkbox and no sheet button here');
  const sets = asks.querySelectorAll('.ask-firsts > li');
  ok(sets.length >= 1 && [...sets].every((li) => li.querySelector('b') && /\?$/.test(text(li))), 'each set named and led by its first question');
  const add = [...asks.querySelectorAll('.home-asks-go a')].find((a) => /briefing/.test(a.getAttribute('href')));
  eq(add.getAttribute('href').split('#add=')[1].split('.').length, sets.length, 'one link adds every set to a briefing');
  for (const id of Object.values(FACES)) ok(document.querySelector(`.agenda-q > [data-answer="${id}"]`)?.textContent.trim(), `${id}: the build wrote its answer`);
  ok(!document.querySelector('script[type="module"]') && ![...document.querySelectorAll('script[src]')].some((s) => /(library|energy-funding|policy-watch|explorer-band)\.js$/.test(s.getAttribute('src'))), 'no feed script and no module');
  eq([...document.querySelectorAll('a.paper, .paper')].length, 1, 'one paper button, in the brief');
  const track = document.querySelector('#work fieldset.track');
  eq(track.querySelectorAll('.track-step').length, 4, 'How the Work Moves is a four-step track');
}

// With scripts: the agenda is a tablist over its faces; an answer follows its plate; the meter's axis holds; nothing is fetched.
async function homeLive() {
  const { window, document, errors } = await load();
  eq(errors.join(' | '), '', 'no script errors');
  const tabs = [...document.querySelectorAll('.agenda [role="tab"]')];
  const faces = tabs.map((t) => document.getElementById(t.getAttribute('aria-controls')));
  eq(tabs.length, 4, 'four questions, four tabs');
  eq(document.querySelector('.agenda-qs').getAttribute('aria-orientation'), 'vertical', 'a vertical tablist');
  ok(!faces[0].hidden && faces.slice(1).every((f) => f.hidden), 'the first face shows, the others wait');
  ok(document.getElementById('ai-hour').classList.contains('is-live') || document.getElementById('ai-hour').dataset.variant === 'face', 'the hour meter starts as a face');

  // The hour meter: a stop moves the needle and the answer while the axis holds still.
  const hour = document.getElementById('ai-hour');
  const plot = hour.querySelector('.plate-plot');
  const axis = () => [...plot.querySelectorAll('.ladder-axis span')].map((n) => `${n.textContent}@${n.style.getPropertyValue('--x')}`).join();
  const answer = document.querySelector('[data-answer="ai-hour"]');
  const ticks = axis();
  const at = +plot.style.getPropertyValue('--at');
  const first = answer.textContent;
  ok(ticks.length > 0, `the meter has an axis: ${ticks}`);
  pick(window, hour.querySelector('input[name="counted"][value="dc"]'));
  eq(axis(), ticks, 'the axis holds across stops');
  ok(+plot.style.getPropertyValue('--at') < at, 'the needle moves down to what the stop counts');
  ok(answer.textContent !== first && /^Data center only/.test(answer.textContent), `the answer follows the plate: ${answer.textContent}`);
  fire(window, hour.querySelector('[data-reset]'), 'click');
  eq(answer.textContent, first, 'back at the starting point, so is the answer');

  // A face changes by arrow key and is named in the address, replacing the entry.
  const before = window.history.length;
  key(window, tabs[0], 'ArrowDown');
  ok(tabs[1].getAttribute('aria-selected') === 'true' && !faces[1].hidden && faces[0].hidden, 'Down chooses the next question and shows its face');
  ok(/agenda=project/.test(window.location.hash) && window.history.length === before, 'the face is named in the address, replacing the entry');
  const project = document.getElementById('dc-project');
  const size = project.querySelector('[data-param="p_mw"] input[type="range"]');
  const projectAnswer = document.querySelector('[data-answer="dc-project"]');
  pick(window, size, '250');
  ok(projectAnswer.textContent.startsWith('A 250 MW project'), `the project answer follows its plate: ${projectAnswer.textContent}`);
  key(window, tabs[1], 'End');
  ok(!faces[3].hidden && faces[3].tabIndex !== 0, 'End shows the question sets');
  ok(projectAnswer.textContent.startsWith('A 250 MW project'), 'and a closed face keeps its state and its answer');

  // The address opens a face by name; without a name, the first.
  const named = await load('#agenda=asks');
  ok(!named.document.getElementById('face-asks').hidden && named.document.getElementById('face-hour').hidden, 'agenda=asks opens the question sets');
  eq(named.errors.join(' | '), '', 'no script errors there either');
  await wait(50);
  eq(window.fetched.concat(named.window.fetched).join(), '', 'nothing is fetched: home loads no data file');
}

module.exports = { groups: { homeStatic, homeLive } };
