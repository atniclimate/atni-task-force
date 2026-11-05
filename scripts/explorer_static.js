// For scripts/build_explorer.py: what the page's own code says at the default settings, so the no-script page and print carry the same words and geometry.
// Reads {data, pours} on stdin, writes JSON on stdout. Node only; no packages.
const path = require('path');
const ex = require(path.join(__dirname, '..', 'site', 'assets', 'js', 'explorer.js'));

const { data: D, pours } = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const V = ex.Views(D);
V.set(V.fresh());
const at = (t, spec) => spec.split('.').reduce((o, k) => (o === undefined || o === null ? o : o[k]), t);
const lows = Object.fromEntries(Object.entries(D.inputs).map(([k, v]) => [k, v[1]]));
const highs = Object.fromEntries(Object.entries(D.inputs).map(([k, v]) => [k, v[2]]));
const spreadAt = (spec, i) => V.run.spread(`pour:${spec}`, (t) => at(t, spec))[i];

const out = { walls: {}, rulers: {}, levers: {}, cross: {}, cells: {}, tables: {}, details: {}, pours: {}, week: V.week(), title: V.title(), line: V.line() };
for (const [id, spec] of Object.entries(D.boards)) {
  if (spec.kind === 'wall' || spec.kind === 'ruler') {
    const at = V.boardScale(id, 'wh');
    for (const key of spec.rows) { out.cells[key] = V.rowCell(key, 'wh', at); out.tables[key] = V.table(key); }
    if (spec.kind === 'ruler') out.rulers[id] = V.ruler(spec.rows, 'wh');
    else out.walls[id] = V.layout(V.boardKeys(id, 'wh'), 'wh', spec.plain, at);
  } else if (spec.kind === 'lever') {
    for (const key of spec.rows) {
      out.levers[key] = {};
      for (const m of ['wh', 'usd', 'g', 'ml']) {
        const r = V.lever(key, m);
        out.levers[key][m] = { ...r, before_text: ex.leverText(r.before, m), after_text: ex.leverText(r.after, m), ratio_text: r.ratio === null ? null : ex.num(r.ratio) };
      }
    }
  } else {
    const { items, ticks } = V.crossings(spec.rows);
    out.cross[id] = { ticks, items: {} };
    for (const [key, c] of Object.entries(items)) out.cross[id].items[key] = { ...c, words: V.crossWords(c, spec.noun), text: ex.words(V.crossWords(c, spec.noun)), ends: V.crossEnds(c) };
  }
}
for (const name of ['use', 'where', 'arch', 'catalog']) out.details[name] = V.detailOf(D.first[name]);
out.readings = {};
for (const [letter, opts] of Object.entries(V.t.arch)) for (const k of Object.keys(ex.flatten(opts.readings))) out.readings[`arch.${letter}.readings.${k}`] = V.reading(`arch.${letter}.readings.${k}`);
const week = out.week;
out.weekWords = {
  list: ex.usd(week.list), earned: ex.usd(week.earned), seat: week.seat ? ex.usd(week.seat) : '', g: ex.plainFig(week.g, 'g'), home: ex.plainFig(week.water.home, 'ml'), cloud: ex.plainFig(week.water.cloud, 'ml'),
  grids: `${V.grids('catalog.video_hour')}, location-based`, 'home-tag': V.basin('home'), 'cloud-tag': V.basin('cloud'),
};

function valueOf(spec) {
  const [head, ...rest] = spec.split(':');
  if (head === 'i') return D.inputs[rest[0]][+rest[1]];
  if (head === 'lo' || head === 'hi') return spreadAt(rest[0], head === 'lo' ? 0 : 1);
  if (head === 'x') { const [name, option] = rest[0].split('='); return at(ex.compute({ ...V.run.base, ...D.sel[name].opts[option] }), rest[1]); }
  if (head === 'c') return V.run.crossover(rest[0])[rest[1]];
  if (head === 'sum') return rest[0].split(',').reduce((all, p) => all + at(V.t, p), 0);
  if (head === 'ratio') { const [a, b] = rest[0].split(',').map((p) => at(V.t, p)); return a / b; }
  if (head === 'p') return at(V.run.base, rest[0]);
  // eslint-disable-next-line no-new-func
  if (head === 'e') return new Function('p', 'lo', 'hi', 'sl', 'sh', `return ${rest.join(':')}`)(V.run.base, lows, highs, (s) => spreadAt(s, 0), (s) => spreadAt(s, 1));
  return at(V.t, spec);
}
const grouped = (v) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 12 }).format(v);
const unitOf = (spec) => (/(^|_|\.)ml$/.test(spec) ? 'ml' : /(^|_|\.)g$/.test(spec) ? 'g' : 'wh');
for (const pour of pours) {
  const [spec, fmt] = pour.split('|');
  const v = valueOf(spec);
  if (v === undefined || v === null || Number.isNaN(v)) throw new Error(`Nothing to pour at ${pour}`);
  out.pours[pour] = {
    undefined: () => ex.num(v), 2: () => ex.num(v, 2), 3: () => ex.num(v, 3), $: () => ex.usd(v), $0: () => `$${grouped(v)}`, u: () => ex.words(ex.figure(v, null, null, unitOf(spec))),
    m: () => ex.num(v / 1e6, 2), k: () => ex.num(v / 1e3), pct: () => ex.num(v * 100), g: () => grouped(v),
  }[fmt]();
}
process.stdout.write(JSON.stringify(out));
