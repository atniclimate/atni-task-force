// Energy types by stage (the overview and energy/potential/): each type's stages laid over its bar, inside the bar's own box, so nothing moves when they come.
// On energy/potential/, the Tribe-by-type grid the build wrote (scripts/build_energy_pages.py): one Tab stop, arrows to move, the chosen cell's passages in
// the side column, and marks that highlight rather than hide. Nothing is fetched; without scripts the grid is a table and every passage follows it.

import { esc, plural, STATES, linkFilters, address, writeAddress } from './util.js';

const STAGE_KEYS = ['installed', 'planned', 'assessed', 'goal']; // most advanced first, as the plate's columns hold them
const STAGES = { 4: 'Installed or operating', 3: 'Planned or funded', 2: 'Assessed or sited', 1: 'Goal or interest' };

// The stages over each bar: a segment per stage with a count, in the key's ramp; the row's words and the Table say the same aloud.
function stacks(figure) {
  window.plate.register(figure.dataset.plate, {
    render(ctx) {
      ctx.auto();
      if (figure.querySelector('.stack-bar')) return;
      for (const row of ctx.data.rows) {
        const track = ctx.plot.querySelector(`[data-row="${row.key}"] .ladder-track`);
        if (!track || !row.value) continue;
        const bar = Object.assign(document.createElement('span'), { className: 'stack-bar' });
        bar.setAttribute('aria-hidden', 'true');
        STAGE_KEYS.forEach((key, i) => {
          const n = Number(row.cols?.[key]);
          if (!n) return;
          const part = Object.assign(document.createElement('i'), { className: `stage-${4 - i}` });
          part.style.setProperty('--n', n);
          part.append(Object.assign(document.createElement('b'), { textContent: n }));
          bar.append(part);
        });
        track.append(bar);
      }
    },
  });
}
document.querySelectorAll('[data-plate^="energy-types"]').forEach(stacks);

// The grid. Cells are the table's own; a roving tabindex keeps one Tab stop, and the side column follows the chosen cell.
function grid(table) {
  const form = document.getElementById('tt-filters');
  const side = document.getElementById('tt-side');
  const title = side.querySelector('.tt-side-title');
  const body = side.querySelector('.tt-side-body');
  const status = document.getElementById('tt-status');
  const evidence = document.getElementById('tt-evidence');
  const tbody = table.tBodies[0];
  const original = [...tbody.rows];
  const heads = [...table.tHead.rows[0].cells].slice(1);
  const types = heads.map((th) => [th.dataset.type, th.textContent.trim()]);
  const field = (name) => form.elements.namedItem(name);
  const total = original.length;
  let active = null;

  table.setAttribute('role', 'grid');
  table.setAttribute('aria-describedby', 'tt-status');
  for (const a of table.querySelectorAll('tbody th a')) a.tabIndex = -1; // the row's cells are its stops; the link stays for a pointer and for print
  const cells = () => [...tbody.rows].filter((r) => !r.classList.contains('is-group')).map((r) => [...r.querySelectorAll('td[data-tt]')]);
  for (const td of table.querySelectorAll('td[data-tt]')) td.tabIndex = -1;

  // Options from the grid itself, so the lists and the grid cannot disagree. Each select's width is set by the form's columns, so filling it moves nothing.
  const fill = (select, rows) => select.insertAdjacentHTML('beforeend', rows.map(([v, label]) => `<option value="${esc(v)}">${esc(label)}</option>`).join(''));
  fill(field('tribe'), original.map((r) => [r.dataset.tribe, r.querySelector('th a').textContent]));
  const states = [...new Set(original.flatMap((r) => r.dataset.states.split(' ').filter(Boolean)))].sort((a, b) => (STATES[a] || a).localeCompare(STATES[b] || b));
  fill(field('state'), states.map((s) => [s, STATES[s] || s]));
  fill(field('type'), types);
  fill(field('stage'), Object.entries(STAGES).reverse()); // most advanced first

  const section = (slug) => evidence.querySelector(`#${CSS.escape(slug)}`);
  const strip = (node) => { node.removeAttribute('id'); for (const n of node.querySelectorAll('[id]')) n.removeAttribute('id'); return node; };
  const typeName = (id) => types.find(([t]) => t === id)?.[1] || id;

  function show(td) {
    const [slug, type] = td.dataset.tt.split('--');
    const tribe = section(slug);
    const finding = tribe?.querySelector(`#${CSS.escape(td.dataset.tt)}`);
    title.textContent = tribe?.querySelector('h3').textContent || slug;
    const parts = [strip(tribe.querySelector('.record-meta').cloneNode(true))];
    if (finding) parts.push(strip(finding.cloneNode(true)));
    else {
      const none = Object.assign(document.createElement('p'), { textContent: `No finding for ${typeName(type).toLowerCase()} in this Tribe’s public plans in the library. That is not evidence of opposition or disinterest.` });
      parts.push(none, ...[...tribe.querySelectorAll(':scope > .record-note')].map((n) => strip(n.cloneNode(true))));
    }
    const others = [...tribe.querySelectorAll('.tt-finding')];
    if (others.length) {
      const list = Object.assign(document.createElement('ul'), { className: 'tt-others' });
      list.setAttribute('aria-label', 'This Tribe’s energy types');
      for (const f of others) {
        const b = Object.assign(document.createElement('button'), { type: 'button', textContent: typeName(f.dataset.type) });
        b.setAttribute('aria-pressed', String(f === finding));
        b.addEventListener('click', () => choose(table.querySelector(`td[data-tt="${CSS.escape(`${slug}--${f.dataset.type}`)}"]`), { focus: true }));
        const li = document.createElement('li');
        li.append(b);
        list.append(li);
      }
      parts.push(list);
    }
    parts.push(strip(tribe.querySelector('.record-links').cloneNode(true)));
    body.replaceChildren(...parts);
  }

  function choose(td, { focus = false, write = true } = {}) {
    if (!td) return;
    if (active) { active.classList.remove('is-on'); active.tabIndex = -1; active.removeAttribute('aria-selected'); }
    active = td;
    td.classList.add('is-on');
    td.tabIndex = 0;
    td.setAttribute('aria-selected', 'true');
    show(td);
    if (focus) td.focus({ preventScroll: false });
    if (write) {
      const { anchor, params } = address();
      params.set('tt', td.dataset.tt);
      writeAddress(anchor && !section(anchor) && !table.querySelector(`[data-tt="${CSS.escape(anchor)}"]`) ? anchor : '', params);
    }
  }

  table.addEventListener('click', (event) => {
    const td = event.target.closest('td[data-tt]');
    const row = event.target.closest('tbody th');
    if (td) choose(td, { focus: true });
    else if (row) { event.preventDefault(); choose(firstOf(row.parentElement), { focus: true }); }
  });
  table.addEventListener('keydown', (event) => {
    const td = event.target.closest('td[data-tt]');
    if (!td) return;
    const grid = cells();
    const r = grid.findIndex((row) => row.includes(td));
    const c = grid[r].indexOf(td);
    const last = grid.length - 1;
    const width = grid[r].length - 1;
    const to = {
      ArrowRight: [r, Math.min(width, c + 1)], ArrowLeft: [r, Math.max(0, c - 1)], ArrowDown: [Math.min(last, r + 1), c], ArrowUp: [Math.max(0, r - 1), c],
      Home: event.ctrlKey ? [0, 0] : [r, 0], End: event.ctrlKey ? [last, grid[last].length - 1] : [r, width],
      PageDown: [Math.min(last, r + 10), c], PageUp: [Math.max(0, r - 10), c],
    }[event.key];
    if (to) {
      event.preventDefault();
      choose(grid[to[0]][to[1]], { focus: true });
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      title.focus(); // the passages are next in the reading order of the side column
    }
  });
  side.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && active) { event.preventDefault(); active.focus(); }
  });

  const firstOf = (row) => row.querySelector('td[data-stage]') || row.querySelector('td[data-tt]');

  // Marks: a filter highlights what matches and dims the rest, so nothing a reader is looking at disappears. The order moves rows, never their cells.
  const writeParams = linkFilters(form, ['order', 'tribe', 'state', 'type', 'stage', 'check']);
  function order() {
    for (const g of tbody.querySelectorAll('tr.is-group')) g.remove();
    if (form.elements.namedItem('order').value !== 'state') { tbody.append(...original); return; }
    const first = (r) => r.dataset.states.split(' ')[0] || 'ZZ';
    const name = (s) => STATES[s] || (s === 'ZZ' ? 'State not recorded' : s);
    const sorted = [...original].sort((a, b) => name(first(a)).localeCompare(name(first(b))));
    let current = '';
    for (const row of sorted) {
      if (first(row) !== current) {
        current = first(row);
        const head = document.createElement('tr');
        head.className = 'is-group';
        head.innerHTML = `<th scope="colgroup" colspan="${heads.length + 1}">${esc(name(current))}</th>`;
        tbody.append(head);
      }
      tbody.append(row);
    }
  }
  function mark() {
    const [state, type, stage, check] = ['state', 'type', 'stage', 'check'].map((n) => field(n).value);
    const narrowed = Boolean(type || stage || check);
    let matched = 0;
    const tribes = new Set();
    for (const row of original) {
      const inState = !state || row.dataset.states.split(' ').includes(state);
      row.classList.toggle('is-dim', !inState);
      for (const td of row.querySelectorAll('td[data-tt]')) {
        const [, t] = td.dataset.tt.split('--');
        const hit = inState && narrowed && td.dataset.stage && (!type || t === type) && (!stage || td.dataset.stage === stage) && (!check || td.dataset.check === check);
        td.classList.toggle('is-dim', (narrowed && !hit) || !inState);
        if (hit) { matched += 1; tribes.add(row); }
      }
      if (!narrowed && inState && state) tribes.add(row);
    }
    for (const th of heads) th.classList.toggle('is-mark', th.dataset.type === type);
    const where = state ? ` in ${STATES[state] || state}` : '';
    status.textContent = narrowed
      ? `${plural(matched, 'cell')} marked, in ${tribes.size} of ${plural(total, 'Tribe')}${where}. The others are dimmed, not removed.`
      : state ? `${plural(tribes.size, 'Tribe')} of ${total} marked${where}. The others are dimmed, not removed.` : '';
    writeParams();
  }
  form.addEventListener('change', (event) => {
    if (event.target.name === 'order') order();
    if (event.target.name === 'tribe') {
      const row = original.find((r) => r.dataset.tribe === event.target.value);
      if (row) { choose(firstOf(row), { focus: false }); row.scrollIntoView({ block: 'nearest', behavior: 'instant' }); }
      writeParams();
      return;
    }
    mark();
  });
  form.addEventListener('submit', (event) => event.preventDefault());
  form.querySelector('[data-clear]').addEventListener('click', () => {
    for (const name of ['state', 'type', 'stage', 'check', 'tribe']) field(name).value = '';
    mark();
    field('state').focus();
  });

  // Where the address lands: a cell (tt=), a Tribe's entry (#slug or #slug--type, as old links and the Funding page write them), or the first finding.
  function land() {
    const { anchor, params } = address();
    let id = '';
    try { id = decodeURIComponent(anchor); } catch { /* names nothing */ }
    const named = params.get('tt') || id;
    const cell = named && table.querySelector(`td[data-tt="${CSS.escape(named)}"]`);
    const row = !cell && id && original.find((r) => r.dataset.tribe === id);
    const pick = field('tribe').value && original.find((r) => r.dataset.tribe === field('tribe').value);
    const target = cell || (row && firstOf(row)) || (pick && firstOf(pick));
    choose(target || table.querySelector('td[data-stage]'), { write: false, focus: Boolean(cell && !params.get('tt') || row) });
    if (target && (cell || row)) target.closest('tr').scrollIntoView({ block: 'center', behavior: 'instant' });
  }
  order();
  mark();
  land();
  window.addEventListener('hashchange', () => { if (!window.siteAddress.followed || section(address().anchor)) land(); });
}
const table = document.getElementById('tt-grid');
if (table && document.getElementById('tt-side')) grid(table);
