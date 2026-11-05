// Plate kit, SVG marks, drawn from a plot's measured size; pages reach them as plate.draw. Text by textContent only.
(function () {
const unique = (list) => [...new Set(list)];
const blank = (v) => v === undefined || v === null;
const keysOf = (rows) => unique(rows.map((r) => r.key)).sort((a, b) => a - b || 0);

function add(parent, tag, attrs) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (name === 'text') node.textContent = value;
    else node.setAttribute(name, value);
  }
  return parent.appendChild(node);
}
// Full under 10,000, compact above.
const fmt = (n, top = Math.abs(n)) => new Intl.NumberFormat('en-US', top >= 1e4 ? { notation: 'compact', maximumFractionDigits: 1 } : { maximumFractionDigits: 3 }).format(n);
function scale(kind, [d0, d1], [r0, r1]) {
  const t = kind === 'log' ? Math.log10 : (v) => v;
  return (v) => r0 + ((t(v) - t(d0)) / ((t(d1) - t(d0)) || 1)) * (r1 - r0);
}

const inner = (g, W, H, m) => ({ g, W, H, x0: m.left, x1: W - m.right, y0: H - m.bottom, y1: m.top });
function frame(plot, minH = 0) {
  plot.querySelector('.plate-svg')?.remove();
  const W = plot.clientWidth;
  const H = Math.max(plot.clientHeight, minH);
  const svg = add(plot, 'svg', { class: 'plate-svg', viewBox: `0 0 ${W} ${H}`, role: 'none' });
  if (H > plot.clientHeight) svg.style.height = `${H}px`;
  return { g: svg, W, H };
}
function axes(f, x, y, yTicks, xs) {
  const g = add(f.g, 'g', { 'aria-hidden': 'true' });
  const top = Math.max(...yTicks.map(Math.abs));
  for (const t of yTicks) {
    add(g, 'line', { class: 'm-grid', x1: f.x0, x2: f.x1, y1: y(t), y2: y(t) });
    add(g, 'text', { class: 'm-tick', x: f.x0 - 8, y: y(t), dy: '.32em', 'text-anchor': 'end', text: fmt(t, top) });
  }
  const base = y(Math.max(Math.min(...yTicks), 0));
  add(g, 'line', { class: 'm-base', x1: f.x0, x2: f.x1, y1: base, y2: base });
  let right = Infinity; // newest year first; one that would touch is left out
  for (const t of (xs.length > 12 ? xs.filter((v) => v % 5 === 0) : [...xs]).sort((a, b) => b - a)) {
    if (right - x(t) >= 36) {
      const edge = f.W - x(t) < 24;
      add(g, 'text', { class: 'm-tick', x: x(t), y: f.y0 + 20, 'text-anchor': edge ? 'end' : 'middle', text: t });
      right = edge ? x(t) - 18 : x(t);
    }
  }
}
const labelled = (names, lead) => (names.length <= 4 ? names : names.filter((n) => n === lead));
const seriesOf = (rows) => unique(rows.map((r) => r.series));
function spread(ys, gap, top, bottom) { // label heights, moved apart, in bounds
  const out = [...ys];
  out.forEach((y, i) => { out[i] = Math.max(y, i ? out[i - 1] + gap : top); });
  for (let i = out.length - 1; i >= 0; i--) out[i] = Math.min(out[i], i < out.length - 1 ? out[i + 1] - gap : bottom);
  return out;
}
const pathOf = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
function trace(g, pts, cls) {
  const solid = pts.filter((p) => !p[2]);
  const dashed = pts.filter((p) => p[2]);
  if (solid.length > 1) add(g, 'path', { class: cls, d: pathOf(solid) });
  if (dashed.length) add(g, 'path', { class: `${cls} is-proj`, d: pathOf([...solid.slice(-1), ...dashed]) });
}
function chart(f, rows, cfg, withLabels) {
  const x = scale('linear', cfg.xdomain, [f.x0, f.x1]);
  const y = scale('linear', cfg.domain, [f.y0, f.y1]);
  const point = cfg.select === 'point';
  axes(f, x, y, cfg.ticks, unique(rows.map((r) => r.x)));
  if (cfg.band) {
    const up = cfg.band.map((b) => [x(b[0]), y(b[2]), b[3]]);
    const down = cfg.band.map((b) => [x(b[0]), y(b[1]), b[3]]);
    add(f.g, 'path', { class: 'm-band', d: `${pathOf([...up, ...[...down].reverse()])}Z` });
    trace(f.g, up, 'm-band-edge');
    trace(f.g, down, 'm-band-edge');
  }
  const lead = cfg.highlight;
  const names = seriesOf(rows);
  const points = (name) => rows.filter((r) => r.series === name && !blank(r.value));
  for (const name of [...names].sort((a, b) => (a === lead) - (b === lead))) {
    const cls = `m-line${name === lead ? ' is-on' : ''}${names.length === 1 && !lead ? ' is-one' : ''}`;
    trace(f.g, points(name).map((r) => [x(r.x), y(r.value), r.projected]), cls);
  }
  for (const r of rows) if (!blank(r.high) && !blank(r.low)) add(f.g, 'line', { class: 'm-range', x1: x(r.x) + (r.dx || 0), x2: x(r.x) + (r.dx || 0), y1: y(r.low), y2: y(r.high) });
  // Names at last points: a column moved apart beside one plot or with endLabels, else above left of the point.
  const last = (n) => points(n).at(-1);
  const wanted = (!withLabels ? [] : cfg.endLabels ? names : labelled(names, lead)).filter(last);
  const column = cfg.endLabels || !cfg.panels ? [...wanted].sort((a, b) => y(last(a).value) - y(last(b).value)) : [];
  const tag = (n, more, attrs) => add(f.g, 'text', { class: `m-label${n === lead ? ' is-lead' : ''}${more}`, text: n, ...attrs });
  const heights = spread(column.map((n) => y(last(n).value)), cfg.panels ? 14 : 15, f.y1, f.y0);
  column.forEach((n, i) => tag(n, cfg.panels && n !== lead ? ' m-end' : '', { x: cfg.panels ? f.x1 + 8 : x(last(n).x) + 10, y: heights[i], dy: '.32em' }));
  const placed = [];
  for (const n of wanted.filter((m) => !column.includes(m)).sort((a, b) => (b === lead) - (a === lead))) {
    const v = y(last(n).value);
    if (placed.every((py) => Math.abs(py - v) >= 15) && placed.push(v)) tag(n, '', { x: x(last(n).x) - 5, y: v - 10, 'text-anchor': 'end' });
  }
  if (!point) add(f.g, 'line', { class: 'm-needle', x1: 0, x2: 0, y1: f.y1, y2: f.y0 });
  const keys = keysOf(rows);
  const px = keys.map((k) => x(rows.find((r) => r.key === k).x));
  keys.forEach((key, i) => {
    const at = rows.filter((r) => r.key === key);
    const left = i ? (px[i - 1] + px[i]) / 2 : f.x0;
    const right = i < keys.length - 1 ? (px[i] + px[i + 1]) / 2 : f.x1;
    const band = add(f.g, 'g', { 'data-row': key, 'data-nx': px[i].toFixed(1), 'aria-label': at.map((r) => r.reading || r.display).join(' ') });
    if (point) add(band, 'rect', { class: 'm-hit', x: px[i] - 22, y: y(at[0].value ?? at[0].high) - 22, width: 44, height: 44 });
    else add(band, 'rect', { class: 'm-hit', x: left, y: f.y1, width: right - left, height: f.y0 - f.y1 });
    for (const r of at.filter((a) => !blank(a.value))) {
      const solo = cfg.dots || points(r.series).length === 1 ? ' is-solo' : '';
      add(band, 'rect', { class: `m-dot${solo}${r.hollow ? ' is-hollow' : ''}${r.series === lead ? ' is-lead' : ''}`, x: px[i] - 5, y: y(r.value) - 5, width: 10, height: 10 });
    }
  });
}
function lines(plot, rows, cfg) {
  const f = frame(plot);
  const longest = Math.max(0, ...labelled(seriesOf(rows), cfg.highlight).map((n) => n.length));
  chart(inner(f.g, f.W, f.H, { top: 12, right: Math.min(f.W * 0.3, longest * 7.5 + 16), bottom: 28, left: 56 }), rows, cfg, true);
}
function multiples(plot, rows, cfg) {
  const { panels } = cfg;
  const gap = 24;
  let cols = 1;
  let best = 0;
  for (let c = 1; c <= panels.length; c++) { // the grid with the most room per panel
    const room = Math.min((plot.clientWidth + gap) / c - gap, ((plot.clientHeight + gap) / Math.ceil(panels.length / c) - gap) * 1.6);
    if (room > best) [cols, best] = [c, room];
  }
  const down = Math.ceil(panels.length / cols);
  const f = frame(plot, down * 150);
  const cw = (f.W + gap) / cols;
  const ch = (f.H + gap) / down;
  panels.forEach((panel, i) => {
    const g = add(f.g, 'g', { transform: `translate(${(i % cols) * cw} ${Math.floor(i / cols) * ch})` });
    add(g, 'text', { class: 'm-title', x: 0, y: 14, text: panel.title });
    const named = cfg.highlight && seriesOf(rows).length > 1 && cw > 240;
    chart(inner(g, cw - gap, ch - gap, { top: 28, right: named ? 70 : 8, bottom: 24, left: 48 }), rows.filter((r) => r.panel === panel.id), { ...cfg, ...panel, panels: true, endLabels: named }, !!cfg.highlight);
  });
}
window.plateDraw = { add, frame, inner, scale, axes, chart, lines, multiples, fmt };
})();
