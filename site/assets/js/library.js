// Reads data/library.json and fills the library page's list, [data-library-feed] feeds, [data-library-featured] lists, and [data-figure] counts.
// Each page keeps a plain link to the library, so nothing is lost when this script cannot run.

import { setFigure } from './util.js';

const ROOT = new URL('../../', import.meta.url);
const PAGE_SIZE = 40;
const FILTERS = ['q', 'area', 'type', 'tribal', 'year'];
const START = 'start-here'; // the Area filter's first choice: the featured entries
const AREAS = {
  'energy-feasibility': 'Energy feasibility',
  'data-centers': 'Data centers',
  ai: 'Artificial intelligence',
  summit: 'Summit',
  'cross-cutting': 'Cross-cutting',
};
const TYPES = {
  resolution: 'Resolution',
  report: 'Report',
  policy: 'Policy',
  legislation: 'Legislation',
  article: 'Article',
  academic: 'Academic research',
  dataset: 'Dataset',
  tool: 'Tool',
  website: 'Website',
  news: 'News',
};

const esc = (value) => String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const sortable = (date) => (date.length === 4 ? `${date}-00-00` : date);
const newestFirst = (a, b) => sortable(b.date).localeCompare(sortable(a.date)) || a.title.localeCompare(b.title);
const latestAdded = (a, b) => b.added.localeCompare(a.added) || Number(b.featured) - Number(a.featured) || newestFirst(a, b);
const resolutionsFirst = (a, b) => Number(b.type === 'resolution') - Number(a.type === 'resolution');
const showDate = (date) => (date.length === 4 ? date : `${date.slice(5, 7)}/${date.slice(8, 10)}/${date.slice(0, 4)}`);
const absolute = (url) => new URL(url, ROOT).href;
const fold = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function entryHTML(entry, compact = false) {
  const pdf = /\.pdf$/i.test(entry.url) ? '<span class="entry-format"> (PDF)</span>' : '';
  const type = esc(TYPES[entry.type] || entry.type);
  const chip = (name, value, label, kind = '') => `<li${kind}><a href="?${name}=${esc(value)}" data-filter="${name}" data-value="${esc(value)}">${esc(label)}</a></li>`;
  // On the library page a chip is a filter and the type word runs inline. A short feed on another page keeps its left cell.
  const tags = compact
    ? ''
    : `<ul class="tags" role="list">${entry.areas.map((a) => chip('area', a, AREAS[a] || a)).join('')}${
        entry.tribal_specific ? chip('tribal', 'yes', 'Tribal-specific', ' class="tag-tribal"') : ''
      }</ul>`;
  // A long summary shows four lines, and More opens the rest. Print shows it whole.
  // shortcut: 320 characters fill four lines at 1920, so a wider column can show a More that opens nothing; measure the text if that matters.
  const long = entry.summary.length > 320;
  return `<li class="entry">${compact ? `
<p class="entry-type">${type}</p>` : ''}
<h3 class="entry-title"><a href="${esc(absolute(entry.url))}">${esc(entry.title)}${pdf}</a></h3>
<p class="entry-meta">${compact ? '' : `<span class="entry-type">${type}</span>, `}${esc(entry.publisher)}, <time datetime="${esc(entry.date)}">${esc(showDate(entry.date))}</time></p>
<p class="entry-summary${long ? ' is-clamped' : ''}">${esc(entry.summary)}</p>${long ? '<button type="button" class="entry-more" aria-expanded="false">More</button>' : ''}${tags}
</li>`;
}
document.addEventListener('click', (event) => {
  const button = event.target.closest?.('.entry-more');
  if (!button) return;
  const clamped = button.previousElementSibling.classList.toggle('is-clamped');
  button.setAttribute('aria-expanded', String(!clamped));
  button.textContent = clamped ? 'More' : 'Less';
});

function renderFeatured(entries) {
  for (const box of document.querySelectorAll('[data-library-featured]')) {
    // On the home page, skip entries the page already links to (the resolutions list).
    const linked = new Set(box.hasAttribute('data-skip-linked') ? [...document.querySelectorAll('main a[href]')].map((a) => a.href) : []);
    const list = entries
      .filter((e) => e.featured && !linked.has(absolute(e.url)))
      .sort((a, b) => resolutionsFirst(a, b) || newestFirst(a, b));
    if (list.length) {
      box.insertAdjacentHTML(
        'afterbegin',
        `<ul class="entries entries-grid" role="list">${list.map((e) => entryHTML(e, box.hasAttribute('data-compact'))).join('')}</ul>`,
      );
      box.closest('section[hidden]')?.removeAttribute('hidden');
    }
  }
}

function renderFeeds(entries) {
  for (const feed of document.querySelectorAll('[data-library-feed]')) {
    const area = feed.dataset.area;
    const linked = new Set(feed.hasAttribute('data-skip-linked') ? [...document.querySelectorAll('main a[href]')].map((a) => a.href) : []);
    const list = entries
      .filter((e) => (!area || e.areas.includes(area)) && !linked.has(absolute(e.url)))
      .sort(area ? newestFirst : latestAdded)
      .slice(0, Number(feed.dataset.limit) || 6);
    if (list.length) {
      feed.insertAdjacentHTML('afterbegin', `<ul class="entries" role="list">${list.map((e) => entryHTML(e, true)).join('')}</ul>`);
    }
  }
}

function renderLibrary(entries) {
  const app = document.getElementById('library-app');
  if (!app) return;
  const form = document.querySelector('form.filters');
  const field = (name) => form.elements.namedItem(name);
  const results = document.getElementById('library-results');
  const status = document.getElementById('library-status');
  const more = document.getElementById('library-more');
  const sorted = [...entries].sort(newestFirst);
  const text = new Map(sorted.map((e) => [e, fold([e.title, e.publisher, e.summary, TYPES[e.type], ...e.areas.map((a) => AREAS[a])].join(' '))]));
  // The field lists entries as scripts/build_library_strip.py does, so a square's place names its entry.
  const squares = document.querySelectorAll('.comp-field > i');
  const inField = Object.keys(AREAS).flatMap((a) => entries.filter((e) => e.areas[0] === a));
  const bars = document.querySelectorAll('.comp-row');

  const count = (test) => entries.filter(test).length;
  const addOptions = (name, options) => {
    field(name).insertAdjacentHTML(
      'beforeend',
      options.filter(([, , n]) => n).map(([value, label, n]) => `<option value="${esc(value)}">${esc(label)} (${n})</option>`).join(''),
    );
  };
  addOptions('area', [[START, 'Start here', count((e) => e.featured)], ...Object.keys(AREAS).map((k) => [k, AREAS[k], count((e) => e.areas.includes(k))])]);
  addOptions('type', Object.keys(TYPES).map((k) => [k, TYPES[k], count((e) => e.type === k)]));
  const years = [...new Set(entries.map((e) => e.date.slice(0, 4)))].sort().reverse();
  // The newest four years stand alone on the strip and the rest share a bar, which the filter offers too.
  addOptions('year', years.flatMap((y, i) => [
    [y, y, count((e) => e.date.startsWith(y))],
    ...(i === 3 ? [[`before-${y}`, `Before ${y}`, count((e) => e.date < y)]] : []),
  ]));

  const params = new URLSearchParams(window.location.search);
  for (const name of FILTERS) if (params.has(name)) field(name).value = params.get(name);

  let limit = PAGE_SIZE;
  const render = () => {
    const words = fold(field('q').value).split(/\s+/).filter(Boolean);
    const [area, type, tribal, year] = ['area', 'type', 'tribal', 'year'].map((n) => field(n).value);
    const hits = sorted.filter(
      (e) =>
        (!area || (area === START ? e.featured : e.areas.includes(area))) &&
        (!type || e.type === type) &&
        (!tribal || e.tribal_specific === (tribal === 'yes')) &&
        (!year || (year.startsWith('before-') ? e.date < year.slice(7) : e.date.startsWith(year))) &&
        words.every((w) => text.get(e).includes(w)),
    );
    if (area === START) hits.sort(resolutionsFirst); // a stable sort: newest first within each
    const shown = Math.min(limit, hits.length);
    const filtered = Boolean(words.length || area || type || tribal || year);
    document.querySelector('.start-here')?.classList.toggle('is-filtered', filtered);
    results.innerHTML = hits.slice(0, shown).map((e) => entryHTML(e)).join('');
    const kept = new Set(hits);
    inField.forEach((e, i) => squares[i]?.classList.toggle('is-out', filtered && !kept.has(e)));
    for (const bar of bars) {
      if (field(bar.dataset.filter).value === bar.dataset.value) bar.setAttribute('aria-current', 'true');
      else bar.removeAttribute('aria-current');
    }
    status.textContent = hits.length
      ? `Showing ${shown} of ${hits.length} ${filtered ? 'matching ' : ''}${hits.length === 1 ? 'entry' : 'entries'}${filtered ? ` (${entries.length} in the library)` : ''}.`
      : 'No entries match. Clear the filters or change the search.';
    more.hidden = shown >= hits.length;
    more.textContent = `Show ${Math.min(PAGE_SIZE, hits.length - shown)} more`;
    const query = new URLSearchParams(FILTERS.filter((n) => field(n).value.trim()).map((n) => [n, field(n).value.trim()])).toString();
    window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
  };

  let typing;
  form.addEventListener('input', (event) => {
    limit = PAGE_SIZE;
    window.clearTimeout(typing);
    if (event.target === field('q')) typing = window.setTimeout(render, 250);
    else render();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    window.clearTimeout(typing);
    render();
  });
  form.querySelector('[data-clear]').addEventListener('click', () => {
    for (const name of FILTERS) field(name).value = '';
    limit = PAGE_SIZE;
    render();
    field('q').focus();
  });
  more.addEventListener('click', () => {
    const first = limit;
    limit += PAGE_SIZE;
    render();
    results.children[first]?.querySelector('a')?.focus();
  });
  // A bar or a chip sets one filter, and pressing it again clears it. A modified click still opens a new tab.
  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('[data-filter]');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const control = field(link.dataset.filter);
    const redrawn = results.contains(link);
    control.value = control.value === link.dataset.value ? '' : link.dataset.value;
    limit = PAGE_SIZE;
    render();
    if (redrawn) status.focus(); // the chip that had focus is gone
  });

  render();
  app.hidden = false;
}

fetch(new URL('data/library.json', ROOT))
  .then((response) => {
    if (!response.ok) throw new Error(`library.json: HTTP ${response.status}`);
    return response.json();
  })
  .then(({ entries, updated }) => {
    setFigure('library', entries.length.toLocaleString('en-US'));
    setFigure('library-tribal', entries.filter((e) => e.tribal_specific).length);
    setFigure('library-grounding', entries.filter((e) => e.featured && e.type === 'resolution').length);
    setFigure('library-date', showDate(updated));
    renderFeatured(entries);
    renderFeeds(entries);
    renderLibrary(entries);
  })
  .catch((error) => {
    for (const note of document.querySelectorAll('[data-library-error]')) note.hidden = false;
    for (const row of document.querySelectorAll('.library-controls')) row.hidden = true; // nothing to filter
    console.warn(error);
  });
