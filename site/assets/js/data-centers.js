// The Data Center page: count squares in the instruments and the Council plate, custom layouts for two plates, and details
// that open for a deep link. Numbers come from the plates' data blocks; text reaches the page by textContent only.
(function () {
const { add, frame, inner, chart, scale } = plate.draw;
const num = (v) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(v);
const blank = (v) => v === undefined || v === null;

// The largest pitch at which n squares fit W by H.
function fitPitch(n, W, H, max = 24) {
  let pitch = max;
  while (pitch > 4 && Math.ceil(n / Math.max(1, Math.floor(W / pitch))) * pitch > H) pitch -= 1;
  return pitch;
}
// Squares from cell `from` on; a fraction of a unit draws a narrower last square, so a small project still shows.
function cells(from, amount, pitch, per) {
  const size = pitch - 2;
  const one = (i, w) => `M${(i % per) * pitch + 0.75} ${Math.floor(i / per) * pitch + 0.75}h${w}v${size}h${-w}z`;
  const whole = Math.floor(amount + 1e-9);
  let d = '';
  for (let i = 0; i < whole; i++) d += one(from + i, size);
  if (amount - whole > 0.02) d += one(from + whole, Math.max(2, size * (amount - whole)));
  return d;
}
const trackOf = (node) => node.querySelector('.ladder-track');
const rowNode = (plot, key) => plot.querySelector(`[data-row="${key}"]`);

// Runs of squares in a row's track, centered on the row's height. A run with `from` lies over earlier ones.
function fillTrack(node, runs, pitch) {
  const track = trackOf(node);
  node.classList.add('dc-sqrow');
  track.querySelector('.dc-sq')?.remove();
  const per = Math.max(1, Math.floor(track.clientWidth / pitch));
  const used = (n) => Math.ceil(n - 1e-9); // 0.15 x 100 is 15.000000000000002, and must not skip a cell
  const count = runs.reduce((sum, run) => sum + (blank(run.from) ? used(run.n) : 0), 0);
  const height = Math.ceil(count / per) * pitch;
  const svg = add(track, 'svg', { class: 'dc-sq', width: Math.min(count, per) * pitch, height, 'aria-hidden': 'true' }); // its wash fits the squares
  svg.style.top = `${Math.max(0, (track.clientHeight - height) / 2)}px`;
  let at = 0;
  for (const run of runs) {
    add(svg, 'path', { class: run.cls, d: cells(run.from ?? at, run.n, pitch, per) });
    if (blank(run.from)) at += used(run.n);
  }
}
function unitNote(plot, text) {
  let note = plot.querySelector('.dc-unit');
  if (!note) {
    note = document.createElement('p');
    note.className = 'caption dc-unit';
    note.setAttribute('aria-hidden', 'true');
    plot.prepend(note);
  }
  note.textContent = text;
}
// A row with no figure prints words, so they drop to body size.
function markWords(ctx) {
  for (const r of ctx.data.rows) if (r.f) rowNode(ctx.plot, r.key)?.classList.toggle('dc-words', !r.text);
}
// Rows counted at one shared pitch, so their lengths compare. All are modeled, so hollow; a range's upper part recedes.
function countRows(ctx, keys, unitFor, say) {
  ctx.auto();
  markWords(ctx);
  if (ctx.reason === 'select' || !ctx.plot.clientWidth) return;
  const rows = keys.map((k) => ctx.data.rows.find((r) => r.key === k));
  const top = (r) => r.high ?? r.value ?? 0;
  const unit = unitFor(Math.max(...rows.map(top)));
  unitNote(ctx.plot, say(unit));
  const nodes = rows.map((r) => rowNode(ctx.plot, r.key));
  const pitch = Math.min(...nodes.map((node, i) => fitPitch(Math.ceil(top(rows[i]) / unit) || 1, trackOf(node).clientWidth, trackOf(node).clientHeight)));
  rows.forEach((r, i) => {
    const low = r.low ?? r.value ?? 0;
    fillTrack(nodes[i], [{ n: low / unit, cls: 'm-count is-hollow' }, { n: (top(r) - low) / unit, cls: 'm-count is-hollow dc-faint' }], pitch);
  });
}

// The fixed record is the context for the ratios, so with scripts it reads under the Reading. Its rows keep their keys and selection.
function moveRecord(root) {
  const plot = root.querySelector('.plate-plot');
  const list = Object.assign(document.createElement('ol'), { className: 'dc-fixed', id: `${root.id}-record` });
  list.setAttribute('role', 'none');
  list.append(...plot.querySelectorAll('.instrument-group, .is-fixed'));
  root.querySelector('.plate-view[data-view="reading"]').append(list);
  plot.setAttribute('aria-owns', list.id);
  list.addEventListener('click', () => { root.querySelector('.plate-detail').scrollTop = 0; }); // the Reading it just changed
}
moveRecord(document.getElementById('dc-jobs-per-mw'));

plate.register('dc-jobs-per-mw', {
  render(ctx) {
    countRows(ctx, ['build', 'ops', 'other'], (top) => (top <= 400 ? 1 : top <= 4000 ? 10 : 100),
      (unit) => `One square is ${unit === 1 ? 'one job' : `${unit} jobs`} at this size. The upper part of a range is fainter.`);
  },
});

plate.register('dc-cooling', {
  render(ctx) {
    countRows(ctx, ['site', 'plant'], (top) => (top <= 40000 ? 100 : 1000), (unit) => `One square is ${unit} million liters of water, in both water rows.`);
  },
});

plate.register('dc-project', {
  render(ctx) {
    ctx.auto();
    markWords(ctx);
    if (ctx.reason === 'select' || !ctx.plot.clientWidth) return;
    // One water row until the reader counts the plant, set before measuring, so the squares fit the height the rows then have.
    rowNode(ctx.plot, 'plant').hidden = ctx.state.p_plant !== 'on';
    const node = rowNode(ctx.plot, 'share');
    const field = ctx.inputs.region / 100;
    const pitch = fitPitch(field, trackOf(node).clientWidth, trackOf(node).clientHeight);
    fillTrack(node, [{ n: field, cls: 'dc-ctx' }, { n: ctx.inputs.amw / 100, cls: 'dc-lit', from: 0 }], pitch);
    // The site row says whose figure it is.
    rowNode(ctx.plot, 'site').querySelector('.ladder-tag').textContent = blank(ctx.state.p_l) ? "No applicant figure; the record's spread" : "At the applicant's figure";
  },
});

// The selected case read at 2030 and 2050, so the needle has something to read where the four lines nearly touch.
plate.register('dc-eia-servers', {
  render(ctx) {
    ctx.auto();
    if (ctx.reason === 'select' || !ctx.plot.clientWidth) return;
    const lead = ctx.data.plot.highlight;
    const svg = ctx.plot.querySelector('.plate-svg');
    const names = [...svg.querySelectorAll('.m-label')].map((n) => +n.getAttribute('y')); // the column at the lines' ends
    for (const year of ['2030', '2050']) {
      const dot = ctx.plot.querySelector(`[data-row="${year}"] .m-dot.is-lead`);
      const r = ctx.data.rows.find((x) => x.key === year && x.series === lead);
      if (dot && r) {
        dot.classList.add('is-solo');
        const top = +dot.getAttribute('y') - 6;
        const near = names.filter((h) => Math.abs(h - top) < 48);
        add(svg, 'text', { class: 'm-label is-lead', x: +dot.getAttribute('x') - 6, y: year === '2050' && near.length ? Math.min(top, Math.min(...near) - 17) : top, 'text-anchor': 'end', text: `${year}: ${num(r.value)}` });
      }
    }
  },
});

// The Council plate: the tech load over time, then the same load and the whole region in squares of one size.
const LEAD = 'Data centers and chip fabs';
let field = null;
function litField(ctx) {
  const r = ctx.rows.find((x) => x.series === LEAD);
  if (!field || !r) return;
  const mid = r.value / 100;
  field.fill.setAttribute('d', cells(0, mid, field.pitch, field.per));
  field.range.setAttribute('d', r.high ? cells(Math.ceil(mid), r.high / 100 - Math.ceil(mid), field.pitch, field.per) : '');
  field.text.textContent = `${LEAD}, ${r.year}: ${num(r.value)} aMW${r.high ? `, up to ${num(r.high)} at the high input` : ''}.`;
}
function drawCouncil(ctx) {
  const { plot, data, inputs } = ctx;
  const f = frame(plot);
  const split = Math.round(f.H * 0.54);
  const area = inner(f.g, f.W, split, { top: 12, right: 12, bottom: 28, left: 52 });
  chart(area, data.rows, data.plot, false);
  const x = scale('linear', data.plot.xdomain, [area.x0, area.x1]);
  const y = scale('linear', data.plot.domain, [area.y0, area.y1]);
  const leadEnd = data.rows.filter((r) => r.series === LEAD).at(-1);
  const other = data.rows.find((r) => r.series !== LEAD);
  add(f.g, 'text', { class: 'm-label is-lead', x: area.x1, y: y(leadEnd.value) - 10, 'text-anchor': 'end', text: LEAD });
  add(f.g, 'text', { class: 'm-label', x: x(other.x) + 10, y: y(other.value) + 14, text: other.series });

  const top = Math.max(...data.rows.map((r) => r.high ?? r.value)) / 100;
  const counts = [inputs.region / 100, top];
  const line = 20;
  const room = f.H - split - 8 - counts.length * line;
  let pitch = 22;
  const across = () => Math.min(25, Math.floor(f.W / pitch)); // rows of 25, as in every count view
  let per = across();
  while (pitch > 5 && counts.reduce((sum, n) => sum + Math.ceil(n / per) * pitch, 0) > room) {
    pitch -= 1;
    per = across();
  }
  const g = add(f.g, 'g', { 'aria-hidden': 'true', transform: `translate(0 ${split + 8})` });
  let at = 0;
  const stripe = (text, draw, count) => {
    const label = add(g, 'text', { class: 'dc-label', x: 0, y: at + 14, text });
    const box = add(g, 'g', { transform: `translate(0 ${at + line})` });
    at += line + Math.ceil(count / per) * pitch;
    return [label, box, draw(box)];
  };
  stripe(`The region today: ${num(inputs.region)} aMW. One square is 100 aMW, here and below.`, (box) => add(box, 'path', { class: 'dc-ctx', d: cells(0, inputs.region / 100, pitch, per) }), counts[0]);
  const [text, box] = stripe('', () => null, counts[1]);
  field = { text, pitch, per, fill: add(box, 'path', { class: 'dc-lit' }), range: add(box, 'path', { class: 'dc-lit-range' }) };
}
plate.register('dc-pnw-load', {
  render(ctx) {
    if (ctx.reason !== 'select' && ctx.plot.clientWidth) drawCouncil(ctx);
    litField(ctx);
  },
});

// The range-only EPRI mark gets its name on the plot.
plate.register('dc-lbnl-us', {
  render(ctx) {
    ctx.auto();
    if (ctx.reason === 'select' || !ctx.plot.clientWidth) return;
    const ranges = ctx.plot.querySelectorAll('.m-range');
    const mark = ranges[ranges.length - 1];
    if (mark) add(ctx.plot.querySelector('.plate-svg'), 'text', { class: 'm-label', x: mark.getAttribute('x1') - 6, y: +mark.getAttribute('y2') + 12, 'text-anchor': 'end', text: 'EPRI' });
  },
});

// Past forecasts: the LBNL panel holds the most editions, so it takes the left; each panel keeps its own axis and years.
const EDITIONS = { lbnl: ['2025 Update', [2014, 2030]], steo: ['10/2026 outlook', [2026.5, 2027.5]], bnef: ['07/2026 outlook', [2029, 2036]] };
const FORECASTS = new Set(['l16-forecast', 'l25-forecast', 's-may', 's-oct', 'b-dec', 'b-jul-near', 'b-jul-far']);
plate.register('dc-forecast-misses', {
  render(ctx) {
    const { plot, data } = ctx;
    if (ctx.reason === 'select' || !plot.clientWidth) return;
    for (const r of data.rows) r.projected = FORECASTS.has(r.key);
    const f = frame(plot);
    const gap = 24;
    const wide = f.W >= 520;
    const left = wide ? Math.round(f.W * 0.58) : f.W;
    const spots = wide
      ? { lbnl: [0, 0, left, f.H], steo: [left + gap, 0, f.W - left - gap, (f.H - gap) / 2], bnef: [left + gap, (f.H + gap) / 2, f.W - left - gap, (f.H - gap) / 2] }
      : { lbnl: [0, 0, f.W, (f.H - 2 * gap) / 3], steo: [0, (f.H + gap) / 3, f.W, (f.H - 2 * gap) / 3], bnef: [0, (2 * f.H + gap) / 3, f.W, (f.H - 2 * gap) / 3] };
    for (const panel of data.plot.panels) {
      const [gx, gy, w, h] = spots[panel.id];
      const g = add(f.g, 'g', { transform: `translate(${gx} ${gy})` });
      add(g, 'text', { class: 'm-title', x: 0, y: 14, text: panel.title });
      const [highlight, xdomain] = EDITIONS[panel.id];
      chart(inner(g, w, h, { top: 28, right: 8, bottom: 24, left: 44 }), data.rows.filter((r) => r.panel === panel.id), { ...data.plot, ...panel, highlight, xdomain, panels: true }, true);
    }
  },
});
})();
