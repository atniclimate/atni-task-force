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

// The address, #anchor&name=value, is theme.js's (window.siteAddress), the one script every page loads first; util.js hands the same functions to modules.
// Settings ride in the fragment, since a browser never sends it to a server (owner ruling 29). A tab pushes a history entry; everything else replaces one.
const { parse, read: readAddress, write: writeAddress } = window.siteAddress;
// A page's receipts live on its Sources page (owner ruling 39, 11/15/2026): an old link to one here, #src-ID or #PLATE-source-ID, goes on to the same id there.
const MOVED = /^(?:src-|[a-z0-9-]+-source-)[a-z]{2,3}-\d{3}$/;
const movedTo = (anchor) => {
  const link = document.querySelector('a[data-sources]');
  return link && MOVED.test(anchor) && !document.getElementById(anchor) ? `${link.href.split('#')[0]}#${anchor}` : null;
};
// Settings after the anchor leave the browser no element to land on, so the kit lands as the browser does on a plain #id: the anchor in view and focus on it,
// where Tab and a screen reader then start (a11y A1). A plain #id stays the browser's own; a page that has already taken the reader inside keeps its focus.
function land(raw) {
  const { anchor } = parse(raw);
  const moved = movedTo(anchor);
  if (moved) { location.replace(moved); return; }
  let target = null;
  try { target = anchor && raw !== anchor ? document.getElementById(decodeURIComponent(anchor)) : null; } catch { /* a broken escape names nothing */ }
  if (!target || target.contains(document.activeElement)) return;
  target.scrollIntoView?.();
  if (target.tabIndex < 0 && !target.hasAttribute('tabindex')) target.tabIndex = -1; // a plate or a heading takes focus without joining the Tab order
  target.focus({ preventScroll: true });
}
if (!NO_ADDRESS) on(document, 'DOMContentLoaded', () => { if (location.search) { const { anchor, params } = readAddress(); writeAddress(anchor, params); } });
// A link within the page keeps only the settings of the plate the reader last touched (resource-use-05, ai-12); theme.js asks this for each name it could keep.
let touched = null;
const namesOf = (p) => new Set([p.id, `${p.id}-view`, ...[...p.params].filter(([, c]) => c.stop).map(([name]) => name)]);
window.siteAddress.keep = (name) => ![...plates.values()].some((p) => namesOf(p).has(name)) || (!!touched && namesOf(touched).has(name));
// A closed tab panel or view stays findable where the browser can reveal one: find-in-page or a link opens it, and its beforematch listener brings its tab or
// view forward. Safari has no such reveal, and gets plain hidden.
const FINDABLE = 'onbeforematch' in document.documentElement;
const conceal = (node, off) => (off ? node.setAttribute('hidden', FINDABLE ? 'until-found' : '') : node.removeAttribute('hidden'));

// The agenda runs to the window's foot (docs/PLATE-KIT.md): --plate-h is the window less what stands above it. Plates keep the heights their variant gives them.
function fitFirst() {
  const first = document.querySelector('.agenda');
  if (!first || innerWidth < 1100 || first.closest('[hidden]')) return;
  const top = first.getBoundingClientRect().top + scrollY;
  if (top < innerHeight * 0.6) first.style.setProperty('--plate-h', `${Math.round(Math.max(448, innerHeight - top - 16))}px`);
}

// A plate in a closed tab panel starts when its panel opens (lazy start), so a page's first paint pays only for what shows.
const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex="0"]';
function startIn(node) { all(node, '[data-plate]').forEach(start); }

// A jump list becomes tabs. Without this, and in print, every panel shows. A tab is a place: changing one pushes a history entry, so Back returns to it.
function initTabs(strip) {
  const tabs = all(strip, 'a[href^="#"]:not([data-not-tab])');
  const panels = tabs.map((a) => document.getElementById(a.hash.slice(1)));
  if (panels.includes(null)) return;
  set(strip.querySelector('ul'), { role: 'tablist', 'aria-label': strip.getAttribute('aria-label') || 'Sections' });
  tabs.forEach((a, i) => {
    a.parentElement.setAttribute('role', 'none');
    set(a, { role: 'tab', id: a.id || `tab-${panels[i].id}`, 'aria-controls': panels[i].id });
    set(panels[i], { role: 'tabpanel', 'aria-labelledby': a.id });
  });
  // The next Tab after the strip reaches the panel's first control; a panel with nothing to focus is itself one stop, so its words can be reached (ai-15).
  const stops = panels.map((panel) => !panel.querySelector(`${FOCUSABLE}, [data-plate]`));
  const show = (n) => {
    tabs.forEach((a, i) => {
      set(a, { 'aria-selected': i === n, tabindex: i === n ? 0 : -1 });
      conceal(panels[i], i !== n);
      if (stops[i] && i === n) panels[i].tabIndex = 0;
      else panels[i].removeAttribute('tabindex');
    });
    startIn(panels[n]);
    strip.classList.toggle('is-sticky', panels[n].offsetHeight > innerHeight);
    fitFirst();
  };
  panels.forEach((panel, i) => on(panel, 'beforematch', () => show(i))); // find-in-page or a link reached a closed panel: its tab comes with it
  const go = (n, e) => {
    e.preventDefault();
    const moved = !tabs[n].matches('[aria-selected="true"]');
    show(n);
    panels[n].classList.add('is-entering'); // a tab change counts as a touch; CSS takes it to 0ms under reduced motion
    setTimeout(() => panels[n].classList.remove('is-entering'), 200);
    // From deep in a panel the new one opens at its top, at once, under the strip (ai-03); focus stays on the tab.
    const top = panels[n].getBoundingClientRect().top;
    const under = strip.classList.contains('is-sticky') ? strip.offsetHeight : 0;
    if (top < under) scrollTo({ top: scrollY + top - under, behavior: 'instant' });
    // The tab is the anchor, and the settings stay beside it. A run of arrow keys is one change of place, so it pushes once and then replaces; the tab already
    // open only writes its anchor.
    writeAddress(panels[n].id, readAddress().params, moved && !arrowing);
    arrowing = arrowing || !!e.key;
  };
  let arrowing = false;
  on(strip, 'focusout', (e) => { if (!strip.contains(e.relatedTarget)) arrowing = false; });
  const fromHash = () => {
    const { anchor } = readAddress();
    const target = document.getElementById(anchor);
    const n = panels.findIndex((panel) => panel.contains(target));
    if (n >= 0) show(n);
    if (anchor === 'checklists') target?.querySelector('details')?.setAttribute('open', '');
    if (n >= 0 && target !== panels[n] && !window.siteAddress.traversed) target.scrollIntoView();
    return n >= 0;
  };
  on(strip, 'click', (e) => {
    const n = tabs.indexOf(e.target.closest('a'));
    arrowing = false;
    if (n >= 0) go(n, e);
  });
  on(strip, 'keydown', (e) => {
    const i = tabs.indexOf(e.target);
    // Space on a link does nothing natively, so this is its one action; Enter arrives as the link's click. Alt+Left stays the browser's Back.
    const n = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i || tabs.length) - 1, Home: 0, End: tabs.length - 1, ' ': i }[e.key];
    if (i < 0 || !has(n) || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === ' ') arrowing = false;
    go(n, e);
    tabs[n].focus();
  });
  on(window, 'hashchange', fromHash); // a link, Back, or Forward: the tab the address names comes forward
  if (!fromHash()) show(0);
}

// The agenda (DIRECTION-R2 3.2): its questions become a vertical tablist and its faces their panels. Up, Down, Home, and End choose at once; Tab enters the
// face. A face is a look, not a place: a change replaces the history entry, naming the face in agenda= (the first face is the default and goes unnamed); an
// anchor in a face, or the face itself, opens it and wins. An answer is plain text the kit keeps with its plate's own state (data-answer), chosen or not, so
// it is the tab's description and is hidden from the tree once, never read twice. The join bar follows the chosen cell. Without this, the questions are
// links and the faces stack, whole.
function initAgenda(agenda) {
  const tabs = all(agenda, '.agenda-q > a[href^="#"]');
  const faces = tabs.map((a) => document.getElementById(a.hash.slice(1)));
  if (!tabs.length || faces.includes(null)) return;
  set(agenda.querySelector('.agenda-qs'), { role: 'tablist', 'aria-orientation': 'vertical', 'aria-label': agenda.getAttribute('aria-label') || 'Questions' });
  const names = faces.map((face) => face.id.replace(/^face-/, ''));
  tabs.forEach((a, i) => {
    const cell = a.closest('.agenda-q');
    const answer = cell.querySelector('.agenda-a');
    set(cell, { role: 'none' });
    set(a, { role: 'tab', id: a.id || `q-${names[i]}`, 'aria-controls': faces[i].id });
    if (answer) {
      set(answer, { id: answer.id || `${a.id}-a`, 'aria-hidden': 'true' });
      a.setAttribute('aria-describedby', answer.id);
    }
    set(faces[i], { role: 'tabpanel', 'aria-labelledby': a.id });
  });
  const stops = faces.map((face) => !face.querySelector(`${FOCUSABLE}, [data-plate]`));
  let at = -1;
  const join = () => {
    const cell = tabs[at]?.closest('.agenda-q');
    if (!cell) return;
    agenda.style.setProperty('--join-y', `${cell.offsetTop}px`);
    agenda.style.setProperty('--join-h', `${cell.offsetHeight}px`);
  };
  const show = (n) => {
    at = n;
    tabs.forEach((a, i) => {
      set(a, { 'aria-selected': i === n, tabindex: i === n ? 0 : -1 });
      a.closest('.agenda-q').classList.toggle('is-on', i === n);
      conceal(faces[i], i !== n);
      if (stops[i] && i === n) faces[i].tabIndex = 0;
      else faces[i].removeAttribute('tabindex');
    });
    startIn(faces[n]);
    join();
  };
  const choose = (n, e) => {
    e.preventDefault();
    tabs[n].focus();
    if (n === at) return;
    show(n);
    faces[n].classList.add('is-entering');
    setTimeout(() => faces[n].classList.remove('is-entering'), 200);
    const { anchor, params } = readAddress();
    if (n) params.set('agenda', names[n]);
    else params.delete('agenda');
    writeAddress(faces.some((face) => face.id === anchor || face.contains(document.getElementById(anchor))) ? '' : anchor, params);
  };
  const fromAddress = () => {
    const { anchor, params } = readAddress();
    let target = null;
    try { target = anchor ? document.getElementById(decodeURIComponent(anchor)) : null; } catch { /* a broken escape names nothing */ }
    const held = faces.findIndex((face) => target && face.contains(target));
    const named = names.indexOf(params.get('agenda'));
    const n = held >= 0 ? held : Math.max(named, 0);
    if (n !== at) show(n);
  };
  on(agenda, 'click', (e) => {
    const n = tabs.indexOf(e.target.closest('.agenda-q > a'));
    if (n >= 0) choose(n, e);
  });
  on(agenda, 'keydown', (e) => {
    const i = tabs.indexOf(e.target);
    const n = { ArrowDown: (i + 1) % tabs.length, ArrowUp: (i || tabs.length) - 1, Home: 0, End: tabs.length - 1, ' ': i }[e.key];
    if (i < 0 || !has(n) || e.altKey || e.ctrlKey || e.metaKey) return;
    choose(n, e);
  });
  faces.forEach((face, i) => on(face, 'beforematch', () => show(i)));
  on(window, 'hashchange', fromAddress);
  agenda.classList.add('is-live');
  fromAddress();
  new ResizeObserver(join).observe(agenda.querySelector('.agenda-qs'));
}

const GROUPED = new Intl.NumberFormat('en-US', { maximumFractionDigits: 12 }); // one formatter: building one per call cost the Briefing and AI pages over four seconds
const grouped = (v) => GROUPED.format(v);
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
// Fills a sentence's live names: {text}, {other[text]}, a setting, a field, an input, a branch {now[chat][total]:.0f}. figures: a row named by its id prints its
// figure as the plate rounds it, as a title or an answer must (build_plates.py state_context is the twin).
function live(p, r, template, figures = false) {
  return template.replace(/\{([\w-]+)((?:\[[\w-]+\])*)(?::([^}]*))?\}/g, (m, name, path, spec) => {
    const parts = path.slice(1, -1).split('][').filter(Boolean);
    const dig = (start) => parts.reduce((o, k) => o?.[k], start);
    let v;
    const row = figures && !parts.length && !has(r[name]) && !has(r.fields?.[name]) ? rowsAt(p, name)[0] : null;
    if (parts.length) v = dig(rowsAt(p, name)[0] || p.env[name]);
    else if (row && !p.data.setting?.some((s) => s.name === name)) v = row.f ? sig(row.value ?? row.low, row.digits) : row.value ?? row.low;
    else {
      const c = p.data.setting?.find((s) => s.name === name);
      v = c ? c.options?.[p.state[name]] ?? p.state[name] ?? 'blank' : r[name] ?? r.fields?.[name] ?? p.env[name];
      if (r.f && /^(value|low|high)$/.test(name)) v = sig(v, r.digits);
    }
    if (name === 'year' && typeof v === 'number') return String(v); // a year is never grouped: 2030, not 2,030 (row_fields hands the build the bare int)
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
  if (data.plot.fit === 'data') {
    fitRuler(p);
    // Fixed axes are the rule; a plate that refits its ruler to a stop (plot.fit "data", or "rescale") says so whenever the scale is not the one it opened on.
    const at = data.plot.domain.join();
    p.fit0 = p.fit0 || at;
    if (p.scaleNote) set(p.scaleNote, { text: at === p.fit0 ? '' : 'The scale changed.' }).hidden = at === p.fit0;
  }
}

// A stop, the selection, and the view ride in the address; a typed or dragged figure never does (owner ruling 29): it is the reader's to enter on this screen,
// so Back or a link keeps whatever the reader set. init: a plate starting out takes its defaults for those.
function readState(p, init = true) {
  const { params } = readAddress();
  for (const [name, c] of p.params) {
    if (!c.stop && !init && has(p.state[name])) continue;
    p.state[name] = c.parse(c.stop ? params.get(name) ?? '' : '') ?? c.def;
    c.write(p.state[name]);
  }
  p.selected = p.keys.includes(params.get(p.id)) ? params.get(p.id) : p.data.default;
  p.shown = p.selected;
}
// The address follows a quarter second after the last change, so a dragged slider writes it once, and a browser that throttles replaceState can never stop a redraw.
function writeQuery(p) {
  touched = p;
  if (NO_ADDRESS) return;
  clearTimeout(p.queryTimer);
  p.queryTimer = setTimeout(() => flushQuery(p), 250);
}
// Copy reading flushes a pending write first, so a copy within a quarter second of a change carries the new address.
function flushQuery(p) {
  if (!p.queryTimer) return;
  clearTimeout(p.queryTimer);
  p.queryTimer = 0;
  const { anchor, params } = readAddress();
  const put = (name, value, def) => (value === def ? params.delete(name) : params.set(name, value));
  for (const [name, c] of p.params) if (c.stop) put(name, p.state[name], c.def);
  put(p.id, p.selected, p.data.default);
  put(`${p.id}-view`, p.root.dataset.view, 'chart');
  writeAddress(anchor, params);
}
// Back, Forward, or an address typed in: every plate takes what the address names (CW 4, ai-13).
function reapply() {
  for (const p of plates.values()) {
    readState(p, false);
    const asked = readAddress().params.get(`${p.id}-view`);
    setView(p, asked === 'table' ? 'table' : 'chart');
    update(p, 'state');
  }
}
function announce(p) {
  clearTimeout(p.liveTimer);
  // A drawn plot's selected band is named with the Reading, so with focus on it the sentence has already been spoken.
  const spoken = () => document.activeElement === p.plot && document.getElementById(p.plot.getAttribute('aria-activedescendant'))?.ownerSVGElement;
  p.liveTimer = setTimeout(() => {
    if (!spoken() || p.sortSaid) p.live.textContent = [p.sortSaid, spoken() ? '' : p.reading.textContent].filter(Boolean).join(' ');
    if (p.sortSaid && p.root.contains(document.activeElement)) document.getElementById(p.plot.getAttribute('aria-activedescendant'))?.scrollIntoView?.({ block: 'nearest' });
    p.sortSaid = '';
  }, 500);
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
  const label = box.querySelector('label, legend')?.textContent.trim() || name;
  on(box, 'input', (e) => {
    const value = c.parse(e.target.value);
    if (!radio) e.target.setAttribute('aria-invalid', String(!has(value) && e.target.value !== '')); // a typed figure off the scale says so while it is typed
    if (has(value)) apply(value, e.target);
  });
  on(box, 'click', (e) => {
    if (e.target.dataset.preset) apply(+e.target.dataset.preset);
  });
  // A typed figure past an end goes to that end, and the status says so (ai-09, explorer-10); one off the steps goes back to the last one taken.
  on(box, 'change', (e) => {
    const typed = +e.target.value;
    if (!radio && e.target.value !== '' && Number.isFinite(typed) && (typed < +min || typed > +max)) {
      const end = typed < +min ? +min : +max;
      apply(end);
      p.status.textContent = `${label} runs from ${grouped(+min)} to ${grouped(+max)}, so ${grouped(end)} is used.`;
    }
    e.target.removeAttribute('aria-invalid');
    c.write(p.state[name]);
  });
}

// Chart or Table: two pressed buttons over the plot. The Table takes the plot's and the window's place while the claim zone stays, so nothing beside it moves.
// A view kept for find-in-page stays findable, and its beforematch brings it forward.
function setView(p, name) {
  p.root.dataset.view = name;
  const table = name === 'table';
  conceal(p.tableView, !table);
  for (const part of [p.plot, p.detail, p.root.querySelector(':scope > .plate-under')]) if (part) conceal(part, table);
  for (const button of all(p.root, '.plate-views button')) button.setAttribute('aria-pressed', String(button.dataset.view === name));
}
const STATUS_WORDS = { verified: 'verified', partly: 'partly verified' };
const glyph = (status) => h('span', { class: status === 'partly' ? 'st st-p' : 'st st-v', 'aria-hidden': 'true' });
// The card for one chip: each claim the chip stands for, from the plate's own data. Its source as a link; the publisher and dates; status and limit; the claim id;
// and the way on to the full receipt (quote, boundary, and date) on the Sources page. more: false leaves that link off, as a printed sheet does.
function receiptNodes(p, claim, more = true) {
  const r = p.data.receipts[claim];
  const dates = [r.published && `published ${r.published}`, r.year && `value year ${r.year}`].filter(Boolean).join(', ');
  return [
    h('p', { class: 'plate-source-title' }, /^https:\/\//.test(r.url || '') ? h('a', { href: r.url, text: r.title }) : r.title),
    h('p', { class: 'caption', text: `${r.short.split(': ').pop()}${dates ? `, ${dates}` : ''}.` }),
    h('p', { class: 'caption plate-receipt-status' }, glyph(r.status), `${r.status === 'partly' ? 'Partly verified.' : 'Verified against the source.'}${r.limit ? ` Limit: ${r.limit}` : ''}`),
    h('p', { class: 'caption plate-receipt-id', text: `Claim ${claim}` }),
    ...(more && p.sources ? [h('p', { class: 'caption plate-receipt-more' }, h('a', { href: `${p.sources}#${p.id}-source-${claim}`, text: 'Quote, boundary and date on the Sources page' }))] : []),
  ];
}
// One card at a time, never open before the reader asks. A chip the reader pressed sends focus into its card, and Escape comes back to the chip; pressing it
// again, or a new selection, closes it (energy-10, briefing-plates-14).
function openCard(p, chip) {
  const claims = chip ? chip.dataset.claims.split(' ') : [];
  p.open = chip ? chip.dataset.claims : null;
  p.receipt.hidden = !chip;
  const cards = claims.slice(0, 4).map((claim) => h('div', { class: 'plate-receipt-item' }, ...receiptNodes(p, claim)));
  const rest = claims.length - cards.length;
  if (rest > 0 && p.sources) cards.push(h('p', { class: 'caption' }, h('a', { href: `${p.sources}#${p.id}`, text: `${rest} more from this publisher on the Sources page` })));
  p.receipt.replaceChildren(...cards);
  for (const each of all(p.root, '.plate-evidence .receipt')) each.setAttribute('aria-expanded', String(each === chip));
  p.from = chip;
  if (chip) {
    p.receipt.focus({ preventScroll: true });
    p.receipt.scrollIntoView?.({ block: 'nearest' });
  }
}
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
    const label = needle.querySelector('.needle-label') || needle.appendChild(span('needle-label', ''));
    label.textContent = words;
    // The name reads right of the needle and turns back only where it would run past the ruler's end (data-centers-09).
    const width = needle.parentElement.clientWidth;
    needle.classList.toggle('is-flip', width && label.offsetWidth ? (1 - +at) * width < label.offsetWidth + 16 : +at > 0.6);
  }
  all(p.plot, '.m-needle-label').forEach((label, i) => { // the plot's far end, in the same coordinates as the needle's px
    const flip = parseFloat(at) > label.getAttribute('data-end') * 0.6;
    const text = label.figures ? [i ? '' : words, label.figures.get(key)].filter(Boolean).join(': ') : words; // small multiples: the year once, then each cell's figure
    set(label, { text, 'text-anchor': flip ? 'end' : 'start', dx: flip ? -8 : 8 });
  });
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
  // Within 32px of a ruler's end the needle and its name stand where that end's tick would, so the tick gives way (data-centers-09).
  const nx = needle && !String(needle).endsWith('px') ? parseFloat(needle) : null;
  const ruler = p.plot.querySelector('.ladder-grid, .instrument-ruler')?.clientWidth || 0;
  const near = (f) => nx !== null && (ruler ? f * ruler < 32 : f < 0.03);
  p.plot.classList.toggle('near-start', near(nx));
  p.plot.classList.toggle('near-end', nx !== null && near(1 - nx));
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
  if (p.setting) p.setting.textContent = `Setting shown: ${p.data.setting.map((c) => `${c.label}: ${c.options?.[p.state[c.name]] ?? p.state[c.name] ?? 'blank'}`).join('; ')}.`;
  if (p.svgOut) p.svgOut.hidden = !p.plot.querySelector('.plate-svg');
  const picked = new Set(focusOf(p, rowsAt(p, p.selected)).filter((r) => !hl || !r.series || r.series === hl)); // the Table's bars: orange for the selection, as the facts list marks it, never a preview
  for (const { cell, r } of p.bars) cell.classList.toggle('is-on', picked.has(r));
  const moved = changed(p);
  p.root.toggleAttribute('data-moved', moved);
  p.back.hidden = !moved;
  settleLabels(p);
  if (p.shown !== p.selected) return; // a preview shows a row; the title, the evidence, the Table, and the answer stay with the selection
  evidence(p);
  p.caption.textContent = firstSentence(p.reading.textContent);
  for (const tr of p.lines) tr.classList.toggle('is-on', tr.dataset.key === p.selected && (!tr.dataset.when || tr.dataset.when === p.state[p.data.by]));
  if (p.title.textContent !== p.titleSaid) p.title0 = p.title.textContent; // a page script's own title stands as the finding at the defaults
  p.titleSaid = titleAt(p);
  if (p.title.textContent !== p.titleSaid) p.title.textContent = p.titleSaid;
  const answer = p.data.answer ? fillState(p, p.data.answer) : null;
  if (answer) for (const node of all(document, `[data-answer="${p.id}"]`)) if (node.textContent !== answer) node.textContent = answer;
  for (const fn of p.listeners) fn(read(p.id));
}
// Under the Reading: the selection's claims, counted by status, then one chip per publisher with its count; a chip opens its card in the window.
function evidence(p) {
  // A page script's render may add what its setting rests on (data.cites), as the AI hour plate does for a connection's receipt.
  const claims = unique([...claimsOf(focusOf(p, rowsAt(p, p.selected))), ...(p.data.also || []).filter((a) => !a.at || a.at === p.selected).map((a) => a.claim), ...(p.data.cites || [])]).filter((c) => p.data.receipts[c]);
  const said = claims.join(' ');
  if (said === p.said) return;
  p.said = said;
  const groups = new Map();
  const tally = { verified: 0, partly: 0 };
  for (const claim of claims) {
    const { short, status } = p.data.receipts[claim];
    tally[status] += 1;
    const publisher = short.split(': ').pop(); // "Series: Publisher" in a lines plate
    groups.set(publisher, [...(groups.get(publisher) || []), claim]);
  }
  const counts = Object.entries(tally).filter(([, n]) => n).map(([status, n]) => h('span', { class: 'plate-evidence-count' }, glyph(status), `${n} ${STATUS_WORDS[status]}`));
  const chips = [...groups].map(([publisher, ids]) => h('button', { type: 'button', class: 'receipt', 'data-claims': ids.join(' '), 'aria-expanded': 'false', 'aria-controls': p.receipt.id },
    glyph(ids.some((id) => p.data.receipts[id].status === 'partly') ? 'partly' : 'verified'), `${publisher}${ids.length > 1 ? `, ${ids.length}` : ''}`));
  const held = p.evidence.contains(document.activeElement) ? document.activeElement.textContent.replace(/, \d+$/, '') : null; // focus survives a rebuild
  p.evidence.replaceChildren(...(claims.length ? [h('p', { class: 'plate-evidence-line' }, ...counts.flatMap((n, i) => (i ? [' ', n] : [n]))), h('div', { class: 'plate-chips' }, ...chips)] : []));
  if (held !== null) (chips.find((c) => c.textContent.replace(/, \d+$/, '') === held) || chips[0])?.focus({ preventScroll: true });
  if (p.open) openCard(p, null);
}
// Labels give way rather than overprint: axis ticks thin, keeping both ends, before two would touch; a starting point's name hides where it would cover the
// shared ground's or the needle's. From measured boxes, so a layout with no boxes (print preview, a test) keeps every label.
const box = (n) => n.getBoundingClientRect();
const touch = (a, b, gap = 0) => a.width && b.width && a.left < b.right + gap && b.left < a.right + gap && a.top < b.bottom && b.top < a.bottom;
function settleLabels(p) {
  for (const axis of all(p.plot, '.ladder-axis')) {
    const ticks = [...axis.children];
    ticks.forEach((t) => t.classList.remove('is-thin'));
    let kept = ticks[0];
    for (const t of ticks.slice(1)) {
      if (kept && touch(box(kept), box(t), 8)) (t === ticks.at(-1) && kept !== ticks[0] ? kept : t).classList.add('is-thin');
      if (!t.classList.contains('is-thin')) kept = t;
    }
  }
  const others = all(p.plot, '.ladder-shared-label, .needle-label');
  for (const label of all(p.plot, '.start-mark > span')) label.classList.toggle('is-hidden', others.some((o) => touch(box(label), box(o))));
}
const firstSentence = (text) => String(text).split(/(?<=\.) /)[0];
// The title is the finding at the defaults. Moved off them, it is the plate's title_template filled from the state, else the Reading's first sentence, which the
// settings have already rewritten, else the old title said to be the starting one. CSV, print, and Copy reading use the same words (ai-04).
function titleAt(p) {
  if (!changed(p)) return p.title0;
  if (p.data.title_template) return fillState(p, p.data.title_template);
  return firstSentence(p.reading.textContent).replace(/\.$/, '') || `At the starting settings: ${p.title0}`;
}
// A title or an answer at this state, from the selected row: each figure is one the plate prints now (the build's figure rule), a row by its id as the plate rounds it.
function fillState(p, template) {
  const rows = focusOf(p, rowsAt(p, p.selected));
  return live(p, rows.find((r) => r.series === p.data.plot.highlight) || rows[0] || {}, template, true).replace(/\s+/g, ' ').replace(/,\s*\./g, '.').trim();
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
    // A new order is said with the Reading, and the selected row stays the plot's active one, in view (ai-11).
    if (has(p.sortedBy) && p.sortedBy !== by) p.sortSaid = `Order: ${p.data.setting?.find((s) => s.name === cfg.sort)?.options?.[by] ?? by}.`;
    p.sortedBy = by;
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
    if (cfg.type === 'meter') meterParts(p, node, a);
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
// A meter row's parts on its one fixed scale (build_plates.py meter_parts is the twin): stacked from zero in their order, and a part this stop does not count
// left as a dashed ghost, so the needle, at the counted total, moves while the axis holds (DIRECTION-R2 3.7, item 4). A row past the scale keeps its hatched bar.
function meterParts(p, node, r) {
  const box = node?.querySelector('.meter-parts');
  if (!box || !r || r.off_scale) return;
  const [lo, hi] = axisOf(p, r).domain; // the row's group keeps its own scale, as meter_parts draws it
  const stop = p.state[p.data.by];
  let at = 0;
  [...box.children].forEach((part, i) => {
    const s = (r.segments || [])[i];
    if (!s) return;
    const a = Math.min(1, Math.max(0, (at - lo) / (hi - lo)));
    part.style.setProperty('--a', a.toFixed(4));
    part.style.setProperty('--w', Math.max(0, Math.min(1 - a, (s.value || 0) / (hi - lo))).toFixed(4));
    part.classList.toggle('is-ghost', !!s.at && !s.at.includes(stop));
    at += s.value || 0;
  });
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
  // A bar's name reads on from its end tick, on its own row, and turns back only near the ruler's end; a square's reads away from the row's own mark.
  mark.classList.toggle('is-flip', node.closest('[data-form="bar"]') ? g > 0.7 : r.frac > g ? g > 0.15 : g > 0.85);
}
// Small multiples print each cell's own figure at its needle's head, where no mark can stand, so the cells compare at a glance (critique S4). The words are the
// row's own, as the facts list prints them; nameNeedle shows the year's, on the selection and on a hover's preview.
function needleFigures(p) {
  const cfg = p.data.plot;
  if (cfg.select === 'point') return;
  const cells = [...(p.plot.querySelector('.plate-svg')?.children || [])]; // one group per panel, in order
  cfg.panels.forEach((panel, i) => {
    const label = cells[i]?.querySelector('.m-needle-label');
    if (!label) return;
    label.figures = new Map();
    for (const band of cells[i].querySelectorAll('[data-row]')) {
      const rows = current(p).filter((r) => r.key === band.dataset.row && r.panel === panel.id && !blank(r.value));
      const r = cfg.highlight ? rows.find((x) => x.series === cfg.highlight) : rows.length === 1 && rows[0];
      if (r) label.figures.set(band.dataset.row, r.display);
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
  const wordsOf = new Map(p.tableRows.map((r) => [r, [r.display, r.text, blank(r.value) ? null : grouped(r.value)]])); // once a row, not once a row a cell
  const words = (r) => wordsOf.get(r);
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
    // The Count view says what one square is before any square (ai-35).
    p.countKey = p.countBox.before(h('p', { class: 'caption count-key' }, h('span', { class: 'count-key-square', 'aria-hidden': 'true' }), `Each square is one ${cfg.noun}.`)) || p.countBox.previousElementSibling;
  }
  p.countBox.hidden = !counting;
  p.countKey.hidden = !counting;
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
}
function preview(p, key) {
  p.shown = key;
  update(p, 'select');
}
function select(p, key) {
  p.selected = key;
  preview(p, key); // a new selection closes the open card: its claims are the evidence line's to show
  writeQuery(p);
  announce(p);
}
// Back to the starting point: every setting to its default, the selection to the default row, and More assumptions closed (ai-10).
function reset(p) {
  for (const [name, c] of p.params) {
    p.state[name] = c.def;
    c.write(c.def);
  }
  for (const more of all(p.root, '.plate-claim details.plate-more')) more.open = false;
  p.status.textContent = '';
  update(p, 'state');
  select(p, p.data.default);
}
// The reading as it stands, with the plate's current title, its link (this plate first, then the stops and selections on the page), and its sources.
async function copyReading(p) {
  const titles = unique(claimsOf(focusOf(p, rowsAt(p, p.selected))).map((claim) => p.data.receipts[claim]?.title).filter(Boolean)).join('; ');
  flushQuery(p);
  const url = new URL(location.pathname, location.href);
  url.hash = [p.id, readAddress().params.toString()].filter(Boolean).join('&');
  try {
    await navigator.clipboard.writeText(`${titleAt(p)}\n${p.reading.textContent}${NO_ADDRESS ? '' : `\n${url}`}${titles ? `\nSources: ${titles}` : ''}`);
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

// One line of the Table per claim set: each line links its own claims (build_plates.py claim_refs), so the line says them itself.
const lineClaims = (p, lines) => lines.map((tr) => unique(all(tr, 'a[data-claim]').map((a) => a.dataset.claim)));
// The Table at these settings, every line of it whether or not it shows, plus each line's claims, statuses, and limits; then the title as it stands, what it
// was set to, and when its sources were checked.
function csvOf(p) {
  const lines = all(p.root, '.plate-table tbody tr');
  const claims = lineClaims(p, lines);
  const of = (ids, part) => unique(ids.map((id) => p.data.receipts[id]?.[part]).filter(Boolean)).join('; ');
  const cell = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rows = [
    [...all(p.root, '.plate-table thead th').map((n) => n.textContent.trim()), 'claim_ids', 'status', 'limit'],
    ...lines.map((tr, i) => [...[...tr.children].map((n) => n.textContent.trim()), (claims[i] || []).join('; '), of(claims[i] || [], 'status'), of(claims[i] || [], 'limit')]),
    ['title', titleAt(p)],
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
  const title = add(copy, 'title', { text: titleAt(p) });
  copy.prepend(title, desc, ground);
  return new XMLSerializer().serializeToString(copy);
}
// One plate, one sheet: its title as it stands, the plot and the Reading together, then the Table, every line with its claims and their status, and the
// collar with the Sources page's address. A Table past 25 lines runs on, its head and foot lines repeated. The class lasts until the dialog closes, so
// Ctrl+P on its own still prints the page.
function printOne(p) {
  p.title.textContent = titleAt(p);
  const from = p.root.closest('[data-from]')?.dataset.from ?? document.querySelector('main h1')?.textContent ?? '';
  const eyebrow = p.root.querySelector('.eyebrow')?.textContent ?? '';
  const head = h('div', { class: 'plate-print-head' }, h('p', { text: [from, eyebrow].filter(Boolean).join(': ') }), h('p', { text: guardLine(p) }));
  const foot = h('p', { class: 'plate-print-foot', text: GUARD_FOOT });
  p.root.prepend(head);
  p.root.append(foot);
  p.root.classList.add('is-print-one');
  p.root.classList.toggle('is-long', p.lines.length > 25);
  document.documentElement.dataset.printOne = p.id;
  addEventListener('afterprint', () => {
    head.remove();
    foot.remove();
    p.root.classList.remove('is-print-one', 'is-long');
    delete document.documentElement.dataset.printOne;
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
    select(p, keys[Math.max(0, Math.min(n, keys.length - 1))]);
    document.getElementById(plot.getAttribute('aria-activedescendant'))?.scrollIntoView?.({ block: 'nearest' }); // focus stays on the plot, so nothing else brings the row into view
  });
  // A pointer's hover outlines a row and changes nothing else (site.css; CD 1, explorer-03), so the readout and the actions never move under it. A sideways touch
  // drag previews the rows it crosses, through elementFromPoint, and commits where it lifts.
  let last = null;
  on(plot, 'pointermove', (e) => {
    if (e.pointerType !== 'touch') return;
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

// A plot says once how it is used, as its description, in the words of its form, and the Table is one press away, under it, with focus taken there (the
// screen-reader report, R3 and R4; the voice lead's words, a11y A5). The Explorer's plots, all lists of rows, use this too.
const HOW = {
  rows: 'Use arrow keys to move between rows, Home and End to reach the first and last, and the Table view for all values.',
  years: 'Use the left and right arrow keys to move between years, Home and End to reach the first and last, and the Table view for all values.',
  cells: 'Use arrow keys to move between cells, Home and End for the ends of a row, Ctrl with Home or End for the corners, and the Table view for all values.',
};
const describe = (root, plot, id, form) => {
  plot.setAttribute('aria-describedby', id);
  root.append(h('p', { id, hidden: '', text: HOW[form] }));
};
// Where a plate sits gives its variant (docs/PLATE-KIT.md): a face in an agenda, a column of a strip, a lead as a tab's or a section's first plate and on the
// Briefing, a repeater after it. A definition's "variant" wins. site.css draws the same guess before this runs, so nothing jumps.
function variantOf(root) {
  if (root.dataset.variant) return root.dataset.variant;
  if (root.closest('.agenda-faces')) return 'face';
  if (root.closest('.plate-strip, .plate-pair')) return 'strip'; // two plates side by side are a strip of two
  const room = NO_ADDRESS ? null : root.closest('[role="tabpanel"], section, main');
  return !room || room.querySelector('[data-plate]') === root ? 'lead' : 'repeater';
}
const ROWS_SHOWN = 25; // a longer Table opens with this many, and a button appends the rest in place: no inner scroll (docs/PLATE-KIT.md)
// With scripts the parts move to where a reader wants them; without scripts they stay where the build wrote them, and everything shows.
function arrange(p) {
  const { root, plot, data: { plot: cfg } } = p;
  root.dataset.variant = variantOf(root);
  set(p.receipt, { tabindex: -1, role: 'group', 'aria-label': 'Source' });
  // A typed figure never rides in the address, so a shared link cannot carry one; the plate says so where a reader types (owner ruling 29).
  if (!NO_ADDRESS && [...p.params.values()].some((c) => !c.stop)) p.detail.append(h('p', { class: 'caption plate-link-note', text: 'Figures you type stay on this screen: the link in Copy reading leaves them out.' }));
  if (NO_ADDRESS) root.querySelector('[data-add-briefing]')?.remove(); // on the Briefing the plate is already in it
  // plot.switch: a control that is part of the picture sits over the plot, at its full width, beside the view buttons.
  const control = cfg.switch && root.querySelector(`.plate-controls [data-param="${cfg.switch}"]`);
  if (control) {
    root.querySelector('.plate-bar').prepend(h('div', { class: 'plate-switch' }, control));
    root.classList.add('has-switch');
  }
  // The key, and the ruler's caption where the ruler redraws itself, read under the axis.
  p.note = cfg.fit === 'data' ? all(root, '.plate-claim > .caption').find((n) => n.textContent.startsWith('Each mark is ten times')) : null;
  const under = [p.note, root.querySelector('.plate-claim .plate-legend'), p.scaleNote = h('p', { class: 'plate-scale-note', hidden: '' })].filter(Boolean);
  plot.after(h('div', { class: 'plate-under' }, ...under));
  root.classList.add('has-under');
  describe(root, plot, `${p.id}-how`, cfg.type === 'matrix' ? 'cells' : /^(lines|multiples)$/.test(cfg.type) ? 'years' : 'rows');
  if (cfg.needle && cfg.type === 'instrument') plot.querySelector('.instrument').prepend(h('li', { class: 'needle', role: 'none', 'aria-hidden': 'true' }));
  // A long Table opens on its first rows; every row prints, and shows without scripts.
  const extra = p.lines.slice(ROWS_SHOWN);
  if (extra.length) {
    for (const tr of extra) tr.classList.add('is-more');
    p.more = h('button', { type: 'button', class: 'plate-more-rows', 'data-more-rows': '', text: `Show all ${grouped(p.lines.length)} rows` });
    p.count.textContent = `${ROWS_SHOWN} of ${grouped(p.lines.length)} rows`;
    p.count.after(p.more);
  }
  moveProse(root);
}
function showAllRows(p) {
  const first = p.lines.find((tr) => tr.classList.contains('is-more'));
  for (const tr of p.lines) tr.classList.remove('is-more');
  p.count.textContent = `${grouped(p.lines.length)} rows`;
  p.more.remove();
  if (first) { first.tabIndex = -1; first.focus(); } // the first new row, where the reader's eye goes next
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
    id, root, data, tableRows, params: new Map(), state: {}, keys: keysOf(data.rows), env: { ...data.env }, listeners: [],
    title: find('.plate-title'), title0: find('.plate-title').textContent, titleSaid: find('.plate-title').textContent, plot: find('.plate-plot'), reading: find('.reading'), value: find('.readout-value'), unit: find('.readout-unit'), status: find('.plate-status'),
    facts: find('.plate-facts'), receipt: find('.plate-receipt'), live: find(':scope > output'), setting: find('.plate-setting'), ladders: find('.ladder-groups'),
    detail: find('.plate-detail'), evidence: find('.plate-evidence'), back: find('[data-reset]'), svgOut: find('[data-svg]'),
    tableView: find('.plate-view[data-view="table"]'), caption: find('.plate-table caption'), count: find('.plate-count'), lines: all(root, '.plate-table tbody tr'),
    sources: find('.plate-sources-link a')?.getAttribute('href').split('#')[0], // the page's Sources page, as this page reaches it; the Briefing's copy reaches it from there
  };
  p.rowNodes = new Map(all(p.plot, '.ladder-row, .instrument-row').map((node) => [node.dataset.row, node]));
  bindBars(p); // before the first update rewrites a live cell, while every cell holds the build's words
  plates.set(id, p);
  all(root, '[data-param]').forEach((box) => addControl(p, box));
  readState(p);
  // An old link may still carry a typed figure; it was not applied, and it leaves the address so no copy of the link carries it on.
  const typed = [...p.params].filter(([name, c]) => !c.stop && readAddress().params.has(name));
  if (typed.length && !NO_ADDRESS) {
    const { anchor, params } = readAddress();
    for (const [name] of typed) params.delete(name);
    writeAddress(anchor, params);
  }
  root.classList.add('is-live');
  for (const part of all(root, '[data-js][hidden]')) part.hidden = false; // markup from before the js class: site.css now hides [data-js] without scripts
  // Each plate's table region is a landmark, so each needs its own name.
  for (const region of all(root, '.table-scroll[role="region"]')) region.setAttribute('aria-label', `Table of values: ${p.title0}`);
  arrange(p);
  // {id}-view=table opens the Table; an old link's =sources or =reading opens the Chart with focus on the evidence, and leaves the address (movedTo forwards receipts).
  const asked = readAddress().params.get(`${id}-view`);
  setView(p, asked === 'table' ? 'table' : 'chart');
  if (asked && asked !== 'table') {
    const { anchor, params } = readAddress();
    params.delete(`${id}-view`);
    writeAddress(anchor, params);
    p.focusEvidence = true;
  }
  on(p.tableView, 'beforematch', () => setView(p, 'table')); // a word found in a closed view brings it forward, buttons and all
  for (const part of [p.plot, p.detail]) on(part, 'beforematch', () => setView(p, 'chart'));
  on(root, 'click', (e) => {
    const chip = e.target.closest('.plate-evidence .receipt');
    const row = e.target.closest('[data-row]'); // a page may hold some rows in the window (data-centers.js moveRecord)
    const view = e.target.closest('.plate-views button');
    if (view) {
      setView(p, view.dataset.view);
      writeQuery(p);
    } else if (chip) openCard(p, p.open === chip.dataset.claims ? null : chip);
    else if (e.target.closest('[data-copy]')) copyReading(p);
    else if (e.target.closest('[data-reset]')) {
      reset(p);
      root.querySelector('[data-copy]')?.focus(); // the button leaves with the moved settings, so focus stays beside it
    } else if (e.target.closest('[data-print-plate]')) printOne(p);
    else if (e.target.closest('[data-csv]')) save(`${id}-${fileDate()}.csv`, csvOf(p), 'text/csv;charset=utf-8');
    else if (e.target.closest('[data-svg]')) save(`${id}-${fileDate()}.svg`, svgOf(p), 'image/svg+xml');
    else if (e.target.closest('[data-more-rows]')) showAllRows(p);
    else if (row && !row.classList.contains('is-ghost')) select(p, row.dataset.row);
  });
  on(root, 'keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (p.open) {
      const { from } = p;
      const inside = p.receipt.contains(document.activeElement);
      openCard(p, null);
      if (inside) from?.focus(); // back to the chip the reader came from
    } else if (e.target === p.plot) select(p, p.data.default);
  });
  wirePlot(p);
  update(p, 'init');
  if (p.focusEvidence) (p.evidence.querySelector('button') || p.evidence).focus?.({ preventScroll: true });
}
// Lazy start: a plate starts when it shows, and a page script's register waits for it.
const pending = new Map();
function start(root) {
  const id = root.dataset.plate;
  if (plates.has(id) || !document.getElementById(`plate-data-${id}`)) return plates.get(id);
  initPlate(root);
  if (pending.has(id)) apply(plates.get(id), pending.get(id));
  return plates.get(id);
}
const plateOf = (id) => {
  const root = document.querySelector(`[data-plate="${id}"]`);
  return root ? start(root) : null;
};

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

// A page script's drawing and defaults for its plate; a plate in a closed panel takes them when it starts.
function register(id, options = {}) {
  if (!document.querySelector(`[data-plate="${id}"]`)) throw new Error(`No plate ${id}`);
  if (plates.has(id)) apply(plates.get(id), options);
  else pending.set(id, options);
}
function apply(p, { render, defaults = {}, countParts } = {}) {
  for (const [name, value] of Object.entries(defaults)) {
    const c = p.params.get(name);
    if (!has(c?.parse(String(value)))) throw new Error(`Bad default ${name} on plate ${p.id}`);
    c.def = c.parse(String(value));
  }
  p.render = render;
  p.countParts = countParts;
  readState(p);
  update(p, 'init');
}

// Tabs and the agenda first, so a closed panel's or face's plates wait; then a deep link's plate, so the reader's landing is drawn first; then every plate that shows.
all(document, '.section-strip[data-workbench]').forEach(initTabs);
all(document, '.agenda').forEach(initAgenda);
const landing = (() => { try { return document.getElementById(decodeURIComponent(readAddress().anchor))?.closest('[data-plate]'); } catch { return null; } })();
if (landing && !landing.closest('[hidden]')) start(landing);
all(document, '[data-plate]').filter((root) => !root.closest('[hidden]')).forEach(start);
all(document, '[data-strip]').forEach(initStrip);
// The countdown (scripts/plate_countdown.py, docs/PLATE-KIT.md): the build drew the ruler from plot.from, each dated deadline's mark and date, and its days
// counted from that day. Here only today moves: the needle (--today), the days in their fixed slots, and a deadline passed since, which keeps its row and is
// counted in the Passed lane; nothing reflows. The plot is the plate's list box, so its lists give up their roles and each lane is a group its gutter names.
function initCountdown(root) {
  const { from, to } = root.dataset;
  const today = isoToday();
  const here = Math.min(1, Math.max(0, (midnight(today) - midnight(from)) / (midnight(to) - midnight(from))));
  root.style.setProperty('--today', here.toFixed(4));
  root.classList.toggle('is-flip', here > 0.6);
  let passed = 0;
  for (const row of all(root, '.countdown-row')) {
    const days = daysUntil(row.dataset.date);
    row.classList.toggle('is-passed', days < 0);
    if (days < 0) passed += 1;
    row.querySelector('.countdown-days').replaceChildren(...(days > 0 ? [span('countdown-n', grouped(days)), ` ${days === 1 ? 'day' : 'days'}`] : [span('countdown-n', days ? 'passed' : 'today')]));
  }
  const count = root.querySelector('[data-lane="passed"] .countdown-n');
  if (count) count.textContent = grouped(Number(count.dataset.built) + passed);
  const note = root.querySelector('.countdown-note');
  if (note) note.textContent = `Days counted from today, ${usDay(today)}.`;
  for (const list of all(root, '.countdown-rows, .countdown-names')) list.setAttribute('role', 'none');
  for (const lane of all(root, '.countdown-lane')) set(lane, { role: 'group', 'aria-labelledby': lane.querySelector('.countdown-when').id });
  root.classList.add('has-today');
}
all(document, '.countdown').forEach(initCountdown);
on(document, 'DOMContentLoaded', () => land(location.hash.slice(1))); // after an old ?query has moved into the fragment, and after a tab has opened
// A link the reader followed lands; Back, Forward, or a typed address puts every plate where the address says (theme.js tells the two apart).
on(window, 'hashchange', (e) => {
  if (!window.siteAddress.followed) reapply();
  if (!window.siteAddress.traversed && e.newURL) land(new URL(e.newURL).hash.slice(1));
});
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
// What a page may read of a plate or ask of it, for the briefing and the agenda: its state as the reader left it, in the words the plate prints. A plate not yet
// started starts for it.
function read(id) {
  const p = plates.get(id) || plateOf(id);
  const settings = (p.data.setting || []).map((c) => ({ name: c.name, label: c.label, word: c.options?.[p.state[c.name]] ?? p.state[c.name] ?? 'not set', changed: p.state[c.name] !== p.params.get(c.name).def }));
  const answer = p.data.answer ? fillState(p, p.data.answer) : null;
  return { id, title: p.title.textContent, answer, reading: p.reading.textContent, state: { ...p.state }, selected: p.selected, changed: changed(p), settings, receipts: p.data.receipts };
}
// onReading(id, fn): fn(read(id)) after every change the plate settles on (a setting or a selection, never a hover's preview), and once now.
function onReading(id, fn) {
  const p = plateOf(id);
  if (!p) throw new Error(`No plate ${id}`);
  p.listeners.push(fn);
  fn(read(id));
}
// fig is the one rounding for a computed figure, and today the one date in house style, for the page scripts that print either. The Explorer shares the address,
// the findable hiding, and a plot's aids.
window.plate = {
  register, onReading, draw, strip: initStrip, readingInto, read, reset: (id) => reset(plateOf(id)), start: plateOf, save, fig, today: () => usDay(isoToday()),
  address: { read: readAddress, write: writeAddress }, conceal, movedTo,
};
})();
