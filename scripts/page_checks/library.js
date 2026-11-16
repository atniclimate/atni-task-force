// The Library page, with library.js running on the real data: the first view needs no data file, shelves and filters move the list, every bar's printed
// count is what its filter returns, the preview follows the chosen row, and a short feed on another page keeps its markup. jsdom does not run modules, so
// the script is loaded with its import resolved.
const { JSDOM, ok, eq, wait, read, open, fire, figures, settings } = require('./lib');

const html = read('site/library/index.html');
const data = JSON.parse(read('site/data/library.json'));
const util = read('site/assets/js/util.js').replace(/^export (async function|function|const) /gm, '$1 ').replace('import.meta.url', "'http://localhost/site/assets/js/util.js'");
const script = read('site/assets/js/library.js').replace(/^import .*$/m, () => util); // a function, so a $ in util.js is never read as a replacement pattern
const TOTAL = data.entries.length;
const FILINGS = /\bSEC\b/;

async function load(where = '', source = html, respond = () => ({ ok: true, json: async () => data })) {
  const asked = [];
  const page = await open(source, `http://localhost/site/library/index.html${where}`, (window) => {
    window.fetch = async (url) => { asked.push(String(url)); return respond(String(url)); };
    window.Element.prototype.scrollIntoView = function () {}; // jsdom has none; theme.js scrolls to a disclosure a deep link opens
  });
  page.window.eval(`(function () {\n${script}\n})();`);
  await wait(5);
  eq(page.errors.length, 0, `no script errors: ${page.errors.join('; ')}`);
  const { document } = page;
  const form = document.querySelector('.filters');
  return {
    ...page, asked, form, field: (name) => form.elements.namedItem(name),
    status: document.getElementById('library-status'), heading: document.getElementById('shelf-title'),
    bars: [...document.querySelectorAll('.comp-row')], rows: () => [...document.querySelectorAll('#library-results .entry')],
    preview: () => document.querySelector('#entry-preview-body [data-preview]'),
  };
}
const libraryAsked = (asked) => asked.filter((url) => url.includes('library.json')).length;
const shown = (status) => Number((figures(status.textContent)[1] || figures(status.textContent)[0] || '0').replace(/,/g, ''));
const printed = (bar) => bar.parentElement.querySelector('.comp-n').textContent.split(/\s/)[0].replace(/,/g, '');
const out = (document) => document.querySelectorAll('.comp-field > .is-out').length;
const press = async (window, node, init) => { const event = fire(window, node, 'click', init); await wait(5); return event; };

const groups = {
  async withoutScripts() {
    const { document } = new JSDOM(html).window;
    eq(document.querySelectorAll('.comp-field > i').length, TOTAL, 'the field is in the page itself');
    ok(document.querySelectorAll('.comp-row').length >= 19, 'and so are the bars');
    eq(document.querySelectorAll('#library-results .entry, .shelf-static .entry').length, 40, '40 entries without scripts (-11)');
    ok(document.querySelector('#entry-preview-body [data-preview] .preview-summary').textContent, 'and the first one in the preview');
    ok(document.querySelector('noscript'), 'the page says what needs scripts');
    ok(document.querySelector('a[href="../data/library.json"]'), 'and where the data is');
    ok(document.querySelector('form.filters').hasAttribute('data-js'), 'filters that cannot run are not drawn (site.css hides [data-js])');
  },

  async theFirstViewNeedsNoData() { // -01, -12: nothing waits for the 729 KB file, so nothing moves when it comes
    const { asked, rows, preview, status } = await load();
    eq(libraryAsked(asked), 0, 'library.json is not read for the first view');
    eq(rows().length, data.entries.filter((e) => e.featured).length, 'Start here is in the page');
    eq(preview().dataset.preview, rows()[0].dataset.entry, 'with its first entry beside it');
    ok(/five resolutions/.test(status.textContent), 'and its line');
  },

  async theRowsPreviewWithoutData() {
    const { window, document, asked, rows, preview, field } = await load();
    const row = rows()[3];
    await press(window, row.querySelector('.entry-meta'));
    eq(preview().dataset.preview, row.dataset.entry, 'pressing a row, not its link, shows it beside the list');
    eq(row.getAttribute('aria-current'), 'true', 'and marks it');
    eq(document.querySelectorAll('#library-results .entry[aria-current]').length, 1, 'only it');
    eq(preview().querySelector('.preview-title').textContent, row.querySelector('.entry-title a').firstChild.textContent, 'the title is the row\'s');
    eq(preview().querySelector('.preview-summary').textContent, row.querySelector('.entry-summary').textContent, 'and the whole summary');
    eq(field('entry').value, row.dataset.entry, 'the choice can be linked');
    const entry = data.entries.find((e) => e.id === row.dataset.entry);
    eq(preview().querySelector('.paper').getAttribute('href'), new URL(entry.url, 'http://localhost/site/').href, 'the document is one press away');
    fire(window, rows()[5].querySelector('.entry-title a'), 'focusin');
    eq(preview().dataset.preview, rows()[5].dataset.entry, 'reaching a title by keyboard shows it too');
    eq(libraryAsked(asked), 0, 'all without the data file');
    const held = JSON.parse(document.getElementById('library-cites').textContent);
    const cited = rows().find((r) => held.cites[r.dataset.i]);
    if (cited) {
      await press(window, cited.querySelector('.entry-meta'));
      const links = [...preview().querySelectorAll('.preview-cites a')];
      ok(links.some((a) => /\/sources\/#src-/.test(a.href)), 'a cited entry names its claims, each on its page\'s Sources page');
    }
  },

  async aFailedLoadLeavesNoDeadFilters() {
    const { window, document, rows } = await load('', html, () => ({ ok: false, status: 503 }));
    fire(window, document.querySelector('[data-shelf="all"]'), 'pointerdown');
    await press(window, document.querySelector('[data-shelf="all"]'));
    await wait(5);
    eq(document.querySelector('[data-library-error]').hidden, false, 'the page says the rest could not load');
    eq(document.querySelector('form.filters').hidden, true, 'and the filters step aside, with nothing to filter');
    ok(document.querySelector('.shelf-static').hasAttribute('data-shown'), 'the build\'s Tribal-specific rows come back');
    ok(rows().length > 0, 'and the first view stays');
  },

  async everyBarIsItsCount() {
    const { window, document, status, bars, field } = await load();
    for (const bar of bars) {
      ok((await press(window, bar)).defaultPrevented, 'a plain click stays on the page');
      eq(field(bar.dataset.filter).value, bar.dataset.value, `${bar.dataset.value} sets the ${bar.dataset.filter} filter, and the filter offers it`);
      eq(String(shown(status)), printed(bar), `${bar.dataset.value}: the bar's count is the filter's`);
      eq(bar.getAttribute('aria-current'), 'true', 'the bar says it is on');
      eq(document.querySelectorAll('.comp-row[aria-current]').length, 1, 'and only that one');
      eq(TOTAL - out(document), Number(printed(bar)), 'the field keeps that many squares');
      eq(document.activeElement, status, 'the page returns to the list it filtered, its status line in focus (critic 9)');
      eq(bar.querySelector('.comp-hit').textContent, `${Number(printed(bar)).toLocaleString('en-US')} of`, 'its whole share is kept');
      ok(settings(window).includes(`${bar.dataset.filter}=${bar.dataset.value}`), 'the view can be linked');
      await press(window, bar);
      eq(field(bar.dataset.filter).value, '', 'pressing it again clears it');
      eq(bar.hasAttribute('aria-current'), false, 'and the bar says so');
      eq(out(document), 0, 'and the field fills');
    }
  },

  async shelvesSwitchTheList() {
    const { window, document, status, heading, rows, form } = await load();
    const shelf = (name) => document.querySelector(`[data-shelf="${name}"]`);
    const since = new Date(Date.parse(data.updated) - 90 * 864e5).toISOString().slice(0, 10);
    const recent = data.entries.filter((e) => e.added >= since);
    const cases = [
      ['tribal', 'Tribal-Specific, Newest First', data.entries.filter((e) => e.tribal_specific).length],
      ['new', 'Newly Added', recent.length],
      ['filings', 'Company Filings', data.entries.filter((e) => FILINGS.test(e.publisher)).length],
      ['all', 'Browse All', TOTAL],
    ];
    eq(form.hasAttribute('data-full'), false, 'Start here offers the search alone (critic 4)');
    for (const [name, title, count] of cases) {
      await press(window, shelf(name));
      eq(form.hasAttribute('data-full'), true, `${name}: a list shelf offers every filter`);
      if (name === 'new') {
        const added = rows().map((r) => data.entries.find((e) => e.id === r.dataset.entry).added);
        ok(added.every((day) => day >= since), 'Newly added holds only recent additions');
        ok(added.every((day, i) => !i || added[i - 1] >= day), 'the newest addition first');
        ok(status.textContent.includes(`added since ${since.slice(5, 7)}/${since.slice(8)}/${since.slice(0, 4)}`), 'and its line says since when');
        const log = document.querySelector('[data-log]');
        eq(log.hidden, false, 'it links the log of every change');
        await press(window, log.querySelector('a'));
        ok(document.getElementById('whats-new').open, 'which opens in place');
        eq(document.activeElement, document.querySelector('#whats-new summary'), 'and takes focus');
        eq(heading.textContent, title, 'while the shelf stays');
      }
      eq(heading.textContent, title, `${name}: the list says which shelf`);
      eq(shown(status), count, `${name}: and how many it holds`);
      eq(shelf(name).getAttribute('aria-current'), 'true', `${name}: the shelf says it is open`);
      eq(document.querySelectorAll('[data-shelf][aria-current]').length, 1, 'and only it');
      eq(rows().length, Math.min(40, count), 'forty rows at a time');
    }
    const newest = data.entries.filter((e) => FILINGS.test(e.publisher)).length;
    ok(newest > 0, 'the library holds company filings');
    await press(window, shelf('start'));
    eq(rows().length, data.entries.filter((e) => e.featured).length, 'Start here again');
    eq(form.hasAttribute('data-full'), false, 'and the search alone again');
    eq(document.querySelector('[data-log]').hidden, true, 'the log link goes with Newly added');
    eq(rows()[0].querySelector('.entry-type').textContent, 'Resolution', 'resolutions first');
    ok(!rows().some((r) => FILINGS.test(r.querySelector('.entry-meta').textContent)), 'and no company filing (-25)');
  },

  async moreAppendsOnly() { // -07: the shown rows stay as they are
    const { window, document, rows } = await load('#shelf=all');
    await wait(5);
    const before = rows();
    const more = document.getElementById('library-more');
    eq(more.hidden, false, 'more to show');
    await press(window, more);
    eq(rows().length, 80, 'forty more');
    ok(before.every((row, i) => rows()[i] === row), 'the first forty were not drawn again');
    eq(document.activeElement, rows()[40].querySelector('a'), 'focus goes to the first new row');
  },

  async searchMarksAndChoicesFollow() {
    const { window, document, status, field } = await load();
    const q = field('q');
    q.value = 'water';
    fire(window, q, 'input');
    await wait(280);
    const hits = data.entries.filter((e) => [e.title, e.publisher, e.summary].join(' ').toLowerCase().includes('water')).length;
    ok(hits > 0 && shown(status) >= hits, 'the search finds what holds the word');
    eq(shown(status), TOTAL - out(document), 'and the field lights as many');
    ok(document.querySelector('#library-results mark'), 'the word is marked in a title');
    q.value = '';
    const area = field('area');
    area.value = 'summit';
    fire(window, area, 'input');
    await wait(5);
    const empty = [...field('year').options].filter((o) => o.value && !data.entries.some((e) => e.areas.includes('summit') && (o.value.startsWith('before-') ? e.date < o.value.slice(7) : e.date.startsWith(o.value))));
    ok(empty.every((o) => o.disabled), 'a year the area leaves empty cannot be chosen (-03)');
    ok([...field('year').options].some((o) => o.value && !o.disabled), 'and the rest can');
    eq(document.querySelector('.comp-row[data-value="summit"]').getAttribute('aria-current'), 'true', 'a select lights its bar');
  },

  async aBurstLinkOpensExactlyItsRecords() { // -08
    const { status } = await load('#added=2026-11-05&publisher=SEC%20EDGAR');
    await wait(5);
    eq(shown(status), data.entries.filter((e) => e.added === '2026-11-05' && e.publisher === 'SEC EDGAR').length, 'the records added that day from that publisher');
    ok(/from SEC EDGAR, added 11\/05\/2026/.test(status.textContent), 'and the line says which');
  },

  async anUnknownValueSaysSo() { // -10
    const { document, status } = await load('?area=bogus');
    const notice = document.querySelector('[data-library-notice]');
    eq(notice.hidden, false, 'a value this library does not use is named');
    ok(notice.textContent.includes('bogus'), 'with the value');
    ok(/five resolutions/.test(status.textContent), 'and the list is not narrowed by it');
    const old = await load('?area=start-here');
    eq(old.document.querySelector('[data-library-notice]').hidden, true, 'the old Start here link opens that shelf, quietly');
  },

  async chipsFilterAndHandFocusOn() {
    const { window, document, status, field } = await load();
    const chip = document.querySelector('#entry-preview-body .tags a');
    ok(chip.dataset.filter, 'a chip names its filter');
    await press(window, chip);
    await wait(5);
    eq(field(chip.dataset.filter).value, chip.dataset.value, 'it sets its filter');
    eq(document.activeElement, status, 'the chip is redrawn away, so focus lands on the status');
  },

  async aModifiedClickIsALink() {
    const { window, bars, field } = await load();
    const event = fire(window, bars[0], 'click', { ctrlKey: true });
    eq(event.defaultPrevented, false, 'a new tab opens as usual');
    eq(field(bars[0].dataset.filter).value, '', 'and this page does not change');
  },

  async aLinkedViewOpensFiltered() {
    const before = new JSDOM(html).window.document.querySelector('.comp-row[data-value^="before-"]');
    const { document, status, bars } = await load(`?year=${before.dataset.value}`);
    await wait(5);
    eq(String(shown(status)), printed(before), 'the shared year bar has a filter behind it');
    eq(bars.filter((b) => b.hasAttribute('aria-current')).length, 1, 'and is lit on arrival');
    eq(document.querySelector('.comp-row[aria-current]').dataset.value, before.dataset.value, 'the right one');
  },

  async backPutsTheFiltersWhereTheAddressSays() { // CW 4: util.js linkFilters hears Back, Forward, or a typed address, and not a followed link
    const year = new JSDOM(html).window.document.querySelector('.comp-row[data-filter="year"]');
    const { window, status, field } = await load();
    window.history.replaceState(null, '', `#year=${year.dataset.value}`); // the entry Back returns to
    fire(window, window, 'hashchange');
    await wait(5);
    eq(field('year').value, year.dataset.value, 'Back sets the filter the address names');
    eq(String(shown(status)), printed(year), 'and the list follows it');
    window.history.replaceState(null, '', window.location.pathname);
    fire(window, window, 'hashchange');
    await wait(5);
    eq(field('year').value, '', 'an address without it clears it');
  },

  async aDeepLinkWithFiltersOpensWhatsNew() { // the anchor is the fragment's first part; the filters after it are settings (a11y A2)
    const plain = await load('#whats-new');
    ok(plain.document.getElementById('whats-new').open, '#whats-new opens What changed');
    const filtered = await load('#whats-new&q=solar');
    await wait(5);
    ok(filtered.document.getElementById('whats-new').open, 'and so does #whats-new with a filter after it');
    eq(filtered.field('q').value, 'solar', 'whose filter still applies');
  },

  async feedMarkupOnOtherPages() {
    const feed = html.replace('<!-- library-composition -->', '<div id="feed" data-library-feed data-limit="6"></div><!-- library-composition -->');
    const { document } = await load('', feed);
    await wait(20);
    const compact = document.querySelector('#feed .entry');
    eq(compact.firstElementChild.className, 'entry-type', 'a feed on another page keeps its left cell');
    eq(compact.querySelector('.tags'), null, 'and has no chips');
    ok(![...document.querySelectorAll('#feed .entry-meta')].some((m) => FILINGS.test(m.textContent)), 'the newest additions leave company filings to their shelf (home-shell-17)');
    ok(![...document.querySelectorAll('#feed .entry-summary')].some((s) => /\d{4}-\d\d-\d\d/.test(s.textContent)), 'summaries in house dates (home-shell-11d)');
  },
};

module.exports = { groups };
