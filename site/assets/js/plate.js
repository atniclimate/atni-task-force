// Plate kit: tabs, selection, detail, receipts, controls, the address, and formulas over the HTML from build_plates.py.
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
// The briefing keeps nothing in the address: a staff member's typed megawatts are the case the Explorer's link rule protects. <html data-address="none">.
const NO_ADDRESS = document.documentElement.dataset.address === 'none';

// Settings ride in the fragment, #anchor&name=value, since a browser never sends a fragment to the server (owner ruling 29). The anchor, when there is one, comes
// first and names an element. An old link's ?query is read as part of the address, and moves into the fragment once theme.js has read the deep link.
const parse = (raw) => {
  const first = raw.split('&')[0];
  const anchor = first.includes('=') ? '' : first;
  return { anchor, params: new URLSearchParams(anchor ? raw.slice(first.length + 1) : raw) };
};
function readAddress() {
  const at = parse(location.hash.slice(1));
  for (const [name, value] of new URLSearchParams(location.search)) if (!at.params.has(name)) at.params.append(name, value);
  return at;
}
function writeAddress(anchor, params) {
  const hash = [anchor, params.toString()].filter(Boolean).join('&');
  try { history.replaceState(null, '', `${location.pathname}${hash ? `#${hash}` : ''}`); } catch { /* throttled: the next change writes it */ }
}
if (!NO_ADDRESS) {
  on(document, 'DOMContentLoaded', () => { if (location.search) { const { anchor, params } = readAddress(); writeAddress(anchor, params); } });
  // A link within the page (#id) takes the whole fragment: the settings it held come back after it, so a reload or a copied link keeps them.
  on(window, 'hashchange', (e) => {
    const now = readAddress();
    const was = e.oldURL ? parse(new URL(e.oldURL).hash.slice(1)).params : null;
    if (was?.toString() && !now.params.toString()) writeAddress(now.anchor, was);
  });
}
// A closed tab panel or view stays findable where the browser can reveal one: find-in-page or a link opens it, and its beforematch listener brings its tab or
// view forward. Safari has no such reveal, and gets plain hidden.
const FINDABLE = 'onbeforematch' in document.documentElement;
const conceal = (node, off) => (off ? node.setAttribute('hidden', FINDABLE ? 'until-found' : '') : node.removeAttribute('hidden'));

// The first plate on the screen runs to the window's foot; others keep the height CSS gives them. A panel kept for find-in-page still has a box, so hidden is asked too.
function fitFirst() {
  const first = all(document, '[data-plate]').find((node) => node.offsetParent && !node.closest('[hidden]'));
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
      conceal(panels[i], i !== n);
      panels[i].tabIndex = i === n ? 0 : -1; // a closed panel kept for find-in-page is still a box, so it leaves the Tab order
    });
    strip.classList.toggle('is-sticky', panels[n].offsetHeight > innerHeight);
    fitFirst();
  };
  panels.forEach((panel, i) => on(panel, 'beforematch', () => show(i))); // find-in-page or a link reached a closed panel: its tab comes with it
  const go = (n, e) => {
    e.preventDefault();
    show(n);
    panels[n].classList.add('is-entering'); // a tab change counts as a touch; CSS takes it to 0ms under reduced motion
    setTimeout(() => panels[n].classList.remove('is-entering'), 200);
    writeAddress(panels[n].id, readAddress().params); // the tab is the anchor, and the settings stay beside it
  };
  const fromHash = () => {
    const { anchor } = readAddress();
    const target = document.getElementById(anchor);
    const n = panels.findIndex((panel) => panel.contains(target));
    if (n >= 0) show(n);
    if (anchor === 'checklists') target?.querySelector('details')?.setAttribute('open', '');
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
// The one rule for a figure's words: no trailing zero, 3 (2.4 to 6), never 3.0 (2.4 to 6.0). A template's own {x:.1f} is its author's choice.
const fig = (v, d) => grouped(sig(v, d));

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
  const n = (v) => `${plus && v > 0 ? '+' : ''}${fig(v, r.digits)}`;
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
        r.fields[name] = blank(v) ? '' : fig(v, digits);
      }
    }
    if (r.t) r.reading = live(p, r, r.t);
  }
  if (data.plot.fit === 'data') fitRuler(p);
}

function readState(p) {
  const { params } = readAddress();
  for (const [name, c] of p.params) {
    // With no address to keep, a link may still name a stop; a typed figure is the reader's to enter here.
    p.state[name] = c.parse(NO_ADDRESS && !c.stop ? '' : params.get(name) ?? '') ?? c.def;
    c.write(p.state[name]);
  }
  p.selected = p.keys.includes(params.get(p.id)) ? params.get(p.id) : p.data.default;
  p.shown = p.selected;
}
// The address follows a quarter second after the last change, so a dragged slider writes it once, and a browser that throttles replaceState can never stop a redraw.
function writeQuery(p) {
  if (NO_ADDRESS) return;
  clearTimeout(p.queryTimer);
  p.queryTimer = setTimeout(() => flushQuery(p), 250);
}
// Copy Reading flushes a pending write first, so a copy within a quarter second of a change carries the new address.
function flushQuery(p) {
  if (!p.queryTimer) return;
  clearTimeout(p.queryTimer);
  p.queryTimer = 0;
  const { anchor, params } = readAddress();
  const put = (name, value, def) => (value === def ? params.delete(name) : params.set(name, value));
  for (const [name, c] of p.params) put(name, p.state[name], c.def);
  put(p.id, p.selected, p.data.default);
  writeAddress(anchor, params);
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
    stop: radio,
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
    update(p, 'state');
    announce(p);
    writeQuery(p);
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
  for (const view of all(p.root, '.plate-view')) conceal(view, view.dataset.view !== name);
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
    out.push(list(parts.filter((s) => !blank(s.value)).map((s) => h('li', {}, h('span', { class: `plate-square${s.hollow ? ' is-hollow' : ''}` }), h('strong', { text: `${fig(s.value)} ${unit}`.trim() }), h('span', { text: `${s.label}, ${s.word || (s.hollow ? 'modeled' : 'measured')}` })))));
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
const figureOf = (r, v) => fig(v, r.digits);
// A formula row's starting point: its figure at the plate's defaults, when a setting has moved it off that figure. v0 is the build's default, kept fresh whenever the plate stands at its defaults.
const startOf = (r) => (r.f && !blank(r.v0) && !blank(r.value) && fig(r.value, r.digits) !== fig(r.v0, r.digits) ? r.v0 : null);
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
  const was = lead && startOf(lead);
  if (!blank(was)) text += ` From a starting point of ${`${fig(was, lead.digits)} ${lead.unit || ''}`.trim()}.`; // the faint mark behind a moved row, in words
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
  if (NO_ADDRESS && p.shown === p.selected) p.title.textContent = titleAt(p);
  if (p.svgOut) p.svgOut.hidden = !p.plot.querySelector('.plate-svg');
  const picked = new Set(focusOf(p, rowsAt(p, p.selected)).filter((r) => !hl || !r.series || r.series === hl)); // the Table's bars: orange for the selection, as the facts list marks it, never a preview
  for (const { cell, r } of p.bars) cell.classList.toggle('is-on', picked.has(r));
}
// The title is the finding at the defaults. Moved off them, it is the Reading's first sentence, which the settings have already rewritten. A packet or a printed sheet may not state a figure the plot beside it has left.
const titleAt = (p) => (changed(p) ? p.reading.textContent.split(/(?<=\.) /)[0].replace(/\.$/, '') : p.title0);

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
    startMark(p, node, a && !b && !cfg.off_ruler?.includes(key) ? a : null);
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
// The starting point behind a moved row: a hollow mark where its figure stood at the defaults, on today's ruler, named on the selected row. aria-hidden: the Reading says it.
function startMark(p, node, r) {
  const s = r ? startOf(r) : null;
  const axis = r && axisOf(p, r);
  const [d0, d1] = axis?.domain || [];
  const on = !!node && !blank(s) && !!axis.domain && (axis.scale !== 'log' || s > 0) && s >= Math.min(d0, d1) && s <= Math.max(d0, d1); // off today's ruler it has no place
  node?.classList.toggle('has-start', on);
  if (!on) return;
  const g = fracOn(axis, s);
  const mark = node.querySelector('.start-mark') || node.querySelector('.ladder-track').appendChild(h('i', { class: 'start-mark', 'aria-hidden': 'true' }, h('span', { text: 'Starting point' })));
  node.style.setProperty('--s', g);
  mark.classList.toggle('is-flip', r.frac > g ? g > 0.15 : g > 0.85); // its name reads away from the row's own mark, while the ruler has room
}
// Small multiples print each cell's own figure beside the needle, so the cells compare at a glance. The words are the row's own, as the facts list prints them,
// placed by the square the drawing set at that year, and shown as it is: on the selection and on a hover's preview.
function needleFigures(p) {
  const cfg = p.data.plot;
  if (cfg.select === 'point') return;
  const cells = [...(p.plot.querySelector('.plate-svg')?.children || [])]; // one group per panel, in order
  cfg.panels.forEach((panel, i) => {
    const label = cells[i]?.querySelector('.m-needle-label');
    for (const band of label ? cells[i].querySelectorAll('[data-row]') : []) {
      const rows = current(p).filter((r) => r.key === band.dataset.row && r.panel === panel.id && !blank(r.value));
      const r = cfg.highlight ? rows.find((x) => x.series === cfg.highlight) : rows.length === 1 && rows[0];
      const dot = r && band.querySelector(cfg.highlight ? '.m-dot.is-lead' : '.m-dot');
      if (!dot) continue;
      const [x, y, s] = ['x', 'y', 'width'].map((name) => +dot.getAttribute(name));
      const flip = +band.dataset.nx > label.getAttribute('data-end') * 0.6; // as the needle's own name turns back
      const below = y - 6 < +label.getAttribute('y') + 22; // under the square where the year at the needle's top would meet it
      add(band, 'text', { class: 'm-value', x: flip ? x - 6 : x + s + 6, y: below ? y + s + 18 : y - 6, 'text-anchor': flip ? 'end' : 'start', 'aria-hidden': 'true', text: r.display });
    }
  });
}
function autoDraw(p) {
  const cfg = p.data.plot;
  if (cfg.type === 'matrix') return;
  if (draw[cfg.type]) {
    if (!p.plot.clientWidth) return;
    draw[cfg.type](p.plot, current(p), cfg);
    if (cfg.type === 'multiples') needleFigures(p);
  } else drawRulers(p);
}
// The Table view as a chart: under each figure a thin bar on the plate's own ruler, from its zero, or a square where that ruler is a log one, which carries
// no bars, and the band of a range-only row; under 3:1 on purpose, since the cell prints the figure, and orange for the selection. A cell is bound to its row
// once: by its data-cell, or by its words where a line holds one row, or, in a table that pivots rows into columns, by its words and its line's.
function bindBars(p) {
  const cfg = p.data.plot;
  p.bars = [];
  if (cfg.type === 'matrix') return;
  const heads = all(p.root, '.plate-table thead th').map((n) => n.textContent.trim());
  const lines = all(p.root, '.plate-table tbody tr');
  const stops = p.data.setting?.find((c) => c.name === p.data.by)?.options || {};
  const panel = (r) => cfg.panels?.find((x) => x.id === r.panel)?.label;
  const words = (r) => [r.display, r.text, blank(r.value) ? null : grouped(r.value)];
  lines.forEach((tr, i) => {
    const said = new Set([...tr.children].map((n) => n.textContent.trim()));
    const own = lines.length === p.tableRows.length ? p.tableRows[i] : null; // a line per row, as lineClaims reads them
    const taken = new Set();
    [...tr.children].forEach((cell, j) => {
      if (!j) return; // the row's name
      const [k, when, field] = (cell.dataset.cell || '').split('|');
      const text = cell.textContent.trim();
      // Where a line holds several rows, each word of a row that the line or the column's head says counts for it and each it does not, against.
      const fit = (x) => [x.label, x.series, x.year, x.end, panel(x), stops[x.when]].reduce((n, v) => (blank(v) ? n : n + (said.has(String(v)) || heads[j] === String(v) ? 1 : -1)), 0);
      const best = (list) => list.reduce((a, x) => (fit(x) > (a ? fit(a) : 0) ? x : a), null);
      const r = cell.dataset.cell ? /^(display|text|value)$/.test(field) && p.tableRows.find((x) => x.key === k && (x.when || '') === when)
        : own ? words(own).includes(text) && own : best(p.tableRows.filter((x) => !taken.has(x) && words(x).includes(text)));
      if (r && !taken.has(r)) {
        taken.add(r);
        p.bars.push({ cell, r });
      }
    });
  });
}
function placeBars(p) {
  const cfg = p.data.plot;
  for (const { cell, r } of p.bars) {
    const axis = r.axis || cfg.panels?.find((x) => x.id === r.panel) || axisOf(p, r);
    const [d0, d1] = axis.domain || [];
    const at = (v) => (blank(v) || !axis.domain ? null : fracOn(axis, v));
    const x = blank(r.frac) ? at(r.value) : r.frac;
    const zero = axis.scale !== 'log' && Math.min(d0, d1) <= 0 && Math.max(d0, d1) >= 0 ? at(0) : null;
    let ends = null;
    if (!blank(x) && !cfg.off_ruler?.includes(r.key)) ends = blank(zero) ? [x, x] : [Math.min(x, zero), Math.max(x, zero)];
    else if (blank(x) && !blank(r.lo) && !blank(r.hi)) ends = [r.lo, r.hi];
    cell.classList.toggle('has-bar', !!ends);
    cell.classList.toggle('is-dot', !!ends && !blank(x) && blank(zero));
    if (ends) {
      cell.style.setProperty('--b0', ends[0].toFixed(4));
      cell.style.setProperty('--bw', (ends[1] - ends[0]).toFixed(4));
    }
  }
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
    cell.replaceChildren(...(over ? [span('count-over', `Too large to draw: ${fig(n / cfg.cap)} fields of ${cfg.cap} squares.`)] : []));
    if (blank(n)) value.textContent = r ? r.display : p.data.not_counted;
    else value.replaceChildren(span('ladder-num', fig(n)), ' ', span('ladder-unit', Math.round(n) === 1 ? cfg.noun : cfg.nouns));
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
    if (!changed(p)) for (const r of p.data.rows) if (r.f) r.v0 = r.value; // at its defaults: today's figures are the starting point
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
      td.textContent = typeof v === 'number' ? fig(v, r.digits) : v ?? '';
    }
    for (const item of all(p.root, '.plate-legend [data-series]')) item.firstElementChild.classList.toggle('is-on', item.dataset.series === cfg.highlight);
    placeBars(p);
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
  flushQuery(p);
  const url = new URL(location.pathname, location.href);
  url.hash = [p.id, readAddress().params.toString()].filter(Boolean).join('&'); // this plate first, then every setting on the page
  try {
    await navigator.clipboard.writeText(`${p.reading.textContent}${NO_ADDRESS ? '' : `\n${url}`}${titles ? `\nSources: ${titles}` : ''}`);
    p.status.textContent = NO_ADDRESS ? 'Copied with its sources.' : 'Copied with its link and sources.';
  } catch {
    getSelection().selectAllChildren(p.reading);
    p.status.textContent = 'Copy is blocked here. The Reading is selected: press Ctrl+C.';
  }
}

// What leaves the page leaves from here and nowhere else: the reader's own browser writes the file, and nothing goes to a server.
function save(name, text, type) {
  const a = h('a', { download: name, href: URL.createObjectURL(new Blob([text], { type })) });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const fileDate = () => usDay(isoToday()).replaceAll('/', '-');
const GUARD_FOOT = 'This comparison does not decide a proposal.';
// A date this page states for its sources: the briefing's section says it per plate, and a page band says it once.
const checkedOf = (p) => p.root.closest('[data-checked]')?.dataset.checked ?? all(document, '.figure-label').find((n) => n.textContent.trim() === 'Sources checked')?.previousElementSibling.textContent.trim() ?? '';
const guardLine = (p) => (checkedOf(p) ? `Settings chosen by the reader, sources checked ${checkedOf(p)}.` : 'Settings chosen by the reader.');
const settingWords = (p) => (p.data.setting || []).map((c) => `${c.label}: ${c.options?.[p.state[c.name]] ?? p.state[c.name] ?? 'not set'}`).join('; ');

// One line of the Table per claim set: a table with a Claims column says so itself; otherwise a line is a row, or, where a table pairs two rows on a line, every row of that key and stop.
function lineClaims(p, lines) {
  const heads = all(p.root, '.plate-table thead th').map((n) => n.textContent.trim());
  const at = heads.findIndex((t) => /^claims?$/i.test(t));
  if (at >= 0) return lines.map((tr) => tr.children[at].textContent.split(/,\s*/).filter(Boolean));
  if (lines.length === p.tableRows.length) return p.tableRows.map((r) => unique(claimsOf([r])));
  const pairs = new Map();
  for (const r of p.tableRows) {
    const key = `${r.key}|${r.when || ''}`;
    pairs.set(key, [...(pairs.get(key) || []), r]);
  }
  return [...pairs.values()].map((rows) => unique(claimsOf(rows)));
}
// The Table view at these settings, as it shows, plus each line's claims, statuses, and limits; then what it was set to and when its sources were checked.
function csvOf(p) {
  const lines = all(p.root, '.plate-table tbody tr');
  const claims = lineClaims(p, lines);
  const of = (ids, part) => unique(ids.map((id) => p.data.receipts[id]?.[part]).filter(Boolean)).join('; ');
  const cell = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rows = [
    [...all(p.root, '.plate-table thead th').map((n) => n.textContent.trim()), 'claim_ids', 'status', 'limit'],
    ...lines.map((tr, i) => [...[...tr.children].map((n) => n.textContent.trim()), (claims[i] || []).join('; '), of(claims[i] || [], 'status'), of(claims[i] || [], 'limit')]),
    ['settings', settingWords(p) || 'none on this plate'],
    ['checked', checkedOf(p) || 'not stated on this page'],
  ];
  return `﻿${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`; // the mark tells Excel it is UTF-8
}
// The drawn plot as a file that stands alone: each mark keeps the values it has now, in this theme, on this ground.
const OWN_STYLE = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linejoin', 'stroke-linecap', 'paint-order', 'opacity', 'font-family', 'font-size', 'font-weight'];
function svgOf(p) {
  const from = p.plot.querySelector('.plate-svg');
  const copy = from.cloneNode(true);
  const originals = [from, ...all(from, '*')];
  const copies = [copy, ...all(copy, '*')];
  originals.forEach((node, i) => {
    const css = getComputedStyle(node);
    if (css.display === 'none' || node.classList.contains('m-hit')) { copies[i].remove(); return; }
    copies[i].setAttribute('style', OWN_STYLE.map((name) => `${name}:${css.getPropertyValue(name)}`).join(';'));
    if (css.transform && css.transform !== 'none') copies[i].setAttribute('transform', css.transform);
    for (const { name } of [...copies[i].attributes]) if (/^(class|role|id|tabindex|aria-.*|data-.*)$/.test(name)) copies[i].removeAttribute(name);
  });
  const [, , W, H] = from.getAttribute('viewBox').split(' ');
  set(copy, { width: W, height: H });
  const ground = add(copy, 'rect', { width: W, height: H, fill: getComputedStyle(p.plot).getPropertyValue('--plot-ground').trim() || '#FFFFFF' });
  const desc = add(copy, 'desc', { text: `${guardLine(p)} ${GUARD_FOOT} Claims: ${Object.keys(p.data.receipts).join(', ')}.` });
  const title = add(copy, 'title', { text: p.title.textContent });
  copy.prepend(title, desc, ground);
  return new XMLSerializer().serializeToString(copy);
}
// One plate, one sheet. The attribute and the class last until the print dialog closes, so Ctrl+P on its own still prints the page.
function printOne(p) {
  const words = p.title.textContent;
  if (changed(p)) p.title.textContent = titleAt(p);
  const from = p.root.closest('[data-from]')?.dataset.from ?? document.querySelector('main h1')?.textContent ?? '';
  const eyebrow = p.root.querySelector('.eyebrow')?.textContent ?? '';
  const head = h('div', { class: 'plate-print-head' }, h('p', { text: [from, eyebrow].filter(Boolean).join(': ') }), h('p', { text: guardLine(p) }));
  const foot = h('p', { class: 'plate-print-foot', text: GUARD_FOOT });
  p.root.prepend(head);
  p.root.append(foot);
  p.root.classList.add('is-print-one');
  document.documentElement.dataset.printOne = p.id;
  addEventListener('afterprint', () => {
    head.remove();
    foot.remove();
    p.root.classList.remove('is-print-one');
    delete document.documentElement.dataset.printOne;
    p.title.textContent = words;
  }, { once: true });
  print();
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

// A plot says once how it is used, as its description, and the Table is one press away, under it, with focus taken there (the screen-reader report, R3 and R4).
// The Explorer's plots use this too.
const HOW = 'Use arrow keys to move between rows, Home and End to reach the first and last, and the Table view for all values.';
function aid(root, plot, id, toTable) {
  plot.setAttribute('aria-describedby', id);
  root.append(h('p', { id, hidden: '', text: HOW }));
  const press = h('button', { type: 'button', class: 'plate-to-table', text: 'Read as a table' });
  on(press, 'click', () => {
    toTable();
    root.querySelector('.plate-view[data-view="table"] .table-scroll')?.focus();
  });
  let under = root.querySelector(':scope > .plate-under');
  if (!under) plot.after(under = h('div', { class: 'plate-under' }));
  under.append(press);
  root.classList.add('has-under');
}
// With scripts the parts move to where a reader wants them; without scripts they stay where the build wrote them, and everything shows.
function arrange(p) {
  const { root, plot, data: { plot: cfg, receipts } } = p;
  // Chips, the receipt they open, and the list all go to the Sources view, so the Reading view ends at Copy and Reset and one line of receipts.
  root.querySelector('.plate-view[data-view="sources"]').prepend(root.querySelector('.plate-chips'), p.receipt);
  set(p.receipt, { tabindex: -1, role: 'group', 'aria-label': 'Source' });
  set(p.list, { tabindex: -1, 'aria-label': 'All sources' });
  p.tally = h('button', { type: 'button', class: 'plate-tally', hidden: '' });
  const actions = root.querySelector('.plate-actions');
  actions.after(p.tally);
  // What leaves the page, in one row of words beside Copy and Reset, since three more boxes would stack the panel's first screen. CSV always; SVG only on a plot that is one.
  p.svgOut = h('button', { type: 'button', 'data-svg': '', hidden: '', text: 'Download SVG' });
  actions.insertBefore(h('div', { class: 'plate-out' }, h('button', { type: 'button', 'data-print-plate': '', text: 'Print this plate' }), h('button', { type: 'button', 'data-csv': '', text: 'Download CSV' }), p.svgOut), p.status);
  // A link carries a plate's settings, here where the home questions rely on it. The briefing keeps no address, so it has no need of the sentence.
  if (!NO_ADDRESS && [...p.params.values()].some((c) => !c.stop)) p.tally.after(h('p', { class: 'caption plate-link-note', text: "The link in Copy Reading carries these settings. Do not put a Nation's private figures in a shared link." }));
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
  aid(root, plot, `${p.id}-how`, () => setView(p, 'table'));
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
  for (const r of data.rows) if (r.f) r.v0 = r.value; // the build pours each formula row at the plate's defaults
  const tableRows = data.rows; // the Table lists them all, whatever the plot draws
  // data-rows draws a plate's rows in part on another page: the same data, not a second chart.
  const only = root.dataset.rows?.split(',');
  if (only) {
    data.rows = data.rows.filter((r) => only.includes(r.key));
    all(root, '.ladder-row').filter((node) => !only.includes(node.dataset.row)).forEach((node) => node.remove());
    if (!only.includes(data.default)) [data.default] = only;
  }
  const p = {
    id, root, data, tableRows, params: new Map(), state: {}, keys: keysOf(data.rows), env: { ...data.env },
    title: find('.plate-title'), title0: find('.plate-title').textContent, plot: find('.plate-plot'), reading: find('.reading'), value: find('.readout-value'), unit: find('.readout-unit'), status: find('.plate-status'),
    facts: find('.plate-facts'), receipt: find('.plate-receipt'), live: find('output'), setting: find('.plate-setting'), ladders: find('.ladder-groups'), list: find('.plate-sources'),
    moreChips: find('.plate-chips').appendChild(h('button', { type: 'button', class: 'plate-chip-more', hidden: '' })),
  };
  p.rowNodes = new Map(all(p.plot, '.ladder-row, .instrument-row').map((node) => [node.dataset.row, node]));
  bindBars(p); // before the first update rewrites a live cell, while every cell holds the build's words
  plates.set(id, p);
  all(root, '[data-param]').forEach((box) => addControl(p, box));
  readState(p);
  root.classList.add('is-live');
  for (const part of all(root, '[data-js]')) part.hidden = false;
  // Each plate's table region is a landmark, so each needs its own name.
  for (const region of all(root, '.table-scroll[role="region"]')) region.setAttribute('aria-label', `Table of values: ${find('.plate-title')?.textContent ?? id}`);
  arrange(p);
  // ID-view=sources in the address opens a plate on that view, from a link on another page.
  const asked = readAddress().params.get(`${id}-view`);
  setView(p, asked === 'sources' || asked === 'table' ? asked : 'reading');
  for (const view of all(root, '.plate-view')) on(view, 'beforematch', () => setView(p, view.dataset.view)); // a word found in a closed view brings it forward, radio and all
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
    else if (e.target.closest('[data-print-plate]')) printOne(p);
    else if (e.target.closest('[data-csv]')) save(`${id}-${fileDate()}.csv`, csvOf(p), 'text/csv;charset=utf-8');
    else if (e.target.closest('[data-svg]')) save(`${id}-${fileDate()}.svg`, svgOf(p), 'image/svg+xml');
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
    const old = Math.max(0, -daysUntil(checked)); // never "-1 days ago" from a clock behind the check date, nor "-0" on the day itself
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
// What a page may read of a plate or ask of it, for the briefing: its state as the reader left it, in the words the plate prints.
function read(id) {
  const p = plates.get(id);
  const settings = (p.data.setting || []).map((c) => ({ name: c.name, label: c.label, word: c.options?.[p.state[c.name]] ?? p.state[c.name] ?? 'not set', changed: p.state[c.name] !== p.params.get(c.name).def }));
  return { id, title: p.title.textContent, state: { ...p.state }, selected: p.selected, changed: changed(p), settings, receipts: p.data.receipts };
}
// fig is the one rounding for a computed figure, and today the one date in house style, for the page scripts that print either. The Explorer shares the address,
// the findable hiding, and a plot's aids.
window.plate = { register, draw, strip: initStrip, readingInto, read, reset: (id) => reset(plates.get(id)), save, fig, today: () => usDay(isoToday()), address: { read: readAddress, write: writeAddress }, conceal, aid };
})();
