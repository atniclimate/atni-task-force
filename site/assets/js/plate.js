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
    setTimeout(() => panels[n].classList.remove('is-entering'), 260);
    history.replaceState(null, '', `#${panels[n].id}`);
  };
  const fromHash = () => {
    const target = document.getElementById(location.hash.slice(1));
    const n = panels.findIndex((panel) => panel.contains(target));
    if (n >= 0) show(n);
    if (n >= 0 && target !== panels[n]) target.scrollIntoView();
    return n >= 0;
  };
  on(strip, 'click', (e) => {
    const n = tabs.indexOf(e.target.closest('a'));
    if (n >= 0) go(n, e);
  });
  on(strip, 'keydown', (e) => {
    const i = tabs.indexOf(e.target);
    const n = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i || tabs.length) - 1, Home: 0, End: tabs.length - 1, ' ': i }[e.key];
    if (i < 0 || !has(n)) return;
    go(n, e);
    tabs[n].focus();
  });
  on(window, 'hashchange', fromHash);
  if (!fromHash()) show(0);
}

const grouped = (v) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 12 }).format(v);
const sig = (v, d) => (blank(v) ? v : +Number(v).toPrecision(d || 3));

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
function derive(p, r) { // text and ruler positions follow the numbers
  const axis = axisOf(p, r);
  const at = (v) => (blank(v) || !axis.domain ? undefined : fracOn(axis, v));
  const both = !blank(r.low) && !blank(r.high);
  r.text = textOf(r, p.data.plot.signed);
  r.display = r.text ? `${r.text} ${r.unit || ''}`.trim() : r.gap || p.data.not_counted;
  r.frac = at(blank(r.value) && both && sig(r.low, r.digits) === sig(r.high, r.digits) ? r.low : r.value);
  r.lo = both ? at(r.low) : undefined;
  r.hi = both ? at(r.high) : undefined;
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
  p.liveTimer = setTimeout(() => { p.live.textContent = p.reading.textContent; }, 500);
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
function openReceipt(p, claim) {
  p.open = claim;
  p.receipt.hidden = !claim;
  p.receipt.replaceChildren(...(claim ? document.getElementById(`${p.id}-source-${claim}`).cloneNode(true).children : []));
  for (const chip of all(p.root, '.receipt')) chip.setAttribute('aria-expanded', chip.dataset.claim === claim);
}
const firstClaim = (p) => claimsOf(focusOf(p, rowsAt(p, p.selected)))[0] ?? null;
function factNodes(p, rows, key) {
  const hl = p.data.plot.highlight;
  const list = (items) => h('ul', { class: 'plate-values' }, ...items);
  const out = [];
  if (rows.length > 1) out.push(list(rows.map((r) => h('li', {}, h('span', { class: `plate-key${hl && r.series === hl ? ' is-on' : ''}` }), h('strong', { text: r.display }), h('span', { text: r.name || r.series || '' })))));
  const parted = rows.find((r) => r.segments);
  const parts = parted?.segments.filter((s) => !s.at || s.at.includes(p.state[p.data.by])); // only what this stop counts
  if (parts) {
    const unit = parted?.unit || '';
    const total = parts.reduce((sum, s) => sum + (s.value || 0), 0) || 1;
    out.push(h('div', { class: 'plate-segments' }, ...parts.map((s) => h('span', { class: `plate-seg${s.hollow ? ' is-hollow' : ''}`, style: `flex-grow:${(s.value || 0) / total}` }))));
    out.push(list(parts.filter((s) => !blank(s.value)).map((s) => h('li', {}, h('span', { class: `plate-square${s.hollow ? ' is-hollow' : ''}` }), h('strong', { text: `${grouped(sig(s.value))} ${unit}`.trim() }), h('span', { text: `${s.label}, ${s.word || (s.hollow ? 'modeled' : 'measured')}` })))));
  }
  const say = (text) => h('p', { class: 'caption', text });
  for (const a of p.data.also || []) if (!a.at || a.at === key) out.push(say(`${a.label}: ${a.display}`));
  // How a figure was reached opens on request, and stays open.
  const notes = [
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
  return i < 0 ? [r.text, r.unit] : [r.text.slice(0, i), `${r.text.slice(i + 1)} ${r.unit || ''}`.trim()];
};
function paint(p) {
  const key = p.shown;
  const cfg = p.data.plot;
  const hl = cfg.highlight;
  const at = rowsAt(p, key);
  const rows = focusOf(p, at);
  const speak = cfg.highlight_by ? rows.filter((r) => r.series === hl) : rows;
  const seen = new Set();
  const inView = (n) => { const off = n.closest('[hidden]'); return !off || !p.plot.contains(off); };
  const nodes = all(p.root, '[data-row]').filter(inView); // rows may sit under the Reading
  for (const node of nodes) {
    const k = node.dataset.row;
    node.classList.toggle('is-on', k === key);
    set(node, { role: seen.has(k) ? 'none' : cfg.type === 'matrix' ? 'gridcell' : 'option' });
    if (!seen.has(k)) {
      set(node, { id: node.id || `${p.id}-row-${k}`, 'aria-selected': k === p.selected });
      if (k === p.selected) p.plot.setAttribute('aria-activedescendant', node.id);
    }
    seen.add(k);
  }
  const spot = nodes.find((node) => node.dataset.row === key);
  const needle = spot?.closest('.ladder')?.dataset.form === 'bar' || cfg.type === 'instrument' || cfg.select === 'point' ? null : spot?.dataset.nx ? `${spot.dataset.nx}px` : spot?.style.getPropertyValue('--x');
  p.plot.classList.toggle('no-needle', !needle);
  p.plot.style.setProperty('--at', needle || '');
  for (const ladder of all(p.plot, '.ladder')) ladder.classList.toggle('no-needle', !needle || !ladder.contains(spot));
  const lead = rows.find((r) => r.series === hl) || rows[0];
  const gapText = lead ? lead.display : p.data.not_counted;
  [p.value.textContent, p.unit.textContent] = p.override.readout || (lead?.text ? readoutOf(lead) : ['', gapText]);
  p.value.parentElement.classList.toggle('is-long', p.value.textContent.length >= 9);
  const label = cfg.panels && cfg.highlight_by ? hl : p.data.rows.find((r) => r.key === key).label;
  const group = p.data.readings?.[[key, cfg.panels ? hl : '', p.state[p.data.by] || ''].join('|')];
  const said = (group ? [group] : speak.map((r) => r.reading)).filter(Boolean);
  let text = p.override.reading || (said.length ? [...said, p.data.tail].filter(Boolean).join(' ') : `${label}: ${gapText}.`);
  // A partly number keeps its limit, even in a page script's sentence.
  for (const r of speak) if (r.limit && !text.includes(r.limit)) text += ` Limit: ${r.limit}`;
  p.reading.textContent = text;
  p.facts.replaceChildren(...factNodes(p, rows, key));
  const claims = new Set([...claimsOf(focusOf(p, rowsAt(p, p.selected))), ...(p.data.also || []).filter((a) => !a.at || a.at === p.selected).map((a) => a.claim), ...(p.data.cites || [])]);
  // One chip per publisher, with a count; the per-claim list is in Sources, and so is what passes six chips.
  const groups = new Map();
  for (const chip of all(p.root, '.receipt')) {
    chip.hidden = !claims.has(chip.dataset.claim);
    chip.classList.add('is-extra');
    delete chip.dataset.many;
    if (chip.hidden) continue;
    const publisher = p.data.receipts[chip.dataset.claim].short.split(': ').pop(); // "Series: Publisher" in a lines plate
    groups.set(publisher, [...(groups.get(publisher) || []), chip]);
  }
  [...groups].forEach(([publisher, [chip, ...others]], i) => {
    chip.classList.toggle('is-extra', i >= 6);
    chip.lastElementChild.textContent = others.length ? `${publisher}, ${others.length + 1} claims` : p.data.receipts[chip.dataset.claim].short;
    if (others.length) chip.dataset.many = 1;
  });
  p.moreChips.hidden = groups.size <= 6;
  p.moreChips.textContent = `${groups.size - 6} more in Sources`;
  if (p.setting) p.setting.textContent = `Setting shown: ${p.data.setting.map((c) => `${c.label}: ${c.options?.[p.state[c.name]] ?? p.state[c.name] ?? 'blank'}`).join('; ')}.`;
}

// "15 (9.28 to 24) Wh": figure and unit on one line, the range on the next.
function valueCell(cell, text) {
  const m = /^(\S+) (\([^)]*\))(?: (.+))?$/.exec(text);
  if (!m) cell.textContent = text;
  else cell.replaceChildren(span('ladder-num', m[1]), ' ', span('ladder-tag', m[2]), ...(m[3] ? [' ', span('ladder-unit', m[3])] : []));
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
    } else markRow(p, key, a ? { frac: a.frac, lo: a.lo, hi: a.hi, text: a.display } : { text: p.data.not_counted });
    const sign = cfg.diverging && !blank(a?.value) ? a.value : 0;
    p.rowNodes.get(key)?.classList.toggle('is-pos', sign > 0);
    p.rowNodes.get(key)?.classList.toggle('is-neg', sign < 0);
  }
  for (const m of cfg.marks || []) {
    const node = all(p.plot, '.ladder-tick').find((n) => n.dataset.mark === m.id);
    if (!node) continue;
    node.hidden = !Object.entries(m.when || {}).every(([k, v]) => p.state[k] === v);
    if (m.f) {
      node.style.setProperty('--x', m.frac);
      node.firstElementChild.textContent = `${m.label}, ${m.text || ''} ${m.unit || ''}`.trim();
    }
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
  if (!counting && !p.countBox) return;
  if (!p.countBox) {
    const row = (key) => h('li', { class: 'count-row', 'data-row': key }, h('span', { class: 'ladder-label', text: p.data.rows.find((r) => r.key === key).label }), h('span', { class: 'count-cell' }), h('span', { class: 'ladder-value' }));
    p.countBox = p.plot.appendChild(h('ol', { class: 'count-rows', role: 'none' }, ...p.keys.map(row)));
    foldRows(p);
  }
  p.countBox.hidden = !counting;
  if (!counting) return;
  const unit = evaluate(cfg.unit, p.env);
  const rows = [...p.countBox.children].filter((node) => !node.hidden).map((node) => {
    const [r] = rowsAt(p, node.dataset.row);
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
  const room = innerWidth < 1100 ? 900 : (p.plot.clientHeight || 500) - besides - 8; // stacked, the plot has no height to fill
  const across = (size) => Math.max(1, Math.min(25, Math.floor(width / pitchOf(size))));
  const size = [64, 48, 40, 32, 28, 24, 20, 18, 16, 14, 12, 10, 8].find((s) => rows.reduce((sum, row) => sum + 11 + Math.max(row.head, Math.ceil(row.squares.slots / across(s)) * pitchOf(s)), 0) <= room) || 8;
  for (const { cell, squares } of rows) if (squares.slots) drawField(cell, squares, size, across(size));
}
// Rows a stop does not count fold into one line, in both views, and return as rows at a stop that does.
function foldRows(p) {
  if (!p.data.plot.fold) return;
  const off = p.keys.filter((k) => !rowsAt(p, k).length);
  for (const node of all(p.plot, '[data-row]')) node.hidden = off.includes(node.dataset.row);
  p.fold = p.fold || p.plot.appendChild(h('p', { class: 'caption plate-fold', 'aria-hidden': 'true' })); // the Table holds the same rows
  p.fold.hidden = !off.length;
  p.fold.textContent = `${p.data.not_counted}: ${off.map((k) => p.data.rows.find((r) => r.key === k).label).join('; ')}.`;
}
// A detail panel whose facts still fit when narrower gives its width to the plot; the receipt below them may scroll. Measured narrow, so it cannot feed back.
function fitDetail(p) {
  if (innerWidth < 1100 || !p.plot.clientWidth) return;
  const { hidden } = p.receipt;
  p.receipt.hidden = true;
  p.root.classList.add('is-short');
  p.root.classList.toggle('is-short', p.detail.scrollHeight <= p.detail.clientHeight);
  p.receipt.hidden = hidden;
}
function update(p, reason) {
  p.override = {};
  p.w = p.plot.clientWidth;
  p.h = p.plot.clientHeight;
  const cfg = p.data.plot;
  if (cfg.highlight_by) cfg.highlight = p.state[cfg.highlight_by];
  if (cfg.fold && !rowsAt(p, p.selected).length) { // the selected row just folded away
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
    foldRows(p);
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
  if (reason === 'init' || reason === 'size') fitDetail(p);
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
  openReceipt(p, openIt ? firstClaim(p) : null); // the source, its date, boundary, and quote fill the panel
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
  set(plot, { tabindex: 0, role: matrix ? 'grid' : 'listbox', 'aria-labelledby': `${p.id}-title` });
  for (const list of all(plot, '.ladder-rows, .instrument')) list.setAttribute('role', 'none');
  if (matrix) { // the plot is the grid; the table inside it keeps the same rows and cells
    plot.querySelector('table').setAttribute('role', 'none');
    for (const part of all(plot, 'thead, tbody')) part.setAttribute('role', 'rowgroup');
    for (const row of all(plot, 'tr')) row.setAttribute('role', 'row');
    for (const cell of all(plot, 'thead th, thead td')) cell.setAttribute('role', 'columnheader');
    for (const cell of all(plot, 'tbody th')) cell.setAttribute('role', 'rowheader');
  }
  on(plot, 'keydown', (e) => {
    const keys = p.keys.filter((k) => !p.rowNodes.get(k)?.hidden); // a row turned off is no stop
    const i = keys.indexOf(p.selected);
    const n = { ArrowRight: i + 1, ArrowDown: i + across, ArrowLeft: i - 1, ArrowUp: i - across, Home: 0, End: keys.length - 1, Enter: i, ' ': i }[e.key];
    if (!has(n)) return;
    e.preventDefault();
    if (n === i) setView(p, 'reading');
    select(p, keys[Math.max(0, Math.min(n, keys.length - 1))]);
  });
  // elementFromPoint follows a sideways touch drag.
  let last = null;
  on(plot, 'pointermove', (e) => {
    if (!last) {
      requestAnimationFrame(() => {
        const row = document.elementFromPoint(last.clientX, last.clientY)?.closest('[data-row]');
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

function initPlate(root) {
  const id = root.dataset.plate;
  const find = (selector) => root.querySelector(selector);
  const data = JSON.parse(document.getElementById(`plate-data-${id}`).textContent);
  delete data.cites;
  const p = {
    id, root, data, params: new Map(), state: {}, keys: keysOf(data.rows), env: { ...data.env },
    plot: find('.plate-plot'), reading: find('.reading'), value: find('.readout-value'), unit: find('.readout-unit'), status: find('.plate-status'),
    facts: find('.plate-facts'), receipt: find('.plate-receipt'), live: find('output'), setting: find('.plate-setting'), ladders: find('.ladder-groups'), detail: find('.plate-detail'),
    moreChips: find('.plate-chips').appendChild(h('button', { type: 'button', class: 'plate-chip-more', hidden: '' })),
  };
  p.rowNodes = new Map(all(p.plot, '.ladder-row, .instrument-row').map((node) => [node.dataset.row, node]));
  plates.set(id, p);
  all(root, '[data-param]').forEach((box) => addControl(p, box));
  readState(p);
  root.classList.add('is-live');
  for (const part of all(root, '[data-js]')) part.hidden = false;
  set(p.detail, { tabindex: 0, role: 'group', 'aria-label': 'Detail' }); // it scrolls on its own at full width
  setView(p, 'reading');
  on(root, 'change', (e) => { if (e.target.closest('.plate-views')) setView(p, e.target.value); });
  on(root, 'click', (e) => {
    const chip = e.target.closest('.receipt');
    const row = e.target.closest('[data-row]');
    if (chip?.dataset.many || e.target === p.moreChips) { // the button leaves with its view, so focus goes to the view switch
      setView(p, 'sources');
      find('.plate-views input:checked').focus();
    } else if (chip) openReceipt(p, p.open === chip.dataset.claim ? null : chip.dataset.claim);
    else if (e.target.closest('[data-copy]')) copyReading(p);
    else if (e.target.closest('[data-reset]')) reset(p);
    else if (row) {
      setView(p, 'reading');
      select(p, row.dataset.row);
    }
  });
  on(root, 'keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (p.open) openReceipt(p, null);
    else if (e.target === p.plot) select(p, p.data.default, false);
  });
  wirePlot(p);
  update(p, 'init');
  openReceipt(p, firstClaim(p));
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
all(document, '.section-strip[data-workbench]').forEach(initTabs);
fitFirst();
on(window, 'resize', fitFirst);
document.fonts?.ready.then(fitFirst);
window.plate = { register, draw };
})();
