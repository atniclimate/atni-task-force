// Resource Use Explorer: the page around the model, which is resource-model.js. Text by textContent only.
(function () {
'use strict';
const { MS, TAGS, FEED, SCENARIO_WARNING, blank, Run, Views, projectScale, num, usd, pct, grouped, figure, words, leverText, plainFig, applyMeasured, readScenario, typedOk, typedWords } = window.resourceModel;

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
  const span = (t) => place(el('span', '', t.t), t);
  const left = $('.wall-axis-left', axis); // as wide as the left side, so a container query can drop its ticks when it is narrow
  left?.replaceChildren(...ticks.filter((t) => t.left).map(span), $('i', left));
  axis.replaceChildren(...(left ? [left] : []), ...ticks.filter((t) => !t.left).map(span));
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
    $('.ladder-value', n).replaceChildren(el('span', 'x-ghost-words', ghostWords(key)));
  }
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
    const oneLine = id === 'arch.E' && m === 'usd' && key.startsWith('arch.E.move_'); // the group head names the move's price basis once, so the figure and its spread share a line
    n.classList.toggle('is-one-line', oneLine);
    const f = oneLine ? figure(V.val(key, 'usd'), ...V.spread(key, 'usd'), 'usd') : V.cell(key, m, at);
    const extra = wordsOnly.includes(key) && id !== 'arch.E' ? 'on another grid, no bar' : beside ? 'inside the seat figure; printed beside, not added' : ''; // E's group head says it once
    cell($('.ladder-value', n), { ...f, tag: [f.tag, extra].filter(Boolean).join(' ') });
  }
  axisInto(board, lay.ticks);
  $('.wall-off', board).hidden = !visible.some((key) => lay.items[key]?.range?.[2]); // the ruler says so once; each row prints its whole spread
  const note = $('.wall-gridnote', board);
  if (note) {
    note.hidden = !wordsOnly.length;
    note.textContent = wordsOnly.length ? `Rows on different grids carry no bar: ${[...new Set(wordsOnly.map(V.grids))].join(' against ')}, and the local grid is ${V.p.grid_local} g per kWh. Set them to one feed in Settings to draw them.` : '';
  }
  return [...order.filter((key) => !scenario.includes(key) && !ghosts.includes(key)), ...scenario]; // the arrows step past a ghost
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
const measuredTag = (key) => (V.isMoved(key) ? [el('span', 'x-measured-tag', D.measured.label)] : []); // the label comes from the model, on every row a reading moved
function paintTables() {
  const on = S.damage !== 'off';
  for (const [key, tr] of tableRows) {
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
    if (td && on) td.textContent = gone ? '' : V.damageFig(V.damage(key));
  }
  for (const id of ['cross.prompts', 'cross.views']) {
    const { items } = V.crossings(D.boards[id].rows);
    for (const [key, c] of Object.entries(items)) { const td = $('[data-c="count"]', tableRows.get(key)); td.textContent = words(V.crossWords(c, D.boards[id].noun)); $('[data-c="ends"]', tableRows.get(key)).textContent = V.crossEnds(c); }
  }
  $$('[data-damage-col]').forEach((n) => { n.hidden = !on; });
  if (!on) return;
  const c = V.damageOf(1); // the family's own words, its head among them, so an avoidance cost never reads as a damage; the figure is each row's
  $$('th[data-damage-col]').forEach((th) => { th.textContent = `${c.head}, ${V.damageCurrency(c)}`; });
  $$('caption [data-damage-col]').forEach((n) => { n.textContent = ` ${c.head} column: ${c.family}, ${c.kind}; ${c.column}, as of ${c.as_of}.`; });
}
// What the custody rule leaves out, always listed under the plate with its reason, and what the rule costs. One block for each comparison, so print holds them all.
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
function paintMeasured() {
  const line = V.measuredLine();
  for (const name of Object.keys(painters)) {
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
  for (const [i, id] of c.claims.entries()) { const a = el('a', 'x-c', id); a.href = `#src-${id}`; note.append(...(i ? [', ', a] : [a])); }
  return [el('p', 'x-damage-head', `${c.column}, as of ${c.as_of}`), el('p', 'x-damage-figures', V.damageWords(c)), note];
};

const priceWord = (key) => (blank(V.val(key, 'usd')) ? D.rows[key].pn || D.words.price.none : D.rows[key].pt || D.words.price[V.basis(key)]);
const basinWord = (tag) => tag.slice(0, tag.lastIndexOf(',')); // the model writes "basin, convention", and a convention has no comma

// The detail zone reads the same on every plate: the energy large, then price, carbon, and water at their bases, then the sentence. How it is modeled folds up; receipts live in Sources.
function detail(name, key) {
  const plate = plateOf(name);
  const d = (k) => $(`[data-d="${k}"]`, plate);
  const text = (k, v) => { const n = d(k); if (n) n.textContent = v; };
  const noteId = D.rows[key]?.note;
  const long = () => d('value').parentElement.classList.toggle('is-long', d('value').textContent.length >= 9);
  const big = (node, f) => { node.replaceChildren(el('span', '', f.num), ' ', el('span', 'x-big-unit', f.unit)); return node; };
  const readout = (r) => { text('value', r.value); text('unit', r.unit); text('qual', r.qual); window.plate.readingInto(d('reading'), V.copied(r.reading, key), r.value); };
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
    text('price', r.price); text('price-word', priceWord(key)); text('price-tag', r.priceTag); big(d('co2'), r.co2); text('co2-tag', r.co2Tag);
    d('water').replaceChildren(...(r.water.length ? r.water.map((w) => { const s = el('span', 'x-figure'); s.append(big(el('strong', 'x-big'), w), el('span', 'caption', basinWord(w.tag))); return s; }) : [el('span', 'caption', 'No water figure: the record holds no generation water for this feed.')]));
    text('water-basis', r.water.map((w) => w.tag).join('; ') || 'no figure');
    d('layers').replaceChildren(...r.layers.map((l) => { const li = el('li'); li.append(el('span', `plate-square w-key-${l.tag}${l.on ? '' : ' is-hollow'}`), el('strong', '', l.text), el('span', '', l.label)); return li; }));
    text('spread', r.spread); text('moves', r.moves);
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
  const master = noteId && document.getElementById(noteId);
  const parts = master ? [...master.cloneNode(true).children] : [];
  const note = d('note');
  note.replaceChildren(...parts.filter((n) => !n.matches('.plate-chips')));
  if (Object.keys(D.sel).some((k) => S.settings[k] !== D.sel[k].def)) note.prepend(el('p', 'x-note-title', 'These notes describe the default settings.'));
  const chips = parts.find((n) => n.matches('.plate-chips'));
  d('chips').replaceChildren(...(chips ? chips.children : []));
  const receipts = $$('.receipt', d('chips'));
  for (const chip of receipts) { const id = chip.getAttribute('href').slice(5); chip.lastElementChild.textContent = `${id}, ${document.getElementById(`src-${id}`).dataset.short}`; }
  const partly = receipts.filter((chip) => chip.classList.contains('is-hollow')).length;
  const verified = receipts.length - partly;
  const tally = $('[data-tally]', plate);
  tally.hidden = !receipts.length;
  tally.textContent = `This row: ${[verified && `${verified} verified`, partly && `${partly} partly verified`].filter(Boolean).join(', ')}; ${plate.dataset.sources} sources on the plate`;
  const receipt = d('receipt');
  receipt.hidden = true;
  receipt.replaceChildren();
  $$('.receipt, a.x-c', plate).forEach((c) => c.setAttribute('aria-expanded', false));
}
// As on every plate of the kit: the Sources view lists the whole plate and its name counts them, and its chips are the selected row's. So the view's count and the line under the Reading count one thing each.
function listSources(plate) {
  const ids = new Set($$('.plate-plot [data-row]', plate).flatMap((row) => { const note = document.getElementById(D.rows[row.dataset.row]?.note); return note ? $$('.receipt', note).map((chip) => chip.getAttribute('href').slice(1)) : []; }));
  plate.dataset.sources = ids.size;
  $('.plate-views input[value="sources"] + span', plate).textContent = `Sources (${ids.size})`;
  $('[data-d="sources"]', plate).replaceChildren(...[...ids].map((id) => { const src = document.getElementById(id).cloneNode(true); src.removeAttribute('id'); return src; }));
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
  const also = [S.custody !== D.custody.default && `${D.custody.label}: ${D.custody.options[S.custody].label}`, S.damage !== 'off' && `${D.carbon_damage.label}: ${D.carbon_damage.families[S.damage].label}`, ...Object.entries(S.inputs).map(([k, v]) => `${D.names[k]}, typed: ${v}`)].filter(Boolean);
  $$('[data-setting-list]').forEach((n) => n.replaceChildren(...[...Object.keys(D.sel).map((name) => `${D.names[name]}: ${D.sel[name].say[S.settings[name]]}`), ...also].map((line) => el('li', '', line))));
  $$('[data-if]').forEach((n) => { const [k, v] = n.dataset.if.split(':'); n.hidden = String(V.p[k]) !== v; });
  $$('[data-reading]').forEach((n) => { n.textContent = V.reading(n.dataset.reading); });
  $$('[data-group]').forEach((n) => { const [k, v] = n.dataset.group.split(':'); n.hidden = S.opts[k] !== v; });
  $$('[data-payback]').forEach((n) => { n.textContent = V.payback(n.dataset.payback); });
  for (const [key, n] of rowNodes) if (D.rows[key]) { const tag = V.rowTag(key); $('.ladder-label', n).replaceChildren(V.label(key), ...(tag ? [el('span', 'ladder-tag', tag)] : []), ...measuredTag(key)); }
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
  paintCustody();
  paintMeasured();
  syncControls();
}
function syncControls() {
  $$('input[data-setting]').forEach((n) => { n.checked = S.settings[n.dataset.setting] === n.value; });
  $$('input[data-opt]').forEach((n) => { n.checked = (n.dataset.opt === 'm' ? S.m : n.dataset.opt === 'mode' ? S.mode : S.opts[n.dataset.opt]) === n.value; });
  $$('input[data-field]').forEach((n) => { if (document.activeElement !== n) n.value = n.dataset.field === 'seats' ? S.seats : S.fields[n.dataset.field]; });
  $$('input[data-input]').forEach((n) => { if (document.activeElement !== n) n.value = S.inputs[n.dataset.input] ?? D.inputs[n.dataset.input]?.[0] ?? D.scenario[n.dataset.input]; });
  $$('input[data-measured]').forEach((n) => { if (document.activeElement !== n) n.value = S.measured[n.dataset.measured] ?? ''; });
  $$('input[data-custody]').forEach((n) => { n.checked = S.custody === n.value; });
  $$('select[data-damage]').forEach((n) => { n.value = S.damage; });
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
  const said = fails.length ? `Warning: this page does not match the model at ${fails.slice(0, 3).join(', ')}${fails.length > 3 ? `, and ${fails.length - 3} more` : ''}. Do not rely on these figures.` : `Builder matches the model: ${grouped(n)} figures within 0.5 percent of the published file.`;
  $$('[data-check]').forEach((box) => {
    box.hidden = false;
    box.classList.toggle('is-warn', fails.length > 0);
    box.textContent = said;
  });
  const top = $('[data-check-top]'); // the reassurance can wait in the Table view; a warning cannot
  top.hidden = !fails.length;
  if (fails.length) top.textContent = said;
}
// The drawer starts under the disclaimer band. From 1600px the plate compresses beside it; below, it covers the detail column only, so the plot keeps its width and the reader sees rows move.
const placeDrawer = () => document.documentElement.style.setProperty('--drawer-top', `${Math.max(0, $('.x-band').getBoundingClientRect().bottom)}px`);
const drawerSaid = (open) => $$('[data-open-settings]').forEach((n) => { n.setAttribute('aria-controls', 'settings'); n.setAttribute('aria-expanded', open); });
function openDrawer(from) {
  const drawer = $('#settings');
  drawer.from = from;
  drawer.hidden = false;
  drawerSaid(true);
  document.documentElement.classList.add('has-drawer');
  placeDrawer();
  (from.dataset.at ? document.getElementById(from.dataset.at) : drawer).focus();
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
  const read = (k) => { const n = $(`[data-pf="${k}"]`, box); return n.value === '' || !typedOk(D, 'field', +n.value) ? null : +n.value; }; // past the typed ceiling a figure waits, as for a blank, and never overflows
  const r = projectScale(...['mw', 'lf', 'wue', 'grid', 'load'].map(read));
  const ask = (say) => (blank(r.mwh) ? '–' : say); // once a year prints, an empty row says what it waits for
  const big = (v, unit, missing) => (blank(v) ? ask(missing) : `${grouped(Number(v.toPrecision(3)))} ${unit}`);
  const out = { mwh: big(r.mwh, 'MWh'), water: big(r.water, 'liters', 'Enter site water'), co2: big(r.co2, 'tonnes CO2e', 'Choose a feed'), share: blank(r.share) ? ask('Enter a load to compare') : `${num(r.share * 100)} percent` };
  for (const [k, v] of Object.entries(out)) $(`[data-po="${k}"]`, box).textContent = v;
  $('[data-project-hint]', box).hidden = !blank(r.mwh);
  $('[data-po-poster]', box).textContent = blank(r.mwh) ? '' : grouped(Number(r.mwh.toPrecision(3)));
  $('[data-po-poster]', box).parentElement.classList.toggle('is-long', !blank(r.mwh) && r.mwh >= 1e7);
  $('[data-po-unit]', box).textContent = blank(r.mwh) ? '' : 'MWh';
  $('[data-po-qual]', box).textContent = blank(r.mwh) ? 'Enter megawatts and a load factor.' : 'a year, at the load factor entered';
  const damage = blank(r.co2) ? null : V.damageOf(r.co2 * 1e6); // a project shows its tonnes first, and any dollar beside them
  $('[data-po-damage-row]', box).hidden = !damage;
  if (damage) { $('[data-po-damage-label]', box).textContent = `${damage.column}, as of ${damage.as_of}`; $('[data-po="damage"]', box).textContent = V.damageWords(damage, 'this project\'s CO2e'); }
}
function save(name, text, type) { // a file for the reader's own machine, made in the browser; nothing is sent anywhere
  const a = el('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
}
const closeWarning = () => { $('[data-scenario-warn]').hidden = true; $('[data-scenario-save]').focus(); };
function saveScenario() {
  const now = new Date();
  save('resource-use-scenario.json', `${JSON.stringify(V.scenarioFile(`${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`), null, 1)}\n`, 'application/json');
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
function setView(plate, name) {
  plate.dataset.view = name;
  $$('.plate-view', plate).forEach((n) => { n.hidden = n.dataset.view !== name; });
  $$('.plate-views input', plate).forEach((n) => { n.checked = n.value === name; });
}
async function copyReading(plate) {
  const reading = $('[data-d="reading"]', plate);
  const status = $('.plate-status', plate);
  const titles = $$('[data-d="chips"] .receipt', plate).map((chip) => $('.plate-source-title', document.getElementById(chip.getAttribute('href').slice(1))).textContent);
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
  setView(plate, 'sources'); // a chip in the claim zone may be pressed from another view
  box.hidden = false;
  box.dataset.open = id;
  box.from = chip;
  box.replaceChildren(...document.getElementById(id).cloneNode(true).children);
  chip.setAttribute('aria-expanded', true);
  box.focus(); // the reader goes to it, and Escape comes back
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
  } else if (t.dataset.field) { // the model's one rule for a typed figure, the same a scenario file meets, so nothing typed can overflow
    const name = t.dataset.field === 'seats' ? 'seats' : 'field';
    const bad = t.value === '' || !typedOk(D, name, +t.value);
    t.setAttribute('aria-invalid', bad);
    $('[data-why]').textContent = bad ? `Enter ${typedWords(D, name)}. The Wall keeps the last good value.` : t.dataset.whyText;
    if (!bad) { if (name === 'seats') S.seats = +t.value; else S.fields[t.dataset.field] = +t.value; refresh(); }
  } else if (t.dataset.input) {
    const bad = t.value === '' || !typedOk(D, t.dataset.input, +t.value);
    t.setAttribute('aria-invalid', bad);
    $('[data-input-why]', t.closest('.x-admin-note')).textContent = bad ? `Enter ${typedWords(D, t.dataset.input)}. The figures keep the last good value.` : '';
    if (!bad) { S.inputs[t.dataset.input] = +t.value; refresh('settings'); }
  } else if (t.dataset.measured) {
    const why = $('[data-measured-why]');
    try {
      if (t.value === '') delete S.measured[t.dataset.measured]; // a cleared field goes back to the model's figure
      else Object.assign(S.measured, applyMeasured(D, { [t.dataset.measured]: t.value }).values);
      t.removeAttribute('aria-invalid');
      refresh('settings');
      why.textContent = V.measuredLine();
    } catch (error) { // the model says what it allows; the figures keep the last good value
      t.setAttribute('aria-invalid', true);
      why.textContent = `${error.message}. The figures keep the last good value.`;
    }
  } else if (t.dataset.custody !== undefined) { S.custody = t.value; refresh(); }
  else if (t.dataset.damage !== undefined) { S.damage = t.value; refresh(); project(); }
  else if (t.dataset.pf) project();
}
function choose(plate, key) { // a reader's own selection: the figure they asked for shows at the top of the detail
  picked = key;
  setView(plate, 'reading');
  selectRow(plate.dataset.plateX, key);
}
function onClick(e) {
  const t = e.target;
  const hit = (selector) => t.closest?.(selector);
  if (hit('[data-open-settings]')) { e.preventDefault(); openDrawer(hit('[data-open-settings]')); }
  else if (hit('[data-close-settings]')) closeDrawer();
  else if (hit('.x-plate .receipt, .x-plate a.x-c') && $('[data-d="receipt"]', hit('.x-plate'))) { e.preventDefault(); openReceipt(hit('.x-plate .receipt, .x-plate a.x-c')); }
  else if (hit('.plate-plot [data-row]:not(.is-ghost)')) choose(hit('.x-plate'), hit('[data-row]').dataset.row);
  else if (hit('[data-tally]')) { setView(hit('.x-plate'), 'sources'); $('.plate-views input[value="sources"]', hit('.x-plate')).focus(); } // the button leaves with its view, so focus goes to the view switch
  else if (hit('[data-about]')) { e.preventDefault(); const about = $(hit('[data-about]').getAttribute('href')); about.open = true; $('summary', about).focus(); } // folded with scripts, and a link to a details does not open it
  else if (hit('[data-copy]')) copyReading(hit('.x-plate'));
  else if (hit('[data-reset]')) { Object.assign(S, V.fresh()); $$('[data-pf]').forEach((n) => { n.value = ''; }); project(); refresh('settings'); $('[data-measured-why]').textContent = ''; $('[data-scenario-status]').textContent = ''; $('.plate-status', hit('.x-plate')).textContent = 'Back to the default settings.'; }
  else if (hit('[data-preset]')) { $(`[data-pf="${t.dataset.for}"]`).value = t.dataset.preset; project(); }
  else if (hit('[data-example]')) { for (const k of ['mw', 'lf', 'wue', 'load']) $(`[data-pf="${k}"]`).value = t.dataset[k]; project(); }
  else if (hit('[data-outputs]')) save('resource-model-outputs.csv', V.outputsCsv(), 'text/csv');
  else if (hit('[data-clear-measured]')) { S.measured = {}; refresh('settings'); $('[data-measured-why]').textContent = 'Your readings are cleared, and the model\'s figures are back.'; $('input[data-measured]').focus(); }
  else if (hit('[data-scenario-save]')) { $('[data-scenario-status]').textContent = ''; $('[data-scenario-warn]').hidden = false; $('[data-scenario-confirm]').focus(); } // the warning comes before the file exists
  else if (hit('[data-scenario-confirm]')) saveScenario();
  else if (hit('[data-scenario-cancel]')) closeWarning();
}
function wirePlot(plot) {
  const plate = plot.closest('.x-plate');
  const name = plate.dataset.plateX;
  plot.tabIndex = 0;
  plot.setAttribute('role', 'listbox');
  $$('ol, .wall-group', plot).forEach((n) => n.setAttribute('role', 'none'));
  $$('.wall-key, .x-lever-note', plot).forEach((n) => { n.setAttribute('aria-hidden', 'true'); n.removeAttribute('aria-label'); }); // a list box holds options; the key's words are in the detail's layer list, and the claim zone says each row has its own ruler
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
  const holding = () => $$('[data-d="note"], [data-d="chips"], [data-d="receipt"]', plate).some((n) => n.contains(document.activeElement)); // a preview rebuilds these, which would drop the keyboard's place
  on(plot, 'pointerover', (e) => { const row = e.target.closest('[data-row]:not(.is-ghost)'); if (row && !holding()) detail(name, row.dataset.row); });
  on(plot, 'pointerleave', () => { if (!holding()) detail(name, S.sel[name]); });
}
function fit() {
  if (innerWidth >= 1100) document.documentElement.style.setProperty('--plate-h', `${Math.round(Math.max(544, innerHeight - $('.x-band').getBoundingClientRect().bottom - scrollY - 24))}px`);
}

for (const n of $$('[data-js]')) n.hidden = false;
for (const n of $$('.x-plate .plate-more[open]')) n.open = false; // open without scripts, so nothing waits on one; one folded line each with them
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
for (const zone of $$('.x-plate.is-live > :is(.plate-claim, .plate-detail, .plate-plot:not(.x-plot))')) {
  zone.setAttribute('role', 'group');
  zone.setAttribute('aria-label', zone.matches('.plate-claim') ? 'Finding and settings' : zone.matches('.plate-detail') ? 'Detail' : 'Plot');
}
$$('.x-plate').forEach((plate) => { if ($('.plate-views', plate)) { setView(plate, 'reading'); listSources(plate); } });
$$('[data-d="tokens"]').forEach((slot) => slot.append(...$('#x-tokens').cloneNode(true).children));
for (const name of Object.keys(painters)) { const foot = el('p', 'plate-foot x-measured-line'); foot.dataset.measuredLine = ''; foot.hidden = true; plateOf(name).append(foot); }
$('[data-scenario-warning]').textContent = SCENARIO_WARNING;
// The damage column stands in every table of rows, waiting on the control. It is its own column and never joins the price.
if (D.carbon_damage) {
  for (const [key, tr] of tableRows) {
    if (key.startsWith('lever.') || key.startsWith('cross.')) continue;
    const td = el('td');
    td.dataset.c = 'damage';
    td.dataset.damageCol = '';
    td.hidden = true;
    tr.append(td);
    const headRow = $('thead tr', tr.closest('table'));
    if (!$('[data-damage-col]', headRow)) { const th = el('th', '', 'Damage'); th.scope = 'col'; th.dataset.damageCol = ''; th.hidden = true; headRow.append(th); } // the head names the currency, and the caption the family, once
    const caption = $('caption', tr.closest('table'));
    if (caption && !$('[data-damage-col]', caption)) { const note = el('span'); note.dataset.damageCol = ''; note.hidden = true; caption.append(note); }
  }
}
readQuery();
on(document, 'input', onInput);
on(document, 'focusin', (e) => { if (e.target.dataset?.whyText) $('[data-why]').textContent = e.target.dataset.whyText; });
on(document, 'change', (e) => {
  if (e.target.dataset.field || e.target.dataset.input || e.target.dataset.measured) { e.target.removeAttribute('aria-invalid'); syncControls(); }
  if (e.target.dataset.input) $('[data-input-why]', e.target.closest('.x-admin-note')).textContent = '';
  if (e.target.dataset.scenarioLoad !== undefined) loadScenario(e.target);
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
