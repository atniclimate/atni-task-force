// The Data Center page: count squares in the instruments, the Council plate's second view, the jobs ruler, the matrix's one sentence, and the check of past projections.
// Numbers come from the plates' data blocks; text reaches the page by textContent only.
(function () {
const { add, frame, inner, chart, scale } = plate.draw;
const num = (v) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(v);
const blank = (v) => v === undefined || v === null;

// With scripts, the jump list and a named photograph slot read in the first plate's claim zone, so the plate starts under the tabs. Without them they stay above it.
for (const head of document.querySelectorAll('.dc-panel-head')) head.closest('.panel').querySelector('.plate-claim').append(...head.querySelectorAll('.slot-label, .dc-jump'));

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
  const svg = add(track, 'svg', { class: 'dc-sq', width: Math.min(count, per) * pitch, height, 'aria-hidden': 'true' });
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

// The fixed record is the context for the ratios, so with scripts it becomes the panel's details, under the Reading. Its rows keep their keys and selection.
function moveRecord(root) {
  const list = Object.assign(document.createElement('ol'), { className: 'dc-fixed', id: `${root.id}-record` });
  list.setAttribute('role', 'none');
  list.append(...root.querySelectorAll('.plate-plot .instrument-group, .plate-plot .is-fixed'));
  const more = Object.assign(document.createElement('details'), { className: 'plate-more dc-record' });
  more.append(Object.assign(document.createElement('summary'), { textContent: 'The record' }), list);
  root.querySelector('.plate-view[data-view="reading"]').append(more);
  root.querySelector('.plate-plot').setAttribute('aria-owns', list.id);
  return more;
}
const record = moveRecord(document.getElementById('dc-jobs-per-mw'));

const stopNeedle = (list, y) => { list.querySelector('.needle').style.bottom = `${list.clientHeight - y}px`; };

// One ruler for the project and its jobs, so lengths compare and a bar past the needle is more than one job per MW. Its top is the next 1, 2, or 5 above the longest bar.
const niceTop = (v) => {
  const decade = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 5, 10].find((n) => n * decade >= v) * decade;
};
plate.register('dc-jobs-per-mw', {
  render(ctx) {
    ctx.auto();
    if ((ctx.reason === 'select' || ctx.reason === 'init') && ctx.rows[0]?.group === 'ctx') record.open = true; // arrows or a link reached a record row, so it must show
    if (ctx.reason === 'select') return;
    const rows = ctx.data.rows.filter((r) => r.f);
    const top = niceTop(Math.max(...rows.map((r) => r.high ?? r.value)));
    for (const r of rows) r.axis.domain = [0, top];
    ctx.auto();
    const last = rowNode(ctx.plot, 'other');
    const steps = trackOf(last).clientWidth < 300 ? 1 : 5; // the Table view narrows the plot, and five steps would run together
    for (const node of [rowNode(ctx.plot, 'mw'), last]) {
      node.querySelector('.instrument-ends').replaceChildren(...Array.from({ length: steps + 1 }, (_, i) => {
        const tick = document.createElement('span');
        tick.style.setProperty('--t', i / steps);
        tick.textContent = num((top * i) / steps);
        return tick;
      }));
    }
    stopNeedle(last.parentElement, last.offsetTop + last.offsetHeight / 2 + 14); // at the last bar's foot, clear of the ruler's numbers
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
    const region = ctx.inputs.region / 100;
    const pitch = fitPitch(region, trackOf(node).clientWidth, trackOf(node).clientHeight);
    fillTrack(node, [{ n: region, cls: 'dc-ctx' }, { n: ctx.inputs.amw / 100, cls: 'dc-lit', from: 0 }], pitch);
    // The needle reads across the rulers and stops above the squares, where a place on a ruler means nothing.
    const last = rowNode(ctx.plot, ctx.state.p_plant === 'on' ? 'plant' : 'site');
    stopNeedle(node.parentElement, last.offsetTop + last.offsetHeight);
    // The site row says whose figure it is.
    rowNode(ctx.plot, 'site').querySelector('.ladder-tag').textContent = blank(ctx.state.p_l) ? "No applicant figure; the record's spread" : "At the applicant's figure";
  },
});

// One sentence for a cell, however many figures it holds. plate.js adds a partly figure's limit, and the receipts line under it counts the statuses.
plate.register('dc-tradeoff-matrix', {
  render(ctx) {
    const [first] = ctx.rows;
    ctx.auto();
    if (first) ctx.reading(`${first.label}, ${first.column[0].toLowerCase()}${first.column.slice(1)}: ${ctx.rows.map((r) => r.display).join('; ')}.`);
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
        const x = +dot.getAttribute('x') - 6;
        const near = names.filter((h) => Math.abs(h - top) < 48);
        const overAxis = x - 88 < 56; // on a narrow plot the figure runs back over the axis, so it rises clear of the tick there
        add(svg, 'text', { class: 'm-label is-lead', x, y: year === '2050' && near.length ? Math.min(top, Math.min(...near) - 17) : overAxis ? top - 16 : top, 'text-anchor': 'end', text: `${year}: ${num(r.value)}` });
      }
    }
  },
});

// The Council plate, Lines: the line's name sits over its end, so the years take the plot's width and no margin can cut the name at a narrow window.
// The default year is the first, so the years start 24px in from the ticks, or the needle would read as the y axis. Both inputs show their marks, grey until selected.
const LEAD = 'Data centers and chip fabs';
function drawLines(ctx) {
  const { plot, data } = ctx;
  const f = frame(plot);
  const area = inner(f.g, f.W, f.H, { top: 20, right: 14, bottom: 28, left: 56 });
  const [from, to] = data.plot.xdomain;
  chart(area, data.rows, { ...data.plot, xdomain: [from - ((to - from) * 24) / (area.x1 - area.x0 - 24), to] }, false);
  for (const dot of f.g.querySelectorAll('.m-dot')) {
    dot.classList.remove('is-lead');
    dot.classList.add('is-solo');
  }
  const y = scale('linear', data.plot.domain, [area.y0, area.y1]);
  add(f.g, 'text', { class: 'm-label is-lead', x: area.x1 - 8, y: y(data.rows.at(-1).value) - 18, 'text-anchor': 'end', 'aria-hidden': 'true', text: LEAD });
}
// Its second view: the region today, then each year's load in squares of one size, in rows of 25 as in every count view. A workbook input is hollow, and the squares up to the high input
// recede. Each year is a stop of the same list as in Lines, so keys and the Reading do not change with the view.
function drawSquares(ctx) {
  const { plot, data, inputs } = ctx;
  const f = frame(plot);
  const per = 25;
  const line = 24;
  const lines = (n) => Math.ceil(n / per);
  const years = data.rows.map((r) => ({ r, mid: r.value / 100, top: (r.high ?? r.value) / 100 }));
  const room = f.H - line * (years.length + 1);
  const pitch = Math.max(5, Math.min(32, Math.floor(f.W / per), Math.floor(room / years.reduce((sum, y) => sum + lines(y.top), lines(inputs.region / 100)))));
  let at = 0;
  const stripe = (parent, text, n, draw) => {
    add(parent, 'text', { class: 'm-label', x: 0, y: at + 16, text });
    const box = add(parent, 'g', { transform: `translate(0 ${at + line})` });
    draw(box);
    at += line + lines(n) * pitch;
  };
  const region = add(f.g, 'g', { 'aria-hidden': 'true' });
  stripe(region, `The region today: ${num(inputs.region)} aMW. One square is 100 aMW.`, inputs.region / 100, (box) => add(box, 'path', { class: 'dc-ctx', d: cells(0, inputs.region / 100, pitch, per) }));
  for (const { r, mid, top } of years) {
    const band = add(f.g, 'g', { 'data-row': r.key }); // plate.js gives it its role and names it with the Reading
    add(band, 'rect', { class: 'm-hit', x: 0, y: at, width: f.W, height: line + lines(top) * pitch });
    stripe(band, `${r.key}: ${num(r.value)} aMW${r.high ? `, fainter to ${num(r.high)} at high input` : ''}`, top, (box) => {
      add(box, 'path', { class: 'm-count is-hollow', d: cells(0, mid, pitch, per) });
      if (top > mid) add(box, 'path', { class: 'm-count is-hollow dc-faint', d: cells(Math.ceil(mid), top - Math.ceil(mid), pitch, per) });
    });
  }
}
plate.register('dc-pnw-load', {
  render(ctx) {
    ctx.auto();
    if (ctx.reason === 'select' || !ctx.plot.clientWidth) return;
    const squares = ctx.state.pnw_view === 'squares';
    ctx.plot.parentElement.classList.toggle('dc-is-squares', squares);
    (squares ? drawSquares : drawLines)(ctx);
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

// The check of past projections: a row's end and the readout say how far off it ran, and the EIA target year changes each row's edition.
plate.register('dc-forecast-check', {
  render(ctx) {
    ctx.auto();
    if (ctx.reason !== 'select') {
      for (const node of ctx.plot.querySelectorAll('[data-row]')) {
        const [a, b] = ctx.data.rows.filter((r) => r.key === node.dataset.row && (!r.when || r.when === ctx.state.fc_target));
        const tag = node.querySelector('.ladder-label .ladder-tag');
        if (tag) tag.textContent = a?.tag ?? '';
        if (a?.fields) ctx.setRow(a.key, { frac: a.frac, x2: b.frac, lo: Math.min(a.frac, b.frac), hi: Math.max(a.frac, b.frac), text: a.fields.cell });
      }
    }
    const [lead] = ctx.rows;
    if (lead?.fields) ctx.readout(lead.fields.diff, lead.fields.diff_unit);
  },
});

// County climate: the scenario is the kit's own setting; the measure and the counties shown are placed here. Each row's figures by measure
// arrive in the plate's data as [claim, value, low, high], every claim already among its receipts, and each measure has its own ruler.
const fig3 = (v, lo, hi) => `${plate.fig(v)} (${plate.fig(lo)} to ${plate.fig(hi)})`;
plate.register('dc-climate-counties', {
  render(ctx) {
    const m = ctx.data.measures;
    const meta = m.metrics[ctx.state.cc_metric];
    const pick = ctx.state.cc_state;
    const of = (key) => {
      const f = m.rows[key][ctx.state.cc_metric];
      return { base: f.baseline, fut: f[ctx.state.cc_scenario] };
    };
    if (ctx.reason !== 'select') {
      ctx.auto();
      const [lo, hi] = meta.domain;
      const at = (v) => (v - lo) / (hi - lo);
      const ticks = Array.from({ length: Math.round((hi - lo) / meta.step) + 1 }, (_, i) => lo + i * meta.step);
      const grid = ctx.plot.querySelector('.ladder-grid');
      grid.querySelectorAll('i:not(.ladder-needle):not(.ladder-tick)').forEach((n) => n.remove());
      grid.prepend(...ticks.map((t) => Object.assign(document.createElement('i'), { style: `--x:${at(t)}` })));
      ctx.plot.querySelector('.ladder-axis').replaceChildren(...ticks.map((t) => Object.assign(document.createElement('span'), { style: `--x:${at(t)}`, textContent: plate.fig(t) })));
      ctx.plot.querySelector('.ladder-group-label').textContent = meta.axis;
      for (const node of ctx.plot.querySelectorAll('.ladder-row')) {
        const key = node.dataset.row;
        const { base, fut } = of(key);
        node.hidden = pick === 'dc' ? !m.dc.includes(key) : !key.endsWith(`-${pick}`);
        ctx.setRow(key, { frac: at(base[1]), x2: at(fut[1]), lo: Math.min(at(base[1]), at(fut[1])), hi: Math.max(at(base[1]), at(fut[1])), text: `${fig3(...base.slice(1))} and ${fig3(...fut.slice(1))} ${meta.unit}` });
      }
      const chosen = ctx.plot.querySelector(`.ladder-row[data-row="${ctx.key}"]`);
      if (chosen?.hidden) requestAnimationFrame(() => ctx.plot.querySelector('.ladder-row:not([hidden])')?.click()); // a filter hid the selected county, so the first one shown takes over
    }
    const label = ctx.data.rows.find((r) => r.key === ctx.key)?.label;
    const { base, fut } = of(ctx.key);
    const [b, f] = [fig3(...base.slice(1)), fig3(...fut.slice(1))];
    ctx.reading(`${label}, ${m.scenarios[ctx.state.cc_scenario]}: the ${meta.words} averages about ${f} ${meta.unit} in 2040 to 2059, the median of seven models with the lowest and highest in parentheses, against ${b} ${meta.unit} in 1995 to 2014. A county mean on a quarter-degree grid; research data, not siting guidance. Limit: ${ctx.data.receipts[fut[0]].limit}`);
    ctx.readout(f, meta.unit);
    ctx.fact(`1995 to 2014, historical run: ${b} ${meta.unit}`);
    ctx.fact(`2040 to 2059, median of seven models: ${f} ${meta.unit}`);
  },
});

// Where proposals sit: the selected land row lights its squares on the county map, and the kind picked dims the rest.
plate.register('dc-project-land', {
  render(ctx) {
    ctx.auto();
    for (const sq of document.querySelectorAll('#project-map .m')) {
      sq.classList.toggle('is-selected', sq.dataset.row === ctx.key);
      sq.classList.toggle('is-dim', sq.dataset.row !== ctx.key || (ctx.state.kind !== 'all' && sq.dataset.kind !== ctx.state.kind));
    }
  },
});
})();
