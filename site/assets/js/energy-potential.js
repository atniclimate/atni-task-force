// Energy types by stage across Tribes (the energy overview and energy/potential/): stacked bars and the alphabetical detail on the plate, then the Tribe-by-Tribe list on the
// potential page. The plate's static table and the plain links to the JSON and CSV files stay when this script cannot run.

import { esc, href, fold, plural, STATES, getJSON, linkFilters, addOptions, closedDetail, hashTarget } from './util.js';

const FILTERS = ['q', 'state', 'type', 'stage', 'check', 'has'];
const CHECKS = { verified: 'Verified', needs_review: 'Needs review' };
const STAGE_KEYS = { installed: 'Installed or operating', planned: 'Planned or funded', assessed: 'Assessed or sited', goal: 'Goal or interest' };
let dataFile;
const loadData = () => (dataFile ??= getJSON('data/energy-potential.json'));

// Stage classes run 1 (goal or interest) to 4 (installed or operating); data lists stages most advanced first.
const stageClass = (stages, label) => {
  const i = stages.findIndex((s) => s.label === label);
  return i < 0 ? 0 : stages.length - i;
};

// Excerpts are verbatim cuts of page text: whitespace is collapsed for reading, and an ellipsis
// marks a cut that starts or ends inside a sentence.
function quote(text) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  return `${/^[A-Z0-9"(“•]/.test(t) ? '' : '…'}${t}${/[.!?:;)"”]$/.test(t) ? '' : '…'}`;
}

function counts(data) {
  const { energy_types: types, stages } = data.method;
  const rows = new Map(types.map((t) => [t.id, stages.map(() => 0)]));
  for (const tribe of data.tribes) {
    for (const f of tribe.top) {
      const i = stages.findIndex((s) => s.label === f.stage_label);
      if (rows.has(f.type) && i >= 0) rows.get(f.type)[i] += 1;
    }
  }
  return rows;
}

function citationHTML(c) {
  return `<figure class="citation"><blockquote cite="${href(c.url)}"><p>${esc(quote(c.excerpt))}</p></blockquote>
<figcaption><a href="${href(c.url)}">${esc(c.title)}</a>${c.year ? `, ${esc(c.year)}` : ''}, page ${esc(c.page)}</figcaption></figure>`;
}

function tribeHTML(tribe, stages, hit) {
  const states = tribe.states.map((s) => STATES[s] || s).join(', ');
  const pending = tribe.documents_pending_extraction
    ? `; ${plural(tribe.documents_pending_extraction, 'more awaits', 'more await')} text extraction`
    : '';
  const meta = `${states || 'State not recorded'}. ${plural(tribe.documents_examined, 'document')} read${pending}.`;
  const findings = tribe.top
    .map((f) => `<li${hit(f) ? ' class="is-match"' : ''}><span class="finding-rank" aria-hidden="true">${esc(f.rank)}</span>
<span class="finding-type"><span class="sr-only">Rank ${esc(f.rank)}: </span>${esc(f.label)}</span>
<span class="tag stage stage-${stageClass(stages, f.stage_label)}">${esc(f.stage_label)}</span>
<span class="tag${f.status === 'verified' ? '' : ' is-hollow'}">${esc(CHECKS[f.status] || f.status)}</span></li>`)
    .join('');
  const excerpts = tribe.top.reduce((n, f) => n + f.citations.length, 0);
  const docs = new Set(tribe.top.flatMap((f) => f.citations.map((c) => c.doc_id))).size;
  const evidence = tribe.top
    .map((f) => `<h4>${esc(f.label)}: ${esc(f.stage_label.toLowerCase())}</h4>${f.citations.map(citationHTML).join('')}`)
    .join('');
  const documents = tribe.documents.length
    ? `<details class="disclosure"><summary>Documents read (${tribe.documents.length})</summary><ul class="doc-list">${tribe.documents
        .map((d) => `<li><a href="${href(d.url)}">${esc(d.title)}</a>${d.year ? ` (${esc(d.year)})` : ''}</li>`)
        .join('')}</ul></details>`
    : '';
  const body = tribe.top.length
    ? `<ol class="findings" role="list" aria-label="Energy types, ranked">${findings}</ol>
${tribe.note ? `<p class="record-note">${esc(tribe.note)}</p>` : ''}
<details class="disclosure"><summary>Evidence: ${esc(plural(excerpts, 'excerpt'))} from ${esc(plural(docs, 'document'))}</summary>${evidence}</details>
${documents}
<p class="record-links"><a href="../funding/?tribe=${encodeURIComponent(tribe.slug)}#by-tribe">Funding programs matched to these energy types</a></p>`
    : `<p class="record-note"><strong>No energy type found.</strong> ${esc(tribe.note)}</p>${documents}`;
  return `<li class="record tribe" id="${esc(tribe.slug)}"><h3>${esc(tribe.name)}</h3><p class="record-meta">${esc(meta)}</p>${body}</li>`;
}

function renderList(data, rows) {
  const app = document.getElementById('potential-app');
  if (!app) return null;
  const form = app.querySelector('form');
  const field = (name) => form.elements.namedItem(name);
  const results = document.getElementById('potential-results');
  const status = document.getElementById('potential-status');
  const { energy_types: types, stages } = data.method;
  const tribes = [...data.tribes].sort((a, b) => a.name.localeCompare(b.name));
  const label = new Map(types.map((t) => [t.id, t.label]));
  const text = new Map(
    tribes.map((t) => [
      t,
      fold([
        t.name,
        ...t.states.map((s) => STATES[s] || s),
        ...t.top.map((f) => f.label),
        ...t.documents.map((d) => d.title),
        ...t.top.flatMap((f) => f.citations.map((c) => c.excerpt)),
      ].join(' ')),
    ]),
  );

  const stateCodes = [...new Set(tribes.flatMap((t) => t.states))].sort((a, b) => (STATES[a] || a).localeCompare(STATES[b] || b));
  addOptions(field('state'), stateCodes.map((s) => [s, STATES[s] || s, tribes.filter((t) => t.states.includes(s)).length]));
  addOptions(field('type'), types.map((t) => [t.id, t.label, rows.get(t.id).reduce((a, b) => a + b, 0)]));
  addOptions(field('stage'), stages.map((s) => [s.label, s.label, tribes.filter((t) => t.top.some((f) => f.stage_label === s.label)).length]));
  addOptions(field('check'), Object.entries(CHECKS).map(([k, v]) => [k, v, tribes.filter((t) => t.top.some((f) => f.status === k)).length]));
  const writeParams = linkFilters(form, FILTERS);

  const render = () => {
    const [q, state, type, stage, check, has] = FILTERS.map((n) => field(n).value);
    const words = fold(q).split(/\s+/).filter(Boolean);
    const narrowed = Boolean(type || stage || check);
    const hit = (f) => narrowed && (!type || f.type === type) && (!stage || f.stage_label === stage) && (!check || f.status === check);
    const shown = tribes.filter(
      (t) =>
        (!state || t.states.includes(state)) &&
        (has !== 'yes' || t.top.length) &&
        (has !== 'no' || !t.top.length) &&
        (!narrowed || t.top.some(hit)) &&
        words.every((w) => text.get(t).includes(w)),
    );
    results.innerHTML = shown.map((t) => tribeHTML(t, stages, hit)).join('');
    const filtered = Boolean(words.length || state || has || narrowed);
    const about = type ? ` with ${label.get(type).toLowerCase()} in their plans` : '';
    status.textContent = shown.length
      ? `Showing ${shown.length} of ${plural(tribes.length, 'Tribe')}${filtered ? about : ''}.`
      : 'No Tribe matches. Clear the filters or change the search.';
    writeParams();
  };

  let typing;
  form.addEventListener('input', (event) => {
    window.clearTimeout(typing);
    if (event.target === field('q')) typing = window.setTimeout(render, 250);
    else render();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    window.clearTimeout(typing);
    render();
  });
  form.querySelector('[data-clear]').addEventListener('click', () => {
    for (const name of FILTERS) field(name).value = '';
    render();
    field('q').focus();
  });

  render();
  app.hidden = false;
  // The list is drawn after load, so the browser's own jump to a Tribe's #id has nothing to land on yet.
  hashTarget()?.scrollIntoView();

  return (type) => {
    for (const name of FILTERS) field(name).value = name === 'type' ? type : '';
    render();
    document.getElementById('tribes')?.focus();
  };
}

// One Tribe in a plate's detail: its name links to its existing entry, with its stage, its check, and its cited excerpts. Alphabetical by name, so the list is never a ranking.
function tribeLine(tribe, finding, stages, entry) {
  const cites = finding.citations;
  return `<li><a href="${entry}#${encodeURIComponent(tribe.slug)}">${esc(tribe.name)}</a>
<span class="tag stage stage-${stageClass(stages, finding.stage_label)}">${esc(finding.stage_label)}</span>
<span class="tag${finding.status === 'verified' ? '' : ' is-hollow'}">${esc(CHECKS[finding.status] || finding.status)}</span>
<details class="plate-more"><summary>${esc(plural(cites.length, 'cited excerpt'))}</summary>${cites.map(citationHTML).join('')}</details></li>`;
}

// The plate is drawn by the build as bars of totals, which is what shows without scripts. The stage ramp, the key, and the list of Tribes are this page's own: see docs/PLATE-KIT.md, "Page script".
function typesPlate(figure, pick) {
  const id = figure.dataset.plate;
  const onThisPage = id === 'energy-types-by-stage-plans';
  const entry = onThisPage ? '' : 'potential/';
  let shown = null;
  let timer;
  const parts = {};

  const fillTribes = async () => {
    const key = shown;
    try {
      const data = await loadData();
      if (key !== shown) return;
      const list = data.tribes
        .flatMap((t) => t.top.filter((f) => f.type === key).map((f) => [t, f]))
        .sort(([a], [b]) => a.name.localeCompare(b.name));
      parts.tribes.innerHTML = list.length
        ? `<ul class="energy-tribe-list" role="list">${list.map(([t, f]) => tribeLine(t, f, data.method.stages, entry)).join('')}</ul>`
        : '<p class="caption">No published finding names this type. That reflects the documents in the library, not Tribal positions.</p>';
    } catch (error) {
      parts.tribes.innerHTML = `<p class="caption">The list could not load. It is in <a href="${href('data/energy-potential.json')}">energy-potential.json</a>.</p>`;
      console.warn(error);
    }
  };

  const setUp = (ctx) => {
    const [, top] = ctx.data.plot.domain;
    for (const row of ctx.data.rows) {
      const node = ctx.plot.querySelector(`[data-row="${row.key}"]`);
      const bar = document.createElement('span');
      bar.className = 'stack-bar';
      bar.setAttribute('aria-hidden', 'true');
      Object.keys(STAGE_KEYS).forEach((key, i) => {
        const n = +row.cols[key];
        if (!n) return;
        const part = document.createElement('i');
        part.className = `stage-${4 - i}`;
        part.style.setProperty('--w', n / top);
        bar.append(part);
      });
      node.querySelector('.ladder-track').append(bar);
      node.classList.toggle('is-zero', !row.value);
    }
    const key = document.createElement('div');
    key.className = 'plate-under';
    key.innerHTML = `<ul class="legend plate-legend" aria-label="Most advanced stage found">${Object.values(STAGE_KEYS).map((label, i) => `<li><i class="plate-square stage-${4 - i} energy-key"></i>${esc(label)}</li>`).join('')}</ul>`;
    ctx.plot.after(key);
    // The figures the build wrote as sentences stand large; a sentence stays one sentence aloud.
    for (const p of figure.querySelectorAll('.plate-claim > p:not([class])')) {
      const match = /^([\d,]+) (.+)$/.exec(p.textContent);
      if (!match) continue;
      const big = document.createElement('span');
      big.className = 'energy-figure';
      big.textContent = match[1];
      p.replaceChildren(big, ` ${match[2]}`);
    }
    // What the build leaves in the claim zone for no scripts moves beside the Reading, where selecting a row asks about it. The button stays beside the figures, on the first screen.
    const reading = figure.querySelector('.plate-view[data-view="reading"]');
    const actions = reading.querySelector('.plate-actions');
    const feet = [...figure.querySelectorAll('.plate-claim > .plate-foot')];
    parts.read = feet.map((p) => p.querySelector('a[href$="#tribes"]')).find(Boolean);
    parts.read.classList.add('button');
    const states = document.createElement('div');
    states.className = 'energy-states';
    states.append(...feet.filter((p) => !p.querySelector('a')));
    parts.more = document.createElement('details');
    parts.more.className = 'plate-more energy-tribes';
    parts.summary = document.createElement('summary');
    parts.tribes = document.createElement('div');
    parts.more.append(parts.summary, parts.tribes);
    parts.more.addEventListener('toggle', () => { if (parts.more.open) fillTribes(); });
    reading.insertBefore(states, actions);
    reading.insertBefore(feet.find((p) => p.querySelector('a[href$=".json"]')), actions);
    reading.insertBefore(parts.more, actions);
    if (onThisPage) {
      parts.read.addEventListener('click', (event) => {
        event.preventDefault();
        pick(shown);
      });
      // An entry a filter has hidden is not there to land on, so the filter clears first.
      parts.tribes.addEventListener('click', (event) => {
        const link = event.target.closest('a[href^="#"]');
        if (link && !document.getElementById(decodeURIComponent(link.hash.slice(1)))) pick('');
      });
    }
  };

  closedDetail(figure);
  window.plate.register(id, {
    render(ctx) {
      ctx.auto();
      if (!parts.more) setUp(ctx);
      const [row] = ctx.rows;
      const [, top] = ctx.data.plot.domain;
      const at = row.value / top;
      ctx.plot.style.setProperty('--stack-at', at);
      const needle = ctx.plot.querySelector('.ladder-needle');
      needle.classList.toggle('is-flip', at > 0.6);
      const label = needle.querySelector('.needle-label') || needle.appendChild(document.createElement('span'));
      label.className = 'needle-label';
      label.textContent = `${row.label}, ${plural(row.value, 'Tribe')}`;
      shown = ctx.key;
      parts.read.href = onThisPage ? `?type=${encodeURIComponent(shown)}#tribes` : `potential/?type=${encodeURIComponent(shown)}#tribes`;
      parts.summary.textContent = `${row.label}: the Tribes, alphabetically (${row.value})`;
      clearTimeout(timer); // a pointer passing over rows previews them; the list waits for it to settle
      if (parts.more.open) timer = setTimeout(fillTribes, 150);
    },
  });
}

const plates = [...document.querySelectorAll('[data-plate^="energy-types"]')];
let pick = () => {};
plates.forEach((figure) => typesPlate(figure, (type) => pick(type)));
if (document.getElementById('potential-app')) {
  loadData()
    .then((data) => { pick = renderList(data, counts(data)) || pick; })
    .catch((error) => {
      for (const note of document.querySelectorAll('[data-load-error]')) note.hidden = false;
      console.warn(error);
    });
}
