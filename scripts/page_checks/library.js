// The library page, with library.js running on the real data: every bar's printed count is what its filter returns, chips filter and keep focus,
// the field shows the filter, and a short feed on another page keeps its markup. jsdom does not run modules, so the script is loaded with its import resolved.
const { JSDOM, ok, eq, wait, read, open, fire, figures } = require('./lib');

const html = read('site/library/index.html');
const data = JSON.parse(read('site/data/library.json'));
const script = read('site/assets/js/library.js')
  .replace(/^import .*$/m, 'const setFigure = (name, value) => { for (const el of document.querySelectorAll(`[data-figure="${name}"]`)) el.textContent = value; };')
  .replace('import.meta.url', "'http://localhost/site/assets/js/library.js'");
const TOTAL = data.entries.length;

async function load(query = '', source = html) {
  const page = await open(source, `http://localhost/site/library/index.html${query}`, (window) => {
    window.fetch = async () => ({ ok: true, json: async () => data });
  });
  page.window.eval(`(function () {\n${script}\n})();`);
  await wait(5);
  eq(page.errors.length, 0, `no script errors: ${page.errors.join('; ')}`);
  const { document } = page;
  return { ...page, status: document.getElementById('library-status'), bars: [...document.querySelectorAll('.comp-row')], form: document.querySelector('.filters') };
}
const printed = (bar) => bar.querySelector('.comp-n').textContent.split(/\s/)[0].replace(/,/g, '');
const out = (document) => document.querySelectorAll('.comp-field > .is-out').length;

const groups = {
  async withoutScripts() {
    const { document } = new JSDOM(html).window;
    eq(document.querySelectorAll('.comp-field > i').length, TOTAL, 'the field is in the page itself');
    ok(document.querySelectorAll('.comp-row').length >= 20, 'and so are the bars');
    ok(document.querySelector('noscript'), 'the page says what needs scripts');
    ok(document.querySelector('a[href="../data/library.json"]'), 'and where the data is');
  },

  async aFailedLoadLeavesNoDeadFilters() {
    const { window, document } = await open(html, 'http://localhost/site/library/index.html', (w) => {
      w.fetch = async () => ({ ok: false, status: 503 });
    });
    window.eval(`(function () {\n${script}\n})();`);
    await wait(5);
    eq(document.querySelector('[data-library-error]').hidden, false, 'the page says the list could not load');
    eq(document.querySelector('.library-controls').hidden, true, 'and the filters step aside, with nothing to filter');
    eq(document.getElementById('library-app').hidden, true, 'and no empty list shows');
  },

  async everyBarIsItsCount() {
    const { window, document, status, bars, form } = await load();
    eq(figures(status.textContent)[1], String(TOTAL), 'all entries at the start');
    eq(out(document), 0, 'no square is out with no filter');
    for (const bar of bars) {
      const field = form.elements.namedItem(bar.dataset.filter);
      ok(fire(window, bar, 'click').defaultPrevented, 'a plain click stays on the page');
      eq(field.value, bar.dataset.value, `${bar.dataset.value} sets the ${bar.dataset.filter} filter, and the filter offers it`);
      eq(figures(status.textContent)[1], printed(bar), `${bar.dataset.value}: the bar's count is the filter's`);
      eq(bar.getAttribute('aria-current'), 'true', 'the bar says it is on');
      eq(document.querySelectorAll('.comp-row[aria-current]').length, 1, 'and only that one');
      eq(TOTAL - out(document), Number(printed(bar)), 'the field keeps that many squares');
      ok(window.location.search.includes(`${bar.dataset.filter}=${bar.dataset.value}`), 'the view can be linked');
      fire(window, bar, 'click');
      eq(field.value, '', 'pressing it again clears it');
      eq(bar.hasAttribute('aria-current'), false, 'and the bar says so');
      eq(out(document), 0, 'and the field fills');
    }
  },

  async startHereFiltersLikeTheOtherRows() {
    const { window, document, bars, form } = await load();
    const row = bars[0];
    eq(row.dataset.value, 'start-here', 'the first row');
    eq(row.closest('.comp-group').querySelector('h3').textContent, 'Area', 'under Area');
    const start = document.querySelector('.start-here');
    eq(start.classList.contains('is-filtered'), false, 'the printed list is there on the whole library');
    fire(window, row, 'click');
    const featured = data.entries.filter((e) => e.featured);
    const types = [...document.querySelectorAll('#library-results .entry-meta > .entry-type')].map((t) => t.textContent);
    eq(types.length, featured.length, 'the list is the entries marked featured');
    eq(types.lastIndexOf('Resolution'), featured.filter((e) => e.type === 'resolution').length - 1, 'with the resolutions first');
    eq(start.classList.contains('is-filtered'), true, 'and the printed list steps aside, so paper shows them once');
    fire(window, document.querySelector('.lead a[data-filter]'), 'click');
    eq(form.elements.namedItem('area').value, '', 'the lead names the row, and pressing it does what the row does');
    eq(row.hasAttribute('aria-current'), false, 'so the row goes off');
  },

  async moreOpensTheWholeSummary() {
    const { window, document } = await load('?area=start-here');
    const buttons = [...document.querySelectorAll('#library-results .entry-more')];
    ok(buttons.length, 'a long summary has its More');
    eq(document.querySelectorAll('#library-results .is-clamped').length, buttons.length, 'and only a summary with a More is clamped');
    for (const button of buttons) {
      eq(button.tagName, 'BUTTON', 'a real button, so Tab, Enter, and Space reach it');
      eq(button.hasAttribute('tabindex'), false, 'in the page order');
      eq(button.getAttribute('aria-expanded'), 'false', 'it says it is closed');
    }
    const summary = buttons[0].previousElementSibling;
    eq(data.entries.some((e) => e.summary === summary.textContent), true, 'the whole summary is in the page, and only CSS clamps it');
    fire(window, buttons[0], 'click');
    eq(summary.classList.contains('is-clamped'), false, 'More opens it');
    eq(buttons[0].getAttribute('aria-expanded'), 'true', 'and says so');
    eq(buttons[0].textContent, 'Less', 'and offers the way back');
    fire(window, buttons[0], 'click');
    eq(summary.classList.contains('is-clamped'), true, 'Less closes it');
  },

  async searchAndSelectPaintTheField() {
    const { window, document, status, form } = await load();
    const q = form.elements.namedItem('q');
    q.value = 'water';
    fire(window, q, 'input');
    await wait(280);
    const hits = data.entries.filter((e) => [e.title, e.publisher, e.summary].join(' ').toLowerCase().includes('water')).length;
    ok(hits > 0 && TOTAL - out(document) >= hits, 'the search lights the entries it finds');
    eq(figures(status.textContent)[1], String(TOTAL - out(document)), 'as many as the status counts');
    const area = form.elements.namedItem('area');
    q.value = '';
    area.value = 'summit';
    fire(window, area, 'input');
    await wait(5);
    eq(document.querySelector('.comp-row[data-value="summit"]').getAttribute('aria-current'), 'true', 'a select lights its bar');
  },

  async chipsFilterAndHandFocusOn() {
    const { window, document, status, form } = await load();
    const chip = document.querySelector('#library-results .tags a');
    ok(chip.dataset.filter, 'a chip names its filter');
    fire(window, chip, 'click');
    eq(form.elements.namedItem(chip.dataset.filter).value, chip.dataset.value, 'it sets its filter');
    eq(document.activeElement, status, 'the chip is redrawn away, so focus lands on the status');
    const tribal = [...document.querySelectorAll('#library-results .tag-tribal a')];
    tribal.forEach((a) => eq(a.dataset.filter, 'tribal', 'the Tribal chip filters Tribal focus'));
  },

  async aModifiedClickIsALink() {
    const { window, bars, form } = await load();
    const event = fire(window, bars[0], 'click', { ctrlKey: true });
    eq(event.defaultPrevented, false, 'a new tab opens as usual');
    eq(form.elements.namedItem(bars[0].dataset.filter).value, '', 'and this page does not change');
  },

  async aLinkedViewOpensFiltered() {
    const before = document_of(html).querySelector('.comp-row[data-value^="before-"]');
    const { document, status, bars } = await load(`?year=${before.dataset.value}`);
    eq(figures(status.textContent)[1], printed(before), 'the shared year bar has a filter behind it');
    eq(bars.filter((b) => b.hasAttribute('aria-current')).length, 1, 'and is lit on arrival');
    eq(document.querySelector('.comp-row[aria-current]').dataset.value, before.dataset.value, 'the right one');
  },

  async entryMarkup() {
    const feed = html.replace('<!-- library-composition -->', '<div id="feed" data-library-feed data-area="ai" data-limit="2"></div><!-- library-composition -->');
    const { document } = await load('', feed);
    const compact = document.querySelector('#feed .entry');
    eq(compact.firstElementChild.className, 'entry-type', 'a feed on another page keeps its left cell');
    eq(compact.querySelector('.tags'), null, 'and has no chips');
    const full = document.querySelector('#library-results .entry');
    eq(full.querySelector(':scope > .entry-type'), null, 'the library page has no left cell');
    ok(full.querySelector('.entry-meta > .entry-type').textContent, 'its type word runs before the publisher');
    ok(full.querySelector('.entry-summary'), 'the summary stays');
    eq(document.querySelector('[data-figure="library-grounding"]').textContent, String(data.entries.filter((e) => e.featured && e.type === 'resolution').length), 'the band figure stays poured');
    ok(document.querySelector('[data-library-featured] .entry-meta > .entry-type'), 'Start Here reads the same way');
    eq(document.querySelector('.start-here').hidden, false, 'and shows once it has entries');
  },
};
function document_of(source) { return new JSDOM(source).window.document; }

module.exports = { groups };
