// Kinds of Data Centers (site/data-centers/primer/, R3 lane dc-primer, 11/17/2026). A brief and three outcomes, then the stepper: seven stops at left and
// the stage at right (the step list, the flat still that the WebGL scene replaces once it starts, and Back, the live line, Next and Full screen), then a
// self-check of four questions. jsdom has no WebGL, so getContext returns null and the still must stay; the stepper still runs by button and arrow key.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM, ROOT, ok, eq, read, open, fire, key } = require('./lib');

const REL = 'site/data-centers/primer/index.html';
const html = read(REL);
const PAGE = 'http://localhost/site/data-centers/primer/index.html';
const STOPS = ['laptop', 'closet', 'room', 'inside', 'colocation', 'hyperscale', 'cloud'];
const NAMES = ['Laptop', 'Server closet', 'Server room', 'Inside every one', 'Colocation', 'Hyperscale campus', 'The cloud'];
const ROWS = ['Who uses it', 'Power, typical', 'Who controls the machines and the data'];
const ONWARD = ['../#where', '../#questions', '../../explorer/#where', '../../ai/#face-tiers', '../resource-use/'];
const CLAIMS = {};
for (const name of fs.readdirSync(path.join(ROOT, 'site/data/claims'))) for (const c of JSON.parse(read(`site/data/claims/${name}`)).claims || []) CLAIMS[c.id] = c;

const load = (hash = '') => open(html, `${PAGE}${hash}`, (window) => {
  window.HTMLCanvasElement.prototype.getContext = () => null; // no WebGL here: the still stays
  window.Element.prototype.scrollIntoView = function () { window.scrolled = this.id; };
});
const current = (document) => [...document.querySelectorAll('.primer-steps a')].findIndex((a) => a.getAttribute('aria-current') === 'step');
const where = (document) => document.querySelector('.primer-where').textContent;

const groups = {
  async withoutScripts() {
    const { document } = new JSDOM(html).window;
    const all = [...document.querySelectorAll('[id]')].map((n) => n.id);
    eq(new Set(all).size, all.length, 'no id is used twice');
    ok(document.querySelector('.site-nav a[href="../../data-centers/"][aria-current="true"]'), 'Data Centers is the current section');
    eq(document.querySelector('.brief-name a').getAttribute('href'), '../', 'the name line links to the Data Centers page');
    ok(!/\d/.test(document.querySelector('.brief-lead').textContent), 'the lead holds no digits');
    ok(/ATNI takes no position for or against data centers\.$/.test(document.querySelector('.brief-lead').textContent), 'the lead ends on ATNI\'s position');
    ok(!/\d/.test(document.querySelector('h1').textContent), 'the h1 holds no digits');
    ok(document.querySelector('a[data-sources][href="sources/"]'), 'the meta line links the Sources page');
    const outcomes = document.querySelectorAll('#outcomes li');
    ok(outcomes.length > 0 && outcomes.length <= 3, 'at most three outcomes');
    eq([...document.querySelectorAll('.primer-stop')].map((s) => s.id).join(','), STOPS.join(','), 'seven stops, inside every one after the server room');
    eq([...document.querySelectorAll('.primer-steps a')].map((a) => a.getAttribute('href')).join(','), STOPS.map((s) => `#${s}`).join(','), 'the step list follows the stops');
    eq([...document.querySelectorAll('.primer-steps a')].map((a) => a.textContent).join(','), NAMES.join(','), 'and names them (C4)');
    for (const id of STOPS) {
      const stop = document.getElementById(id);
      const h2 = stop.querySelector('h2');
      ok(h2 && !/\d/.test(h2.textContent), `${id}: a heading with no digits`);
      eq(stop.getAttribute('aria-labelledby'), h2.id, `${id}: named by its heading`);
      ok(stop.querySelector('.primer-gist'), `${id}: a gist`);
      eq([...stop.querySelectorAll('dl.primer-facts dt')].map((dt) => dt.textContent).join('|'), ROWS.join('|'), `${id}: the three rows`);
      ok(/^A council might ask: .+\?$/.test(stop.querySelector('.primer-ask').textContent), `${id}: one question, offered, not in a Nation's voice`);
    }
    for (const id of ['colocation', 'cloud']) ok(/^No source|^None of its own/.test(document.querySelector(`#${id} .primer-facts > div:nth-child(2) dd`).textContent), `${id}: the power row says why it has no figure`);
    const checks = document.querySelectorAll('#check details');
    ok(checks.length >= 3 && checks.length <= 4, 'three or four self-check questions');
    for (const box of checks) {
      const back = box.querySelector('a[href^="#"]:last-child');
      const n = Number(back.textContent.match(/^Back to stop (\d)$/)[1]);
      eq(back.getAttribute('href'), `#${STOPS[n - 1]}`, `"${back.textContent}" lands on stop ${n}`);
    }
    eq([...document.querySelectorAll('.primer-next a')].map((a) => a.getAttribute('href')).join(','), ONWARD.join(','), 'the onward links (C12), exactly');
    const still = document.querySelector('figure.primer-still');
    ok(still && !still.hidden && !still.closest('[hidden], [aria-hidden="true"]'), 'the still is in the page and seen');
    const svg = still.querySelector('svg[role="img"]');
    ok(svg && svg.querySelector('title').textContent.startsWith('Seven drawings, each keeping the one before it small.'), 'the still is an image with its words (C15)');
    ok(svg.outerHTML.length <= 12000 && !/<(image|use|foreignObject)\b|href=/.test(svg.outerHTML), 'the still is at most 12,000 bytes and loads nothing');
    ok(!/fill="(?!none)/.test(svg.outerHTML), 'the still fills nothing, so it holds in forced colors');
    ok(!document.getElementById('primer').classList.contains('is-live'), 'no scene without scripts');
    ok(document.querySelector('.primer-live[aria-hidden="true"] canvas'), 'the canvas and labels sit in an aria-hidden wrapper');
    ok(document.querySelector('.primer-controls').hasAttribute('data-js'), 'the controls are not drawn without scripts (site.css hides [data-js])');
    eq(document.querySelector('.primer-stage').getAttribute('aria-label'), 'Stepper', 'the stage is named (C4)');
    ok(document.querySelector('#primer-route[type="checkbox"]'), 'the short route works without scripts (CSS :has)');
    const marks = [...document.querySelectorAll('a.cr')];
    ok(marks.length > 30, 'the figures are claim marks');
    for (const a of marks) {
      eq(a.getAttribute('href'), `sources/#src-${a.dataset.claim}`, `${a.dataset.claim} links its receipt on the Sources page`);
      ok(CLAIMS[a.dataset.claim], `${a.dataset.claim} ships`);
    }
    const prose = [...document.querySelectorAll('.primer-stop p, .primer-stop dd, #check p')].map((n) => n.cloneNode(true));
    for (const n of prose) n.querySelectorAll('a.cr').forEach((a) => a.remove());
    ok(prose.every((n) => !/\d/.test(n.textContent.replace(/\b(19|20)\d{2}\b|Back to stop \d/g, ''))), 'every figure in the stops sits in a mark (years and stop numbers aside)');
    ok(!/[—]/.test(document.querySelector('main').textContent), 'no em dashes');
  },

  async theScenesLabelsHoldNoDigits() {
    const sandbox = { window: {}, document: { getElementById: () => null } };
    vm.runInNewContext(read('site/assets/js/primer.js'), sandbox);
    const { STOPS: scene } = sandbox.window.primerScene;
    eq(scene.length, STOPS.length, 'one camera a stop');
    for (const [k, [, ink, labels]] of scene.entries()) {
      ok(ink.includes('o'), `stop ${k + 1} lights its own object`);
      ok(labels.every(([words]) => !/\d/.test(words) && words.split(' ').length <= 4), `stop ${k + 1}: labels of four words at most, no digits (C14)`);
      if (k) ok(labels.some((l) => (l[4] || '').includes('b')), `stop ${k + 1} names the object before it`);
    }
  },

  async withScripts() {
    const { window, document, errors } = await load();
    eq(errors.length, 0, `no script errors: ${errors.join('; ')}`);
    ok(!document.getElementById('primer').classList.contains('is-live'), 'no WebGL, so the still stays');
    ok(document.querySelector('figure.primer-still svg'), 'and is still there');
    const back = document.querySelector('[data-step="-1"]');
    const next = document.querySelector('[data-step="1"]');
    eq(current(document), 0, 'stop 1 is current');
    eq(where(document), 'Stop 1 of 7: Laptop', 'the live line says so');
    eq(document.querySelector('.primer-where').getAttribute('aria-live'), 'polite', 'politely');
    ok(back.disabled, 'Back is disabled at stop 1');
    ok(document.querySelector('[data-full]').hidden, 'Full screen stays hidden where the call does not exist');
    fire(window, next, 'click');
    eq(current(document), 1, 'Next moves to stop 2');
    eq(where(document), 'Stop 2 of 7: Server closet', 'and says so');
    eq(window.scrolled, 'closet', 'and brings the stop into view');
    ok(!back.disabled, 'Back is enabled');
    ok(document.getElementById('closet').classList.contains('is-current'), 'the stop is marked');
    eq(window.location.hash, '#closet', 'the address names the stop');
    next.focus();
    key(window, next, 'ArrowRight');
    eq(current(document), 2, 'ArrowRight is Next');
    eq(document.activeElement, next, 'focus stays on the button');
    key(window, next, 'ArrowLeft');
    eq(current(document), 1, 'ArrowLeft is Back');
    fire(window, next, 'keydown', { key: 'ArrowRight', altKey: true });
    eq(current(document), 1, 'a modifier key leaves the stepper alone');
    key(window, document.getElementById('primer-route'), 'ArrowRight');
    eq(current(document), 1, 'so does focus in a form control');
    key(window, document.querySelector('#check summary'), 'ArrowRight');
    eq(current(document), 1, 'and focus in the self-check, outside the stepper');
    fire(window, back, 'click');
    eq(current(document), 0, 'Back returns to stop 1');
    for (let i = 1; i < STOPS.length; i++) fire(window, next, 'click');
    eq(where(document), 'Stop 7 of 7: The cloud', 'Next reaches the last stop');
    eq(next.textContent, 'Self-check', 'where Next reads Self-check');
    fire(window, next, 'click');
    eq(window.scrolled, 'check', 'and goes to the self-check');
    eq(current(document), 6, 'leaving the last stop current');
    window.dispatchEvent(new window.Event('beforeprint'));
    ok([...document.querySelectorAll('details')].every((d) => d.open), 'printing opens every disclosure');
  },

  async aHashStartsAtItsStop() {
    const { document, errors } = await load('#cloud');
    eq(errors.length, 0, `no script errors: ${errors.join('; ')}`);
    eq(current(document), 6, 'the hash #cloud starts at stop 7');
    eq(where(document), 'Stop 7 of 7: The cloud', 'and says so');
    const other = await load('#nowhere');
    eq(current(other.document), 0, 'a hash that names no stop starts at stop 1');
  },
};

module.exports = { groups };
