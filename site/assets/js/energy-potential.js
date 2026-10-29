// What Tribal plans say about energy (energy/potential/): the chart across all Tribes and the
// Tribe-by-Tribe list, both read from data/energy-potential.json. The page keeps plain links to
// the JSON and CSV files, so nothing is lost when this script cannot run.

import { esc, href, fold, day, plural, STATES, getJSON, linkFilters, setFigure, addOptions } from './util.js';

const FILTERS = ['q', 'state', 'type', 'stage', 'check', 'has'];
const CHECKS = { verified: 'Verified', needs_review: 'Needs review' };

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

function renderChart(data, rows, pick) {
  const host = document.getElementById('potential-chart');
  if (!host) return;
  const { energy_types: types, stages } = data.method;
  const total = (id) => rows.get(id).reduce((a, b) => a + b, 0);
  const shown = types.filter((t) => total(t.id) > 0).sort((a, b) => total(b.id) - total(a.id));
  const none = types.filter((t) => total(t.id) === 0);
  const max = Math.max(1, ...shown.map((t) => total(t.id)));
  const legend = stages
    .map((s, i) => `<li><span class="swatch stage-${stages.length - i}" aria-hidden="true"></span>${esc(s.label)}</li>`)
    .join('');
  const bars = shown
    .map((t) => {
      const row = rows.get(t.id);
      const n = total(t.id);
      const end = row.findLastIndex((c) => c > 0);
      const segs = row
        .map((c, i) => (c ? `<span class="bar-seg stage-${stages.length - i}${i === end ? ' is-end' : ''}" style="--w:${(c / max).toFixed(4)}"></span>` : ''))
        .join('');
      const said = row.map((c, i) => `${c} ${stages[i].label.toLowerCase()}`).join(', ');
      const tip = row
        .map((c, i) => `<span class="tip-row"><span class="tip-key stage-${stages.length - i}"></span><strong>${c}</strong> ${esc(stages[i].label)}</span>`)
        .join('');
      return `<li><button type="button" class="bar" data-type="${esc(t.id)}">
<span class="bar-label">${esc(t.label)}</span>
<span class="bar-track" aria-hidden="true">${segs}<span class="bar-total">${n}</span></span>
<span class="sr-only">, ${esc(plural(n, 'Tribe'))}: ${esc(said)}.</span>
<span class="bar-tip" aria-hidden="true"><span class="tip-title">${esc(t.label)}: ${esc(plural(n, 'Tribe'))}</span>${tip}</span>
</button></li>`;
    })
    .join('');
  const lead = shown.slice(0, 3).map((t) => `${t.label.toLowerCase()} for ${total(t.id)}`);
  const summary = lead.length
    ? `The types found most often are ${lead.slice(0, -1).join(', ')}${lead.length > 1 ? ', and ' : ''}${lead[lead.length - 1]} Tribes.`
    : '';
  const missing = none.length
    ? ` No finding concerns ${none.map((t) => t.label.toLowerCase()).join(' or ')}; that reflects the documents in the library, not Tribal positions.`
    : '';
  host.innerHTML = `<ul class="legend" role="list" aria-label="Stage">${legend}</ul>
<ol class="bars" role="list">${bars}</ol>
<p class="chart-note">${esc(summary + missing)}</p>`;
  host.closest('figure')?.removeAttribute('hidden');

  for (const bar of host.querySelectorAll('.bar')) {
    bar.addEventListener('click', () => pick(bar.dataset.type));
    bar.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') bar.classList.add('tip-off');
    });
    const reset = () => bar.classList.remove('tip-off');
    bar.addEventListener('blur', reset);
    bar.addEventListener('mouseleave', reset);
  }

  const table = document.getElementById('potential-table');
  if (table) {
    const head = stages.map((s) => `<th scope="col">${esc(s.label)}</th>`).join('');
    const body = [...shown, ...none]
      .map((t) => `<tr><th scope="row">${esc(t.label)}</th>${rows.get(t.id).map((c) => `<td>${c}</td>`).join('')}<td>${total(t.id)}</td></tr>`)
      .join('');
    table.innerHTML = `<table class="data-table">
<caption>Tribes whose public plans show each energy type, by the most advanced stage found (${esc(day(data.generated))})</caption>
<thead><tr><th scope="col">Energy type</th>${head}<th scope="col">Tribes</th></tr></thead>
<tbody>${body}</tbody></table>`;
  }
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
  const target = window.location.hash && document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
  if (target) target.scrollIntoView();

  return (type) => {
    for (const name of FILTERS) field(name).value = name === 'type' ? type : '';
    render();
    document.getElementById('tribes')?.focus();
  };
}

getJSON('data/energy-potential.json')
  .then((data) => {
    const rows = counts(data);
    setFigure('ep-tribes', data.tribes.length);
    setFigure('ep-with', data.tribes.filter((t) => t.top.length).length);
    setFigure('ep-docs', data.source.documents_examined.toLocaleString('en-US'));
    setFigure('ep-pending', data.source.documents_pending_extraction);
    setFigure('ep-date', day(data.generated));
    let pick = () => {};
    renderChart(data, rows, (type) => pick(type));
    pick = renderList(data, rows) || pick;
  })
  .catch((error) => {
    for (const note of document.querySelectorAll('[data-load-error]')) note.hidden = false;
    console.warn(error);
  });
