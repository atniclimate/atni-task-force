// The Data Center page: the proposal's Count view, the region on the load plate's axis, the cooling readout that follows its control, the jobs ruler, the
// matrix's one sentence, the check of past projections, the county Table that follows its measure, and the atlas's county card.
// Numbers come from the plates' data blocks and the page's own record list; text reaches the page by textContent only. Nothing here moves a laid-out
// block after first paint (data-centers-01): every plate is in its final place in the HTML.
(function () {
const { add, frame, inner, chart, scale } = plate.draw;
const register = (id, options) => document.querySelector(`[data-plate="${id}"]`) && plate.register(id, options); // home loads this script for dc-project alone
const num = (v) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(v);
const blank = (v) => v === undefined || v === null;
const el = (tag, cls, ...kids) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  node.append(...kids.filter((k) => !blank(k)));
  return node;
};

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
    note = el('p', 'caption dc-unit');
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
  root.querySelector('.plate-detail').append(more);
  root.querySelector('.plate-plot').setAttribute('aria-owns', list.id);
  return more;
}
const jobs = document.getElementById('dc-jobs-per-mw');
const record = jobs && moveRecord(jobs);

const stopNeedle = (list, y) => { list.querySelector('.needle').style.bottom = `${list.clientHeight - y}px`; };

// One ruler for the project and its jobs, so lengths compare and a bar past the needle is more than one job per MW. Its top is the next 1, 2, or 5 above the longest bar.
const niceTop = (v) => {
  const decade = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 5, 10].find((n) => n * decade >= v) * decade;
};
register('dc-jobs-per-mw', {
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

// Cooling: the readout follows the row the reader's last setting moves (data-centers-08): PUE moves the electricity, a grid the CO2. A size, a load factor, or
// a cooling design moves the water on site, the selected row from the start, so the readout opens on the water the title names (data-centers-16).
const READS = { c_pue: 'energy', c_grid: 'co2', c_own: 'co2' };
let coolBy = null;
const cooling = document.getElementById('dc-cooling');
cooling?.addEventListener('input', (e) => { coolBy = READS[e.target.closest('[data-param]')?.dataset.param] || null; }, true);
cooling?.addEventListener('click', (e) => { if (e.target.closest('[data-reset]')) coolBy = null; }, true);
register('dc-cooling', {
  render(ctx) {
    countRows(ctx, ['site', 'plant'], (top) => (top <= 40000 ? 100 : 1000), (unit) => `One square is ${unit} million liters of water, in both water rows.`);
    const r = coolBy ? ctx.data.rows.find((x) => x.key === coolBy) : ctx.rows[0];
    if (r?.key === 'site' && !r.text) ctx.readout('None', 'on site'); // closed loop or dry: the row's own word, never an empty figure
    else if (coolBy && r?.text) ctx.readout(r.text, r.unit);
  },
});

// The proposal: Count first, one square a hundred aMW in rows of 25, as in every count view on the site: the region today, the Council's input for 2030, and the
// project in orange. Rulers is the instrument the build draws, its rows on logarithmic rulers of one span under one needle.
function drawCount(ctx) {
  const { plot, inputs } = ctx;
  let box = plot.querySelector('.dc-count');
  if (!box) {
    box = el('div', 'dc-count');
    box.setAttribute('aria-hidden', 'true'); // the Rulers rows and the Table hold every figure with its claim
    plot.append(box);
  }
  box.replaceChildren();
  const amw = ctx.data.rows.find((r) => r.key === 'amw').value;
  const per = 25;
  const line = 28;
  const fields = [
    { text: `The region's load today: ${num(inputs.region)} aMW`, n: inputs.region / 100, cls: 'dc-ctx' },
    { text: `The Council's 2030 input, data centers and chip fabs: ${num(inputs.c2030)} aMW`, n: inputs.c2030 / 100, cls: 'm-count is-hollow' },
    { text: `This project: ${num(amw)} aMW`, n: amw / 100, cls: 'dc-lit' },
  ];
  const lines = (n) => Math.max(1, Math.ceil(n / per - 1e-9));
  const W = box.clientWidth || plot.clientWidth;
  const H = (plot.clientHeight || 400) - 8;
  const pitch = Math.max(6, Math.min(28, Math.floor(W / per), Math.floor((H - line * fields.length) / fields.reduce((sum, f) => sum + lines(f.n), 0))));
  for (const f of fields) {
    const svg = add(el('div', 'dc-count-field'), 'svg', { width: per * pitch, height: lines(f.n) * pitch });
    add(svg, 'path', { class: f.cls, d: cells(0, f.n, pitch, per) });
    box.append(el('p', 'dc-count-label', f.text), svg.parentNode);
  }
}
// The Reading: Count's is the plate's own, one sentence on the load and its share. Rulers adds the energy and the water its rows read, in words (data-centers-29, -33).
const plain = (v) => new Intl.NumberFormat('en-US').format(v);
function rulersReading(ctx) {
  const at = (k) => ctx.data.rows.find((r) => r.key === k);
  const { p_mw, p_lf, p_l, p_plant } = ctx.state;
  return [
    `${plain(p_mw)} MW at a ${plain(p_lf)} load factor averages ${at('amw').text} aMW, about ${at('twh').text} TWh a year and ${at('share').text} percent of the region's ${plain(ctx.inputs.region)} aMW today.`,
    blank(p_l) ? `Water on site would be ${at('site').display} a year, across the record's ${plain(ctx.inputs.ms)} to ${plain(ctx.inputs.google)} liters per kWh.`
      : `Water on site would be ${at('site').display} a year, at the applicant's ${plain(p_l)} liters per kWh.`,
    p_plant === 'on' ? `The power plants would consume about ${at('plant').display} more.` : "Water at the power plant is not counted here, since the convention for a reservoir's evaporation is not stated.",
    "Modeled from the reader's inputs; sources checked 11/04/2026.",
  ].join(' ');
}
register('dc-project', {
  render(ctx) {
    ctx.auto();
    markWords(ctx);
    const counting = ctx.state.p_view !== 'rulers';
    if (!counting && ctx.rows[0]?.f) ctx.reading(rulersReading(ctx));
    ctx.plot.classList.toggle('dc-is-count', counting);
    if (ctx.reason === 'select' || !ctx.plot.clientWidth) return;
    if (counting) {
      drawCount(ctx);
      return;
    }
    // One water row until the reader counts the plant, set before measuring, so the squares fit the height the rows then have.
    rowNode(ctx.plot, 'plant').hidden = ctx.state.p_plant !== 'on';
    const node = rowNode(ctx.plot, 'share');
    const region = ctx.inputs.region / 100;
    const pitch = fitPitch(region, trackOf(node).clientWidth, trackOf(node).clientHeight);
    fillTrack(node, [{ n: region, cls: 'dc-ctx' }, { n: ctx.data.rows.find((r) => r.key === 'amw').value / 100, cls: 'dc-lit', from: 0 }], pitch);
    // The needle reads across the rulers and stops above the squares, where a place on a ruler means nothing.
    const last = rowNode(ctx.plot, ctx.state.p_plant === 'on' ? 'plant' : 'site');
    stopNeedle(node.parentElement, last.offsetTop + last.offsetHeight);
    // The site row says whose figure it is.
    rowNode(ctx.plot, 'site').querySelector('.ladder-tag').textContent = blank(ctx.state.p_l) ? "No applicant figure; the record's spread" : "At the applicant's figure";
  },
});

// One sentence for a cell, however many figures it holds. plate.js adds a partly figure's limit, and the receipts line under it counts the statuses.
register('dc-tradeoff-matrix', {
  render(ctx) {
    const [first] = ctx.rows;
    ctx.auto();
    if (first) ctx.reading(`${first.label}, ${first.column[0].toLowerCase()}${first.column.slice(1)}: ${ctx.rows.map((r) => r.display).join('; ')}.`);
  },
});

// EIA: the selected case read at 2030 and 2050, so the needle has something to read where the four lines nearly touch. A year the four cases share says so,
// rather than "span 104.8 to 104.8" (data-centers-10).
register('dc-eia-servers', {
  render(ctx) {
    ctx.auto();
    const lead = ctx.data.plot.highlight;
    const r = ctx.rows.find((x) => x.series === lead) || ctx.rows[0];
    const band = r && (ctx.data.plot.band || []).find((b) => b[0] === r.year);
    if (band && band[1] === band[2]) ctx.reading(`${r.series}: ${r.text} TWh for data center servers in ${r.year}. All four cases share this figure for ${r.year}.`);
    if (ctx.reason === 'select' || !ctx.plot.clientWidth) return;
    const svg = ctx.plot.querySelector('.plate-svg');
    const names = [...svg.querySelectorAll('.m-label')].map((n) => +n.getAttribute('y')); // the column at the lines' ends
    for (const year of ['2030', '2050']) {
      const dot = ctx.plot.querySelector(`[data-row="${year}"] .m-dot.is-lead`);
      const at = ctx.data.rows.find((x) => x.key === year && x.series === lead);
      if (dot && at) {
        dot.classList.add('is-solo');
        const top = +dot.getAttribute('y') - 6;
        const x = +dot.getAttribute('x') - 6;
        const near = names.filter((h) => Math.abs(h - top) < 48);
        const overAxis = x - 88 < 56; // on a narrow plot the figure runs back over the axis, so it rises clear of the tick there
        add(svg, 'text', { class: 'm-label is-lead', x, y: year === '2050' && near.length ? Math.min(top, Math.min(...near) - 17) : overAxis ? top - 16 : top, 'text-anchor': 'end', text: `${year}: ${num(at.value)}` });
      }
    }
  },
});

// The Council plate: the line's name sits over its end, so the years take the plot's width and no margin can cut the name at a narrow window. The whole region
// today is a rule across the same axis (data-centers-19), so the input reads against it. The default year is the first, so the years start 24px in from the ticks,
// or the needle would read as the y axis.
const LEAD = 'Data centers and chip fabs';
register('dc-pnw-load', {
  render(ctx) {
    ctx.auto();
    if (ctx.reason === 'select' || !ctx.plot.clientWidth) return;
    const { plot, data, inputs } = ctx;
    const f = frame(plot);
    const area = inner(f.g, f.W, f.H, { top: 28, right: 14, bottom: 28, left: 56 });
    const [from, to] = data.plot.xdomain;
    chart(area, data.rows, { ...data.plot, xdomain: [from - ((to - from) * 24) / (area.x1 - area.x0 - 24), to] }, false);
    for (const dot of f.g.querySelectorAll('.m-dot')) {
      dot.classList.remove('is-lead');
      dot.classList.add('is-solo');
    }
    const y = scale('linear', data.plot.domain, [area.y0, area.y1]);
    const ref = add(f.g, 'g', { class: 'dc-ref', 'aria-hidden': 'true' });
    add(ref, 'line', { x1: area.x0, x2: area.x1, y1: y(inputs.region), y2: y(inputs.region) });
    add(ref, 'text', { class: 'm-label is-lead', x: area.x1 - 8, y: y(inputs.region) - 8, 'text-anchor': 'end', text: `The region's load today: ${num(inputs.region)} aMW` });
    add(f.g, 'text', { class: 'm-label is-lead', x: area.x1 - 8, y: y(data.rows.at(-1).value) - 18, 'text-anchor': 'end', 'aria-hidden': 'true', text: LEAD });
  },
});

// The range-only EPRI mark gets its name on the plot.
register('dc-lbnl-us', {
  render(ctx) {
    ctx.auto();
    if (ctx.reason === 'select' || !ctx.plot.clientWidth) return;
    const ranges = ctx.plot.querySelectorAll('.m-range');
    const mark = ranges[ranges.length - 1];
    if (mark) add(ctx.plot.querySelector('.plate-svg'), 'text', { class: 'm-label', x: mark.getAttribute('x1') - 6, y: +mark.getAttribute('y2') + 12, 'text-anchor': 'end', text: 'EPRI' });
  },
});

// The check of past projections: a row's end and the readout say how far off it ran, and the EIA target year changes each row's edition.
register('dc-forecast-check', {
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

// County climate: the scenario is the kit's own setting; the measure and the counties shown are placed here. Each row's figures by measure arrive in the
// plate's data as [claim, value, low, high], every claim already among its receipts, and each measure has its own ruler. The Table, and so the CSV, follow
// the measure: each line's figure and its one claim are rewritten for it (CD 12).
const fig3 = (v, lo, hi) => `${plate.fig(v)} (${plate.fig(lo)} to ${plate.fig(hi)})`;
const STATUS = { verified: 'verified', partly: 'partly verified' };
function claimRef(plateId, id, status) {
  const a = el('a', null, el('span', `st ${status === 'verified' ? 'st-v' : 'st-p'}`), id);
  a.href = `sources/#${plateId}-source-${id}`;
  a.dataset.claim = id;
  a.firstChild.setAttribute('aria-hidden', 'true');
  return el('span', 'claim-ref', a, ` ${STATUS[status] || status}`);
}
function climateTable(ctx, m, meta) {
  const root = ctx.plot.closest('.plate');
  for (const tr of root.querySelectorAll('.plate-table tbody tr[data-key]')) {
    const row = m.rows[tr.dataset.key]?.[ctx.state.cc_metric];
    if (!row) continue;
    const past = tr.children[2].textContent.startsWith('1995');
    const [claim, v, lo, hi] = row[past ? 'baseline' : tr.dataset.when];
    tr.children[3].textContent = `${fig3(v, lo, hi)} ${meta.unit}`;
    tr.lastElementChild.replaceChildren(claimRef(root.id, claim, ctx.data.receipts[claim]?.status));
  }
}
register('dc-climate-counties', {
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
        // One line a county, the finding first, "87 F, from 84": the ranges are in the readout and the facts beside the plot.
        ctx.setRow(key, { frac: at(fut[1]), x2: at(base[1]), lo: Math.min(at(base[1]), at(fut[1])), hi: Math.max(at(base[1]), at(fut[1])), text: `${plate.fig(fut[1])} ${meta.unit}, from ${plate.fig(base[1])}` });
      }
      climateTable(ctx, m, meta);
      const chosen = ctx.plot.querySelector(`.ladder-row[data-row="${ctx.key}"]`);
      if (chosen?.hidden) requestAnimationFrame(() => ctx.plot.querySelector('.ladder-row:not([hidden])')?.click()); // a filter hid the selected county, so the first one shown takes over
    }
    const label = ctx.data.rows.find((r) => r.key === ctx.key)?.label;
    const { base, fut } = of(ctx.key);
    const [b, f] = [fig3(...base.slice(1)), fig3(...fut.slice(1))];
    ctx.reading(`${label}, ${m.scenarios[ctx.state.cc_scenario]}: the ${meta.words} averages about ${f} ${meta.unit} in 2040 to 2059, the median of seven models with the lowest and highest in parentheses, against ${b} ${meta.unit} in 1995 to 2014. A county mean on a quarter-degree grid. Limit: ${ctx.data.receipts[fut[0]].limit}`);
    ctx.readout(f, meta.unit);
    for (const r of ctx.rows) r.display = `${r.series.startsWith('2040') ? f : b} ${meta.unit}`; // the facts, the title, and the answer name this measure's figures
  },
});

// The atlas (the Where tab): a county chosen on the map or in the picker lights its squares and fills the card beside it from the page's own record list, two
// records first; each MW figure is that record's claim mark. Its climate row reads the county plate's data. The kind filter dims the other kinds' squares.
(function atlas() {
  const fig = document.getElementById('dc-atlas');
  const pick = fig?.querySelector('[data-atlas-county]');
  if (!pick) return;
  const card = fig.querySelector('[data-atlas-card]');
  const groups = new Map([...fig.querySelectorAll('.dc-cty')].map((g) => [g.dataset.fips, g]));
  const records = [...document.querySelectorAll('#land-records li[data-fips]')];
  let kind = 'all';
  let current = null;
  let climate;
  const climateOf = (key) => {
    climate ??= JSON.parse(document.getElementById('plate-data-dc-climate-counties')?.textContent || 'null');
    return climate && key ? { row: climate.measures.rows[key]?.tmax_summer, receipts: climate.receipts } : null;
  };
  const paint = () => {
    for (const [fips, g] of groups) {
      g.classList.toggle('is-on', fips === current);
      for (const sq of g.querySelectorAll('.dc-m')) sq.classList.toggle('is-dim', kind !== 'all' && sq.dataset.kind !== kind);
    }
    pick.value = current;
  };
  const recordOf = (li) => {
    const mw = li.querySelector('a.cr');
    return el('li', null,
      el('span', 'dc-rec-name', li.querySelector('strong').textContent),
      el('span', 'dc-rec-mw', ...(mw ? [mw.cloneNode(true), ' as filed'] : ['No MW stated'])),
      el('span', 'dc-rec-meta', `${li.dataset.meta}; ${li.dataset.land}. `, Object.assign(el('a', null, 'Full record'), { href: `#${li.id}` })));
  };
  const render = () => {
    const option = pick.selectedOptions[0];
    const all = records.filter((li) => li.dataset.fips.split(' ').includes(current));
    const list = all.filter((li) => kind === 'all' || li.dataset.kind === kind);
    const words = all.length === 1 ? 'one named proposal' : `${all.length} named proposals`;
    const kids = [el('h4', null, option.textContent.replace(/ \(\d+\)$/, '')),
      el('p', 'caption', kind === 'all' ? `The filings read name ${words} here.` : `${list.length} of the ${words} here ${list.length === 1 ? 'is' : 'are'} this kind.`)];
    const ol = el('ol', 'dc-card-records', ...list.slice(0, 2).map(recordOf));
    kids.push(ol);
    if (list.length > 2) {
      const more = el('button', 'button button-secondary', `Show the other ${list.length - 2}`);
      more.type = 'button';
      more.addEventListener('click', () => {
        ol.append(...list.slice(2).map(recordOf));
        more.remove();
        ol.children[2]?.querySelector('a')?.focus();
      });
      kids.push(more);
    }
    const key = option.dataset.climate;
    const c = climateOf(key);
    if (c?.row) {
      const [fc, fv, flo, fhi] = c.row.ssp245;
      const [bc, bv, blo, bhi] = c.row.baseline;
      const link = Object.assign(el('a', null, 'Compare it with the other counties'), { href: `#climate&dc-climate-counties=${key}` });
      kids.push(el('div', 'dc-card-climate',
        el('p', null, 'May to September daytime high, lower-emissions scenario (SSP2-4.5): ', el('b', null, `${fig3(fv, flo, fhi)} F`), ' in 2040 to 2059, against ',
          el('b', null, `${fig3(bv, blo, bhi)} F`), ' in 1995 to 2014; the median of seven models, lowest and highest in parentheses. '),
        el('p', 'caption', claimRef('dc-climate-counties', fc, c.receipts[fc]?.status), ', ', claimRef('dc-climate-counties', bc, c.receipts[bc]?.status), '. ', link)));
    }
    card.replaceChildren(...kids);
  };
  // The chosen county rides in the address as atlas=FIPS (DIRECTION-R2 3.8), replacing the entry, so a copied link or a reload opens the same card.
  const said = () => window.siteAddress.read().params.get('atlas');
  const select = (fips, write) => {
    if (!fips || ![...pick.options].some((o) => o.value === fips)) return false;
    current = fips;
    paint();
    render();
    if (write) {
      const { anchor, params } = window.siteAddress.read();
      params.set('atlas', fips);
      window.siteAddress.write(anchor, params);
    }
    return true;
  };
  fig.addEventListener('click', (e) => { const g = e.target.closest('.dc-cty'); if (g) select(g.dataset.fips, true); });
  pick.addEventListener('change', () => select(pick.value, true));
  fig.querySelector('[data-atlas-kind]')?.addEventListener('change', (e) => { kind = e.target.value; paint(); render(); });
  window.addEventListener('hashchange', () => { if (said() && said() !== current) select(said()); });
  if (!select(said())) select(pick.dataset.first);
})();
})();
