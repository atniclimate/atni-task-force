// Resource Use Explorer: the page around the model, which is resource-model.js. Text by textContent only.
// Four question tabs (DIRECTION-R2, the Explorer): one page-wide measure and starting point in the scenario bar, Fine-tune as a modal, each plate with the kit's
// Chart and Table, evidence under its Reading, and a collar; every choice but a typed figure rides in the address.
(function () {
'use strict';
const { MS, TAGS, FEED, SCENARIO_WARNING, blank, Run, Views, projectScale, num, usd, pct, grouped, figure, words, leverText, plainFig, applyMeasured, readScenario, typedOk, typedWords, typedRange } = window.resourceModel;
const { address, conceal } = window.plate; // the kit's address in the fragment and its findable hiding

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const on = (node, type, fn, capture) => node.addEventListener(type, fn, capture);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (!blank(text)) n.textContent = text; return n; };
const D = JSON.parse($('#explorer-data').textContent);
const V = Views(D);
const S = V.fresh();
let V0start = null; // the model at its defaults: where a moved bar started; worked out the first time a figure has moved, so a cold load runs the model once (explorer-19)
const start = () => { if (!V0start) { V0start = Views(D); V0start.set(V0start.fresh()); } return V0start; };
window.explorer = { ...window.resourceModel, view: V, state: S, data: D };
const plateOf = (name) => $(`.x-plate[data-plate-x="${name}"]`);
const claimOf = (a) => a.getAttribute('href').split('#src-')[1]; // a receipt's link, sources/#src-ID: the page's receipts are on its Sources page (owner ruling 39)
// Every row's note is data (D.notes: title, lines, claims), so the page builds no nodes it may never show (explorer-19): the selected row's note is made
// here, as text, with each claim id in a line linked to its receipt. The Sources page prints them all.
const CLAIM_IN = /\b([a-z]{2,3}-\d{3})\b/; // validate_public.py CLAIM_ID
function noteOf(id) {
  const n = id && D.notes?.[id];
  if (!n) return null;
  const linked = (line) => line.split(CLAIM_IN).map((part, i) => (i % 2 && D.receipts[part] ? Object.assign(el('a', 'x-c', part), { href: `sources/#src-${part}` }) : part));
  const box = el('div', 'x-note');
  box.append(el('p', 'x-note-title', n.t), ...n.l.map((line) => { const p = el('p'); p.append(...linked(line)); return p; }));
  box.claims = n.c;
  return box;
}
const rowNodes = new Map($$('.plate-plot [data-row]').map((n) => [n.dataset.row, n]));
const tableRows = new Map($$('tr[data-tr]').map((n) => [n.dataset.tr, n]));
const shown = {}; // the keys a plate's arrows step through, in the order they stand
const layouts = {}; // each Wall's geometry as last drawn, for the needle's name
let picked = null; // the row the reader last chose
const views = {}; // each plate's view, chart or table
const MEASURE = { wh: 'Energy', g: 'CO2e', ml: 'Water', usd: 'Price' };
const PRESETS = { phone: { mode: 'person', device: 'phone' }, office: { mode: 'office', device: 'laptop' } }; // the brief's two starting points
const FIELD_TOP = { screen: 168 }; // a week has 168 hours (explorer-10)

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
const LEFT_TICK = / \S+, your side$/; // the zero at the wall and the head's arrows say the side, so a left tick is its figure (explorer-16); build_explorer.py axis_html writes the same
function axisInto(board, ticks, wall) {
  const axis = $('.wall-axis, .ladder-axis', board);
  const place = (n, t) => { n.style.setProperty('--x', t.x.toFixed(4)); return n; };
  const span = (t) => place(el('span', '', t.left ? t.t.replace(LEFT_TICK, '') : t.t), t);
  const left = $('.wall-axis-left', axis); // as wide as the left side, so a container query can drop its ticks when it is narrow
  left?.replaceChildren(...ticks.filter((t) => t.left).map(span), $('i', left));
  const zero = left && !blank(wall) ? [place(el('span', 'wall-zero', '0'), { x: wall })] : [];
  axis.replaceChildren(...(left ? [left] : []), ...zero, ...ticks.filter((t) => !t.left).map(span));
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
function byPhase(board, groups, keys, wordsOnly) { // a move row is one time and a year row is one year, so each stands under its own head and nothing reads as a sum
  let at = 0;
  return groups.flatMap((g) => {
    const head = $(`.wall-group[data-phase="${g.id}"]`, board);
    const here = keys.filter((key) => g.rows.includes(key));
    const kept = here.filter(V.keeps);
    head.hidden = !here.length;
    head.textContent = (kept.length && kept.every((key) => wordsOnly.includes(key)) && g.heads[`${S.m}_words`]) || g.heads[S.m]; // the head says once that its rows carry no bar
    head.style.order = at++;
    here.forEach((key) => { rowNodes.get(key).style.order = at++; });
    return here;
  });
}
// The starting point: a Wall row's figure at the model's defaults, drawn faint behind its bar once the reader has moved it, and said in its Reading. A price draws
// no bar, so it leaves none; water is said by basin, never summed.
const BOARD = new Map(Object.entries(D.boards).flatMap(([id, b]) => (b.kind === 'wall' ? b.rows.map((key) => [key, id]) : [])));
const said = (W, key, m) => (m === 'ml' ? W.water(key).map((w) => `${plainFig(w.v, 'ml')} (${D.words.basin[w.place] || 'basin not stated'})`).join(' and ') : plainFig(W.val(key, m), m));
const sameModel = () => S.mode === 'person' && !Object.keys(S.inputs).length && !Object.keys(S.measured).length && Object.keys(D.sel).every((k) => S.settings[k] === D.sel[k].def) && Object.keys(D.fields).every((k) => S.fields[k] === D.fields[k]);
const moved = (key, m = S.m) => m !== 'usd' && BOARD.has(key) && !sameModel() && start().boardKeys(BOARD.get(key), m).includes(key) && said(V, key, m) !== said(start(), key, m);
const crossDay = (key) => { // a crossover's count a year, in a day's terms (explorer-36): the same figure, divided by 365
  const c = V.run.crossover(key.slice(6));
  return blank(c.value) ? '' : ` That is about ${num(c.value / 365, 2)} ${D.boards[`cross.${S.opts.crossover}`].noun.replace(' a year', '')} a day.`;
};
const spoken = (key, r = detailFor(key)) => V.copied(`${r.reading}${key.startsWith('cross.') ? crossDay(key) : ''}${moved(key) ? ` From a starting point of ${said(start(), key, S.m)}.` : ''}`, key);
const rulerScale = (lay, m) => { // the Wall's scale, read off the first row it draws with a length
  for (const [k, item] of Object.entries(lay.items)) {
    const p = V.parts(k, m);
    if (p.net + p.dc > 0) return (item.end - lay.wall) / (p.net + p.dc);
    if (p.dev + p.rou > 0) return (lay.wall - item.dev[0]) / (p.dev + p.rou);
  }
  return 0;
};
function startMark(n, key, m, lay, sc, first) {
  const mark = $('.start-mark', n);
  const live = sc > 0 && !!lay.items[key] && moved(key, m);
  n.classList.toggle('has-start', live);
  if (!live) return;
  const p = start().parts(key, m);
  const [left, right] = [p.dev + p.rou, p.net + p.dc];
  const [from, to] = [lay.wall - left * sc, lay.wall + right * sc];
  mark.classList.toggle('is-left', !right && left > 0); // all on the reader's side: its end is the far left
  mark.classList.toggle('is-off', right ? to > 1 : from < 0);
  mark.classList.toggle('is-flip', right ? to > 0.7 : from < 0.3); // its name reads on from the end tick, and turns back only near the ruler's end
  mark.classList.toggle('is-below', first);
  mark.style.left = pct(Math.max(0, from));
  mark.style.width = pct(Math.min(1, to) - Math.max(0, from));
}
const feedGrid = (f) => (f === 'hydro' ? V.p.grid_hydro : V.p[FEED[f][0]]);
const oneGrid = (key) => (V.at(V.t, key).feeds || []).every((f) => feedGrid(f) === V.p.grid_local);
const ghostWords = (key) => { // the model's reason, to its first clause: the list under the plate keeps the whole sentence
  const r = D.custody.rows[key];
  const text = r.reason || D.custody.reasons[r.holder];
  const cut = text.search(/[,;.]/);
  return `${D.words.ghost}: ${text[0].toLowerCase()}${text.slice(1, cut < 0 ? undefined : cut)}`;
};

function paintWall(id) {
  const spec = D.boards[id];
  const board = $(`[data-board="${id}"]`);
  const { m } = S;
  const all = (m === 'usd' ? spec.price : m === 'wh' ? spec.energy : spec.grid) || spec.rows;
  const list = all.filter(V.keeps);
  const ghosts = all.filter((key) => !V.keeps(key)); // a row the custody rule removes keeps its place, faint and with no mark, so the plot keeps its shape and says where the row went
  const scenario = (m === 'g' || m === 'ml' ? spec.scenario || [] : []).filter(V.keeps);
  const visible = V.boardKeys(id, m);
  const drawn = [...all.filter((key) => visible.includes(key) || ghosts.includes(key)), ...visible.filter((key) => !all.includes(key))];
  const at = V.boardScale(id, m);
  let wordsOnly = id.startsWith('arch.') && (m === 'g' || m === 'ml') ? list.filter((key) => !oneGrid(key)) : []; // different grids: words, no bar
  if (list.length - wordsOnly.length < 2 && wordsOnly.length) wordsOnly = list; // one bar alone compares with nothing
  board.dataset.measure = m;
  for (const key of spec.rows) {
    const n = rowNodes.get(key);
    const ghost = ghosts.includes(key);
    n.hidden = !drawn.includes(key);
    n.classList.toggle('is-ghost', ghost);
    if (ghost) { n.setAttribute('aria-disabled', 'true'); n.removeAttribute('aria-posinset'); n.removeAttribute('aria-setsize'); } else n.removeAttribute('aria-disabled');
    n.style.order = '';
  }
  for (const head of $$('.wall-group', board)) { head.hidden = !(head.dataset.scenario !== undefined && scenario.length); head.style.order = ''; }
  let order = drawn;
  if (spec.groups) order = byPhase(board, spec.groups, drawn, wordsOnly);
  else if (m === 'usd' || (id === 'catalog.hour' && S.opts.sort === 'tag')) order = byBasis(board, drawn);
  else if (id === 'catalog.hour') order = bySize(drawn, m);
  for (const key of ghosts) {
    const n = rowNodes.get(key);
    n.classList.remove('is-beside', 'is-one-line');
    for (const tag of TAGS) seg($(`.w-${tag}`, n), null);
    $('.wall-range', n).hidden = true;
    $('.wall-needle', n).hidden = true;
    n.classList.remove('has-start');
    $('.ladder-value', n).replaceChildren(el('span', 'x-ghost-words', ghostWords(key)));
  }
  if (scenario.length) { $('.wall-group[data-scenario]', board).style.order = 5000; scenario.forEach((key, i) => { rowNodes.get(key).style.order = 5001 + i; }); }
  const lay = V.layout(m === 'usd' ? [] : visible.filter((key) => !wordsOnly.includes(key)), m, spec.plain, at);
  layouts[id] = { ...lay, at };
  board.style.setProperty('--wall', lay.wall.toFixed(4));
  const sc = rulerScale(lay, m);
  const top = order.find((key) => lay.items[key]); // the first row drawn: a starting point's name goes under its bar, where the plot's top would cut it
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
    startMark(n, key, m, lay, sc, key === top);
    const oneLine = id === 'arch.E' && m === 'usd' && key.startsWith('arch.E.move_'); // the group head names the move's price basis once, so the figure and its spread share a line
    n.classList.toggle('is-one-line', oneLine);
    const f = oneLine ? figure(V.val(key, 'usd'), ...V.spread(key, 'usd'), 'usd') : V.cell(key, m, at);
    const extra = wordsOnly.includes(key) && id !== 'arch.E' ? 'on another grid, no bar' : beside ? 'inside the seat figure; printed beside, not added' : ''; // E's group head says it once
    cell($('.ladder-value', n), { ...f, tag: [f.tag, extra].filter(Boolean).join(' ') });
  }
  axisInto(board, lay.ticks, spec.plain ? null : lay.wall);
  $('.wall-off', board).hidden = !visible.some((key) => lay.items[key]?.range?.[2]); // the ruler says so once; each row prints its whole spread
  const note = $('.wall-gridnote', board);
  if (note) {
    note.hidden = !wordsOnly.length;
    note.textContent = wordsOnly.length ? `Rows on different grids carry no bar: ${[...new Set(wordsOnly.map(V.grids))].join(' against ')}, and the local grid is ${V.p.grid_local} g per kWh. Set them to one feed in Fine-tune to draw them.` : '';
  }
  return [...order.filter((key) => !scenario.includes(key) && !ghosts.includes(key)), ...scenario]; // the arrows step past a ghost
}
// The needle's name (explorer-17): the selected row's figure, over the plot where the needle stands, read away from the near end. A price draws no needle.
function nameNeedle(key) {
  const id = BOARD.get(key);
  const board = id && $(`[data-board="${id}"]`);
  const label = board && $('.wall-needle-label', board);
  if (!label) return;
  const item = layouts[id]?.items[key];
  label.hidden = !item || S.m === 'usd' || !V.keeps(key);
  if (label.hidden) return;
  const f = V.cell(key, S.m, layouts[id].at);
  label.textContent = [f.num, f.unit].filter(Boolean).join(' ');
  label.style.setProperty('--x', item.end.toFixed(4));
  label.classList.toggle('is-flip', item.end > 0.7);
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
    cell($('.ladder-value', n), V.cell(key, m, at));
  }
  axisInto(board, lay.ticks);
  return order;
}
// A lever in words (explorer-18): after as a share of before, then the two figures, from before to after. build_explorer.py lever_value writes the same.
const leverCell = (r, m) => (blank(r.ratio) ? { num: 'no figure', unit: '', tag: `(${leverText(r.before, m)} then ${leverText(r.after, m)})` }
  : { num: num(r.ratio * 100), unit: 'percent of before', tag: `(${leverText(r.before, m)} to ${leverText(r.after, m)})` });
const LEVER_TOP = 1.25; // every lever on one scale, 0 to 125 percent of before; build_explorer.py LEVER_TOP is the same
function paintLevers() {
  const { m } = S;
  for (const key of D.boards.lever.rows) {
    const n = rowNodes.get(key);
    const r = V.lever(key, m);
    const has = !blank(r.ratio);
    const bar = $('.ladder-bar', n);
    bar.hidden = !has; // no figures, no bar
    if (has) n.style.setProperty('--x', (Math.min(r.ratio, LEVER_TOP) / LEVER_TOP).toFixed(4)); else n.style.removeProperty('--x');
    n.classList.toggle('is-up', has && r.ratio > 1);
    n.classList.toggle('is-off', has && r.ratio > LEVER_TOP);
    bar.classList.toggle('is-hollow', has && r.ratio > 1); // more than before: outlined, past the line
    cell($('.ladder-value', n), leverCell(r, m));
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
const painters = {
  use: () => paintWall('use'),
  where: () => paintWall(`where.${S.opts.workload}`),
  arch: () => paintWall(`arch.${S.opts.comparison}`),
  lever: paintLevers,
  cross: () => paintCross(`cross.${S.opts.crossover}`),
  catalog: () => (S.opts.scale === 'unit' ? paintRuler('catalog.unit') : paintWall('catalog.hour')), // the view shown; a switch redraws the other
};
const measuredTag = (key) => (V.isMoved(key) ? [el('span', 'x-measured-tag', D.measured.label)] : []); // the label comes from the model, on every row a reading moved
// A Table's foot: the grid and water factors its shown rows' CO2e and water read at these settings, each with its claim and status. build_explorer.py
// factors_foot writes the same at the defaults.
const FACTOR_HEADS = [['g', 'For the CO2e column, the grid factors: '], ['ml', 'For the water column, the water factors: ']];
function claimLink(id) {
  const r = D.receipts[id];
  const span = el('span', 'x-claim');
  const a = el('a', '', id);
  a.href = `sources/#src-${id}`;
  a.dataset.claim = id;
  span.append(glyph(r?.status), a, ` ${STATUS[r?.status === 'partly' ? 'partly' : 'verified']}`);
  return span;
}
const joined = (ids) => ids.flatMap((id, i) => (i ? ['; ', claimLink(id)] : [claimLink(id)]));
function factorsInto(td) {
  const keys = $$('tbody tr[data-tr]', td.closest('table')).filter((tr) => !tr.hidden && !tr.classList.contains('is-ghost')).map((tr) => tr.dataset.tr);
  const f = keys.map(V.factorClaims);
  td.replaceChildren(...FACTOR_HEADS.map(([m, head]) => [head, [...new Set(f.flatMap((x) => x[m]))].filter((id) => D.receipts[id])]).filter(([, ids]) => ids.length)
    .map(([head, ids]) => { const s = el('span', 'x-claim-for', head); s.append(...joined(ids), '.'); return s; }));
}
function paintTables(live) {
  const dmg = S.damage !== 'off';
  for (const [key, tr] of tableRows) {
    if (!live.has(tr.closest('.x-plate')?.dataset.plateX)) continue;
    if (key === 'use.seat') tr.hidden = S.mode !== 'office';
    const gone = key.startsWith('arch.') && !V.keeps(key); // as on the plot: the row stays, with its reason and no figure
    tr.classList.toggle('is-ghost', gone);
    const fill = (c, text) => { const td = $(`[data-c="${c}"]`, tr); if (td) td.textContent = text; };
    const th = $('th', tr);
    if (th) th.replaceChildren(V.label(key), ...measuredTag(key));
    if (key.startsWith('lever.')) for (const m of MS) { const r = V.lever(key, m); fill(m, `${leverText(r.before, m)} then ${leverText(r.after, m)}${blank(r.ratio) ? '' : `, ${num(r.ratio)}`}`); }
    else if (gone) MS.forEach((m, i) => fill(m, i ? '' : ghostWords(key)));
    else if (!key.startsWith('cross.')) { const t = V.table(key); for (const m of MS) fill(m, t[m]); }
    const td = $('td[data-c="damage"]', tr);
    if (td && dmg) td.textContent = gone ? '' : V.damageFig(V.damage(key));
  }
  for (const td of $$('td[data-factors]')) if (live.has(td.closest('.x-plate')?.dataset.plateX)) factorsInto(td); // a grid or water setting changes which factor's claim stands behind CO2e and water
  if (live.has('cross')) {
    for (const id of ['cross.prompts', 'cross.views']) {
      const { items } = V.crossings(D.boards[id].rows);
      for (const [key, c] of Object.entries(items)) { const td = $('[data-c="count"]', tableRows.get(key)); td.textContent = words(V.crossWords(c, D.boards[id].noun)); $('[data-c="ends"]', tableRows.get(key)).textContent = V.crossEnds(c); }
    }
  }
  $$('[data-damage-col]').forEach((n) => { n.hidden = !dmg; });
  if (!dmg) return;
  const c = V.damageOf(1); // the family's own words, its head among them, so an avoidance cost never reads as a damage; the figure is each row's
  $$('th[data-damage-col]').forEach((th) => { th.textContent = `${c.head}, ${V.damageCurrency(c)}`; });
  $$('caption [data-damage-col]').forEach((n) => { n.textContent = ` ${c.head} column: ${c.family}, ${c.kind}; ${c.column}, as of ${c.as_of}.`; });
}
// What the custody rule leaves out, always listed under the plate with its reason, and what the rule costs. The chosen comparison's block, as print shows it.
function custodyBlock(letter) {
  const c = V.custody(letter);
  const block = el('div', 'x-custody-block');
  block.dataset.group = `comparison:${letter}`;
  block.hidden = S.opts.comparison !== letter;
  if (!c.left.length) { block.append(el('p', 'caption', `${D.custody.label}: ${c.label}. No row leaves this comparison at this setting.`)); return block; }
  block.append(el('h3', 'x-custody-title', 'What This Rule Leaves Out'), el('p', 'caption', `${D.comparisons[letter]}. ${D.custody.label}: ${c.label}.`));
  const named = (rows, text) => { const ul = el('ul', 'x-named'); ul.append(...rows.map((r) => { const li = el('li'); li.append(el('strong', '', `${r.label}.`), ` ${text(r)}`); return li; })); return ul; };
  const leaves = el('div');
  leaves.append(el('p', 'label', D.words.leaves), named(c.left, (r) => `${r.figures}. ${r.reason}`));
  if (c.notes.length) leaves.append(el('p', 'label', 'Rows that stay, with a note'), named(c.notes, (r) => r.note));
  const costs = el('div');
  if (c.cost) {
    const table = el('table', 'data-table x-custody-cost');
    const head = el('tr');
    head.append(...['Line', 'Rows that stay', 'Rows that leave'].map((t) => { const th = el('th', '', t); th.scope = 'col'; return th; }));
    const body = el('tbody');
    body.append(...c.cost.map((line) => { const tr = el('tr'); const th = el('th', '', line.label); th.scope = 'row'; tr.append(th, el('td', '', line.kept), el('td', '', line.left)); return tr; }));
    const thead = el('thead');
    thead.append(head);
    table.append(el('caption', '', 'What the rule costs, at these settings'), thead, body);
    const scroll = el('div', 'table-scroll');
    Object.entries({ tabindex: 0, role: 'group', 'aria-label': 'Table, scrolls sideways' }).forEach(([k, v]) => scroll.setAttribute(k, v));
    scroll.append(table);
    costs.append(scroll);
  }
  for (const text of [c.said, c.oneTime]) if (text) costs.append(el('p', 'caption', text));
  const grid = el('div', 'x-custody-grid');
  grid.append(leaves, costs);
  block.append(grid);
  return block;
}
function paintCustody() {
  const box = $('.x-custody');
  box.dataset.rule = S.custody;
  box.replaceChildren(...Object.keys(D.comparisons).map(custodyBlock));
  const left = V.custody(S.opts.comparison).left.length;
  $('[data-custody-now]').textContent = !left ? '' : `${left} ${left === 1 ? 'row leaves' : 'rows leave'} this comparison at this setting. ${left === 1 ? 'It stays faint on the plot, and is' : 'Each stays faint on the plot, and is'} listed under the plate with its reason.`;
}
// The one sentence a reading carries, at the foot of every plate of rows, and whether this plate holds a row it moved.
function paintMeasured(live) {
  const line = V.measuredLine();
  for (const name of Object.keys(painters)) {
    if (!live.has(name)) continue;
    const plate = plateOf(name);
    const foot = $('[data-measured-line]', plate);
    foot.hidden = !line;
    foot.textContent = !line ? '' : $$('.plate-plot [data-row]', plate).some((n) => V.isMoved(n.dataset.row)) ? line : `${V.measuredLine(false)} No row on this plate uses it.`;
  }
  $('[data-clear-measured]').hidden = !line;
}
const damageNodes = (key) => {
  const c = V.damage(key);
  if (!c) return [];
  const family = D.carbon_damage.families[S.damage];
  const note = el('p', 'caption', `${c.kind.startsWith('avoidance') ? 'Not a price. ' : ''}${c.family}. ${c.kind}. ${family.spread} ${family.limit} `);
  for (const [i, id] of c.claims.entries()) { const a = el('a', 'x-c', id); a.href = `sources/#src-${id}`; note.append(...(i ? [', ', a] : [a])); }
  return [el('p', 'x-damage-head', `${c.column}, as of ${c.as_of}`), el('p', 'x-damage-figures', V.damageWords(c)), note];
};

// What moves it most: each input with a stated range set to its low end and to its high end, the others held where the reader has them, by the model's own
// drivers; the five that move the figure most, in the measure shown, water basin by basin. scripts/explorer_static.js prints the same rows at the defaults.
function movesOf(key, m) {
  const r = V.at(V.t, key);
  const k = V.count(key);
  const places = m === 'ml' && r?.ml_by_place ? Object.keys(r.ml_by_place).sort() : [null];
  const top = places.flatMap((place) => {
    const of = (t) => { const x = V.at(t, key); return place ? x?.ml_by_place?.[place] : x?.[m]; };
    const v = of(V.t);
    return blank(v) ? [] : V.run.drivers(of).filter((e) => e.type === 'input').map((e) => ({ ...e, place, v: v * k, a: e.at_low * k, b: e.at_high * k }));
  }).sort((x, y) => y.swing - x.swing).map((e) => ({ ...e, f: figure(e.v, e.a, e.b, m) })).filter((e) => e.f.tag).slice(0, 5); // ends that print alike move nothing a reader sees
  const all = top.flatMap((e) => [e.a, e.b, e.v]);
  const [lo, hi] = [Math.min(...all), Math.max(...all)];
  const x = (v) => ((v - lo) / (hi - lo || 1)).toFixed(4);
  return top.map((e) => {
    const [a, b] = [Math.min(e.a, e.b), Math.max(e.a, e.b)];
    const name = D.names[e.name] || e.name;
    return {
      name: `${name[0].toUpperCase()}${name.slice(1)}${places.length > 1 ? `, ${D.words.basin[e.place] || 'basin not stated'}` : ''}`,
      ends: `${e.f.tag.slice(1, -1)}${e.f.unit ? ` ${e.f.unit}` : ''}`, claims: D.input_claims[e.name] || [], l: x(a), c: x(Math.min(b, Math.max(a, e.v))), h: x(b), z: x(e.v),
    };
  });
}
function movesInto(body, key) { // a table, so its rows read as rows; the bar under each figure is the same figure drawn, and aria-hidden; the claims have their own column
  const rows = movesOf(key, S.m);
  const none = el('tr');
  none.append(Object.assign(el('td', '', 'No input\'s stated range moves this figure at these settings.'), { colSpan: 3 }));
  body.replaceChildren(...(rows.length ? rows.map((r) => {
    const tr = el('tr');
    Object.entries({ '--l': r.l, '--c': r.c, '--h': r.h, '--z': r.z }).forEach(([name, v]) => tr.style.setProperty(name, v));
    const th = el('th', '', r.name);
    th.scope = 'row';
    const bar = el('span', 'plate-driver-bar');
    bar.setAttribute('aria-hidden', 'true');
    bar.append(el('i'));
    const ids = el('span', 'caption', r.claims.length ? '' : 'no source, an assumption');
    ids.append(...r.claims.flatMap((id, i) => { const a = el('a', 'x-c', id); a.href = `sources/#src-${id}`; return i ? [', ', a] : [a]; }));
    const td = el('td', '', r.ends);
    td.append(bar);
    const from = el('td');
    from.append(ids);
    tr.append(th, td, from);
    return tr;
  }) : [none]));
}

const priceWord = (key) => (blank(V.val(key, 'usd')) ? D.rows[key].pn || D.words.price.none : D.rows[key].pt || D.words.price[V.basis(key)]);
const basinWord = (tag) => tag.slice(0, tag.lastIndexOf(',')); // the model writes "basin, convention", and a convention has no comma

// The window reads the same on every plate: the measure, the energy large, then price, carbon, and water at their bases, then the sentence, then the selected row's
// evidence. How it is modeled folds up; each receipt's quote and boundary are on the Sources page.
const leverDetail = (key) => { // a lever's readout in the row's words: after as a share of before
  const r = V.leverDetail(key, S.m);
  const f = leverCell(V.lever(key, S.m), S.m);
  return { ...r, value: f.num, unit: f.unit ? 'percent' : '', qual: `${f.unit ? 'of before, ' : ''}${D.words.measure[S.m]}` };
};
const detailFor = (key) => (key.startsWith('lever.') ? leverDetail(key) : key.startsWith('cross.') ? V.crossDetail(key, D.boards[`cross.${S.opts.crossover}`].noun) : V.detailOf(key, S.m));
const STATUS = { verified: 'verified', partly: 'partly verified' };
const glyph = (status) => { const s = el('span', status === 'partly' ? 'st st-p' : 'st st-v'); s.setAttribute('aria-hidden', 'true'); return s; };
// Under the Reading, as the kit's evidence line: the selected row's claims counted by status, then one chip per publisher, each opening its card here.
function evidenceInto(box, ids, receiptId) {
  const groups = new Map();
  const tally = { verified: 0, partly: 0 };
  for (const id of ids) {
    const r = D.receipts[id];
    if (!r) continue;
    tally[r.status === 'partly' ? 'partly' : 'verified'] += 1;
    groups.set(r.short, [...(groups.get(r.short) || []), id]);
  }
  const counts = Object.entries(tally).filter(([, n]) => n).map(([status, n]) => { const s = el('span', 'plate-evidence-count'); s.append(glyph(status), `${n} ${STATUS[status]}`); return s; });
  const chips = [...groups].map(([publisher, list]) => {
    const b = el('button', 'receipt');
    b.type = 'button';
    Object.entries({ 'data-claims': list.join(' '), 'aria-expanded': 'false', 'aria-controls': receiptId }).forEach(([k, v]) => b.setAttribute(k, v));
    b.append(glyph(list.some((id) => D.receipts[id].status === 'partly') ? 'partly' : 'verified'), `${publisher}${list.length > 1 ? `, ${list.length}` : ''}`);
    return b;
  });
  if (!counts.length) { box.replaceChildren(); return; }
  const line = el('p', 'plate-evidence-line');
  counts.forEach((n, i) => line.append(...(i ? [' ', n] : [n])));
  const row = el('div', 'plate-chips');
  row.append(...chips);
  box.replaceChildren(line, row);
}
function detail(name, key) {
  const plate = plateOf(name);
  const d = (k) => $(`[data-d="${k}"]`, plate);
  const text = (k, v) => { const n = d(k); if (n) n.textContent = v; };
  const noteId = D.rows[key]?.note;
  const long = () => d('value').parentElement.classList.toggle('is-long', d('value').textContent.length >= 9);
  const big = (node, f) => { node.replaceChildren(el('span', '', f.num), ' ', el('span', 'x-big-unit', f.unit)); return node; };
  const r = detailFor(key);
  text('value', r.value); text('unit', r.unit); text('qual', r.qual); window.plate.readingInto(d('reading'), spoken(key, r), r.value);
  if (key.startsWith('lever.')) d('lines').replaceChildren(...r.lines.map((line) => el('li', '', line)));
  else if (key.startsWith('cross.')) text('ends', r.ends);
  else {
    if (d('energy')) big(d('energy'), r.energy);
    $$('[data-fig]', plate).forEach((n) => { n.hidden = n.dataset.fig === S.m; }); // the readout shows the page-wide measure; the small figures, the other three
    text('price', r.price); text('price-word', priceWord(key)); text('price-tag', r.priceTag); big(d('co2'), r.co2); text('co2-tag', r.co2Tag);
    d('water').replaceChildren(...(r.water.length ? r.water.map((w) => { const s = el('span', 'x-figure'); s.append(big(el('strong', 'x-big'), w), el('span', 'caption', basinWord(w.tag))); return s; }) : [el('span', 'caption', 'No water figure: the record holds no generation water for this feed.')]));
    text('water-basis', r.water.map((w) => w.tag).join('; ') || 'no figure');
    d('layers').replaceChildren(...r.layers.map((l) => { const li = el('li'); li.append(el('span', `plate-square w-key-${l.tag}${l.on ? '' : ' is-hollow'}`), el('strong', '', l.text), el('span', '', l.label)); return li; }));
    text('spread', r.spread); movesInto(d('moves'), key);
    const hours = d('hours');
    if (hours) { // a move's paid hours stand with its figures, since the comparison's title is about them
      const h = key.startsWith('arch.E.move_') ? V.t.upkeep.E[key.split('.').pop()].admin_h : null;
      hours.hidden = blank(h);
      if (!blank(h)) big(d('hours-n'), { num: num(h), unit: h === 1 ? 'hour' : 'hours' });
    }
    const payback = $('[data-payback-line]', plate);
    if (payback && key.startsWith('arch.E.')) payback.textContent = V.paybackLine(key.endsWith('_federated') ? 'federated' : 'node');
    const tokens = d('tokens');
    if (tokens) tokens.hidden = !D.rows[key]?.ai;
    const damage = d('damage');
    damage.replaceChildren(...damageNodes(key));
    damage.hidden = !damage.children.length;
  }
  long();
  const master = noteOf(noteId);
  const note = d('note');
  note.replaceChildren(...(master ? master.children : []));
  if (Object.keys(D.sel).some((k) => S.settings[k] !== D.sel[k].def)) note.prepend(el('p', 'x-note-title', 'These notes describe the default settings.'));
  const receipt = d('receipt');
  const f = V.factorClaims(key); // the window prints CO2e and water whatever the measure, so their factors' claims join the row's own (explorer-03 hard line)
  evidenceInto(d('chips'), [...new Set([...(master?.claims || []), ...f.g, ...f.ml])], receipt.id);
  receipt.hidden = true;
  receipt.replaceChildren();
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
  nameNeedle(key);
  detail(name, key);
}
// Each tab's answer to its question, in the measure and at the settings shown (V.answer); the proposal's, from its fields.
function paintAnswers(live) {
  for (const tab of ['use', 'where', 'savings']) {
    const node = $(`[data-answer-x="${tab}"]`);
    if (node && !node.closest('[hidden]')) node.textContent = V.answer(tab);
  }
  if (!live.has('use')) return;
  const w = V.week();
  const box = $('[data-d="week"]');
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
// The plates on the open tab draw now; the rest wait until their tab opens, so a change costs one tab's redraw (explorer-19).
const isLive = (name) => !plateOf(name).closest('[hidden]:not(.plate-view)');
let stale = new Set();
function refresh(reason) {
  if (reason === 'settings') V.set(S);
  $$('.plate-status').forEach((n) => { n.textContent = ''; }); // what it reported is no longer the state
  const [line, bar] = [V.line(), V.line(D.bar)]; // the bar names fewer settings (explorer-35); each plate's line, for print, names them all
  $$('[data-setting-line]').forEach((n) => { n.textContent = n.dataset.settingLine === 'bar' ? bar : line; });
  barLine();
  $('[data-mode-word]').textContent = S.mode === 'office' ? `An office of ${grouped(S.seats)} seats` : 'One person';
  const also = [S.custody !== D.custody.default && `${D.custody.label}: ${D.custody.options[S.custody].label}`, S.damage !== 'off' && `${D.carbon_damage.label}: ${D.carbon_damage.families[S.damage].label}`, ...Object.entries(S.inputs).map(([k, v]) => `${D.names[k]}, typed: ${v}`)].filter(Boolean);
  $$('[data-setting-list]').forEach((n) => n.replaceChildren(...[...Object.keys(D.sel).map((name) => `${D.names[name]}: ${D.sel[name].say[S.settings[name]]}`), ...also].map((text) => el('li', '', text))));
  $$('[data-if]').forEach((n) => { const [k, v] = n.dataset.if.split(':'); n.hidden = String(V.p[k]) !== v; });
  $$('[data-group]').forEach((n) => { const [k, v] = n.dataset.group.split(':'); n.hidden = S.opts[k] !== v; });
  // Figures beside the rows and paybacks spread every input, so only those shown are worked out; a tab that opens redraws its own (explorer-19).
  const shownNow = (n) => !n.closest('[role="tabpanel"]')?.hidden && !n.closest('[data-group][hidden]'); // a Table out of view still counts: pressing it redraws nothing
  $$('[data-reading]').filter(shownNow).forEach((n) => { n.textContent = V.reading(n.dataset.reading); });
  $$('[data-payback]').filter(shownNow).forEach((n) => { n.textContent = V.payback(n.dataset.payback); });
  const live = new Set(Object.keys(painters).filter(isLive));
  stale = new Set(Object.keys(painters).filter((name) => !live.has(name)));
  for (const [key, n] of rowNodes) if (D.rows[key] && live.has(n.closest('.x-plate').dataset.plateX)) { const tag = V.rowTag(key); $('.ladder-label', n).replaceChildren(V.label(key), ...(tag ? [el('span', 'ladder-tag', tag)] : []), ...measuredTag(key)); }
  for (const name of live) paintPlate(name);
  $$('[data-pair-m]').forEach((n) => { n.hidden = n.dataset.pairM !== S.m; }); // one measure's pairs at a time, each with what reverses it
  $$('[data-admin-tie]').forEach((n) => { n.textContent = V.adminWords(); });
  paintAnswers(live);
  paintTables(live);
  if (live.has('arch')) paintCustody();
  paintMeasured(live);
  syncControls();
  writeQuery(); // after the redraw, so the address can never stop one
}
function paintPlate(name) {
  const order = painters[name]();
  shown[name] = order.filter((key) => !rowNodes.get(key).hidden);
  shown[name].forEach((key, i) => { const n = rowNodes.get(key); n.setAttribute('aria-posinset', i + 1); n.setAttribute('aria-setsize', shown[name].length); }); // rows sort by CSS order, so the count a reader hears must not come from the source order
  if (name === 'where') S.sel.where = `where.${S.opts.workload}.${S.sel.where.split('.').pop()}`;
  if (name === 'arch' && S.sel.arch !== picked && D.boards[`arch.${S.opts.comparison}`].scenario?.includes(S.sel.arch)) S.sel.arch = null; // a scenario is never the main comparison: only a reader's own click lands there
  if (name === 'lever' && !picked0.lever) S.sel.lever = V.bestLever(S.m) ?? S.sel.lever; // until the reader chooses, Savings selects the row its answer names
  if (!shown[name].includes(S.sel[name])) [S.sel[name]] = shown[name];
  selectRow(name, S.sel[name]);
}
function barLine() { // A proposal reads only its own fields, so the bar says so on its tab, where the settings line would mislead (explorer-35)
  const proposal = !$('#proposal')?.hidden;
  const line = $('[data-bar-line]');
  if (line.hidden === proposal) return; // only a change writes: the observer that calls this watches hidden
  line.hidden = proposal;
  $('[data-proposal-line]').hidden = !proposal;
}
// A tab that opens draws the plates that waited (the kit's tabs conceal and reveal the panels).
function wake() {
  barLine();
  const now = [...stale].filter(isLive);
  if (!now.length) return;
  now.forEach((name) => stale.delete(name));
  refresh();
}
const changed = () => S.m !== 'wh' || S.mode !== 'person' || S.custody !== D.custody.default || S.damage !== 'off' || Object.keys(S.inputs).length > 0 || Object.keys(S.measured).length > 0
  || Object.keys(D.sel).some((k) => S.settings[k] !== D.sel[k].def) || Object.entries(D.fields).some(([k, v]) => S.fields[k] !== v && !(k === 'gb' && S.mode === 'office')) || S.seats !== D.scenario.office_users;
function syncControls() {
  $$('input[data-setting]').forEach((n) => { n.checked = S.settings[n.dataset.setting] === n.value; });
  $$('input[data-opt]').forEach((n) => { n.checked = (n.dataset.opt === 'm' ? S.m : n.dataset.opt === 'mode' ? S.mode : S.opts[n.dataset.opt]) === n.value; });
  $$('input[data-field]').forEach((n) => { if (document.activeElement !== n && n.getAttribute('aria-invalid') !== 'true') n.value = n.dataset.field === 'seats' ? S.seats : S.fields[n.dataset.field]; });
  $$('input[data-input]').forEach((n) => { if (document.activeElement !== n) n.value = S.inputs[n.dataset.input] ?? D.inputs[n.dataset.input]?.[0] ?? D.scenario[n.dataset.input]; });
  $$('input[data-measured]').forEach((n) => { if (document.activeElement !== n) n.value = S.measured[n.dataset.measured] ?? ''; });
  $$('input[data-custody]').forEach((n) => { n.checked = S.custody === n.value; });
  $$('select[data-damage]').forEach((n) => { n.value = S.damage; });
  $$('[data-office]').forEach((n) => { n.hidden = S.mode !== 'office'; });
  $$('[data-preset-x]').forEach((n) => { const p = PRESETS[n.dataset.presetX]; n.setAttribute('aria-pressed', String(S.mode === p.mode && S.settings.device === p.device)); });
  $$('[data-measure-word]').forEach((n) => { n.textContent = MEASURE[S.m]; });
  const moves = changed();
  $$('.x-plate [data-reset]').forEach((n) => { if (!n.closest('[data-plate-x="project"]')) n.hidden = !moves; });
}
const fieldDefault = (k) => (k === 'gb' && S.mode === 'office' ? D.inputs.seat_gb[0] : D.fields[k]);
// The address (DIRECTION-R2 3.8): the measure, the starting point, the global selectors, each plate's switches, what each plate shows and which row it has chosen,
// the custody rule, and the damage layer. Never wage, tariff, office size, a project's load, or a typed number, so a shared link cannot carry a Nation's figures.
// They ride in the fragment, after the tab, so not even a menu choice reaches the server.
const LINKED = Object.keys(D.sel).filter((name) => name !== 'wage' && name !== 'tariff');
const PLATES = $$('.x-plate[data-plate-x]').filter((p) => p.id && Object.hasOwn(painters, p.dataset.plateX)).map((p) => [p.dataset.plateX, p.id]);
const VIEWED = $$('.x-plate').filter((p) => $('.plate-views', p)).map((p) => p.id);
const OPTS = Object.keys(V.fresh().opts);
let addressTimer; // a quarter second after the last change, and a throttled replaceState is let go
function writeQuery() {
  clearTimeout(addressTimer);
  addressTimer = setTimeout(flushQuery, 250);
}
function flushQuery(now) { // Copy reading and a jump within the page write it at once, so the address carries what is shown
  if (!addressTimer && !now) return;
  clearTimeout(addressTimer);
  addressTimer = 0;
  const fresh = V.fresh();
  const q = new URLSearchParams(); // what it did not read, it drops
  if (S.m !== fresh.m) q.set('m', S.m);
  if (S.mode === 'office') q.set('preset', 'office');
  for (const name of LINKED) if (S.settings[name] !== D.sel[name].def) q.set(name, S.settings[name]);
  for (const name of OPTS) if (S.opts[name] !== fresh.opts[name]) q.set(name, S.opts[name]);
  if (S.custody !== D.custody.default) q.set('custody', S.custody);
  if (S.damage !== 'off') q.set('damage', S.damage);
  for (const [name, id] of PLATES) if (S.sel[name] && S.sel[name] !== fresh.sel[name] && S.sel[name] === picked0[name]) q.set(id, S.sel[name]);
  for (const id of VIEWED) if (views[id] === 'table') q.set(`${id}-view`, 'table');
  address.write(address.read().anchor, q); // replace: a tab change is the kit's, and pushes
}
const picked0 = {}; // the row a reader chose on each plate, which the address keeps
const mine = (name) => ['m', 'preset', 'custody', 'damage', ...LINKED, ...OPTS, ...PLATES.map(([, id]) => id), ...VIEWED.map((id) => `${id}-view`)].includes(name);
function readQuery() { // a link is untrusted: only a named choice, only one of its own options
  const { params: q } = address.read();
  const fresh = V.fresh();
  const pick = (v, ok, fallback) => (ok(v ?? '') ? v : fallback);
  for (const name of LINKED) S.settings[name] = pick(q.get(name), (v) => Object.hasOwn(D.sel[name].opts, v), D.sel[name].def);
  S.m = pick(q.get('m'), (v) => MS.includes(v), fresh.m);
  S.mode = q.get('preset') === 'office' ? 'office' : 'person';
  const boards = { workload: (v) => Object.hasOwn(D.boards, `where.${v}`), comparison: (v) => Object.hasOwn(D.comparisons, v), crossover: (v) => Object.hasOwn(D.boards, `cross.${v}`),
    scale: (v) => ['hour', 'unit'].includes(v), sort: (v) => ['value', 'tag'].includes(v), waffle: isWaffle };
  for (const name of OPTS) S.opts[name] = pick(q.get(name), boards[name] || (() => false), fresh.opts[name]);
  S.custody = pick(q.get('custody'), (v) => Object.hasOwn(D.custody.options, v), D.custody.default);
  S.damage = pick(q.get('damage'), (v) => v !== 'off' && !!D.carbon_damage && Object.hasOwn(D.carbon_damage.families, v), 'off');
  for (const [name, id] of PLATES) {
    const v = q.get(id);
    if (v && rowNodes.get(v)?.closest(`[data-plate-x="${name}"]`)) { S.sel[name] = v; picked0[name] = v; } else delete picked0[name];
  }
  for (const id of VIEWED) views[id] = q.get(`${id}-view`) === 'table' ? 'table' : 'chart';
  const about = /^about-(.+)$/.exec(address.read().anchor); // a figure's note opens on its own waffle (explorer-09)
  if (about && isWaffle(about[1])) S.opts.waffle = about[1];
}
const isWaffle = (v) => /^[\w-]+$/.test(v) && !!$(`input[name="waffle"][value="${v}"]`);
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
  const verdict = fails.length ? `Warning: this page does not match the model at ${fails.slice(0, 3).join(', ')}${fails.length > 3 ? `, and ${fails.length - 3} more` : ''}. Do not rely on these figures.` : `Builder matches the model: ${grouped(n)} figures within 0.5 percent of the published file.`;
  $$('[data-check]').forEach((box) => {
    box.hidden = false;
    box.classList.toggle('is-warn', fails.length > 0);
    box.textContent = verdict;
  });
  const top = $('[data-check-top]'); // the reassurance can wait under the week; a warning cannot
  top.hidden = !fails.length;
  if (fails.length) top.textContent = verdict;
}
// Fine-tune: a modal on the left (DIRECTION-R2 3.12), the plots updating behind it. The browser contains focus and Escape closes it; focus goes back to its opener.
const fine = $('#settings');
function openFine(from) {
  fine.from = from;
  if (!fine.open) fine.showModal(); // the browser puts focus on its first control, Close
  if (from?.dataset.at) document.getElementById(from.dataset.at)?.focus();
}
on(fine, 'close', () => { fine.from?.focus(); });
function project(example) {
  const box = $('[data-plate-x="project"]');
  if (example) for (const k of ['mw', 'lf', 'wue', 'load']) $(`[data-pf="${k}"]`, box).value = $('[data-example]', box).dataset[k];
  const read = (k) => { // outside the field's own bounds (a load factor of 80 against its max of 1) or past the typed ceiling, a figure waits, as for a blank, and the field says so
    const n = $(`[data-pf="${k}"]`, box);
    const bad = !n.checkValidity() || (n.value !== '' && !typedOk(D, 'field', +n.value));
    n.setAttribute('aria-invalid', bad);
    return bad || n.value === '' ? null : +n.value;
  };
  const r = projectScale(...['mw', 'lf', 'wue', 'grid', 'load'].map(read));
  const ask = (say) => (blank(r.mwh) ? '–' : say); // once a year prints, an empty row says what it waits for
  const big = (v, unit, missing) => (blank(v) ? ask(missing) : `${grouped(Number(v.toPrecision(3)))} ${unit}`);
  const out = { mwh: big(r.mwh, 'MWh'), water: big(r.water, 'liters', 'Enter site water'), co2: big(r.co2, 'tonnes CO2e', 'Choose a feed'), share: blank(r.share) ? ask('Enter a load to compare') : `${num(r.share * 100)} percent` };
  for (const [k, v] of Object.entries(out)) { const n = $(`[data-po="${k}"]`, box); n.textContent = v; n.classList.toggle('is-ask', /^(Enter|Choose)/.test(v)); } // a prompt reads as words, not as a figure (explorer-20)
  const feed = $('[data-pf="grid"]', box).selectedOptions[0];
  if (!blank(r.co2) && feed?.dataset.claims) { // the chosen feed's grid factor, with its claim and status, as every CO2e on the page carries (explorer-03 hard line)
    const ids = feed.dataset.claims.split(' ').filter((id) => D.receipts[id]);
    const said = el('span', 'x-po-claims', ' (');
    said.append(...joined(ids), ')');
    $('[data-po="co2"]', box).append(said);
  }
  $('[data-project-hint]', box).hidden = !blank(r.mwh);
  const fields = ['mw', 'lf'].map((k) => $(`[data-pf="${k}"]`, box).value);
  const exampleBtn = $('[data-example]', box);
  const isExample = ['mw', 'lf', 'wue', 'load'].every((k) => $(`[data-pf="${k}"]`, box).value === exampleBtn.dataset[k]);
  // The readout leads with what the answer leads with: the share of the load, once there is one; else the year's energy (explorer-20).
  const share = !blank(r.share);
  $('[data-po-poster]', box).textContent = blank(r.mwh) ? '' : share ? num(r.share * 100) : grouped(Number(r.mwh.toPrecision(3)));
  $('[data-po-poster]', box).parentElement.classList.toggle('is-long', !share && !blank(r.mwh) && r.mwh >= 1e7);
  $('[data-po-unit]', box).textContent = blank(r.mwh) ? '' : share ? 'percent' : 'MWh';
  $('[data-po-qual]', box).textContent = blank(r.mwh) ? 'Enter megawatts and a load factor.' : share ? `of ${isExample ? 'the region\'s load today' : 'the load entered'}, ${out.mwh} a year` : 'a year, at the load factor entered';
  // The example's button stands only while the fields hold something else, and then says it goes back (explorer-20).
  exampleBtn.dataset.try ??= exampleBtn.textContent;
  exampleBtn.hidden = isExample;
  exampleBtn.textContent = ['mw', 'lf', 'wue', 'load'].every((k) => $(`[data-pf="${k}"]`, box).value === '') ? exampleBtn.dataset.try : 'Back to the Data Centers example';
  const damage = blank(r.co2) ? null : V.damageOf(r.co2 * 1e6); // a project shows its tonnes first, and any dollar beside them
  $('[data-po-damage-row]', box).hidden = !damage;
  if (damage) { $('[data-po-damage-label]', box).textContent = `${damage.column}, as of ${damage.as_of}`; $('[data-po="damage"]', box).textContent = V.damageWords(damage, 'this project\'s CO2e'); }
  $('[data-answer-x="proposal"]').textContent = blank(r.mwh) ? 'Enter a project\'s megawatts and load factor, or start from the Data Centers example, to see its year in energy, site water and CO2e.'
    : `${isExample ? 'The Data Centers example, an illustration and not a proposal: ' : ''}${fields[0]} MW at a load factor of ${fields[1]} uses ${out.mwh} a year${blank(r.share) ? '' : `, ${out.share} of ${isExample ? 'the region\'s load today' : 'the load entered'}`}.`;
}
const closeWarning = () => { $('[data-scenario-warn]').hidden = true; $('[data-scenario-save]').focus(); };
function saveScenario() {
  const now = new Date();
  window.plate.save('resource-use-scenario.json', `${JSON.stringify(V.scenarioFile(`${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`), null, 1)}\n`, 'application/json');
  closeWarning();
  $('[data-scenario-status]').textContent = 'Saved resource-use-scenario.json to this machine. Nothing was sent anywhere.';
}
// An inbound file is untrusted: the model reads it against the input schema, and on any problem nothing changes and the reader sees each problem. Its words never reach the page, only the model's own.
const SCENARIO_LARGEST = 65536; // bytes; a real one is about two kilobytes
async function loadScenario(input) {
  const file = input.files[0];
  input.value = ''; // so the same file can be chosen again
  if (!file) return;
  const status = $('[data-scenario-status]');
  let read;
  try {
    read = file.size > SCENARIO_LARGEST ? { problems: ['That file is too large to be a scenario from this page, so nothing was changed.'] } : readScenario(D, await file.text());
  } catch {
    read = { problems: ['That file could not be read, so nothing was changed. Choose it again, or choose another.'] };
  }
  if (read.problems.length) {
    const list = el('ul', 'x-named');
    list.append(...read.problems.slice(0, 8).map((p) => el('li', '', p)));
    status.replaceChildren(el('p', '', 'That file was not loaded, and nothing changed.'), list, ...(read.problems.length > 8 ? [el('p', '', `And ${read.problems.length - 8} more.`)] : []));
    return;
  }
  const { scenario: f } = read;
  const fresh = V.fresh();
  Object.assign(S, { settings: { ...fresh.settings, ...f.settings }, fields: { ...fresh.fields, ...f.fields }, inputs: f.inputs, measured: f.measured, mode: f.mode ?? fresh.mode, seats: f.seats ?? fresh.seats, custody: f.custody ?? fresh.custody, damage: f.damage ?? fresh.damage });
  refresh('settings');
  project();
  status.textContent = `Scenario loaded from your own machine.${V.records.length ? ` Its readings carry the label: ${D.measured.label}.` : ''}${read.otherBuild ? ' It was saved against another build of the model, so its figures follow this page\'s model.' : ''}`;
}
// Chart or Table, as the kit's two pressed buttons: the Table takes the plot's and the window's place, and the claim zone stays (DIRECTION-R2 3.4).
function setView(plate, name) {
  const table = name === 'table';
  plate.dataset.view = table ? 'table' : 'chart';
  views[plate.id] = plate.dataset.view;
  const tableView = $(':scope > .plate-view[data-view="table"]', plate);
  if (tableView) conceal(tableView, !table);
  for (const part of $$(':scope > :is(.plate-plot, .plate-detail, .plate-under)', plate)) conceal(part, table && !!tableView);
  $$('.plate-views button', plate).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === plate.dataset.view)));
}
const titleOf = (plate) => $$('.plate-title', plate).find((t) => !t.closest('[data-group][hidden]'))?.textContent.trim() ?? ''; // the comparison shown; a closed tab still has its title
async function copyReading(plate) {
  commit(); // a typed figure not yet drawn, then the address it brings
  flushQuery(true);
  const reading = $('[data-d="reading"]', plate);
  const status = $('.plate-status', plate);
  const titles = $$('[data-d="chips"] .receipt', plate).flatMap((chip) => chip.dataset.claims.split(' ')).map((id) => D.receipts[id].title);
  try {
    await navigator.clipboard.writeText(`${reading.textContent}\n${location.href}${titles.length ? `\nSources: ${[...new Set(titles)].join('; ')}` : ''}`);
    status.textContent = 'Copied with its link and sources.';
  } catch {
    getSelection().selectAllChildren(reading);
    status.textContent = 'Copy is blocked here. The Reading is selected: press Ctrl+C.';
  }
}
// A plate's Table as a file: every row as it stands, each with its claims and their status and limit, then the title, the settings, and the date its sources were checked.
function csvOf(plate) {
  const tables = $$(':scope > .plate-view[data-view="table"] table.plate-table', plate).filter((t) => !t.closest('[data-group][hidden]')); // the comparison or workload shown
  const cellOf = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const of = (ids, part) => [...new Set(ids.map((id) => D.receipts[id]?.[part]).filter(Boolean))].join('; ');
  const head = [...$$('thead th', tables[0]).filter((n) => !n.hidden).map((n) => n.textContent.trim()), 'claim_ids', 'status', 'limit']; // a column the page hides, the damage one when it is off, stays out
  const rows = tables.flatMap((t) => $$('tbody tr', t).filter((tr) => !tr.hidden).map((tr) => {
    const f = tr.dataset.tr ? V.factorClaims(tr.dataset.tr) : { g: [], ml: [] }; // the row's own claims, then the factors its CO2e and water read
    const ids = [...new Set([...$$('a[data-claim]', tr).map((a) => a.dataset.claim), ...f.g, ...f.ml])].filter((id) => D.receipts[id]);
    return [...[...tr.children].filter((n) => !n.hidden).map((n) => n.textContent.trim()), ids.join('; '), of(ids, 'status'), of(ids, 'limit')];
  }));
  const checked = $('.brief-meta .figure-num')?.textContent.trim() ?? '';
  const lines = [head, ...rows, ['title', titleOf(plate)], ['settings', `${MEASURE[S.m]}; ${V.line()}`], ['checked', checked]];
  return `﻿${lines.map((r) => r.map(cellOf).join(',')).join('\r\n')}\r\n`; // the mark tells Excel it is UTF-8
}
// Print this plate: everything but this plate leaves the paper (site.css html[data-print-one]); its Table prints under it, every row with its claims.
function printPlate(plate) {
  const head = el('div', 'plate-print-head');
  head.append(el('p', '', `Resource Use Explorer: ${titleOf(plate)}`), el('p', '', `Settings chosen by the reader: ${MEASURE[S.m]}; ${V.line()}`));
  const foot = el('p', 'plate-print-foot', 'Modeled estimates, not measurements. This comparison does not decide a proposal.');
  plate.prepend(head);
  plate.append(foot);
  plate.classList.add('is-print-one');
  document.documentElement.dataset.printOne = plate.id;
  on(window, 'afterprint', () => { head.remove(); foot.remove(); plate.classList.remove('is-print-one'); delete document.documentElement.dataset.printOne; }, { once: true });
  window.print();
}
function closeReceipt(box) {
  const inside = box.contains(document.activeElement);
  box.hidden = true;
  box.replaceChildren();
  box.from?.setAttribute('aria-expanded', false);
  if (inside) box.from?.focus(); // back to the chip the reader came from
}
// The kit's short card, from the data block: the source, linked; status, limit, and claim; and the way on to the full receipt on the Sources page. One at a time.
function openReceipt(chip) {
  const plate = chip.closest('.x-plate');
  const box = $('[data-d="receipt"]', plate);
  const ids = chip.dataset.claims ? chip.dataset.claims.split(' ') : [claimOf(chip)];
  const closing = box.dataset.open === ids.join(' ') && !box.hidden;
  closeReceipt(box);
  if (closing) return;
  if (views[plate.id] === 'table') setView(plate, 'chart'); // a claim in the claim zone may be pressed from the Table
  box.hidden = false;
  box.dataset.open = ids.join(' ');
  box.from = chip;
  box.replaceChildren(...ids.slice(0, 4).map((id) => {
    const r = D.receipts[id];
    const item = el('div', 'plate-receipt-item');
    const title = el('p', 'plate-source-title');
    if (/^https:\/\//.test(r.url || '')) title.append(Object.assign(el('a', '', r.title), { href: r.url }));
    else title.textContent = r.title;
    const status = el('p', 'caption plate-receipt-status');
    status.append(glyph(r.status), `${r.short}. ${r.status === 'partly' ? 'Partly verified.' : 'Verified against the source.'}${r.limit ? ` Limit: ${r.limit}` : ''}`);
    const more = el('p', 'caption plate-receipt-more');
    more.append(Object.assign(el('a', '', 'Quote, boundary and date on the Sources page'), { href: `sources/#src-${id}` }));
    item.append(title, status, el('p', 'caption plate-receipt-id', `Claim ${id}`), more);
    return item;
  }), ...(ids.length > 4 ? [el('p', 'caption', `${ids.length - 4} more from this publisher on the Sources page`)] : []));
  $$('.receipt, a.x-c', plate).forEach((c) => c.setAttribute('aria-expanded', c === chip));
  box.focus(); // the reader goes to it, and Escape comes back
}
// A typed figure or reading redraws once the typing pauses, as the library's search does; its change, which a blur or Enter brings, draws it at once.
let typed = null;
let typing;
function soon(draw) { clearTimeout(typing); typed = draw; typing = setTimeout(commit, 250); }
function commit() { clearTimeout(typing); const draw = typed; typed = null; draw?.(); }
const fieldRange = (key) => { const [low, high] = typedRange(D, key === 'seats' ? 'seats' : 'field'); return [low, Math.min(high, FIELD_TOP[key] ?? high)]; };
const fieldOk = (key, v) => { const [low, high] = fieldRange(key); return Number.isFinite(v) && v >= low && v <= high; };
const fieldLabel = (t) => t.closest('.x-field')?.querySelector('label')?.textContent ?? 'This field';
function onInput(e) {
  const t = e.target;
  const tell = () => announce(t.closest('.x-plate') || shownPlate()); // its sentence is made when spoken, after a typed figure has redrawn
  if (t.dataset.setting) { S.settings[t.dataset.setting] = t.value; refresh('settings'); tell(); }
  else if (t.dataset.opt === 'm') { S.m = t.value; refresh(); tell(); }
  else if (t.dataset.opt) {
    S.opts[t.dataset.opt] = t.value;
    refresh();
    tell();
    if (t.dataset.opt === 'waffle') $('[data-waffle-status]').textContent = $('.x-waffle:not([hidden]) figcaption strong').textContent; // no Reading on this plate says what changed
  } else if (t.dataset.field) { // the model's one rule for a typed figure, the same a scenario file meets, so nothing typed can overflow; a week holds 168 hours
    const name = t.dataset.field;
    unclamp(t);
    const bad = t.value === '' || !fieldOk(name, +t.value);
    t.setAttribute('aria-invalid', bad);
    const [low, high] = fieldRange(name);
    $('[data-why]').textContent = bad ? `${fieldLabel(t)} takes a number from ${grouped(low)} to ${grouped(high)}. The Wall keeps the last good value.` : t.dataset.whyText;
    if (!bad) { if (name === 'seats') S.seats = +t.value; else S.fields[name] = +t.value; soon(() => refresh()); tell(); }
  } else if (t.dataset.input) {
    const bad = t.value === '' || !typedOk(D, t.dataset.input, +t.value);
    t.setAttribute('aria-invalid', bad);
    $('[data-input-why]', t.closest('.x-admin-note')).textContent = bad ? `Enter ${typedWords(D, t.dataset.input)}. The figures keep the last good value.` : '';
    if (!bad) { S.inputs[t.dataset.input] = +t.value; soon(() => refresh('settings')); tell(); }
  } else if (t.dataset.measured) {
    const why = $('[data-measured-why]');
    try {
      if (t.value === '') delete S.measured[t.dataset.measured]; // a cleared field goes back to the model's figure
      else Object.assign(S.measured, applyMeasured(D, { [t.dataset.measured]: t.value }).values);
      t.removeAttribute('aria-invalid');
      soon(() => { refresh('settings'); if (!t.hasAttribute('aria-invalid')) why.textContent = V.measuredLine(); }); // a bad value typed since keeps its own words
      tell();
    } catch (error) { // the model says what it allows; the figures keep the last good value
      t.setAttribute('aria-invalid', true);
      why.textContent = `${error.message}. The figures keep the last good value.`;
    }
  } else if (t.dataset.custody !== undefined) { S.custody = t.value; refresh(); tell(); }
  else if (t.dataset.damage !== undefined) { S.damage = t.value; refresh(); project(); tell(); }
  else if (t.dataset.pf) project();
}
// A count left out of bounds clamps to its nearer end when the reader leaves it, and says so, as the kit's typed figures do (explorer-10).
function settleField(t) {
  const name = t.dataset.field;
  const v = +t.value;
  if (t.value !== '' && fieldOk(name, v)) { t.removeAttribute('aria-invalid'); return; }
  const [low, high] = fieldRange(name);
  const end = t.value === '' || !Number.isFinite(v) ? (name === 'seats' ? S.seats : S.fields[name]) : Math.min(high, Math.max(low, v));
  if (name === 'seats') S.seats = end; else S.fields[name] = end;
  t.value = end;
  t.removeAttribute('aria-invalid'); // the field now holds a good value; the line under the fields says what happened, and stays until it is typed in again
  const say = $('#clamp-use');
  say.textContent = `${fieldLabel(t)} takes a number from ${grouped(low)} to ${grouped(high)}, so ${grouped(end)} is used.`;
  say.hidden = false;
  t.setAttribute('aria-describedby', say.id);
  refresh();
}
function unclamp(t) { // typing in a clamped field again retires its line
  if (t.getAttribute('aria-describedby') !== 'clamp-use') return;
  t.removeAttribute('aria-describedby');
  $('#clamp-use').hidden = true;
}
function choose(plate, key) { // a reader's own selection: the figure they asked for shows at the top of the detail
  picked = key;
  picked0[plate.dataset.plateX] = key;
  if (views[plate.id] === 'table') setView(plate, 'chart');
  selectRow(plate.dataset.plateX, key);
  writeQuery();
  announce(plate);
}
// As on every plate of the kit: the plate's one hidden output speaks the selected row's Reading half a second after the last selection or setting, so an arrow
// speaks its row and then the sentence once.
function announce(plate) {
  const out = plate && $('.plate-detail > output', plate);
  if (!out) return; // a plate with no Reading
  clearTimeout(out.timer);
  out.timer = setTimeout(() => { out.textContent = spoken(S.sel[plate.dataset.plateX]); }, 500);
}
const shownPlate = () => $('[role="tabpanel"]:not([hidden]) .x-plate[data-plate-x]'); // a setting in Fine-tune reaches every tab; the open one says what it changed
function startFrom(name) { // a starting point: who is counted and the device; the rest stays as the reader set it
  const p = PRESETS[name];
  const was = fieldDefault('gb');
  S.mode = p.mode;
  S.settings.device = p.device;
  if (S.fields.gb === was) S.fields.gb = fieldDefault('gb');
  refresh('settings');
  announce(shownPlate());
}
function resetAll(status) {
  Object.assign(S, V.fresh());
  Object.keys(picked0).forEach((k) => delete picked0[k]);
  $$('[aria-describedby="clamp-use"]').forEach(unclamp);
  refresh('settings');
  $('[data-measured-why]').textContent = '';
  $('[data-scenario-status]').textContent = '';
  if (status) status.textContent = 'Back to the starting point.';
}
function onClick(e) {
  const t = e.target;
  const hit = (selector) => t.closest?.(selector);
  if (hit('[data-open-settings]')) { e.preventDefault(); openFine(hit('[data-open-settings]')); }
  else if (hit('[data-to-measure]')) { e.preventDefault(); const m = $('#scenario input[name="m"]:checked'); m.scrollIntoView?.({ block: 'nearest' }); m.focus(); } // the bar, without losing the tab from the address
  else if (hit('[data-preset-x]')) startFrom(hit('[data-preset-x]').dataset.presetX);
  else if (hit('.plate-views button[data-view]')) { setView(hit('.x-plate'), hit('[data-view]').dataset.view); writeQuery(); }
  else if (hit('.x-plate button.receipt, .x-plate .x-c, .x-plate a.receipt') && $('[data-d="receipt"]', hit('.x-plate'))) { e.preventDefault(); openReceipt(hit('.x-plate button.receipt, .x-plate .x-c, .x-plate a.receipt')); }
  else if (hit('.plate-plot [data-row]:not(.is-ghost)')) choose(hit('.x-plate'), hit('[data-row]').dataset.row);
  else if (hit('[data-about]')) { e.preventDefault(); const about = $(hit('[data-about]').getAttribute('href')); about.open = true; $('summary', about).focus(); } // folded with scripts, and a link to a details does not open it
  else if (hit('[data-copy]')) copyReading(hit('.x-plate'));
  else if (hit('[data-print-plate]')) printPlate(hit('.x-plate'));
  else if (hit('[data-csv]')) window.plate.save(`explorer-${hit('.x-plate').id}.csv`, csvOf(hit('.x-plate')), 'text/csv');
  else if (hit('[data-plate-x="project"] [data-reset]')) { $$('[data-pf]').forEach((n) => { n.value = ''; }); project(); $('[data-plate-x="project"] .plate-status').textContent = 'The fields are clear.'; }
  else if (hit('[data-reset]')) { resetAll($('.plate-status', hit('.x-plate'))); announce(hit('.x-plate')); }
  else if (hit('[data-reset-all]')) resetAll($('[data-fine-status]'));
  else if (hit('[data-preset]')) { $(`[data-pf="${t.dataset.for}"]`).value = t.dataset.preset; project(); }
  else if (hit('[data-example]')) { project(true); $('[data-pf="mw"]').focus(); $('[data-plate-x="project"] .plate-status').textContent = 'The Data Centers example is back in the fields.'; } // the button steps aside, so focus goes to the first field
  else if (hit('[data-outputs]')) window.plate.save('resource-model-outputs.csv', V.outputsCsv(), 'text/csv'); // the kit's: made in the browser, sent nowhere, its blob URL let go
  else if (hit('[data-clear-measured]')) { S.measured = {}; refresh('settings'); $('[data-measured-why]').textContent = 'Your readings are cleared, and the model\'s figures are back.'; $('input[data-measured]').focus(); }
  else if (hit('[data-scenario-save]')) { $('[data-scenario-status]').textContent = ''; $('[data-scenario-warn]').hidden = false; $('[data-scenario-confirm]').focus(); } // the warning comes before the file exists
  else if (hit('[data-scenario-confirm]')) saveScenario();
  else if (hit('[data-scenario-cancel]')) closeWarning();
}
// A plot's spoken instruction, as the kit gives its own (plate.js HOW.rows), and the Table one press away on the bar.
const HOW = 'Use arrow keys to move between rows, Home and End to reach the first and last, and the Table view for all values.';
function wirePlot(plot) {
  const plate = plot.closest('.x-plate');
  const name = plate.dataset.plateX;
  plot.tabIndex = 0;
  plot.setAttribute('role', 'listbox');
  const how = el('p', '', HOW);
  how.id = `how-${name}`;
  how.hidden = true;
  plate.append(how);
  plot.setAttribute('aria-describedby', how.id);
  $(':scope > .plate-view[data-view="table"] .table-scroll', plate)?.setAttribute('aria-label', `Table of values: ${titleOf(plate)}`); // named after its plate, as the kit names its regions (a11y A10)
  $$('ol, .wall-group', plot).forEach((n) => n.setAttribute('role', 'none'));
  $$('.wall-key, .x-lever-note, .wall-words', plot).forEach((n) => { n.setAttribute('aria-hidden', 'true'); n.removeAttribute('aria-label'); }); // a list box holds options; the key's words are in the window's layer list
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
}

for (const n of $$('[data-js]')) n.hidden = false;
for (const n of $$('.x-plate .plate-more[open]')) n.open = false; // open without scripts, so nothing waits on one; one folded line each with them
// The parts a default row does not show are made here, and each board's group heads, so the page without scripts carries no empty marks.
for (const n of $$('.wall-row')) {
  const track = $('.wall-track', n);
  for (const cls of [...TAGS.map((tag) => `w w-${tag}`), 'wall-range', 'wall-needle']) if (!$(`.${cls.split(' ').pop()}`, track)) { const part = el('i', cls); part.hidden = true; track.append(part); }
  const start = el('i', 'start-mark'); // the starting point: aria-hidden, since the Reading says its figure
  start.setAttribute('aria-hidden', 'true');
  start.append(el('span', '', 'Starting point'));
  track.append(start);
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
$$('.x-plate').forEach((n) => n.classList.add('is-live'));
for (const zone of $$('.x-plate.is-live > :is(.plate-claim, .plate-detail, .plate-plot:not(.x-plot))')) {
  zone.setAttribute('role', 'group');
  zone.setAttribute('aria-label', zone.matches('.plate-claim') ? 'Finding and settings' : zone.matches('.plate-detail') ? 'Detail' : 'Plot');
}
$$('[data-d="tokens"]').forEach((slot) => slot.append(...$('#x-tokens').cloneNode(true).children));
for (const name of Object.keys(painters)) { const foot = el('p', 'plate-foot x-measured-line'); foot.dataset.measuredLine = ''; foot.hidden = true; $('.plate-detail', plateOf(name)).append(foot); }
$('[data-scenario-warning]').textContent = SCENARIO_WARNING;
// The damage column stands in every table of rows, before the claims, waiting on the control. It is its own column and never joins the price.
if (D.carbon_damage) {
  for (const [key, tr] of tableRows) {
    if (key.startsWith('lever.') || key.startsWith('cross.')) continue;
    const td = el('td');
    td.dataset.c = 'damage';
    td.dataset.damageCol = '';
    td.hidden = true;
    tr.insertBefore(td, $('[data-c="claims"]', tr));
    const headRow = $('thead tr', tr.closest('table'));
    if (!$('[data-damage-col]', headRow)) { // the head names the currency, and the caption the family, once
      const th = el('th', '', 'Damage'); th.scope = 'col'; th.dataset.damageCol = ''; th.hidden = true; headRow.insertBefore(th, headRow.lastElementChild);
      const foot = $('td[data-factors]', tr.closest('table'));
      if (foot) foot.colSpan += 1; // the foot spans the column too
    }
    const caption = $('caption', tr.closest('table'));
    if (caption && !$('[data-damage-col]', caption)) { const note = el('span'); note.dataset.damageCol = ''; note.hidden = true; caption.append(note); }
  }
}
readQuery();
for (const plate of $$('.x-plate')) if ($('.plate-views', plate)) setView(plate, views[plate.id] || 'chart');
$$('.x-plate > .plate-view').forEach((n) => on(n, 'beforematch', () => setView(n.closest('.x-plate'), 'table')));
on(document, 'input', onInput);
on(document, 'focusin', (e) => { if (e.target.dataset?.whyText) $('[data-why]').textContent = e.target.dataset.whyText; });
on(document, 'change', (e) => {
  if (e.target.dataset.input || e.target.dataset.measured) { commit(); e.target.removeAttribute('aria-invalid'); syncControls(); }
  if (e.target.dataset.field) { commit(); settleField(e.target); }
  if (e.target.dataset.input) $('[data-input-why]', e.target.closest('.x-admin-note')).textContent = '';
  if (e.target.dataset.scenarioLoad !== undefined) loadScenario(e.target);
});
on(document, 'click', onClick);
on(document, 'keydown', (e) => {
  if (e.key === 'Escape' && !fine.open) $$('[data-d="receipt"]:not([hidden])').forEach((box) => closeReceipt(box));
});
// Back, Forward, or a typed address puts the page where the address says (CW 4, explorer-07). An address that names none of this page's choices came from a link
// within the page (a claim, a plate), which takes the whole fragment: the choices stay, and the address takes them back. With no tab named, the first tab shows.
function fromAddress() {
  if (![...address.read().params.keys()].some(mine)) { flushQuery(true); return; }
  readQuery();
  for (const plate of $$('.x-plate')) if ($('.plate-views', plate)) setView(plate, views[plate.id]);
  refresh('settings');
}
on(window, 'hashchange', () => {
  if (window.siteAddress.followed) flushQuery(true);
  else fromAddress();
  if (!address.read().anchor) $('[role="tab"]')?.click();
});
on(window, 'popstate', () => { fromAddress(); window.dispatchEvent(new Event('hashchange')); }); // so the tab follows the address on every Back, whatever the browser fired
$$('.x-plot').forEach(wirePlot);
// The kit's tabs reveal a panel by removing hidden: the plates in it draw then.
new MutationObserver(wake).observe($('main'), { attributes: true, attributeFilter: ['hidden'], subtree: true });
refresh('settings');
project(true); // the proposal opens on the Data Centers example, said to be an illustration (explorer-20)
(window.requestIdleCallback || ((fn) => setTimeout(fn, 1)))(selfCheck); // after the first draw (explorer-19)
if (address.read().anchor === 'settings') openFine($('[data-open-settings]'));
}());
