// Shared by the page checks: jsdom running a page's real scripts from disk, counted assertions, and figure matching.
// No browser and no network. Exact figures, claim ids, and receipts fail on any change; a sentence around them may be rewritten.
const { JSDOM, requestInterceptor, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '../..');
let checks = 0;
const count = (n = 1) => { checks += n; return checks; };
const ok = (value, message) => { count(); assert.ok(value, message); };
const eq = (a, b, message) => { count(); assert.strictEqual(a, b, message); };
const wait = (ms = 0) => new Promise((resolve) => { setTimeout(resolve, ms); });
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const plateFile = (id) => JSON.parse(read(`site/data/plates/${id}.json`));

// A local input that is not in the public repository. Missing is a real failure, and the message names the fix.
function fixture(rel, fix) {
  if (!fs.existsSync(path.join(ROOT, rel))) throw new Error(`${rel} is missing. ${fix}`);
  return read(rel);
}

const fromDisk = requestInterceptor((request) => {
  const { pathname } = new URL(request.url);
  if (!pathname.endsWith('.js')) return new Response('', { status: 200, headers: { 'content-type': 'text/css' } });
  return new Response(fs.readFileSync(path.join(ROOT, pathname)), { status: 200, headers: { 'content-type': 'text/javascript' } });
});

async function open(source, url, beforeParse) {
  const errors = [];
  const sink = new VirtualConsole();
  sink.on('jsdomError', (e) => errors.push(String(e.detail || e.message || e)));
  sink.on('error', (...e) => errors.push(e.join(' ')));
  const dom = new JSDOM(source, { url, runScripts: 'dangerously', resources: { interceptors: [fromDisk] }, pretendToBeVisual: true, virtualConsole: sink, beforeParse });
  await new Promise((resolve) => { dom.window.addEventListener('load', resolve); });
  return { window: dom.window, document: dom.window.document, errors };
}

const fire = (window, node, type, init = {}, extra = {}) => {
  const Kind = type === 'keydown' ? window.KeyboardEvent : type === 'input' || type === 'change' || type === 'hashchange' ? window.Event : window.MouseEvent;
  const e = new Kind(type, { bubbles: true, cancelable: true, ...init });
  Object.entries(extra).forEach(([k, v]) => Object.defineProperty(e, k, { value: v }));
  node.dispatchEvent(e);
  return e;
};
const key = (window, node, name) => fire(window, node, 'keydown', { key: name });

// Figures in a sentence. A token such as "2,475.1", "11 percent", or "Amazon" must appear whole, so 3 never matches inside 30, 2.3, or 3/2026.
const NUMBER = /(?<![A-Za-z\d.,/-])[+-]?\$?\d+(?:,\d{3})*(?:\.\d+)?(?:\/\d+)*/g;
const figures = (text) => String(text).match(NUMBER) || [];
const firstFigure = (text) => (figures(text)[0] || '').replace(/^[+-]/, '');
const clean = (text) => String(text).replace(/\s+/g, ' ');
const tokenAt = (token, text, from) => {
  const body = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?<![\\d.,/])${body}(?!\\d|[.,/]\\d)`).exec(text.slice(from));
  return match ? from + match.index + match[0].length : -1;
};
// The tokens appear in this order.
function holds(text, tokens) {
  const body = clean(text);
  let at = 0;
  for (const token of tokens) {
    at = tokenAt(token, body, at);
    if (at < 0) return false;
  }
  return true;
}
// As holds, and the first figure in the text is the first figure asked for: the sentence still opens on this number.
function leads(text, tokens) {
  const number = tokens.find((t) => /\d/.test(t));
  return holds(text, tokens) && (!number || firstFigure(number) === firstFigure(text));
}
// Words in place of a figure: there is text and it states no number.
const wordsOnly = (text) => clean(text).trim().length > 0 && !/\d/.test(text);

// The matchers guard every converted assertion, so a wrong one must stop the run.
assert.ok(holds('about 3 Wh and 30', ['3 Wh', '30']) && !holds('2.3 and 30 and 3/2026 and 1,300', ['3']) && !holds('30 then 3', ['3', '30']));
assert.ok(leads('2030, input 2,475.1 MW', ['2030', '2,475.1 MW']) && !leads('In 2029 and 2030', ['2030']) && leads('Amazon: -42 billion', ['Amazon', '-42 billion']));
assert.ok(wordsOnly('No public guidance') && !wordsOnly('3 Wh') && !wordsOnly(' ') && figures('2,475.1 (1,512.8 to 4,988.7), 2030, CO2').length === 4);

module.exports = { JSDOM, ROOT, count, ok, eq, wait, read, plateFile, fixture, open, fire, key, figures, holds, leads, wordsOnly };
