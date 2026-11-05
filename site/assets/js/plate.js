// Plate kit: tabs, selection, detail, receipts, controls, query state, and formulas over the HTML from build_plates.py.
// Page scripts load after it and call plate.register(id, options). Text by textContent only.
(function () {
const plates = new Map();
const all = (node, selector) => [...node.querySelectorAll(selector)];
const unique = (list) => [...new Set(list)];
const has = (v) => v !== undefined;
const blank = (v) => v === undefined || v === null;
const keysOf = (rows) => unique(rows.map((r) => r.key)).sort((a, b) => a - b || 0); // years in order, ids as listed
const on = (node, type, fn) => node.addEventListener(type, fn);

function set(node, attrs) {
  for (const [name, value] of Object.entries(attrs)) {
    if (name === 'text') node.textContent = value;
    else node.setAttribute(name, value);
  }
  return node;
}
const h = (tag, attrs, ...kids) => {
  const node = set(document.createElement(tag), attrs);
  node.append(...kids);
  return node;
};
const span = (cls, text) => h('span', { class: cls, text });
const draw = window.plateDraw; // plate-svg.js, loaded first
const { add, scale } = draw;

// The first plate on the screen runs to the window's foot; others keep the height CSS gives them.
function fitFirst() {
  const first = all(document, '[data-plate]').find((node) => node.offsetParent);
  if (!first || innerWidth < 1100) return;
  const top = first.getBoundingClientRect().top + scrollY;
  if (top < innerHeight * 0.6) first.style.setProperty('--plate-h', `${Math.round(Math.max(544, innerHeight - top - 16))}px`);
}

// A jump list becomes tabs. Without this, and in print, every panel shows.
function initTabs(strip) {
  const tabs = all(strip, 'a[href^="#"]');
  const panels = tabs.map((a) => document.getElementById(a.hash.slice(1)));
  if (panels.includes(null)) return;
  set(strip.querySelector('ul'), { role: 'tablist', 'aria-label': strip.getAttribute('aria-label') || 'Sections' });
  tabs.forEach((a, i) => {
    a.parentElement.setAttribute('role', 'none');
    set(a, { role: 'tab', id: a.id || `tab-${panels[i].id}`, 'aria-controls': panels[i].id });
    set(panels[i], { role: 'tabpanel', 'aria-labelledby': a.id, tabindex: 0 });
  });
  const show = (n) => {
    tabs.forEach((a, i) => {
      set(a, { 'aria-selected': i === n, tabindex: i === n ? 0 : -1 });
      panels[i].hidden = i !== n;
    });
    strip.classList.toggle('is-sticky', panels[n].offsetHeight > innerHeight);
    fitFirst();
  };
  const go = (n, e) => {
    e.preventDefault();
    show(n);
    panels[n].classList.add('is-entering'); // a tab change counts as a touch; CSS takes it to 0ms under reduced motion
    setTimeout(() => panels[n].classList.remove('is-entering'), 200);
    history.replaceState(null, '', `#${panels[n].id}`);
  };
  const fromHash = () => {
    const target = document.getElementById(location.hash.slice(1));
    const n = panels.findIndex((panel) => panel.contains(target));
    if (n >= 0) show(n);
    if (location.hash === '#checklists') target?.querySelector('details')?.setAttribute('open', '');
    if (n >= 0 && target !== panels[n]) target.scrollIntoView();
    return n >= 0;
  };
  on(strip, 'click', (e) => {
    const n = tabs.indexOf(e.target.closest('a'));
    if (n >= 0) go(n, e);
  });
  on(strip, 'keydown', (e) => {
    const i = tabs.indexOf(e.target);
    // Space on a link does nothing natively, so this is its one action; Enter arrives as the link's click. Alt+Left stays the browser's Back.
    const n = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i || tabs.length) - 1, Home: 0, End: tabs.length - 1, ' ': i }[e.key];
    if (i < 0 || !has(n) || e.altKey || e.ctrlKey || e.metaKey) return;
    go(n, e);
    tabs[n].focus();
  });
  on(window, 'hashchange', fromHash);
  if (!fromHash()) show(0);
}

const grouped = (v) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 12 }).format(v);
// A computed figure: two significant figures, three at 99.5 and up, as the Explorer rounds, so one row prints one number everywhere. A row's digits override.
const sig = (v, d) => (blank(v) ? v : +Number(v).toPrecision(d || (Math.abs(v) >= 99.5 ? 3 : 2)));

// A printed formula, as build_plates.py checks it: numbers, names (dots reach into a branch), + - * / ( ), min, max, ifblank. Blank gives blank.
function evaluate(src, env) {
  const tokens = String(src).match(/\d+\.?\d*(?:e[+-]?\d+)?|[A-Za-z_][\w.]*|\S/gi);
  let i = 0;
  const fold = (next, ops) => () => {
    let a = next();
    while (tokens[i] && ops.includes(tokens[i])) {
      const op = tokens[i++];
      const b = next();
      a = blank(a) || blank(b) || (op === '/' && !b) ? null : { '+': a + b, '-': a - b, '*': a * b, '/': a / b }[op];
    }
    return a;
  };
  const atom = () => {
    const t = tokens[i++];
    if (t === '(') {
      const v = sum();
      i++;
      return v;
    }
    if (t === '-') {
      const v = atom();
      return blank(v) ? null : -v;
    }
    if (/^[\d.]/.test(t)) return +t;
    if (tokens[i] !== '(') return t.split('.').reduce((o, k) => o?.[k], env) ?? null;
    i++;
    const args = [];
    while (tokens[i] !== ')') {
      args.push(sum());
      if (tokens[i] === ',') i++;
    }
    i++;
    if (t === 'ifblank') return args.find((v) => !blank(v)) ?? null;
    return args.some(blank) ? null : Math[t](...args);
  };
  const sum = fold(fold(atom, '*/'), '+-');
  return sum();
}

const current = (p) => p.data.rows.filter((r) => !r.when || r.when === p.state[p.data.by]);
const rowsAt = (p, key) => current(p).filter((r) => r.key === key);
const claimsOf = (rows) => rows.flatMap((r) => [r.claim, ...(r.cites || [])]).filter(Boolean);
// With a company picked across panels, the facts and receipts are that company's.
const focusOf = (p, rows) => {
  const cfg = p.data.plot;
  return cfg.highlight_by && cfg.panels ? rows.filter((r) => r.series === cfg.highlight) : rows;
};

function textOf(r, plus) {
  const n = (v) => `${plus && v > 0 ? '+' : ''}${grouped(sig(v, r.digits))}`;
  const { value: v, low: a, high: b } = r;
  if (!blank(v)) return !blank(a) && !blank(b) ? `${n(v)} (${n(a)} to ${n(b)})` : n(v);
  if (!blank(a) && !blank(b)) return sig(a, r.digits) === sig(b, r.digits) ? n(a) : `${n(a)} to ${n(b)}`;
  if (!blank(a)) return `at least ${n(a)}`;
  return blank(b) ? null : `up to ${n(b)}`;
}
const axisOf = (p, r) => r.axis || (p.data.plot.groups || []).find((g) => g.id === r.group) || p.data.plot;
const fracOn = (axis, v) => Math.min(1, Math.max(0, scale(axis.scale || 'linear', axis.domain, [0, 1])(v)));
function place(p, r) { // ruler positions follow the numbers
  const axis = axisOf(p, r);
  const at = (v) => (blank(v) || !axis.domain ? undefined : fracOn(axis, v));
  const both = !blank(r.low) && !blank(r.high);
  r.frac = at(blank(r.value) && both && sig(r.low, r.digits) === sig(r.high, r.digits) ? r.low : r.value);
  r.lo = both ? at(r.low) : undefined;
  r.hi = both ? at(r.high) : undefined;
}
function derive(p, r) { // and so does the text
  r.text = textOf(r, p.data.plot.signed);
  r.display = r.text ? `${r.text} ${r.unit || ''}`.trim() : r.gap || p.data.not_counted;
  place(p, r);
}
// plot.fit "data": a log ruler in whole decades around what this stop counts. A row named in plot.off_ruler keeps its place in words.
function fitRuler(p) {
  const cfg = p.data.plot;
  const shown = (m) => Object.entries(m.when || {}).every(([k, v]) => p.state[k] === v);
  const nums = [...current(p).filter((r) => !cfg.off_ruler?.includes(r.key)), ...(cfg.marks || []).filter(shown)].flatMap((r) => [r.value, r.low, r.high]).filter((v) => v > 0);
  if (!nums.length) return;
  const low = Math.floor(Math.log10(Math.min(...nums)));
  const high = Math.max(low + 1, Math.ceil(Math.log10(Math.max(...nums))));
  cfg.domain = [10 ** low, 10 ** high];
  for (const r of [...p.data.rows, ...(cfg.marks || [])]) place(p, r);
  const ticks = Array.from({ length: high - low + 1 }, (_, i) => 10 ** (low + i));
  const placed = (t) => `--x:${fracOn(cfg, t)}`;
  const grid = p.plot.querySelector('.ladder-grid');
  all(grid, 'i:not(.ladder-needle):not(.ladder-tick)').forEach((node) => node.remove());
  grid.prepend(...ticks.map((t) => h('i', { style: placed(t) })));
  p.plot.querySelector('.ladder-axis').replaceChildren(...ticks.map((t) => h('span', { style: placed(t), text: draw.fmt(t, ticks.at(-1)) })));
}
// Fills a sentence's live names: {text}, {other[text]}, a setting, a field, an input, a branch {now[chat][total]:.0f}.
function live(p, r, template) {
  return template.replace(/\{([\w-]+)((?:\[[\w-]+\])*)(?::([^}]*))?\}/g, (m, name, path, spec) => {
    const parts = path.slice(1, -1).split('][').filter(Boolean);
    const dig = (start) => parts.reduce((o, k) => o?.[k], start);
    let v;
    if (parts.length) v = dig(rowsAt(p, name)[0] || p.env[name]);
    else {
      const c = p.data.setting?.find((s) => s.name === name);
      v = c ? c.options?.[p.state[name]] ?? p.state[name] ?? 'blank' : r[name] ?? r.fields?.[name] ?? p.env[name];
      if (r.f && /^(value|low|high)$/.test(name)) v = sig(v, r.digits);
    }
    if (typeof v !== 'number') return v ?? '';
    const places = /\.(\d+)f/.exec(spec || '');
    return places ? new Intl.NumberFormat('en-US', { minimumFractionDigits: +places[1], maximumFractionDigits: +places[1], useGrouping: spec.includes(',') }).format(v) : grouped(v);
  });
}
function compute(p) {
  const { data, state, env } = p;
  const stands = data.stands || {};
  for (const name of p.params.keys()) if (!stands[name]) env[name] = state[name];
  for (const name of p.params.keys()) if (stands[name]) env[name] = env[stands[name][state[name]]] ?? null;
  for (const r of data.rows) {
    if (r.f) {
      const showing = !r.show || Object.entries(r.show).every(([k, v]) => state[k] === v);
      for (const part of ['value', 'low', 'high']) r[part] = showing && r.f[part] ? evaluate(r.f[part], env) : undefined;
      derive(p, r);
      if (!r.when || r.when === state[data.by]) {
        env[r.key] = r.value ?? r.low;
        env[`${r.key}_low`] = r.low;
        env[`${r.key}_high`] = r.high;
      }
    }
    for (const s of r.segments || []) s.value = evaluate(s.f, env);
  }
  for (const m of data.plot.marks || []) {
    if (m.f) {
      for (const part of Object.keys(m.f)) m[part] = evaluate(m.f[part], env);
      derive(p, m);
      m.text = textOf(m, data.plot.signed);
    }
  }
  for (const r of data.rows) {
    if (data.fields) {
      const scope = Object.assign(Object.create(env), { value: r.value, low: r.low, high: r.high });
      r.fields = {};
      for (const [name, [f, digits]] of Object.entries(data.fields)) {
        const v = evaluate(f, scope);
        r.fields[name] = blank(v) ? '' : grouped(sig(v, digits));
      }
    }
    if (r.t) r.reading = live(p, r, r.t);
  }
  if (data.plot.fit === 'data') fitRuler(p);
}

function readState(p) {
  const query = new URLSearchParams(location.search);
  for (const [name, c] of p.params) {
    p.state[name] = c.parse(query.get(name) ?? '') ?? c.def;
    c.write(p.state[name]);
  }
  p.selected = p.keys.includes(query.get(p.id)) ? query.get(p.id) : p.data.default;
  p.shown = p.selected;
}
function writeQuery(p) {
  const query = new URLSearchParams(location.search);
  const put = (name, value, def) => (value === def ? query.delete(name) : query.set(name, value));
  for (const [name, c] of p.params) put(name, p.state[name], c.def);
  put(p.id, p.selected, p.data.default);
  const text = query.toString();
  history.replaceState(null, '', `${text ? `?${text}` : location.pathname}${location.hash}`);
}
function announce(p) {
  clearTimeout(p.liveTimer);
  // A drawn plot's selected band is named with the Reading, so with focus on it the sentence has already been spoken.
  const spoken = () => document.activeElement === p.plot && document.getElementById(p.plot.getAttribute('aria-activedescendant'))?.ownerSVGElement;
  p.liveTimer = setTimeout(() => { if (!spoken()) p.live.textContent = p.reading.textContent; }, 500);
}
function addControl(p, box) {
  const name = box.dataset.param;
  const fields = all(box, 'input');
  const radio = fields[0].type === 'radio';
  const { min, max, step } = fields[0];
  const canBlank = has(box.dataset.blank);
  const presets = (box.dataset.presets || '').split(',').filter(Boolean).map(Number);
  const c = {
    def: radio ? (fields.find((f) => f.defaultChecked) || fields[0]).value : fields[0].defaultValue === '' ? null : +fields[0].defaultValue,
    parse(text) {
      if (radio) return fields.some((f) => f.value === text) ? text : undefined;
      if (text === '') return canBlank ? null : undefined;
      if (presets.includes(+text)) return +text;
      const k = (text - min) / (step || 1);
      return +text >= +min && +text <= +max && Number.isInteger(+k.toFixed(9)) ? +text : undefined;
    },
    write: (value, typing) => fields.forEach((f) => {
      if (radio) f.checked = f.value === value;
      else if (f !== typing) f.value = value ?? '';
    }),
  };
  p.params.set(name, c);
  const apply = (value, typing) => {
    c.write(value, typing);
    p.state[name] = value;
    writeQuery(p);
    update(p, 'state');
    announce(p);
  };
  on(box, 'input', (e) => {
    const value = c.parse(e.target.value);
    if (has(value)) apply(value, e.target);
  });
  on(box, 'click', (e) => {
    if (e.target.dataset.preset) apply(+e.target.dataset.preset);
  });
  on(box, 'change', () => c.write(p.state[name])); // a value off the stops goes back
}

function setView(p, name) {
  p.root.dataset.view = name;
  for (const view of all(p.root, '.plate-view')) view.hidden = view.dataset.view !== name;
  for (const radio of all(p.root, '.plate-views input')) radio.checked = radio.value === name;
}
// A chip the reader pressed sends focus to what it opened, in view, and Escape comes back to the chip; on load or on a selection nothing takes focus.
function openReceipt(p, claim, chip) {
  p.open = claim;
  p.receipt.hidden = !claim;
  p.receipt.replaceChildren(...(claim ? document.getElementById(`${p.id}-source-${claim}`).cloneNode(true).children : []));
  for (const each of all(p.root, '.receipt')) each.setAttribute('aria-expanded', each.dataset.claim === claim);
  p.from = chip;
  if (chip && claim) {
    p.receipt.focus();
    p.receipt.scrollIntoView?.({ block: 'nearest' });
  }
}
const firstClaim = (p) => claimsOf(focusOf(p, rowsAt(p, p.selected)))[0] ?? null;
function factNodes(p, rows, key) {
  const hl = p.data.plot.highlight;
  const list = (items) => h('ul', { class: 'plate-values' }, ...items);
  const out = [];
  // One mark for every figure list: grey, hollow when modeled. Orange picks the selected series out of several; a list of one series' figures has nothing to pick out.
  const several = unique(rows.map((r) => r.series)).length > 1;
  if (rows.length > 1) out.push(list(rows.map((r) => h('li', {}, h('span', { class: `plate-square${r.hollow ? ' is-hollow' : ''}${several && hl && r.series === hl ? ' is-on' : ''}` }), h('strong', { text: r.display }), h('span', { text: r.name || r.series || '' })))));
  const parted = rows.find((r) => r.segments);
  const parts = parted?.segments.filter((s) => !s.at || s.at.includes(p.state[p.data.by])); // only what this stop counts
  if (parts) {
    const unit = parted?.unit || '';
    const total = parts.reduce((sum, s) => sum + (s.value || 0), 0) || 1;
    out.push(h('div', { class: 'plate-segments' }, ...parts.map((s) => h('span', { class: `plate-seg${s.hollow ? ' is-hollow' : ''}`, style: `flex-grow:${(s.value || 0) / total}` }))));
    out.push(list(parts.filter((s) => !blank(s.value)).map((s) => h('li', {}, h('span', { class: `plate-square${s.hollow ? ' is-hollow' : ''}` }), h('strong', { text: `${grouped(sig(s.value))} ${unit}`.trim() }), h('span', { text: `${s.label}, ${s.word || (s.hollow ? 'modeled' : 'measured')}` })))));
  }
  const say = (text) => h('p', { class: 'caption', text });
  // How a figure was reached, and the figures beside it, open on request and stay open. They print, and their receipts stay in Sources.
  const notes = [
    ...(p.data.also || []).filter((a) => !a.at || a.at === key).map((a) => `${a.label}: ${a.display}`),
    ...unique(rows.map((r) => r.note).filter(Boolean)).map((text) => `Assumption: ${text}`),
    ...unique(rows.map((r) => r.equation).filter(Boolean)).map((text) => `Equation: ${text}`),
    ...unique(rows.map((r) => r.detail).filter(Boolean)), ...(p.data.details || []), ...(p.override.facts || []),
  ];
  if (notes.length) {
    const modeled = rows.some((r) => r.hollow || r.note || r.equation);
    const more = h('details', { class: 'plate-more' }, h('summary', { text: modeled ? 'How this is modeled' : 'About this figure' }), ...notes.map(say));
    const old = p.facts.querySelector('.plate-more');
    if (old) p.moreOpen = old.open;
    more.open = !!p.moreOpen;
    out.push(more);
  }
  return out;
}
const readoutOf = (r) => {
  const i = r.text.indexOf(' (');
  return i < 0 ? [r.text, r.unit] : [r.text.slice(0, i), r.unit, r.text.slice(i + 1)];
};
// plot.shared: where the selected row's range overlaps other rows on its ruler, the ground they all hold. Yardsticks are context and do not count.
// In row order, a row that would empty the ground is left out of it: a wide range can touch two rows that do not touch each other.
function sharedOf(p, key) {
  const cfg = p.data.plot;
  const counted = (r) => r && !cfg.yard?.includes(r.key) && !cfg.off_ruler?.includes(r.key) && !blank(r.low) && !blank(r.high);
  const [own] = rowsAt(p, key);
  if (!cfg.shared || !counted(own)) return null;
  const rows = [own];
  let { low, high } = own;
  for (const r of current(p)) {
    if (r !== own && counted(r) && r.group === own.group && Math.max(low, r.low) <= Math.min(high, r.high)) {
      low = Math.max(low, r.low);
      high = Math.min(high, r.high);
      rows.push(r);
    }
  }
  return rows.length > 1 ? { rows, low, high } : null;
}
const figureOf = (r, v) => grouped(sig(v, r.digits));
const shortName = (r) => { const name = r.label.split(',')[0]; return /^[A-Z]{2}/.test(name) ? name : name[0].toLowerCase() + name.slice(1); };
function sharedSentence(p, key) {
  const s = sharedOf(p, key);
  if (!s) return '';
  const [a, b] = s.rows;
  const at = p.data.plot.shared.at?.[p.state[p.data.by]] ?? 'this setting';
  const span = (r) => `${figureOf(r, r.low)} to ${figureOf(r, r.high)}`;
  return `At ${at}, ${shortName(a)} and ${shortName(b)} overlap (${span(a)} against ${span(b)}); neither is clearly ${p.data.plot.shared.word}.`;
}
// One band across the rows that share ground, in the selected row's ladder, with what it spans at its top.
function drawShared(p, key) {
  const s = sharedOf(p, key);
  const nodes = s ? s.rows.map((r) => p.rowNodes.get(r.key)).filter((node) => node && !node.hidden) : [];
  const grid = nodes[0]?.closest('.ladder')?.querySelector('.ladder-grid');
  if (p.shared) p.shared.hidden = !grid;
  if (!grid) return;
  p.shared = p.shared || h('span', { class: 'ladder-shared' }, span('ladder-shared-label', ''));
  if (p.shared.parentElement !== grid) grid.append(p.shared);
  const [first] = s.rows;
  const axis = axisOf(p, first);
  const top = Math.min(...nodes.map((n) => n.offsetTop));
  const hi = fracOn(axis, s.high);
  for (const [name, value] of Object.entries({ '--lo': fracOn(axis, s.low), '--hi': hi, top: `${top}px`, height: `${Math.max(...nodes.map((n) => n.offsetTop + n.offsetHeight)) - top}px` })) p.shared.style.setProperty(name, value);
  const label = p.shared.firstElementChild;
  label.textContent = `Shared ground, ${figureOf(first, s.low)} to ${figureOf(first, s.high)} ${first.unit || ''}`.trim();
  // Its name turns back past 0.6, as the needle's does, and wherever it would not fit between the band and the plot's end. From the numbers: a rect here would be mid-slide.
  p.shared.classList.toggle('is-flip', hi > 0.6 || (1 - hi) * grid.clientWidth < label.offsetWidth + 8);
}
const changed = (p) => [...p.params].some(([name, c]) => name !== p.data.plot.count?.control && p.state[name] !== c.def);
// The needle's name at its top: the selected row, or for a drawn plot the year; "your setting" once any setting has moved. An instrument's needle stands at a row, and that row's label is its name.
function nameNeedle(p, key, spot, at) {
  const row = p.data.rows.find((r) => r.key === key);
  const words = `${/^(lines|multiples)$/.test(p.data.plot.type) ? key : row?.label ?? ''}${changed(p) ? ', your setting' : ''}`;
  const needle = spot?.closest('.ladder')?.querySelector('.ladder-needle');
  if (needle) {
    (needle.querySelector('.needle-label') || needle.appendChild(span('needle-label', ''))).textContent = words;
    needle.classList.toggle('is-flip', +at > 0.6);
  }
  for (const label of all(p.plot, '.m-needle-label')) { // the plot's far end, in the same coordinates as the needle's px
    const flip = parseFloat(at) > label.getAttribute('data-end') * 0.6;
    set(label, { text: words, 'text-anchor': flip ? 'end' : 'start', dx: flip ? -8 : 8 });
  }
}
// The Reading for one key: a page script's own sentence, or the plate's. A partly number keeps its limit either way.
function readingAt(p, key, own) {
  const cfg = p.data.plot;
  const hl = cfg.highlight;
  const rows = focusOf(p, rowsAt(p, key));
  const speak = cfg.highlight_by ? rows.filter((r) => r.series === hl) : rows;
  const lead = rows.find((r) => r.series === hl) || rows[0];
  const label = cfg.panels && cfg.highlight_by ? hl : p.data.rows.find((r) => r.key === key).label;
  const group = p.data.readings?.[[key, cfg.panels ? hl : '', p.state[p.data.by] || ''].join('|')];
  const said = (group ? [group] : speak.map((r) => r.reading)).filter(Boolean);
  let text = own || (said.length ? [...said, p.data.tail].filter(Boolean).join(' ') : `${label}: ${lead ? lead.display : p.data.not_counted}.`);
  for (const r of speak) if (r.limit && !text.includes(r.limit)) text += ` Limit: ${r.limit}`;
  const overlap = sharedSentence(p, key);
  return overlap ? `${text} ${overlap}` : text;
}
// In the raised panel a Reading sits in body ink and the first sentence that carries the readout's figure keeps heading ink. The words are the same words: copying or speaking it reads one text.
function readingInto(node, text, figure) {
  const sentences = String(text).split(/(?<=\.) /);
  const carries = figure ? new RegExp(`(?<![\\d.,/])${String(figure).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\d/]|[.,]\\d)`) : null;
  const at = carries ? sentences.findIndex((s) => carries.test(s)) : -1;
  node.replaceChildren(...sentences.flatMap((s, i) => [...(i ? [' '] : []), i === at ? h('b', { text: s }) : s]));
}
function paint(p) {
  const key = p.shown;
  const cfg = p.data.plot;
  const hl = cfg.highlight;
  const at = rowsAt(p, key);
  const rows = focusOf(p, at);
  const seen = new Set();
  const inView = (n) => { const off = n.closest('[hidden]'); return !off || !p.plot.contains(off); };
  const nodes = all(p.root, '[data-row]').filter(inView); // rows may sit under the Reading
  const text = readingAt(p, key, p.override.reading);
  for (const node of nodes) {
    const k = node.dataset.row;
    node.classList.toggle('is-on', k === key);
    if (seen.has(k)) { // small multiples draw a key once per cell; one option stands for them all
      node.setAttribute('aria-hidden', 'true');
      continue;
    }
    seen.add(k);
    set(node, { role: cfg.type === 'matrix' ? 'gridcell' : 'option', id: node.id || `${p.id}-row-${k}`, 'aria-selected': k === p.selected });
    if (node.classList.contains('is-ghost')) node.setAttribute('aria-disabled', 'true');
    else node.removeAttribute('aria-disabled');
    if (k === p.selected) p.plot.setAttribute('aria-activedescendant', node.id);
    if (node.ownerSVGElement) {
      node.setAttribute('aria-label', k === key ? text : readingAt(p, k)); // a drawn band holds no words of its own
      // Chrome turns an option under a plain SVG group into a group, and its selection goes silent. This covers a page script's drawing too.
      for (let g = node.parentElement; g.tagName === 'g'; g = g.parentElement) g.setAttribute('role', 'none');
    }
  }
  const spot = nodes.find((node) => node.dataset.row === key);
  const fixed = cfg.type === 'instrument' && cfg.needle ? p.rowNodes.get(cfg.needle)?.style.getPropertyValue('--x') : null; // an instrument's needle stands at one row's place, whichever row is selected
  const needle = fixed || (spot?.closest('.ladder')?.dataset.form === 'bar' || cfg.type === 'instrument' || cfg.select === 'point' ? null : spot?.dataset.nx ? `${spot.dataset.nx}px` : spot?.style.getPropertyValue('--x'));
  p.plot.classList.toggle('no-needle', !needle);
  p.plot.style.setProperty('--at', needle || '');
  for (const ladder of all(p.plot, '.ladder')) ladder.classList.toggle('no-needle', !needle || !ladder.contains(spot));
  if (needle && !fixed) nameNeedle(p, key, spot, needle);
  // A tick's name reads away from the needle, so neither word covers the other's line.
  for (const tick of all(p.plot, '.ladder-tick')) {
    const x = +tick.style.getPropertyValue('--x');
    tick.classList.toggle('is-right', needle ? x < parseFloat(needle) : x > 0.6);
  }
  drawShared(p, key);
  const lead = rows.find((r) => r.series === hl) || rows[0];
  const gapText = lead ? lead.display : p.data.not_counted;
  const [figure, unit, range] = p.override.readout || (lead?.text ? readoutOf(lead) : ['', gapText]);
  p.value.textContent = figure;
  // The words stay "(2.4 to 6.03) Wh" in this order; CSS puts the unit on the figure's baseline and the range on its own line.
  if (range) p.unit.replaceChildren(span('readout-range', range), ...(unit ? [' ', span('readout-u', unit)] : []));
  else p.unit.textContent = unit;
  p.value.parentElement.classList.toggle('is-long', p.value.textContent.length >= 9);
  readingInto(p.reading, text, figure);
  p.facts.replaceChildren(...factNodes(p, rows, key));
  const claims = new Set([...claimsOf(focusOf(p, rowsAt(p, p.selected))), ...(p.data.also || []).filter((a) => !a.at || a.at === p.selected).map((a) => a.claim), ...(p.data.cites || [])]);
  // One chip per publisher, with a count; the per-claim list follows them, and so does what passes six chips. The Reading view counts them by status.
  const groups = new Map();
  const tally = { verified: 0, partly: 0 };
  for (const chip of all(p.root, '.receipt')) {
    chip.hidden = !claims.has(chip.dataset.claim);
    chip.classList.add('is-extra');
    if (chip.hidden) continue;
    const { short, status } = p.data.receipts[chip.dataset.claim];
    tally[status] += 1;
    const publisher = short.split(': ').pop(); // "Series: Publisher" in a lines plate
    groups.set(publisher, [...(groups.get(publisher) || []), chip]);
  }
  [...groups].forEach(([publisher, [chip, ...others]], i) => {
    chip.classList.toggle('is-extra', i >= 6);
    chip.lastElementChild.textContent = others.length ? `${publisher}, ${others.length + 1} claims` : p.data.receipts[chip.dataset.claim].short;
  });
  p.moreChips.hidden = groups.size <= 6;
  p.moreChips.textContent = `${groups.size - 6} more below`;
  p.tally.hidden = !tally.verified && !tally.partly;
  const whose = cfg.type === 'matrix' ? 'This cell' : /^(lines|multiples)$/.test(cfg.type) ? 'This year' : 'This row';
  const total = Object.keys(p.data.receipts).length; // the same count the Sources tab carries
  p.tally.textContent = `${whose}: ${[tally.verified && `${tally.verified} verified`, tally.partly && `${tally.partly} partly verified`].filter(Boolean).join(', ')}; ${total} ${total === 1 ? 'source' : 'sources'} on the plate`;
  if (p.setting) p.setting.textContent = `Setting shown: ${p.data.setting.map((c) => `${c.label}: ${c.options?.[p.state[c.name]] ?? p.state[c.name] ?? 'blank'}`).join('; ')}.`;
}

// "15 (9.28 to 24) Wh": figure and unit on one line, the range on the next. "240 to 320 million liters" and "28,740 Wh": the figures large and the unit small, in the same words.
const FIGURES = /^([+-]?\$?[\d.,]+(?: (?:to|and) [+-]?\$?[\d.,]+)?) (.+)$/;
function valueCell(cell, text) {
  const m = /^(\S+) (\([^)]*\))(?: (.+))?$/.exec(text);
  const plain = !m && FIGURES.exec(text);
  if (m) cell.replaceChildren(span('ladder-num', m[1]), ' ', span('ladder-tag', m[2]), ...(m[3] ? [' ', span('ladder-unit', m[3])] : []));
  else if (plain) cell.replaceChildren(span('ladder-num', plain[1]), ' ', span('ladder-unit', plain[2]));
  else cell.textContent = text;
}
function markRow(p, key, { frac, lo, hi, text, x2, off }) { // off: a figure the ruler cannot hold, not a missing one
  const node = p.rowNodes.get(key);
  if (!node) return;
  const css = (name, v) => (has(v) ? node.style.setProperty(name, v) : node.style.removeProperty(name));
  const part = (selector, on_) => { const n = node.querySelector(selector); if (n) n.hidden = !on_; };
  css('--x', frac);
  css('--lo', lo);
  css('--hi', hi);
  css('--x2', x2);
  part('.ladder-bar', has(frac));
  part('.ladder-mark:not(.is-b)', has(frac));
  part('.ladder-mark.is-b', has(x2));
  part('.ladder-range', has(lo) && has(hi));
  node.classList.toggle('is-gap', !off && !has(frac) && !has(lo));
  if (has(text)) valueCell(node.querySelector('.ladder-value'), text);
}
function drawRulers(p) {
  const cfg = p.data.plot;
  if (cfg.sort) { // biggest first; by tag, tagged groups together
    const by = p.state[cfg.sort];
    const rows = [...current(p)];
    const tags = unique(rows.map((r) => r.tag || ''));
    const size = (r) => (blank(r.value) ? -Infinity : r.value);
    rows.sort((a, b) => (by === 'tag' ? tags.indexOf(a.tag || '') - tags.indexOf(b.tag || '') : 0) || size(b) - size(a));
    p.keys = unique(rows.map((r) => r.key));
    p.keys.forEach((k, i) => p.rowNodes.get(k)?.style.setProperty('order', i));
  }
  for (const key of p.keys) {
    const [a, b] = rowsAt(p, key);
    if (cfg.type === 'instrument' && !a?.f) continue;
    if (a && b && cfg.pair_names) {
      const pair = [a.frac, b.frac].filter(has);
      markRow(p, key, { frac: a.frac, x2: b.frac, lo: Math.min(...pair), hi: Math.max(...pair), text: `${a.text} and ${b.text} ${a.unit || ''}`.trim() });
    } else if (a && cfg.fit === 'data' && cfg.off_ruler?.includes(key)) markRow(p, key, { off: true, text: `${a.text} (off this ruler) ${a.unit || ''}`.trim() });
    else markRow(p, key, a ? { frac: a.frac, lo: a.lo, hi: a.hi, text: a.display } : { text: p.data.not_counted });
    const node = p.rowNodes.get(key);
    const sign = cfg.diverging && !blank(a?.value) ? a.value : 0;
    node?.classList.toggle('is-pos', sign > 0);
    node?.classList.toggle('is-neg', sign < 0);
    node?.classList.toggle('is-ghost', !a); // this stop does not count the row: it keeps its place, with no mark and the words
    node?.classList.toggle('is-yard', !!cfg.yard?.includes(key));
  }
  p.plot.classList.toggle('has-yard', !!cfg.yard?.length);
  for (const m of cfg.marks || []) {
    const node = all(p.plot, '.ladder-tick').find((n) => n.dataset.mark === m.id);
    if (!node) continue;
    node.hidden = !Object.entries(m.when || {}).every(([k, v]) => p.state[k] === v);
    if (m.f || cfg.fit === 'data') {
      node.style.setProperty('--x', m.frac);
      node.classList.toggle('is-right', m.frac > 0.6);
    }
    if (m.f) node.firstElementChild.textContent = `${m.label}, ${m.text || ''} ${m.unit || ''}`.trim();
  }
}
function autoDraw(p) {
  const cfg = p.data.plot;
  if (cfg.type === 'matrix') return;
  if (draw[cfg.type]) {
    if (p.plot.clientWidth) draw[cfg.type](p.plot, current(p), cfg);
  } else drawRulers(p);
}
// A ladder's second view: one square per unit, in rows of 25 so a block can be counted, at the largest size at which every row fits.
// A row past the cap draws none and says so, so no two rows can look alike by being cut off. A page's countParts may split a row's squares.
const pitchOf = (size) => size + (size >= 18 ? 4 : size >= 14 ? 3 : 2);
function squaresOf(parts) { // whole squares, then a sliver for what remains of a part
  let slots = 0;
  const drawn = [];
  for (const part of parts) {
    if (part.gap) {
      if (slots) slots += 1;
      continue;
    }
    const whole = Math.floor(part.n + 1e-9);
    const sizes = [...Array(whole).fill(1), ...(part.n - whole > 0.02 ? [part.n - whole] : [])];
    drawn.push({ part, from: slots, sizes });
    slots += sizes.length;
  }
  return { drawn, slots };
}
function drawField(cell, { drawn, slots }, size, perLine) {
  const pitch = pitchOf(size);
  const svg = add(cell, 'svg', { class: 'count-marks', width: perLine * pitch, height: Math.ceil(slots / perLine) * pitch, 'aria-hidden': 'true' });
  for (const { part, from, sizes } of drawn) {
    const d = sizes.map((w, k) => {
      const i = from + k;
      const wide = Math.max(2, Math.round(size * w));
      return `M${(i % perLine) * pitch} ${Math.floor(i / perLine) * pitch}h${wide}v${size}h-${wide}z`;
    }).join('');
    if (d) add(svg, 'path', { class: `m-count ${part.cls}${part.hollow ? ' is-hollow' : ''}`, d });
  }
}
function drawCount(p) {
  const cfg = p.data.plot.count;
  if (!cfg) return;
  const counting = p.state[cfg.control] === 'count';
  p.ladders.hidden = counting;
  if (p.note) p.note.hidden = counting; // squares have no ruler to caption
  if (!counting && !p.countBox) return;
  if (!p.countBox) {
    const row = (key) => h('li', { class: 'count-row', 'data-row': key }, h('span', { class: 'ladder-label', text: p.data.rows.find((r) => r.key === key).label }), h('span', { class: 'count-cell' }), h('span', { class: 'ladder-value' }));
    p.countBox = p.plot.appendChild(h('ol', { class: 'count-rows', role: 'none' }, ...p.keys.map(row)));
  }
  p.countBox.hidden = !counting;
  if (!counting) return;
  const unit = evaluate(cfg.unit, p.env);
  const rows = [...p.countBox.children].map((node) => {
    const [r] = rowsAt(p, node.dataset.row);
    node.classList.toggle('is-ghost', !r);
    const amount = r ? r.value ?? r.low : null;
    const n = blank(amount) || !unit ? null : amount / unit;
    const cell = node.querySelector('.count-cell');
    const value = node.querySelector('.ladder-value');
    const over = n > cfg.cap;
    cell.replaceChildren(...(over ? [span('count-over', `Too large to draw: ${grouped(sig(n / cfg.cap))} fields of ${cfg.cap} squares.`)] : []));
    if (blank(n)) value.textContent = r ? r.display : p.data.not_counted;
    else value.replaceChildren(span('ladder-num', grouped(sig(n))), ' ', span('ladder-unit', Math.round(n) === 1 ? cfg.noun : cfg.nouns));
    const parts = blank(n) || over ? [] : p.countParts?.(r, unit, p.env, p.state) ?? [{ cls: '', hollow: r.hollow, n }];
    return { cell, head: node.querySelector('.ladder-label').offsetHeight + value.offsetHeight, squares: squaresOf(parts) };
  });
  const width = rows[0]?.cell.clientWidth || 600;
  const besides = [...p.plot.children].reduce((sum, node) => sum + (node === p.countBox || node === p.ladders ? 0 : node.offsetHeight), 0);
  const room = innerWidth < 1100 ? 900 : (parseFloat(getComputedStyle(p.plot).minHeight) || p.plot.clientHeight || 500) - besides - 8; // the height the plate sets, since squares can grow the plot; stacked, it has none to fill
  const across = (size) => Math.max(1, Math.min(25, Math.floor(width / pitchOf(size))));
  const size = [64, 48, 40, 32, 28, 24, 20, 18, 16, 14, 12, 10, 8].find((s) => rows.reduce((sum, row) => sum + 11 + Math.max(row.head, Math.ceil(row.squares.slots / across(s)) * pitchOf(s)), 0) <= room) || 8;
  for (const { cell, squares } of rows) if (squares.slots) drawField(cell, squares, size, across(size));
}
function update(p, reason) {
  p.override = {};
  p.w = p.plot.clientWidth;
  p.h = p.plot.clientHeight;
  const cfg = p.data.plot;
  if (cfg.highlight_by) cfg.highlight = p.state[cfg.highlight_by];
  if (!rowsAt(p, p.selected).length && rowsAt(p, p.data.default).length) { // this stop does not count the selected row, so the selection goes back to one it does
    p.selected = p.shown = p.data.default;
    writeQuery(p);
  }
  const auto = () => {
    if (reason === 'select') return;
    compute(p);
    autoDraw(p);
  };
  if (p.render) {
    p.render({
      plot: p.plot, data: p.data, state: p.state, reason, key: p.shown, rows: rowsAt(p, p.shown), auto, inputs: p.env,
      reading: (text) => { p.override.reading = text; },
      readout: (value, unit) => { p.override.readout = [value, unit]; },
      setRow: (key, values) => markRow(p, key, values),
      fact: (text) => { (p.override.facts = p.override.facts || []).push(text); },
      frac: (v, group) => fracOn(axisOf(p, { group }), v),
    });
  } else auto();
  if (reason !== 'select') {
    drawCount(p);
    for (const td of all(p.root, '[data-cell]')) {
      const [k, when, field] = td.dataset.cell.split('|');
      const r = p.data.rows.find((x) => x.key === k && (x.when || '') === when);
      const v = r?.[field] ?? r?.fields?.[field];
      td.textContent = typeof v === 'number' ? grouped(sig(v, r.digits)) : v ?? '';
    }
    for (const item of all(p.root, '.plate-legend [data-series]')) item.firstElementChild.classList.toggle('is-on', item.dataset.series === cfg.highlight);
  }
  paint(p);
  if (reason === 'state' && p.open) openReceipt(p, firstClaim(p)); // a setting can change whose figure this is
}
function preview(p, key) {
  p.shown = key;
  update(p, 'select');
}
function select(p, key, openIt = true) {
  p.selected = key;
  preview(p, key);
  writeQuery(p);
  announce(p);
  openReceipt(p, openIt ? firstClaim(p) : null); // the source, its date, boundary, and quote wait in the Sources view
}
function reset(p) {
  for (const [name, c] of p.params) {
    p.state[name] = c.def;
    c.write(c.def);
  }
  p.status.textContent = '';
  update(p, 'state');
  select(p, p.data.default);
}
async function copyReading(p) {
  const titles = unique(claimsOf(focusOf(p, rowsAt(p, p.selected))).map((claim) => p.data.receipts[claim].title)).join('; ');
  const url = new URL(location.href);
  url.hash = p.id;
  try {
    await navigator.clipboard.writeText(`${p.reading.textContent}\n${url}${titles ? `\nSources: ${titles}` : ''}`);
    p.status.textContent = 'Copied with its link and sources.';
  } catch {
    getSelection().selectAllChildren(p.reading);
    p.status.textContent = 'Copy is blocked here. The Reading is selected: press Ctrl+C.';
  }
}

function wirePlot(p) {
  const { plot } = p;
  const matrix = p.data.plot.type === 'matrix';
  const across = matrix ? p.data.plot.columns.length : 1;
  // The pattern and its reason are in docs/PLATE-KIT.md: a list box of rows or years, or a grid for a matrix, one Tab stop, the selection named by aria-activedescendant.
  set(plot, { tabindex: 0, role: matrix ? 'grid' : 'listbox', 'aria-labelledby': `${p.id}-title` });
  if (/^(lines|multiples)$/.test(p.data.plot.type)) plot.setAttribute('aria-orientation', 'horizontal'); // years run across
  for (const list of all(plot, '.ladder-rows, .instrument')) list.setAttribute('role', 'none');
  all(plot, '.ladder-group').forEach((group, i) => { // two rulers: the name of the ruler is said on the way into its rows
    const label = group.querySelector('.ladder-group-label');
    if (label) set(group, { role: 'group', 'aria-labelledby': set(label, { id: `${p.id}-ruler-${i}` }).id });
  });
  if (matrix) { // the plot is the grid; the table inside it keeps the same rows and cells
    plot.querySelector('table').setAttribute('role', 'none');
    for (const part of all(plot, 'thead, tbody')) part.setAttribute('role', 'rowgroup');
    for (const row of all(plot, 'tr')) row.setAttribute('role', 'row');
    for (const cell of all(plot, 'thead th, thead td')) cell.setAttribute('role', cell.textContent.trim() ? 'columnheader' : 'gridcell'); // the empty corner heads nothing
    for (const cell of all(plot, 'tbody th')) cell.setAttribute('role', 'rowheader');
  }
  on(plot, 'keydown', (e) => {
    const cornerKey = matrix && e.ctrlKey && (e.key === 'Home' || e.key === 'End');
    if (e.altKey || e.metaKey || (e.ctrlKey && !cornerKey)) return; // the browser's own shortcuts
    const keys = p.keys.filter((k) => !p.rowNodes.get(k)?.hidden && !p.rowNodes.get(k)?.classList.contains('is-ghost')); // a row turned off is no stop, nor one this stop does not count
    const i = keys.indexOf(p.selected);
    const col = i % across;
    const stay = (n) => (has(keys[n]) ? n : i);
    const moves = matrix // a grid stops at its edges; a list stops at its ends, and either axis steps it
      ? { ArrowRight: col < across - 1 ? i + 1 : i, ArrowLeft: col ? i - 1 : i, ArrowDown: stay(i + across), ArrowUp: stay(i - across), Home: cornerKey ? 0 : i - col, End: cornerKey ? keys.length - 1 : i - col + across - 1 }
      : { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: keys.length - 1 };
    const press = e.key === 'Enter' || e.key === ' ';
    const n = press ? i : moves[e.key];
    if (!has(n)) return;
    e.preventDefault();
    if (press) setView(p, 'reading');
    select(p, keys[Math.max(0, Math.min(n, keys.length - 1))]);
    document.getElementById(plot.getAttribute('aria-activedescendant'))?.scrollIntoView?.({ block: 'nearest' }); // focus stays on the plot, so nothing else brings the row into view
  });
  // elementFromPoint follows a sideways touch drag.
  let last = null;
  on(plot, 'pointermove', (e) => {
    if (!last) {
      requestAnimationFrame(() => {
        const row = document.elementFromPoint(last.clientX, last.clientY)?.closest('[data-row]:not(.is-ghost)');
        last = null;
        if (row && plot.contains(row) && row.dataset.row !== p.shown) preview(p, row.dataset.row);
      });
    }
    last = e;
  });
  on(plot, 'pointerleave', (e) => {
    if (p.shown !== p.selected) (e.pointerType === 'touch' ? select(p, p.shown) : preview(p, p.selected));
  });
  new ResizeObserver(() => {
    if (plot.clientWidth && (plot.clientWidth !== p.w || plot.clientHeight !== p.h)) requestAnimationFrame(() => update(p, 'size'));
  }).observe(plot);
}

// With scripts the parts move to where a reader wants them; without scripts they stay where the build wrote them, and everything shows.
function arrange(p) {
  const { root, plot, data: { plot: cfg, receipts } } = p;
  // Chips, the receipt they open, and the list all go to the Sources view, so the Reading view ends at Copy and Reset and one line of receipts.
  root.querySelector('.plate-view[data-view="sources"]').prepend(root.querySelector('.plate-chips'), p.receipt);
  set(p.receipt, { tabindex: -1, role: 'group', 'aria-label': 'Source' });
  set(p.list, { tabindex: -1, 'aria-label': 'All sources' });
  p.tally = h('button', { type: 'button', class: 'plate-tally', hidden: '' });
  root.querySelector('.plate-actions').after(p.tally);
  root.querySelector('.plate-views input[value="sources"] + span').textContent = `Sources (${Object.keys(receipts).length})`;
  // plot.switch: a control that is part of the picture sits above the plot, at its full width.
  const control = cfg.switch && root.querySelector(`.plate-controls [data-param="${cfg.switch}"]`);
  if (control) {
    root.insertBefore(h('div', { class: 'plate-switch' }, control), plot);
    root.classList.add('has-switch');
  }
  // The key, and the ruler's caption where the ruler redraws itself, read under the axis.
  p.note = cfg.fit === 'data' ? all(root, '.plate-claim > .caption').find((n) => n.textContent.startsWith('Each mark is ten times')) : null;
  const under = [p.note, root.querySelector('.plate-claim .plate-legend')].filter(Boolean);
  if (under.length) plot.after(h('div', { class: 'plate-under' }, ...under));
  root.classList.toggle('has-under', !!control || under.length > 0);
  if (cfg.needle && cfg.type === 'instrument') plot.querySelector('.instrument').prepend(h('li', { class: 'needle', role: 'none', 'aria-hidden': 'true' }));
  moveProse(root);
}
// In a workbench panel the claim zone keeps its title, its controls, and one paragraph; the rest reads under the plate, in the details grid that follows it, or a new one in the page's own style.
// A paragraph with more than one sentence is a disclosure whose summary is its first; a single sentence or a foot line stands as it is, its link in view. An axis caption and a foot that is only a link stay.
function moveProse(root) {
  if (!root.closest('.panel')) return;
  const hasWords = (n) => [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
  const prose = all(root, '.plate-claim > p:not(.eyebrow)').filter((n) => hasWords(n) && !n.textContent.startsWith('Each mark is ten times'));
  const notes = prose.slice(1).map((n) => {
    const [lead, ...more] = n.textContent.split(/(?<=\.) /);
    if (n.classList.contains('plate-foot') || !more.length) return set(n, { class: 'caption plate-foot plate-note' });
    n.textContent = more.join(' ');
    return h('details', { class: 'disclosure' }, h('summary', { text: lead }), n);
  });
  if (!notes.length) return;
  let next = root.nextElementSibling;
  while (next?.matches('script')) next = next.nextElementSibling;
  if (next?.matches('.disclosure-grid')) next.prepend(...notes);
  else root.after(h('div', { class: `${document.querySelector('main .disclosure-grid:not(.plate-notes)')?.className || 'disclosure-grid'} plate-notes` }, ...notes));
}
function initPlate(root) {
  const id = root.dataset.plate;
  const find = (selector) => root.querySelector(selector);
  const data = JSON.parse(document.getElementById(`plate-data-${id}`).textContent);
  delete data.cites;
  // data-rows draws a plate's rows in part on another page: the same data, not a second chart.
  const only = root.dataset.rows?.split(',');
  if (only) {
    data.rows = data.rows.filter((r) => only.includes(r.key));
    all(root, '.ladder-row').filter((node) => !only.includes(node.dataset.row)).forEach((node) => node.remove());
    if (!only.includes(data.default)) [data.default] = only;
  }
  const p = {
    id, root, data, params: new Map(), state: {}, keys: keysOf(data.rows), env: { ...data.env },
    plot: find('.plate-plot'), reading: find('.reading'), value: find('.readout-value'), unit: find('.readout-unit'), status: find('.plate-status'),
    facts: find('.plate-facts'), receipt: find('.plate-receipt'), live: find('output'), setting: find('.plate-setting'), ladders: find('.ladder-groups'), list: find('.plate-sources'),
    moreChips: find('.plate-chips').appendChild(h('button', { type: 'button', class: 'plate-chip-more', hidden: '' })),
  };
  p.rowNodes = new Map(all(p.plot, '.ladder-row, .instrument-row').map((node) => [node.dataset.row, node]));
  plates.set(id, p);
  all(root, '[data-param]').forEach((box) => addControl(p, box));
  readState(p);
  root.classList.add('is-live');
  for (const part of all(root, '[data-js]')) part.hidden = false;
  // Each plate's table region is a landmark, so each needs its own name.
  for (const region of all(root, '.table-scroll[role="region"]')) region.setAttribute('aria-label', `Table of values: ${find('.plate-title')?.textContent ?? id}`);
  arrange(p);
  // ?ID-view=sources opens a plate on that view, from a link on another page.
  const asked = new URLSearchParams(location.search).get(`${id}-view`);
  setView(p, asked === 'sources' || asked === 'table' ? asked : 'reading');
  on(root, 'change', (e) => { if (e.target.closest('.plate-views')) setView(p, e.target.value); });
  on(root, 'click', (e) => {
    const chip = e.target.closest('.receipt');
    const row = e.target.closest('[data-row]');
    if (e.target === p.tally) { // the button leaves with its view, so focus goes to the view switch
      setView(p, 'sources');
      find('.plate-views input:checked').focus();
    } else if (e.target === p.moreChips) {
      setView(p, 'sources');
      p.list.focus();
      p.list.scrollIntoView?.({ block: 'nearest' });
    } else if (chip) {
      setView(p, 'sources');
      openReceipt(p, p.open === chip.dataset.claim ? null : chip.dataset.claim, chip);
    } else if (e.target.closest('[data-copy]')) copyReading(p);
    else if (e.target.closest('[data-reset]')) reset(p);
    else if (row && !row.classList.contains('is-ghost')) {
      setView(p, 'reading');
      select(p, row.dataset.row);
    }
  });
  on(root, 'keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (p.open) {
      const { from } = p;
      const inside = p.receipt.contains(document.activeElement);
      openReceipt(p, null);
      if (inside) from?.focus(); // back to the chip the reader came from
    } else if (e.target === p.plot) select(p, p.data.default, false);
  });
  wirePlot(p);
  update(p, 'init');
  openReceipt(p, firstClaim(p));
}

// The strip: dates on one track from a checked date, built from a list a generator writes, so without scripts it is that list. Days count between local midnights, so a deadline
// reads "today" all of its day in the reader's own zone. See docs/PLATE-KIT.md for the markup.
const DAY = 86400000;
const midnight = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
const isoToday = () => { const n = new Date(); return [n.getFullYear(), n.getMonth() + 1, n.getDate()].map((v) => String(v).padStart(2, '0')).join('-'); };
const daysUntil = (iso) => Math.round((midnight(iso) - midnight(isoToday())) / DAY);
const usDay = (iso) => { const [y, m, d] = iso.split('-'); return `${m}/${d}/${y}`; };
function initStrip(root) {
  const { from, to, checked } = root.dataset;
  const at = (iso) => (midnight(iso) - midnight(from)) / (midnight(to) - midnight(from));
  const rows = root.querySelector('.strip-rows');
  const lane = root.querySelector('.strip-undated') || root.appendChild(h('ul', { class: 'strip-undated' }));
  const beyond = [];
  const dated = [];
  for (const row of all(rows, '.strip-row')) {
    const days = daysUntil(row.dataset.date);
    if (days < 0) { // passed: it leaves the track with what the reader should do
      lane.append(h('li', {}, row.querySelector('a'), ` passed ${usDay(row.dataset.date)}; confirm with the agency`));
      row.remove();
    } else if (at(row.dataset.date) > 1) {
      beyond.push(row.querySelector('a'));
      row.remove();
    } else dated.push(row);
  }
  dated.sort((a, b) => midnight(a.dataset.date) - midnight(b.dataset.date));
  rows.append(...dated);
  const today = isoToday();
  const track = h('div', { class: 'strip-track', 'aria-hidden': 'true' });
  const months = h('div', { class: 'strip-months', 'aria-hidden': 'true' });
  const start = new Date(midnight(from));
  for (let i = 1; ; i += 1) {
    const month = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const iso = [month.getFullYear(), month.getMonth() + 1, 1].map((v) => String(v).padStart(2, '0')).join('-');
    const t = at(iso);
    if (t > 1) break;
    track.append(h('i', { style: `--t:${t}` }));
    if (month.getMonth() % 6 === 0 && t > 0.1) months.append(h('span', { style: `--t:${t}`, text: `${iso.slice(5, 7)}/${iso.slice(0, 4)}` }));
  }
  dated.forEach((row, i) => {
    const days = daysUntil(row.dataset.date);
    const t = at(row.dataset.date);
    const soon = days <= 14;
    track.append(h('b', { class: `strip-mark${soon ? ' is-soon' : ''}`, style: `--t:${t}` }));
    row.classList.toggle('is-flip', t > 0.5);
    row.classList.toggle('is-soon', soon);
    set(row, { style: `--t:${t};--i:${dated.length - 1 - i}` });
    const figure = days ? [span('strip-n', grouped(days)), ' ', span('strip-unit', days === 1 ? 'day' : 'days')] : [span('strip-n', 'today')];
    row.replaceChildren(h('div', { class: 'strip-body' }, ...figure, ' ', ...row.children));
  });
  const here = Math.min(1, Math.max(0, at(today)));
  const needle = h('i', { class: `needle${here > 0.6 ? ' is-flip' : ''}`, style: `--t:${here}`, 'aria-hidden': 'true' }, span('needle-label', `today, ${usDay(today)}`));
  const area = h('div', { class: 'strip-area' }, needle, track, months);
  rows.before(area);
  area.append(rows);
  if (beyond.length) area.after(h('div', { class: 'strip-beyond' }, span('strip-beyond-title', 'Beyond two years'), ...beyond));
  const age = root.querySelector('[data-strip-age]');
  if (age && checked) {
    const old = -daysUntil(checked);
    age.textContent = `, ${grouped(old)} ${old === 1 ? 'day' : 'days'} ago`;
    if (old > 30) age.parentElement.prepend('Stale: ');
  }
  root.classList.add('is-live');
}

function register(id, { render, defaults = {}, countParts } = {}) {
  const p = plates.get(id);
  if (!p) throw new Error(`No plate ${id}`);
  for (const [name, value] of Object.entries(defaults)) {
    const c = p.params.get(name);
    if (!has(c?.parse(String(value)))) throw new Error(`Bad default ${name} on plate ${id}`);
    c.def = c.parse(String(value));
  }
  p.render = render;
  p.countParts = countParts;
  readState(p);
  update(p, 'init');
}

all(document, '[data-plate]').forEach(initPlate);
all(document, '[data-strip]').forEach(initStrip);
all(document, '.section-strip[data-workbench]').forEach(initTabs);
// A strip that scrolls says so: its right edge fades while more waits past it.
for (const list of all(document, '.section-strip ul, .toc ul')) {
  const cut = () => list.classList.toggle('is-cut', list.scrollLeft + list.clientWidth < list.scrollWidth - 1);
  cut();
  on(list, 'scroll', cut);
  new ResizeObserver(cut).observe(list);
  document.fonts?.ready.then(cut);
}
fitFirst();
on(window, 'resize', fitFirst);
document.fonts?.ready.then(fitFirst);
// A readout's figure shrinks only as far as its own text needs: CSS reads the length. It watches the figure, so it serves a page's own script too.
for (const value of all(document, '.readout-value')) {
  const count = () => value.parentElement.style.setProperty('--chars', Math.max(1, value.textContent.length));
  count();
  new MutationObserver(count).observe(value, { childList: true, characterData: true, subtree: true });
}
window.plate = { register, draw, strip: initStrip, readingInto };
})();
