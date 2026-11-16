// energy/funding/: the catalog the build wrote (scripts/build_energy_pages.py) as one list box with the chosen program's detail beside it, marks that highlight
// rather than hide, and the Tribe picker, read from the page's own inline data. Nothing is fetched. Without scripts the list links to every detail below it.

import { esc, plural, day, linkFilters, address, writeAddress } from './util.js';

const today = () => { const n = new Date(); return [n.getFullYear(), n.getMonth() + 1, n.getDate()].map((v) => String(v).padStart(2, '0')).join('-'); };

// A date the countdown counts as passed reads as passed here too, so a program shows one status: open, with its date passed (energy-14).
function dates(root) {
  const now = today();
  for (const el of root.querySelectorAll('.catalog-date[data-date]')) if (el.dataset.date < now) el.textContent = `${day(el.dataset.date)}, passed`;
  for (const el of root.querySelectorAll('.program-due[data-date]')) {
    if (el.dataset.date >= now) continue;
    el.classList.add('is-passed');
    el.querySelector('strong').textContent = `Passed ${day(el.dataset.date)}:`;
  }
}

function catalog() {
  const list = document.getElementById('catalog-list');
  if (!list) return null;
  const form = document.getElementById('catalog-filters');
  const status = document.getElementById('catalog-status');
  const field = (name) => form.elements.namedItem(name);
  const items = [...list.querySelectorAll('.catalog-item')];
  const detail = (item) => document.getElementById(`prog-${item.dataset.program}`);
  let chosen = null;

  // One list box: each row an option, so the list is one Tab stop and the arrows choose. A row's link becomes its words, in the same box.
  list.setAttribute('role', 'listbox');
  list.tabIndex = 0;
  for (const item of items) {
    const a = item.querySelector('a.catalog-pick');
    const span = Object.assign(document.createElement('span'), { className: a.className });
    span.append(...a.childNodes);
    a.replaceWith(span);
    item.id = `pick-${item.dataset.program}`;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', 'false');
    item.setAttribute('aria-controls', `prog-${item.dataset.program}`);
  }
  for (const article of document.querySelectorAll('.catalog-details > .program')) article.tabIndex = -1;

  function choose(item, { write = true } = {}) {
    if (!item) return;
    if (chosen) { chosen.classList.remove('is-on'); chosen.setAttribute('aria-selected', 'false'); detail(chosen).classList.remove('is-on'); }
    chosen = item;
    item.classList.add('is-on');
    item.setAttribute('aria-selected', 'true');
    list.setAttribute('aria-activedescendant', item.id);
    detail(item).classList.add('is-on');
    detail(item).scrollTop = 0;
    item.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    if (write) {
      const { params } = address();
      params.set('program', item.dataset.program);
      writeAddress('', params);
    }
  }
  list.addEventListener('click', (event) => { const item = event.target.closest('.catalog-item'); if (item) { choose(item); list.focus(); } });
  list.addEventListener('keydown', (event) => {
    const i = items.indexOf(chosen);
    const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: items.length - 1, PageDown: i + 5, PageUp: i - 5 }[event.key];
    if (to !== undefined) {
      event.preventDefault();
      choose(items[Math.max(0, Math.min(items.length - 1, to))]);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      detail(chosen)?.focus(); // the detail is next to read
    }
  });
  document.querySelector('.catalog-details')?.addEventListener('keydown', (event) => { if (event.key === 'Escape' && chosen) { event.preventDefault(); list.focus(); } });

  // Marks: what a filter matches keeps its ink and the rest dims; nothing leaves the list, so a link to a program always lands (energy-08).
  const NAMES = ['type', 'cooling', 'status'];
  const matches = (item, { type, cooling, status: state }) => (!type || `${item.dataset.types} ${item.dataset.possible}`.split(' ').includes(type))
    && (!cooling || item.dataset.cooling.split(' ').includes(cooling)) && (!state || item.dataset.status === state);
  const writeParams = linkFilters(form, NAMES);
  const values = () => Object.fromEntries(NAMES.map((n) => [n, field(n).value]));
  function mark(note = '') {
    const v = values();
    const on = Object.values(v).some(Boolean);
    let n = 0;
    for (const item of items) {
      const hit = !on || matches(item, v);
      item.classList.toggle('is-dim', !hit);
      if (on && hit) n += 1;
    }
    status.textContent = [note, on ? `${plural(n, 'program')} of ${items.length} marked; the others are dimmed, not removed.` : ''].filter(Boolean).join(' ');
    writeParams();
  }
  form.addEventListener('change', () => mark());
  form.addEventListener('submit', (event) => event.preventDefault());
  form.querySelector('[data-clear]').addEventListener('click', () => { for (const n of NAMES) field(n).value = ''; mark(); field('type').focus(); });

  // A link to #prog-ID, from this page or another, opens that program; marks that would dim it are cleared, and the status says so.
  function open(id, { focus = true } = {}) {
    const item = items.find((x) => x.dataset.program === id);
    if (!item) return false;
    let note = '';
    if (Object.values(values()).some(Boolean) && !matches(item, values())) {
      for (const n of NAMES) field(n).value = '';
      note = `Marks cleared to show ${item.querySelector('.catalog-name').textContent}.`;
    }
    mark(note);
    choose(item);
    const article = detail(item);
    article.closest('.catalog').scrollIntoView({ block: 'start', behavior: 'instant' });
    if (focus) article.focus({ preventScroll: true });
    return true;
  }
  document.addEventListener('click', (event) => {
    const a = event.target.closest?.('a[href^="#prog-"]');
    if (!a || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (open(a.getAttribute('href').slice(6))) event.preventDefault();
  });
  window.addEventListener('hashchange', () => { const { anchor } = address(); if (anchor.startsWith('prog-')) open(anchor.slice(5)); });

  dates(document);
  mark();
  const { anchor, params } = address();
  if (anchor.startsWith('prog-') && open(anchor.slice(5))) return { open };
  choose(items.find((x) => x.dataset.program === params.get('program')) || items[0], { write: false });
  return { open };
}

// What fits a Tribe's own plans: each program once, with the Tribe's types it names, open first; one line of status, so a change is announced in a sentence
// and the list is not read again (energy-12).
function tribes() {
  const form = document.getElementById('tribe-form');
  const select = document.getElementById('pick-tribe');
  const data = document.getElementById('tribe-matches');
  if (!form || !select || !data) return;
  const table = JSON.parse(data.textContent);
  const out = document.getElementById('tribe-results');
  const status = document.getElementById('tribe-status');
  const program = (id) => document.querySelector(`.catalog-item[data-program="${CSS.escape(id)}"]`);
  const name = (id) => program(id)?.querySelector('.catalog-name').textContent || id;
  const typeLabel = new Map([...document.querySelectorAll('#filter-type option')].map((o) => [o.value, o.textContent.replace(/ \(\d+\)$/, '')]));
  const writeParams = linkFilters(form, ['tribe']);

  function render() {
    const tribe = table[select.value];
    if (!tribe) { out.replaceChildren(); status.textContent = ''; writeParams(); return; }
    const named = new Map();
    const possible = new Map();
    for (const [type, , , names, maybes] of tribe.types) {
      for (const id of names) named.set(id, [...(named.get(id) || []), type]);
      for (const id of maybes) if (!names.includes(id)) possible.set(id, [...(possible.get(id) || []), type]);
    }
    for (const id of named.keys()) possible.delete(id);
    const live = (id) => ['open', 'forecasted'].includes(program(id)?.dataset.status);
    const group = (heading, entries) => (entries.length ? `<section class="fit-group"><h3>${esc(heading)}</h3><ul>${entries.map(([id, ts]) => `<li><a href="#prog-${esc(id)}">${esc(name(id))}</a>${program(id)?.dataset.status === 'forecasted' ? ' (forecasted)' : ''}<span class="fit-types">${esc(ts.map((t) => typeLabel.get(t) || t).join(', '))}</span></li>`).join('')}</ul></section>` : '');
    const openNamed = [...named].filter(([id]) => live(id));
    const openMaybe = [...possible].filter(([id]) => live(id));
    const closed = [...named].filter(([id]) => !live(id));
    out.innerHTML = group('Open programs that name one of its types', openNamed) + group('Open programs that may fit; confirm with the agency', openMaybe) + group('Closed at the check', closed);
    status.textContent = tribe.types.length
      ? `${tribe.name}: ${plural(tribe.types.length, 'energy type')} in its public plans; ${plural(openNamed.length, 'open or forecasted program')} ${openNamed.length === 1 ? 'names' : 'name'} one of them.`
      : `${tribe.name}: no energy type was found in its public plans in the library, so no program is matched.`;
    writeParams();
  }
  select.addEventListener('change', render);
  form.addEventListener('submit', (event) => event.preventDefault());
  render();
}

catalog();
tribes();
