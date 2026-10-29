// Library rendering for the ATNI Energy Task Forces site.
// Reads data/library.json and fills (1) the filterable list on the library page,
// (2) short feeds marked [data-library-feed] on other pages, (3) the "Start here" lists of
// featured entries marked [data-library-featured], and (4) [data-figure] counts. Each page
// keeps a plain link to the library, so nothing is lost when this script cannot run.

import { setFigure } from './util.js';

const ROOT = new URL('../../', import.meta.url);
const PAGE_SIZE = 40;
const FILTERS = ['q', 'area', 'type', 'tribal', 'year'];
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
const showDate = (date) => (date.length === 4 ? date : `${date.slice(5, 7)}/${date.slice(8, 10)}/${date.slice(0, 4)}`);
const absolute = (url) => new URL(url, ROOT).href;
const fold = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function entryHTML(entry, compact = false) {
  const pdf = /\.pdf$/i.test(entry.url) ? '<span class="entry-format"> (PDF)</span>' : '';
  const tags = compact
    ? ''
    : `<ul class="tags" role="list">${entry.areas.map((a) => `<li>${esc(AREAS[a] || a)}</li>`).join('')}${
        entry.tribal_specific ? '<li class="tag-tribal">Tribal-specific</li>' : ''
      }</ul>`;
  return `<li class="entry">
<p class="entry-type">${esc(TYPES[entry.type] || entry.type)}</p>
<h3 class="entry-title"><a href="${esc(absolute(entry.url))}">${esc(entry.title)}${pdf}</a></h3>
<p class="entry-meta">${esc(entry.publisher)}, <time datetime="${esc(entry.date)}">${esc(showDate(entry.date))}</time></p>
<p class="entry-summary">${esc(entry.summary)}</p>${tags}
</li>`;
}

// Featured entries: resolutions first, then the rest, each group newest first.
function renderFeatured(entries) {
  for (const box of document.querySelectorAll('[data-library-featured]')) {
    // On the home page, skip entries the page already links to (the resolutions list).
    const linked = new Set(box.hasAttribute('data-skip-linked') ? [...document.querySelectorAll('main a[href]')].map((a) => a.href) : []);
    const list = entries
      .filter((e) => e.featured && !linked.has(absolute(e.url)))
      .sort((a, b) => Number(b.type === 'resolution') - Number(a.type === 'resolution') || newestFirst(a, b));
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
    // On the home page, skip entries the page already links to (the resolutions list).
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
  const form = app.querySelector('form');
  const field = (name) => form.elements.namedItem(name);
  const results = document.getElementById('library-results');
  const status = document.getElementById('library-status');
  const more = document.getElementById('library-more');
  const sorted = [...entries].sort(newestFirst);
  const text = new Map(sorted.map((e) => [e, fold([e.title, e.publisher, e.summary, TYPES[e.type], ...e.areas.map((a) => AREAS[a])].join(' '))]));

  const count = (test) => entries.filter(test).length;
  const addOptions = (name, options) => {
    field(name).insertAdjacentHTML(
      'beforeend',
      options.filter(([, , n]) => n).map(([value, label, n]) => `<option value="${esc(value)}">${esc(label)} (${n})</option>`).join(''),
    );
  };
  addOptions('area', Object.keys(AREAS).map((k) => [k, AREAS[k], count((e) => e.areas.includes(k))]));
  addOptions('type', Object.keys(TYPES).map((k) => [k, TYPES[k], count((e) => e.type === k)]));
  const years = [...new Set(entries.map((e) => e.date.slice(0, 4)))].sort().reverse();
  addOptions('year', years.map((y) => [y, y, count((e) => e.date.startsWith(y))]));

  const params = new URLSearchParams(window.location.search);
  for (const name of FILTERS) if (params.has(name)) field(name).value = params.get(name);

  let limit = PAGE_SIZE;
  const render = () => {
    const words = fold(field('q').value).split(/\s+/).filter(Boolean);
    const [area, type, tribal, year] = ['area', 'type', 'tribal', 'year'].map((n) => field(n).value);
    const hits = sorted.filter(
      (e) =>
        (!area || e.areas.includes(area)) &&
        (!type || e.type === type) &&
        (!tribal || e.tribal_specific === (tribal === 'yes')) &&
        (!year || e.date.startsWith(year)) &&
        words.every((w) => text.get(e).includes(w)),
    );
    const shown = Math.min(limit, hits.length);
    const filtered = Boolean(words.length || area || type || tribal || year);
    results.innerHTML = hits.slice(0, shown).map((e) => entryHTML(e)).join('');
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
    setFigure('library-date', showDate(updated));
    renderFeatured(entries);
    renderFeeds(entries);
    renderLibrary(entries);
  })
  .catch((error) => {
    for (const note of document.querySelectorAll('[data-library-error]')) note.hidden = false;
    console.warn(error);
  });
