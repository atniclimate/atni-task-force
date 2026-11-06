// For scripts/build_explorer.py: what the page's own model says at the default settings, so the no-script page, print, and the home band carry the same words and geometry.
// Reads {data, pours} on stdin, writes JSON on stdout. Node only; no packages.
const path = require('path');
const ex = require(path.join(__dirname, '..', 'site', 'assets', 'js', 'resource-model.js'));

const { data: D, pours } = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const V = ex.Views(D);
V.set(V.fresh());
const at = (t, spec) => spec.split('.').reduce((o, k) => (o === undefined || o === null ? o : o[k]), t);
const lows = Object.fromEntries(Object.entries(D.inputs).map(([k, v]) => [k, v[1]]));
const highs = Object.fromEntries(Object.entries(D.inputs).map(([k, v]) => [k, v[2]]));
const spreadAt = (spec, i) => V.run.spread(`pour:${spec}`, (t) => at(t, spec))[i];

const out = { walls: {}, rulers: {}, levers: {}, cross: {}, cells: {}, tags: {}, tables: {}, details: {}, pours: {}, week: V.week(), title: V.title(), line: V.line(), adminWords: V.adminWords() };
// The home ladder: each row at each boundary, from the same layers and spreads the Explorer prints, so the three boundaries cannot drift from it.
const BOUNDARY = { dc: (l) => l.data_center, adds: (l) => l.data_center + l.network, whole: (l) => l.data_center + l.network + l.router + l.device };
out.band = Object.fromEntries(['chat_hour', 'video_hour', 'short_hour', 'coding_hour'].map((k) => {
  const { router, device } = V.t.catalog[k].layers;
  const stops = Object.fromEntries(Object.entries(BOUNDARY).map(([stop, sum]) => {
    const of = (t) => sum(t.catalog[k].layers);
    const [lo, hi] = V.run.spread(`band:${k}:${stop}`, of);
    return [stop, { value: of(V.t), lo, hi, lo_text: ex.num(lo), hi_text: ex.num(hi), ...ex.figure(of(V.t), lo, hi, 'wh') }];
  }));
  return [k, { ...V.cell(`catalog.${k}`, 'wh'), screen: ex.num(router + device), fixed: router + device, stops }];
}));
for (const [id, spec] of Object.entries(D.boards)) {
  if (spec.kind === 'wall' || spec.kind === 'ruler') {
    const at = V.boardScale(id, 'wh');
    for (const key of spec.rows) { out.cells[key] = V.cell(key, 'wh', at); out.tags[key] = V.rowTag(key); out.tables[key] = V.table(key); }
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
// What moves it most, at the defaults: the same rows explorer.js's movesOf draws live, line for line (the Explorer page check holds the two equal).
function movesOf(key, m) {
  const r = V.at(V.t, key);
  const k = V.count(key);
  const places = m === 'ml' && r?.ml_by_place ? Object.keys(r.ml_by_place).sort() : [null];
  const top = places.flatMap((place) => {
    const of = (t) => { const x = V.at(t, key); return place ? x?.ml_by_place?.[place] : x?.[m]; };
    const v = of(V.t);
    return ex.blank(v) ? [] : V.run.drivers(of).filter((e) => e.type === 'input').map((e) => ({ ...e, place, v: v * k, a: e.at_low * k, b: e.at_high * k }));
  }).sort((x, y) => y.swing - x.swing).map((e) => ({ ...e, f: ex.figure(e.v, e.a, e.b, m) })).filter((e) => e.f.tag).slice(0, 5);
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
out.moves = Object.fromEntries(['use', 'where', 'arch', 'catalog'].map((name) => [name, movesOf(D.first[name], 'wh')]));
out.readings = {};
for (const [letter, opts] of Object.entries(V.t.arch)) for (const k of Object.keys(ex.flatten(opts.readings))) out.readings[`arch.${letter}.readings.${k}`] = V.reading(`arch.${letter}.readings.${k}`);
out.paybacks = Object.fromEntries(Object.keys(V.t.arch.E.payback).map((k) => [k, V.payback(k)]));
out.paybackLine = V.paybackLine('node'); // the move's first row is the one-copy move
out.custody = Object.fromEntries(Object.keys(D.custody.options).filter((rule) => rule !== D.custody.default).map((rule) => [rule, Object.fromEntries(Object.keys(V.t.arch).map((letter) => [letter, V.custody(letter, rule)]))]));
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
