// Resource Use Explorer: the page around the model, which is resource-model.js. Text by textContent only.
(function () {
'use strict';
const { MS, TAGS, FEED, blank, Run, Views, projectScale, num, usd, pct, grouped, words, leverText, plainFig } = window.resourceModel;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const on = (node, type, fn, capture) => node.addEventListener(type, fn, capture);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (!blank(text)) n.textContent = text; return n; };
const D = JSON.parse($('#explorer-data').textContent);
const V = Views(D);
const S = V.fresh();
window.explorer = { ...window.resourceModel, view: V, state: S, data: D };
const plateOf = (name) => $(`.x-plate[data-plate-x="${name}"]`);
const rowNodes = new Map($$('.plate-plot [data-row]').map((n) => [n.dataset.row, n]));
const tableRows = new Map($$('tr[data-tr]').map((n) => [n.dataset.tr, n]));
const shown = {}; // the keys a plate's arrows step through, in the order they stand
let picked = null; // the row the reader last chose

function cell(node, f) {
  const parts = [el('span', 'ladder-num', f.num)];
  if (f.unit) parts.push(' ', el('span', 'ladder-unit', f.unit));
  if (f.tag) parts.push(' ', el('span', 'ladder-tag', f.tag));
  node.replaceChildren(...parts);
}
function seg(node, range) {
  node.hidden = !(range && range[1] > 0);
  if (!node.hidden) { node.style.left = pct(range[0]); node.style.width = pct(range[1]); }
}
function axisInto(board, ticks) {
  const axis = $('.wall-axis, .ladder-axis', board);
  const place = (n, t) => { n.style.setProperty('--x', t.x.toFixed(4)); return n; };
  axis.replaceChildren(...ticks.map((t) => place(el('span', '', t.t), t)));
  const grid = $('.ladder-grid', board);
  if (grid) grid.replaceChildren(...ticks.map((t) => place(el('i'), t)));
}
function byBasis(board, keys) { // rows by price basis, with a rule between groups; a price is never ranked across bases
  const rank = (basis) => D.words.order.indexOf(basis);
  for (const head of $$('.wall-group[data-basis]', board)) { head.hidden = !keys.some((key) => V.basis(key) === head.dataset.basis); head.style.order = rank(head.dataset.basis) * 1000; }
  const sorted = [...keys].sort((a, b) => rank(V.basis(a)) - rank(V.basis(b)));
  sorted.forEach((key, i) => { rowNodes.get(key).style.order = rank(V.basis(key)) * 1000 + i + 1; });
  return sorted;
}
const bySize = (keys, m) => { const sorted = [...keys].sort((a, b) => (V.val(b, m) ?? -1) - (V.val(a, m) ?? -1)); sorted.forEach((key, i) => { rowNodes.get(key).style.order = i; }); return sorted; };
const feedGrid = (f) => (f === 'hydro' ? V.p.grid_hydro : V.p[FEED[f][0]]);
const oneGrid = (key) => (V.at(V.t, key).feeds || []).every((f) => feedGrid(f) === V.p.grid_local);

function paintWall(id) {
  const spec = D.boards[id];
  const board = $(`[data-board="${id}"]`);
  const { m } = S;
  const list = (m === 'usd' ? spec.price : m === 'wh' ? spec.energy : spec.grid) || spec.rows;
  const scenario = m === 'g' || m === 'ml' ? spec.scenario || [] : [];
  const visible = V.boardKeys(id, m);
  const at = V.boardScale(id, m);
  let wordsOnly = id.startsWith('arch.') && (m === 'g' || m === 'ml') ? list.filter((key) => !oneGrid(key)) : []; // different grids: words, no bar
  if (list.length - wordsOnly.length < 2 && wordsOnly.length) wordsOnly = list; // one bar alone compares with nothing
  board.dataset.measure = m;
  for (const key of spec.rows) { const n = rowNodes.get(key); n.hidden = !visible.includes(key); n.style.order = ''; }
  for (const head of $$('.wall-group', board)) { head.hidden = !(head.dataset.scenario !== undefined && scenario.length); head.style.order = ''; }
  let order = visible;
  if (m === 'usd' || (id === 'catalog.hour' && S.opts.sort === 'tag')) order = byBasis(board, visible);
  else if (id === 'catalog.hour') order = bySize(visible, m);
  if (scenario.length) { $('.wall-group[data-scenario]', board).style.order = 5000; scenario.forEach((key, i) => { rowNodes.get(key).style.order = 5001 + i; }); }
  const lay = V.layout(m === 'usd' ? [] : visible.filter((key) => !wordsOnly.includes(key)), m, spec.plain, at);
  board.style.setProperty('--wall', lay.wall.toFixed(4));
  for (const key of visible) {
    const n = rowNodes.get(key);
    const item = lay.items[key];
    const beside = key === 'use.gb' && S.mode === 'office';
    n.classList.toggle('is-beside', beside);
    for (const tag of TAGS) seg($(`.w-${tag}`, n), item && item[tag]);
    const range = $('.wall-range', n);
    range.hidden = !item?.range;
    if (item?.range) {
      range.style.left = pct(item.range[0]);
      range.style.width = pct(item.range[1]);
      range.className = `wall-range ${item.range[2]}`.trim();
    }
    const needle = $('.wall-needle', n);
    needle.hidden = !item;
    if (item) needle.style.left = pct(item.end);
    const f = V.rowCell(key, m, at);
    const extra = wordsOnly.includes(key) ? 'on another grid, no bar' : beside ? 'inside the seat figure; printed beside, not added' : '';
    cell($('.ladder-value', n), { ...f, tag: [f.tag, extra, item?.range?.[2] ? D.words.off : ''].filter(Boolean).join(' ') });
  }
  axisInto(board, lay.ticks);
  const note = $('.wall-gridnote', board);
  if (note) {
    note.hidden = !wordsOnly.length;
    note.textContent = wordsOnly.length ? `Rows on different grids carry no bar: ${[...new Set(wordsOnly.map(V.grids))].join(' against ')}, and the local grid is ${V.p.grid_local} g per kWh. Set them to one feed in Settings to draw them.` : '';
  }
  return [...order.filter((key) => !scenario.includes(key)), ...scenario];
}
function paintRuler(id) {
  const spec = D.boards[id];
  const board = $(`[data-board="${id}"]`);
  const { m } = S;
  board.dataset.measure = m;
  const lay = m === 'usd' ? { items: {}, ticks: [] } : V.ruler(spec.rows, m);
  const at = V.boardScale(id, m);
  for (const head of $$('.wall-group', board)) head.hidden = true;
  const order = m === 'usd' || S.opts.sort === 'tag' ? byBasis(board, spec.rows) : bySize(spec.rows, m);
  for (const key of spec.rows) {
    const n = rowNodes.get(key);
    const item = lay.items[key] || {};
    if (!blank(item.x)) n.style.setProperty('--x', item.x.toFixed(4));
    $('.ladder-mark', n).hidden = blank(item.x);
    const hasRange = !blank(item.lo) && !blank(item.hi) && item.hi > item.lo;
    if (hasRange) { n.style.setProperty('--lo', item.lo.toFixed(4)); n.style.setProperty('--hi', item.hi.toFixed(4)); } else { n.style.removeProperty('--lo'); n.style.removeProperty('--hi'); }
    $('.ladder-range', n).hidden = !hasRange;
    cell($('.ladder-value', n), V.rowCell(key, m, at));
  }
  axisInto(board, lay.ticks);
  return order;
}
function paintLevers() {
  const { m } = S;
  for (const key of D.boards.lever.rows) {
    const n = rowNodes.get(key);
    const r = V.lever(key, m);
    const has = !blank(r.xAfter) && !blank(r.xBefore);
    if (has) { n.style.setProperty('--x', r.xAfter.toFixed(4)); n.style.setProperty('--x2', r.xBefore.toFixed(4)); } else { n.style.removeProperty('--x'); n.style.removeProperty('--x2'); } // no figures, no line
    $$('.ladder-mark', n).forEach((mark) => { mark.hidden = !has; });
    cell($('.ladder-value', n), { num: blank(r.ratio) ? 'no figure' : num(r.ratio), unit: 'after over before', tag: `(${leverText(r.before, m)} then ${leverText(r.after, m)})` });
  }
  return D.boards.lever.rows;
}
function paintCross(id) {
  const spec = D.boards[id];
  const { items, ticks } = V.crossings(spec.rows);
  for (const key of spec.rows) {
    const n = rowNodes.get(key);
    const c = items[key];
    if (!blank(c.x)) n.style.setProperty('--x', c.x.toFixed(4));
    $('.ladder-mark', n).hidden = blank(c.x);
    const hasRange = !blank(c.xlo) && c.xhi > c.xlo;
    if (hasRange) { n.style.setProperty('--lo', c.xlo.toFixed(4)); n.style.setProperty('--hi', c.xhi.toFixed(4)); } else { n.style.removeProperty('--lo'); n.style.removeProperty('--hi'); }
    $('.ladder-range', n).hidden = !hasRange;
    const orNever = !blank(c.value) && c.never.length > 0; // the same test as the value column's words
    n.classList.toggle('is-or-never', orNever);
    $('.x-or-never', n).hidden = !orNever;
    cell($('.ladder-value', n), V.crossWords(c, spec.noun));
  }
  axisInto($(`[data-board="${id}"]`), ticks);
  return spec.rows;
}
const allOf = (prefix, paint, current) => { // every board stays live, so print and a later switch never show stale rows
  let order;
  for (const id of Object.keys(D.boards)) if (id.startsWith(prefix)) { const o = paint(id); if (id === current) order = o; }
  return order;
};
const painters = {
  use: () => paintWall('use'),
  where: () => allOf('where.', paintWall, `where.${S.opts.workload}`),
  arch: () => allOf('arch.', paintWall, `arch.${S.opts.comparison}`),
  lever: paintLevers,
  cross: () => allOf('cross.', paintCross, `cross.${S.opts.crossover}`),
  catalog: () => { const hour = paintWall('catalog.hour'); const unit = paintRuler('catalog.unit'); return S.opts.scale === 'unit' ? unit : hour; }, // both stay live; the arrows step the view shown
};
function paintTables() {
  for (const [key, tr] of tableRows) {
    if (key === 'use.seat') tr.hidden = S.mode !== 'office';
    const fill = (c, text) => { const td = $(`[data-c="${c}"]`, tr); if (td) td.textContent = text; };
    const th = $('th', tr);
    if (th) th.textContent = V.label(key);
    if (key.startsWith('lever.')) for (const m of MS) { const r = V.lever(key, m); fill(m, `${leverText(r.before, m)} then ${leverText(r.after, m)}${blank(r.ratio) ? '' : `, ${num(r.ratio)}`}`); }
    else if (!key.startsWith('cross.')) { const t = V.table(key); for (const m of MS) fill(m, t[m]); }
  }
  for (const id of ['cross.prompts', 'cross.views']) {
    const { items } = V.crossings(D.boards[id].rows);
    for (const [key, c] of Object.entries(items)) { const td = $('[data-c="count"]', tableRows.get(key)); td.textContent = words(V.crossWords(c, D.boards[id].noun)); $('[data-c="ends"]', tableRows.get(key)).textContent = V.crossEnds(c); }
  }
}

// The detail zone reads the same on every plate: the energy large, then price, carbon, and water with their bases, then the sentence.
function detail(name, key) {
  const plate = plateOf(name);
  const d = (k) => $(`[data-d="${k}"]`, plate);
  const text = (k, v) => { const n = d(k); if (n) n.textContent = v; };
  const noteId = D.rows[key]?.note;
  const long = () => d('value').parentElement.classList.toggle('is-long', d('value').textContent.length >= 8);
  const big = (node, f) => { node.replaceChildren(el('span', '', f.num), ' ', el('span', 'x-big-unit', f.unit)); return node; };
  const readout = (r) => { text('value', r.value); text('unit', r.unit); text('qual', r.qual); text('reading', r.reading); };
  if (key.startsWith('lever.')) {
    const r = V.leverDetail(key, S.m);
    readout(r);
    d('lines').replaceChildren(...r.lines.map((line) => el('li', '', line)));
  } else if (key.startsWith('cross.')) {
    const r = V.crossDetail(key, D.boards[`cross.${S.opts.crossover}`].noun);
    readout(r);
    text('ends', r.ends);
  } else {
    const r = V.detailOf(key, S.m);
    readout(r);
    text('price', r.price); text('price-tag', r.priceTag); big(d('co2'), r.co2); text('co2-tag', r.co2Tag);
    d('water').replaceChildren(...(r.water.length ? r.water.map((w) => { const s = el('span', 'x-figure'); s.append(big(el('strong', 'x-big'), w), el('span', 'caption', w.tag)); return s; }) : [el('span', 'caption', 'No water figure: the record holds no generation water for this feed.')]));
    d('layers').replaceChildren(...r.layers.map((l) => { const li = el('li'); li.append(el('span', `plate-square w-key-${l.tag}${l.on ? '' : ' is-hollow'}`), el('strong', '', l.text), el('span', '', l.label)); return li; }));
    text('spread', r.spread); text('moves', r.moves);
    const tokens = d('tokens');
    if (tokens) tokens.hidden = !D.rows[key]?.ai;
  }
  long();
  const master = noteId && document.getElementById(noteId);
  const note = d('note');
  note.replaceChildren(...(master ? [...master.cloneNode(true).children] : []));
  if (Object.keys(D.sel).some((k) => S.settings[k] !== D.sel[k].def)) note.prepend(el('p', 'x-note-title', 'These notes describe the default settings.'));
  for (const chip of $$('.receipt', note)) { const id = chip.getAttribute('href').slice(5); chip.lastElementChild.textContent = `${id}, ${document.getElementById(`src-${id}`).dataset.short}`; }
  const receipt = d('receipt');
  receipt.hidden = true;
  receipt.replaceChildren();
  $$('.receipt, a.x-c', plate).forEach((c) => c.setAttribute('aria-expanded', false));
  d('sources').replaceChildren(...$$('.receipt', note).map((chip) => { const src = document.getElementById(chip.getAttribute('href').slice(1)).cloneNode(true); src.removeAttribute('id'); return src; }));
}
function selectRow(name, key) {
  S.sel[name] = key;
  const plate = plateOf(name);
  $$('.plate-plot [data-row]', plate).forEach((n) => {
    const hit = n.dataset.row === key;
    n.classList.toggle('is-on', hit);
    n.setAttribute('role', 'option');
    n.setAttribute('aria-selected', hit);
    if (hit) $('.plate-plot', plate).setAttribute('aria-activedescendant', n.id);
  });
  detail(name, key);
  reachSoon();
}
function paintWeek() {
  const w = V.week();
  const box = $('[data-d="week"]');
  $('[data-title="use"]').textContent = V.title();
  const line = (name, v) => { const n = $(`[data-w="${name}"]`, box); n.parentElement.hidden = !v; n.textContent = usd(v); };
  line('list', w.list);
  line('earned', w.earned);
  line('seat', w.seat);
  $('[data-w="g"]', box).textContent = plainFig(w.g, 'g');
  $('[data-w="grids"]', box).textContent = `${V.grids('catalog.video_hour')}, location-based`;
  for (const place of ['home', 'cloud']) {
    $(`[data-w="${place}"]`, box).textContent = w.noWater ? 'no figure for one feed' : plainFig(w.water[place], 'ml');
    $(`[data-w="${place}-tag"]`, box).textContent = V.basin(place);
  }
}
function refresh(reason) {
  if (reason === 'settings') { V.set(S); writeQuery(); }
  $$('.plate-status').forEach((n) => { n.textContent = ''; }); // what it reported is no longer the state
  const line = V.line();
  $$('[data-setting-line]').forEach((n) => { n.textContent = line; });
  $$('[data-setting-list]').forEach((n) => n.replaceChildren(...Object.keys(D.sel).map((name) => el('li', '', `${D.names[name]}: ${D.sel[name].say[S.settings[name]]}`))));
  $$('[data-if]').forEach((n) => { const [k, v] = n.dataset.if.split(':'); n.hidden = String(V.p[k]) !== v; });
  $$('[data-reading]').forEach((n) => { n.textContent = V.reading(n.dataset.reading); });
  $$('[data-group]').forEach((n) => { const [k, v] = n.dataset.group.split(':'); n.hidden = S.opts[k] !== v; });
  for (const [key, n] of rowNodes) if (D.rows[key]) $('.ladder-label', n).textContent = V.label(key);
  for (const name of Object.keys(painters)) {
    const order = painters[name]();
    shown[name] = order.filter((key) => !rowNodes.get(key).hidden);
    shown[name].forEach((key, i) => { const n = rowNodes.get(key); n.setAttribute('aria-posinset', i + 1); n.setAttribute('aria-setsize', shown[name].length); }); // rows sort by CSS order, so the count a reader hears must not come from the source order
    if (name === 'where') S.sel.where = `where.${S.opts.workload}.${S.sel.where.split('.').pop()}`;
    if (name === 'arch' && S.sel.arch !== picked && D.boards[`arch.${S.opts.comparison}`].scenario?.includes(S.sel.arch)) S.sel.arch = null; // a scenario is never the main comparison: only a reader's own click lands there
    if (!shown[name].includes(S.sel[name])) [S.sel[name]] = shown[name];
    selectRow(name, S.sel[name]);
  }
  $$('[data-pair-m]').forEach((n) => { n.hidden = n.dataset.pairM !== S.m; }); // one measure's pairs at a time, each with what reverses it
  $$('[data-admin-tie]').forEach((n) => { n.textContent = V.adminWords(); });
  paintWeek();
  paintTables();
  syncControls();
}
function syncControls() {
  $$('input[data-setting]').forEach((n) => { n.checked = S.settings[n.dataset.setting] === n.value; });
  $$('input[data-opt]').forEach((n) => { n.checked = (n.dataset.opt === 'm' ? S.m : n.dataset.opt === 'mode' ? S.mode : S.opts[n.dataset.opt]) === n.value; });
  $$('input[data-field]').forEach((n) => { if (document.activeElement !== n) n.value = n.dataset.field === 'seats' ? S.seats : S.fields[n.dataset.field]; });
  $$('input[data-input]').forEach((n) => { if (document.activeElement !== n) n.value = S.inputs[n.dataset.input] ?? D.inputs[n.dataset.input][0]; });
  $$('[data-office]').forEach((n) => { n.hidden = S.mode !== 'office'; });
}
const fieldDefault = (k) => (k === 'gb' && S.mode === 'office' ? D.inputs.seat_gb[0] : D.fields[k]);
// The address carries the global selectors and nothing else: never wage, tariff, office size, a project's load, or a typed number, so a shared link cannot carry a Nation's figures.
const LINKED = Object.keys(D.sel).filter((name) => name !== 'wage' && name !== 'tariff');
function writeQuery() {
  const q = new URLSearchParams();
  for (const name of LINKED) if (S.settings[name] !== D.sel[name].def) q.set(name, S.settings[name]);
  const text = q.toString();
  history.replaceState(null, '', `${text ? `?${text}` : location.pathname}${location.hash}`); // replace, never push: Back leaves the page, not a trail of radio clicks
}
function readQuery() { // a link is untrusted: only a named selector, only one of its own options
  const q = new URLSearchParams(location.search);
  for (const name of LINKED) S.settings[name] = Object.hasOwn(D.sel[name].opts, q.get(name) ?? '') ? q.get(name) : D.sel[name].def;
}
function selfCheck() {
  const run = new Run(D, null);
  const fails = [];
  let n = 0;
  for (const [key, want] of Object.entries(D.check)) {
    const row = V.at(run.tree, key);
    MS.forEach((m, i) => {
      if (blank(want[i])) return;
      n += 1;
      if (blank(row?.[m]) || Math.abs(row[m] - want[i]) > 0.005 * Math.abs(want[i])) fails.push(`${key} ${m}`);
    });
  }
  $$('[data-check]').forEach((box) => {
    box.hidden = false;
    box.classList.toggle('is-warn', fails.length > 0);
    box.textContent = fails.length ? `Warning: this page does not match the model at ${fails.slice(0, 3).join(', ')}${fails.length > 3 ? `, and ${fails.length - 3} more` : ''}. Do not rely on these figures.` : `Builder matches the model: ${grouped(n)} figures within 0.5 percent of the published file.`;
  });
}
// The drawer starts under the disclaimer band, so the plate compresses beside it and nothing the reader is watching is covered.
const placeDrawer = () => document.documentElement.style.setProperty('--drawer-top', `${Math.max(0, $('.x-band').getBoundingClientRect().bottom)}px`);
const drawerSaid = (open) => $$('[data-open-settings]').forEach((n) => { n.setAttribute('aria-controls', 'settings'); n.setAttribute('aria-expanded', open); });
function openDrawer(from) {
  const drawer = $('#settings');
  drawer.from = from;
  drawer.hidden = false;
  drawerSaid(true);
  document.documentElement.classList.add('has-drawer');
  placeDrawer();
  drawer.focus();
}
function closeDrawer() {
  const drawer = $('#settings');
  if (drawer.hidden) return;
  drawer.hidden = true;
  drawerSaid(false);
  document.documentElement.classList.remove('has-drawer');
  drawer.from?.focus();
}
function project() {
  const box = $('[data-plate-x="project"]');
  const read = (k) => { const n = $(`[data-pf="${k}"]`, box); return n.value === '' || !(+n.value >= 0) ? null : +n.value; };
  const r = projectScale(...['mw', 'lf', 'wue', 'grid', 'load'].map(read));
  const big = (v, unit) => (blank(v) ? '–' : `${grouped(Number(v.toPrecision(3)))} ${unit}`);
  const out = { mwh: big(r.mwh, 'MWh'), water: big(r.water, 'liters'), co2: big(r.co2, 'tonnes CO2e'), share: blank(r.share) ? '–' : `${num(r.share * 100)} percent` };
  for (const [k, v] of Object.entries(out)) $(`[data-po="${k}"]`, box).textContent = v;
  $('[data-project-hint]', box).hidden = !blank(r.mwh);
}
function outputsCsv() {
  const rows = [['row', 'measure', 'value', 'low', 'high', 'price_basis', 'settings']];
  const setting = Object.entries(S.settings).map(([k, v]) => `${k}=${v}`).join(' ');
  for (const key of Object.keys(D.check)) {
    const r = V.at(V.t, key);
    for (const m of ['wh', 'usd', 'g']) { const [lo, hi] = V.spread(key, m); rows.push([key, m, r[m], lo, hi, m === 'usd' ? V.basis(key) : '', setting]); }
    for (const part of V.water(key)) rows.push([key, `ml ${part.place}`, part.v, part.lo, part.hi, '', setting]);
  }
  return rows.map((r) => r.map((c) => (blank(c) ? '' : c)).join(',')).join('\n');
}
function setView(plate, name) {
  plate.dataset.view = name;
  $$('.plate-view', plate).forEach((n) => { n.hidden = n.dataset.view !== name; });
  $$('.plate-views input', plate).forEach((n) => { n.checked = n.value === name; });
  reachSoon();
}
async function copyReading(plate) {
  const reading = $('[data-d="reading"]', plate);
  const status = $('.plate-status', plate);
  const titles = $$('[data-d="note"] .receipt', plate).map((chip) => $('.plate-source-title', document.getElementById(chip.getAttribute('href').slice(1))).textContent);
  try {
    await navigator.clipboard.writeText(`${reading.textContent}\n${location.href}${titles.length ? `\nSources: ${[...new Set(titles)].join('; ')}` : ''}`);
    status.textContent = 'Copied with its link and sources.';
  } catch {
    getSelection().selectAllChildren(reading);
    status.textContent = 'Copy is blocked here. The Reading is selected: press Ctrl+C.';
  }
}
function closeReceipt(box) {
  const inside = box.contains(document.activeElement);
  box.hidden = true;
  box.replaceChildren();
  box.from?.setAttribute('aria-expanded', false);
  if (inside) box.from?.focus(); // back to the chip the reader came from
}
function openReceipt(chip) {
  const plate = chip.closest('.x-plate');
  const box = $('[data-d="receipt"]', plate);
  const id = chip.getAttribute('href').slice(1);
  const closing = box.dataset.open === id && !box.hidden;
  closeReceipt(box);
  if (closing) return;
  setView(plate, 'reading'); // a chip in the claim zone may be pressed from another view
  box.hidden = false;
  box.dataset.open = id;
  box.from = chip;
  box.replaceChildren(...document.getElementById(id).cloneNode(true).children);
  chip.setAttribute('aria-expanded', true);
  box.focus(); // it opens at the foot of the detail, often past the fold: the reader goes to it, and Escape comes back
}
function onInput(e) {
  const t = e.target;
  if (t.dataset.setting) { S.settings[t.dataset.setting] = t.value; refresh('settings'); }
  else if (t.dataset.opt === 'm') { S.m = t.value; refresh(); }
  else if (t.dataset.opt === 'mode') {
    const was = fieldDefault('gb');
    S.mode = t.value;
    if (S.fields.gb === was) S.fields.gb = fieldDefault('gb');
    refresh();
  } else if (t.dataset.opt) {
    S.opts[t.dataset.opt] = t.value;
    refresh();
    if (t.dataset.opt === 'waffle') $('[data-waffle-status]').textContent = $('.x-waffle:not([hidden]) figcaption strong').textContent; // no Reading on this plate says what changed
  } else if (t.dataset.field) {
    const seat = t.dataset.field === 'seats';
    const bad = t.value === '' || !(+t.value >= (seat ? 1 : 0));
    t.setAttribute('aria-invalid', bad);
    $('[data-why]').textContent = bad ? `Enter a number${seat ? ' of one or more' : ' zero or above'}. The Wall keeps the last good value.` : t.dataset.whyText;
    if (!bad) { if (seat) S.seats = +t.value; else S.fields[t.dataset.field] = +t.value; refresh(); }
  } else if (t.dataset.input) {
    const bad = t.value === '' || !(+t.value >= 0);
    t.setAttribute('aria-invalid', bad);
    $('[data-input-why]').textContent = bad ? 'Enter a number zero or above. The figures keep the last good value.' : '';
    if (!bad) { S.inputs[t.dataset.input] = +t.value; refresh('settings'); }
  } else if (t.dataset.pf) project();
}
function choose(plate, key) { // a reader's own selection: the figure they asked for shows at the top of the detail
  picked = key;
  setView(plate, 'reading');
  selectRow(plate.dataset.plateX, key);
  $('.plate-detail', plate).scrollTop = 0;
}
function onClick(e) {
  const t = e.target;
  const hit = (selector) => t.closest?.(selector);
  if (hit('[data-open-settings]')) { e.preventDefault(); openDrawer(hit('[data-open-settings]')); }
  else if (hit('[data-close-settings]')) closeDrawer();
  else if (hit('.x-plate .receipt, .x-plate a.x-c') && $('[data-d="receipt"]', hit('.x-plate'))) { e.preventDefault(); openReceipt(hit('.x-plate .receipt, .x-plate a.x-c')); }
  else if (hit('.plate-plot [data-row]')) choose(hit('.x-plate'), hit('[data-row]').dataset.row);
  else if (hit('[data-copy]')) copyReading(hit('.x-plate'));
  else if (hit('[data-reset]')) { Object.assign(S, V.fresh()); refresh('settings'); $('.plate-status', hit('.x-plate')).textContent = 'Back to the default settings.'; }
  else if (hit('[data-preset]')) { $(`[data-pf="${t.dataset.for}"]`).value = t.dataset.preset; project(); }
  else if (hit('[data-outputs]')) { const a = el('a'); a.href = URL.createObjectURL(new Blob([outputsCsv()], { type: 'text/csv' })); a.download = 'resource-model-outputs.csv'; a.click(); }
}
function wirePlot(plot) {
  const plate = plot.closest('.x-plate');
  const name = plate.dataset.plateX;
  plot.tabIndex = 0;
  plot.setAttribute('role', 'listbox');
  $$('ol, .wall-group', plot).forEach((n) => n.setAttribute('role', 'none'));
  $$('.wall-key', plot).forEach((n) => { n.setAttribute('aria-hidden', 'true'); n.removeAttribute('aria-label'); }); // a list box holds options; the key's words are in the detail's layer list
  on(plot, 'keydown', (e) => {
    const keys = shown[name];
    const i = keys.indexOf(S.sel[name]);
    const n = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: keys.length - 1, Enter: i, ' ': i }[e.key];
    if (n === undefined || e.altKey || e.ctrlKey || e.metaKey) return; // Alt+Left stays the browser's Back
    e.preventDefault();
    const key = keys[Math.max(0, Math.min(n, keys.length - 1))];
    choose(plate, key);
    rowNodes.get(key).scrollIntoView({ block: 'nearest' }); // the arrows are the keyboard's scroll here, so the row they reach must come into view
  });
  const holding = () => $$('[data-d="note"], [data-d="receipt"]', plate).some((n) => n.contains(document.activeElement)); // a preview rebuilds these, which would drop the keyboard's place
  on(plot, 'pointerover', (e) => { const row = e.target.closest('[data-row]'); if (row && !holding()) detail(name, row.dataset.row); });
  on(plot, 'pointerleave', () => { if (!holding()) detail(name, S.sel[name]); });
}
function fit() {
  if (innerWidth >= 1100) document.documentElement.style.setProperty('--plate-h', `${Math.round(Math.max(544, innerHeight - $('.x-band').getBoundingClientRect().bottom - scrollY - 24))}px`);
}
// The plate fills the window, so a longer zone is cut at its foot. A cut zone fades there, as on every plate (site.css), and takes a tab stop, so its text can be reached without a mouse; one that fits stays out of the tab order.
const zones = () => $$('.x-plate.is-live > :is(.plate-claim, .plate-detail, .plate-plot)');
function reachable() {
  for (const zone of zones()) {
    if (!zone.clientHeight) continue; // a hidden panel, measured when it shows
    zone.classList.toggle('has-more', zone.scrollTop + zone.clientHeight < zone.scrollHeight - 1);
    if (zone.matches('.x-plot')) continue; // the list box is always a stop
    if (zone.scrollHeight > zone.clientHeight + 1) zone.tabIndex = 0;
    else zone.removeAttribute('tabindex');
  }
}
let measuring = false;
const reachSoon = () => { if (!measuring) { measuring = true; requestAnimationFrame(() => { measuring = false; reachable(); }); } };

for (const n of $$('[data-js]')) n.hidden = false;
// The parts a default row does not show are made here, and each board's group heads, so the page without scripts carries no empty marks.
for (const n of $$('.wall-row')) {
  const track = $('.wall-track', n);
  for (const cls of [...TAGS.map((tag) => `w w-${tag}`), 'wall-range', 'wall-needle']) if (!$(`.${cls.split(' ').pop()}`, track)) { const part = el('i', cls); part.hidden = true; track.append(part); }
}
for (const n of $$('[data-board^="cross."] .ladder-row')) {
  if (!$('.x-or-never', n)) { const word = el('i', 'x-or-never', D.words.orNever); word.setAttribute('aria-hidden', 'true'); $('.ladder-track', n).append(word); }
}
for (const [id, spec] of Object.entries(D.boards)) {
  if (spec.kind !== 'wall' && spec.kind !== 'ruler') continue;
  const rows = $('ol', $(`[data-board="${id}"]`));
  const head = (text) => { const li = el('li', 'wall-group', text); li.hidden = true; rows.prepend(li); return li; };
  for (const [basis, text] of Object.entries(D.words.heads)) head(text).dataset.basis = basis;
  if (spec.scenario) head('Scenario: a declared feed, not the default').dataset.scenario = '';
}
document.documentElement.classList.add('x-live');
$('#settings').hidden = true;
drawerSaid(false);
$$('.x-plate.plate-fit').forEach((n) => n.classList.add('is-live'));
for (const zone of zones()) {
  if (!zone.matches('.x-plot')) {
    zone.setAttribute('role', 'group');
    zone.setAttribute('aria-label', zone.matches('.plate-claim') ? 'Finding and settings' : zone.matches('.plate-detail') ? 'Detail' : 'Plot');
  }
  on(zone, 'scroll', reachSoon);
  if (window.ResizeObserver) new ResizeObserver(reachSoon).observe(zone); // a panel showing, or the window moving
}
on(document, 'toggle', reachSoon, true);
$$('.x-plate').forEach((plate) => { if ($('.plate-views', plate)) setView(plate, 'reading'); });
$$('[data-d="tokens"]').forEach((slot) => slot.append(...$('#x-tokens').cloneNode(true).children));
readQuery();
on(document, 'input', onInput);
on(document, 'focusin', (e) => { if (e.target.dataset?.whyText) $('[data-why]').textContent = e.target.dataset.whyText; });
on(document, 'change', (e) => {
  if (e.target.dataset.field || e.target.dataset.input) { e.target.removeAttribute('aria-invalid'); syncControls(); }
  if (e.target.dataset.input) $('[data-input-why]').textContent = '';
  if (e.target.closest?.('.plate-views')) setView(e.target.closest('.x-plate'), e.target.value);
});
on(document, 'click', onClick);
on(document, 'keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('#settings').hidden) closeDrawer();
  else $$('[data-d="receipt"]:not([hidden])').forEach((box) => closeReceipt(box));
});
// Back within the page: the address holds the truth for the selectors, and with no hash the first tab shows, which plate.js does not do by itself.
on(window, 'popstate', () => {
  const was = JSON.stringify(S.settings);
  readQuery();
  if (JSON.stringify(S.settings) !== was) refresh('settings');
  window.dispatchEvent(new Event('hashchange')); // Chrome fires no hashchange when the query differs too, which would leave the tab behind the address
});
on(window, 'hashchange', () => { if (!location.hash) $('[role="tab"]').click(); });
$$('.x-plot').forEach(wirePlot);
let opened = [];
on(window, 'beforeprint', () => { opened = $$('details:not([open])'); opened.forEach((n) => { n.open = true; }); });
on(window, 'afterprint', () => opened.forEach((n) => { n.open = false; }));
on(window, 'resize', () => { fit(); placeDrawer(); });
on(window, 'scroll', () => { if (!$('#settings').hidden) placeDrawer(); });
document.fonts?.ready.then(fit);
fit();
refresh('settings');
selfCheck();
project();
if (location.hash === '#settings') openDrawer($('[data-open-settings]'));
}());
