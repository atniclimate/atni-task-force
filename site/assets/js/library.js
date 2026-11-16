// The Library's reading room: shelves, a list, and the selected entry's preview. scripts/build_library_strip.py builds the first view into the page, so it
// reads without scripts and without data/library.json; this script moves between shelves, filters Browse all, and fills the preview, and reads
// library.json only when a reader first asks for more than the first view (library-summit-about-12). On other pages it fills [data-library-feed] and
// [data-library-featured] lists and [data-figure] counts. Each page keeps a plain link to the library, so nothing is lost when this script cannot run.

import { ROOT, esc, day, usDates, fold, linkFilters, setFigure, address } from './util.js';

const PAGE_SIZE = 40;
const NARROW = ['q', 'area', 'type', 'tribal', 'year', 'added', 'publisher', 'filings']; // any of these set opens Browse all
const FILTERS = [...NARROW, 'shelf', 'entry'];
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
const GROUPS = { grounding: 'Grounding resolutions', 'energy-feasibility': 'Tribal Energy', 'data-centers': 'Data Centers', ai: 'AI', 'cross-cutting': 'Across the task forces' };
const SHELVES = { start: 'Start here', tribal: 'Tribal-specific, newest first', filings: 'Company filings', all: 'Browse all' };
const FILINGS = /\bSEC\b/; // a company filing: its publisher is the SEC's EDGAR system (scripts/build_library_strip.py FILINGS)

const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0); // code-point order, as the build sorts, so a shelf drawn here and there agree
const sortable = (date) => (date.length === 4 ? `${date}-00-00` : date);
const newestFirst = (a, b) => cmp(sortable(b.date), sortable(a.date)) || cmp(a.title, b.title);
const latestAdded = (a, b) => cmp(b.added, a.added) || Number(b.featured) - Number(a.featured) || newestFirst(a, b);
const resolutionsFirst = (a, b) => Number(b.type === 'resolution') - Number(a.type === 'resolution');
const local = (url) => (/^https:\/\//i.test(url) ? url : new URL(url, ROOT).href);
const isPdf = (url) => /\.pdf$/i.test(url);

// One row, as the build writes it. Search words are marked in the title, between escapes, never inside one.
function rowHTML(e, at, words = []) {
  let title = esc(e.title);
  if (words.length) {
    const find = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    title = title.split(/(&#\d+;)/).map((part, i) => (i % 2 ? part : part.replace(find, '<mark>$1</mark>'))).join('');
  }
  return `<li class="entry" data-entry="${esc(e.id)}" data-i="${at}" data-areas="${esc(e.areas.join(' '))}"><h3 class="entry-title"><a href="${esc(local(e.url))}">${title}${isPdf(e.url) ? '<span class="entry-format"> (PDF)</span>' : ''}</a></h3><p class="entry-meta"><span class="entry-type">${esc(TYPES[e.type] || e.type)}</span>, ${esc(e.publisher)}, <time datetime="${esc(e.date)}">${esc(day(e.date))}</time>${e.tribal_specific ? '<span class="entry-tribal">Tribal-specific</span>' : ''}</p><p class="entry-summary">${esc(usDates(e.summary))}</p></li>`;
}

// A short list on another page: the type in its left cell, and a summary that shows four lines with More only when it holds more (-06).
function feedHTML(e) {
  return `<li class="entry">
<p class="entry-type">${esc(TYPES[e.type] || e.type)}</p>
<h3 class="entry-title"><a href="${esc(local(e.url))}">${esc(e.title)}${isPdf(e.url) ? '<span class="entry-format"> (PDF)</span>' : ''}</a></h3>
<p class="entry-meta">${esc(e.publisher)}, <time datetime="${esc(e.date)}">${esc(day(e.date))}</time></p>
<p class="entry-summary is-clamped">${esc(usDates(e.summary))}</p><button type="button" class="entry-more" aria-expanded="false">More</button>
</li>`;
}
function fitSummaries(list) {
  requestAnimationFrame(() => {
    for (const text of list.querySelectorAll('.entry-summary.is-clamped')) {
      if (text.scrollHeight > text.clientHeight + 1) continue;
      text.classList.remove('is-clamped');
      text.nextElementSibling?.remove(); // its More would open nothing
    }
  });
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
    const list = entries.filter((e) => e.featured && !linked.has(local(e.url))).sort((a, b) => resolutionsFirst(a, b) || newestFirst(a, b));
    if (!list.length) continue;
    box.insertAdjacentHTML('afterbegin', `<ul class="entries entries-grid" role="list">${list.map(feedHTML).join('')}</ul>`);
    box.closest('section[hidden]')?.removeAttribute('hidden');
    fitSummaries(box);
  }
}

// The newest additions lead with the sources a council reads first: company filings stay on their own shelf (home-shell-17).
function renderFeeds(entries) {
  for (const feed of document.querySelectorAll('[data-library-feed]')) {
    const area = feed.dataset.area;
    const linked = new Set(feed.hasAttribute('data-skip-linked') ? [...document.querySelectorAll('main a[href]')].map((a) => a.href) : []);
    const list = entries
      .filter((e) => (!area || e.areas.includes(area)) && !FILINGS.test(e.publisher) && !linked.has(local(e.url)))
      .sort(area ? newestFirst : latestAdded)
      .slice(0, Number(feed.dataset.limit) || 6);
    if (!list.length) continue;
    feed.insertAdjacentHTML('afterbegin', `<ul class="entries" role="list">${list.map(feedHTML).join('')}</ul>`);
    fitSummaries(feed);
  }
}

function figures(entries, updated) {
  setFigure('library', entries.length.toLocaleString('en-US'));
  setFigure('library-tribal', entries.filter((e) => e.tribal_specific).length);
  setFigure('library-grounding', entries.filter((e) => e.featured && e.type === 'resolution').length);
  setFigure('library-date', day(updated));
}

let loading = null;
const load = () => {
  loading ??= fetch(new URL('data/library.json', ROOT)).then((response) => {
    if (!response.ok) throw new Error(`library.json: HTTP ${response.status}`);
    return response.json();
  });
  return loading;
};
const failed = (error) => {
  for (const note of document.querySelectorAll('[data-library-error]')) note.hidden = false;
  for (const part of document.querySelectorAll('[data-library-needs]')) part.hidden = true; // nothing to filter
  document.querySelector('.shelf-static')?.setAttribute('data-shown', ''); // the build's Tribal-specific rows, as a reader without scripts sees them
  console.warn(error);
};

// The reading room ---------------------------------------------------------------------------------------------------------------------------------

function readingRoom(room) {
  const form = room.querySelector('form.filters');
  const field = (name) => form.elements.namedItem(name);
  const results = document.getElementById('library-results');
  const status = document.getElementById('library-status');
  const heading = document.getElementById('shelf-title');
  const more = document.getElementById('library-more');
  const pane = document.getElementById('entry-preview-body');
  const notice = room.querySelector('[data-library-notice]');
  const rail = [...room.querySelectorAll('[data-shelf]')];
  const held = JSON.parse(document.getElementById('library-cites')?.textContent || '{"pages":[],"cites":{}}');
  const squares = document.querySelectorAll('.comp-field > i');
  const bars = [...document.querySelectorAll('.comp-row')];
  const startNote = status.textContent;
  let data = null; // { entries, sorted, text, byId, field }
  let hits = [];
  let shown = 0;
  let words = [];

  const ready = () => load().then((json) => {
    if (!data) {
      const sorted = [...json.entries].sort(newestFirst);
      data = {
        entries: json.entries,
        sorted,
        byId: new Map(json.entries.map((e) => [e.id, e])),
        at: new Map(json.entries.map((e, i) => [e, i])), // a row's place in the file keys its citations, as the build wrote them
        text: new Map(sorted.map((e) => [e, fold([e.title, e.publisher, e.summary, TYPES[e.type], ...e.areas.map((a) => AREAS[a])].join(' '))])),
        field: Object.keys(AREAS).flatMap((a) => json.entries.filter((e) => e.areas[0] === a)), // the squares' order, as the build lists them
      };
      figures(json.entries, json.updated);
    }
    return data;
  });

  const narrowing = () => Object.fromEntries(NARROW.map((name) => [name, field(name).value.trim()]));
  const browsing = () => field('shelf').value === 'all' || Object.values(narrowing()).some(Boolean);
  const current = () => {
    if (!browsing()) return 'start';
    const set = Object.entries(narrowing()).filter(([, v]) => v);
    if (set.length === 1 && set[0][0] === 'tribal' && set[0][1] === 'yes') return 'tribal';
    if (set.length === 1 && set[0][0] === 'filings') return 'filings';
    return 'all';
  };
  const matches = (f, words) => (e) =>
    (!f.area || e.areas.includes(f.area)) &&
    (!f.type || e.type === f.type) &&
    (!f.tribal || e.tribal_specific === (f.tribal === 'yes')) &&
    (!f.year || (f.year.startsWith('before-') ? e.date < f.year.slice(7) : e.date.startsWith(f.year))) &&
    (!f.added || e.added === f.added) &&
    (!f.publisher || e.publisher === f.publisher) &&
    (!f.filings || FILINGS.test(e.publisher)) &&
    words.every((w) => data.text.get(e).includes(w));

  // The selected entry beside the list: a row read from the page or an entry from the file, drawn the same way.
  const fromRow = (li) => {
    const link = li.querySelector('.entry-title a').cloneNode(true);
    link.querySelector('.entry-format')?.remove();
    const meta = li.querySelector('.entry-meta');
    return {
      id: li.dataset.entry, at: li.dataset.i, title: link.textContent, url: link.href, kind: meta.querySelector('.entry-type').textContent,
      publisher: meta.childNodes[1].textContent.replace(/^, |, $/g, ''), date: meta.querySelector('time').dateTime,
      summary: li.querySelector('.entry-summary').textContent, areas: li.dataset.areas.split(' ').filter(Boolean), tribal: !!meta.querySelector('.entry-tribal'),
    };
  };
  const fromEntry = (e) => ({ id: e.id, at: data.at.get(e), title: e.title, url: local(e.url), kind: TYPES[e.type] || e.type, publisher: e.publisher, date: e.date, summary: usDates(e.summary), areas: e.areas, tribal: e.tribal_specific });
  const previewHTML = (v) => {
    const chips = v.areas.map((a) => `<li><a href="#area=${esc(a)}" data-filter="area" data-value="${esc(a)}">${esc(AREAS[a] || a)}</a></li>`).join('')
      + (v.tribal ? '<li class="tag-tribal"><a href="#tribal=yes" data-filter="tribal" data-value="yes">Tribal-specific</a></li>' : '');
    const used = held.cites[v.at] || [];
    const where = used.length
      ? used.map(([i, ...ids]) => {
        const [path, name] = held.pages[i];
        const page = new URL(path, ROOT).href;
        return `<li><a href="${esc(page)}">${esc(name)}</a>: ${ids.map((c) => `<a href="${esc(page)}sources/#src-${esc(c)}">${esc(c)}</a>`).join(', ')}</li>`;
      }).join('')
      : '<li>No figure on this site cites it.</li>';
    return `<h3 class="preview-title">${esc(v.title)}</h3><p class="entry-meta"><span class="entry-type">${esc(v.kind)}</span>, ${esc(v.publisher)}, <time datetime="${esc(v.date)}">${esc(day(v.date))}</time></p><p class="preview-summary">${esc(v.summary)}</p><dl class="preview-facts"><div><dt>Areas</dt><dd><ul class="tags" role="list">${chips}</ul></dd></div><div><dt>Cited on this site</dt><dd><ul class="preview-cites" role="list">${where}</ul></dd></div></dl><p class="preview-go"><a class="paper" href="${esc(v.url)}">Open the document${isPdf(v.url) ? ' (PDF)' : ''}</a></p>`;
  };
  let picked = pane.querySelector('[data-preview]')?.dataset.preview || results.querySelector('.entry')?.dataset.entry;
  const pick = (view, chosen) => {
    for (const li of results.querySelectorAll('.entry')) {
      if (li.dataset.entry === view.id) li.setAttribute('aria-current', 'true');
      else li.removeAttribute('aria-current');
    }
    if (view.id !== picked) pane.innerHTML = `<div data-preview="${esc(view.id)}">${previewHTML(view)}</div>`;
    picked = view.id;
    if (chosen) {
      field('entry').value = results.querySelector('.entry')?.dataset.entry === view.id ? '' : view.id; // the first row is the default and needs no address
      write();
    }
  };
  const pickFirst = () => {
    const first = results.querySelector('.entry');
    if (first) pick(fromRow(first), false);
  };

  // The list for the shelf and filters the form holds now. The first view is the build's: drawing it again would move nothing, so it is drawn only on a change.
  const groupsHTML = () => {
    const by = Object.fromEntries(Object.keys(GROUPS).map((k) => [k, []]));
    for (const e of data.entries.filter((x) => x.featured).sort(newestFirst)) by[e.type === 'resolution' ? 'grounding' : e.areas[0]].push(e);
    return Object.entries(by).filter(([, list]) => list.length).map(([key, list]) => `<p class="entry-group" id="group-${key}">${GROUPS[key]}</p><ol class="entries" role="list" aria-labelledby="group-${key}">${list.map((e) => rowHTML(e, data.at.get(e))).join('')}</ol>`).join('');
  };
  const describe = (f) => [
    f.publisher && `from ${f.publisher}`,
    f.added && `added ${day(f.added)}`,
  ].filter(Boolean).join(', ');
  const paint = () => {
    const f = narrowing();
    const filtered = Object.values(f).some(Boolean);
    const kept = new Set(filtered ? hits : []);
    data.field.forEach((e, i) => squares[i]?.classList.toggle('is-out', filtered && !kept.has(e)));
    for (const bar of bars) {
      const { filter, value } = bar.dataset;
      const on = field(filter).value === value;
      if (on) bar.setAttribute('aria-current', 'true');
      else bar.removeAttribute('aria-current');
      const n = filtered ? hits.filter(matches({ ...Object.fromEntries(NARROW.map((k) => [k, ''])), [filter]: value }, [])).length : 0;
      bar.style.setProperty('--h', filtered ? (n / data.entries.length).toFixed(4) : '0');
      bar.querySelector('.comp-hit').textContent = filtered ? `${n.toLocaleString('en-US')} of` : '';
    }
    // A choice the other filters leave empty is shown, but cannot be chosen (-03).
    for (const name of ['area', 'type', 'tribal', 'year']) {
      const others = { ...f, [name]: '' };
      for (const option of field(name).options) {
        if (!option.value) continue;
        option.disabled = option.value !== field(name).value && !data.sorted.some(matches({ ...others, [name]: option.value }, words));
      }
    }
  };
  const draw = () => {
    const f = narrowing();
    words = fold(f.q).split(/\s+/).filter(Boolean);
    const kind = current();
    heading.textContent = SHELVES[kind];
    for (const a of rail) {
      if (a.dataset.shelf === kind) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    }
    if (kind === 'start') {
      hits = data.entries.filter((e) => e.featured);
      results.innerHTML = groupsHTML();
      status.textContent = startNote;
      more.hidden = true;
    } else {
      hits = data.sorted.filter(matches(f, words));
      shown = Math.min(PAGE_SIZE, hits.length);
      results.innerHTML = `<ol class="entries" role="list" aria-labelledby="shelf-title">${hits.slice(0, shown).map((e) => rowHTML(e, data.at.get(e), words)).join('')}</ol>`;
      const what = describe(f);
      const noun = hits.length === 1 ? 'entry' : 'entries';
      status.textContent = hits.length
        ? `Showing ${shown.toLocaleString('en-US')} of ${hits.length.toLocaleString('en-US')} ${noun}${what ? ` ${what}` : ''}, newest first.`
        : 'No entries match. Clear the filters or change the search.';
      more.hidden = shown >= hits.length;
      more.textContent = `Show ${Math.min(PAGE_SIZE, hits.length - shown)} more`;
    }
    paint();
    const asked = field('entry').value && data.byId.get(field('entry').value);
    if (asked) pick(fromEntry(asked), false);
    else pickFirst();
  };
  let write = () => {};
  const update = () => ready().then(() => { draw(); write(); }, failed);

  // A link that names a value this library does not use says so, and shows everything (-10). The old Start here link opens that shelf.
  write = linkFilters(form, FILTERS);
  const { params } = address();
  if (params.get('area') === 'start-here') params.delete('area');
  const unknown = ['area', 'type', 'tribal', 'year'].filter((name) => params.get(name) && field(name).value !== params.get(name));
  if (unknown.length) {
    notice.textContent = `This library has no ${unknown.map((name) => `${{ area: 'area', type: 'type', tribal: 'Tribal focus', year: 'year' }[name]} “${params.get(name)}”`).join(' or ')}, so the list is not narrowed by ${unknown.length === 1 ? 'it' : 'them'}.`;
    notice.hidden = false;
  }
  if (browsing() || field('entry').value) update();

  // The data loads when a reader reaches for anything past the first view: the form, the shelves, a bar, or a chip.
  const reach = (event) => { if (event.target.closest?.('form, [data-shelf], .comp-row, [data-filter]')) ready().catch(failed); };
  document.addEventListener('pointerdown', reach);
  document.addEventListener('focusin', reach);

  let typing;
  form.addEventListener('input', (event) => {
    window.clearTimeout(typing);
    if (event.target === field('entry')) {
      ready().then(() => { const e = data.byId.get(field('entry').value); if (e) pick(fromEntry(e), false); else pickFirst(); });
      return;
    }
    if (event.isTrusted) field('entry').value = ''; // a reader's new filter starts the preview at its first row; Back sets both, in order
    if (event.target === field('q')) typing = window.setTimeout(update, 250);
    else update();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    window.clearTimeout(typing);
    update();
  });
  form.querySelector('[data-clear]').addEventListener('click', () => {
    for (const name of NARROW) field(name).value = '';
    field('entry').value = '';
    update();
    field('q').focus();
  });
  for (const button of form.querySelectorAll('[data-try]')) {
    button.addEventListener('click', () => {
      field('q').value = button.dataset.try;
      update();
    });
  }
  more.addEventListener('click', () => {
    const list = results.querySelector('ol');
    const from = shown;
    shown = Math.min(shown + PAGE_SIZE, hits.length);
    list.insertAdjacentHTML('beforeend', hits.slice(from, shown).map((e) => rowHTML(e, data.at.get(e), words)).join('')); // only the new rows, so the page never redraws (-07)
    status.textContent = status.textContent.replace(/^Showing [\d,]+/, `Showing ${shown.toLocaleString('en-US')}`);
    more.hidden = shown >= hits.length;
    more.textContent = `Show ${Math.min(PAGE_SIZE, hits.length - shown)} more`;
    list.children[from]?.querySelector('a')?.focus();
  });

  // A row's title opens its document; pressing the rest of the row, or reaching its title by keyboard, shows it beside the list.
  results.addEventListener('click', (event) => {
    const li = event.target.closest('.entry');
    if (li && !event.target.closest('a')) pick(fromRow(li), true);
  });
  results.addEventListener('focusin', (event) => {
    const li = event.target.closest('.entry');
    if (li) pick(fromRow(li), true);
  });

  // A shelf is a set of filters; What changed is a place on the page, and opens there.
  for (const a of rail) {
    a.addEventListener('click', (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      for (const name of [...NARROW, 'entry']) field(name).value = '';
      field('shelf').value = a.dataset.shelf === 'start' ? '' : 'all';
      if (a.dataset.shelf === 'tribal') field('tribal').value = 'yes';
      if (a.dataset.shelf === 'filings') field('filings').value = 'only';
      update();
    });
  }
  room.querySelector('[data-changes]')?.addEventListener('click', () => { newest && (newest.open = true); });

  // A bar or a chip sets one filter, and pressing it again clears it. A modified click still opens a new tab.
  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('[data-filter]');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const control = field(link.dataset.filter);
    const redrawn = pane.contains(link);
    control.value = control.value === link.dataset.value ? '' : link.dataset.value;
    field('entry').value = '';
    update().then(() => { if (redrawn) status.focus(); }); // the chip that had focus is gone
  });
}

// "N new since your last visit": the last-seen date stays in this browser and is never sent anywhere. Without storage, the line stays hidden.
const sinceLine = document.querySelector('[data-whats-new-since]');
if (sinceLine) {
  fetch(new URL('data/whats-new.json', ROOT))
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error('whats-new.json'))))
    .then(({ items }) => {
      const seen = localStorage.getItem('atni-last-seen');
      localStorage.setItem('atni-last-seen', items[0].date);
      const count = seen ? items.filter((item) => item.date > seen).length : 0;
      sinceLine.textContent = `${count} new since your last visit`;
      sinceLine.hidden = !count;
    })
    .catch(() => {});
}
const newest = document.getElementById('whats-new'); // the What changed shelf opens it; theme.js opens it for a link

const room = document.getElementById('room');
if (room) readingRoom(room);
if (document.querySelector('[data-library-feed], [data-library-featured]') || (!room && document.querySelector('[data-figure]'))) {
  load()
    .then(({ entries, updated }) => {
      figures(entries, updated);
      renderFeatured(entries);
      renderFeeds(entries);
    })
    .catch(failed);
}
