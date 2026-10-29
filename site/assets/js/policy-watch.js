// Policy watch panels on the energy, data center and AI pages, read from data/policy-watch.json.
// Each [data-policy-watch="<task force id>"] panel gets its saved searches and its follow list.
// The panel's import steps and download link are plain HTML and work without this script.

import { esc, href, day, plural, getJSON, setFigure } from './util.js';

const KINDS = { docket: 'Docket', rin: 'Regulation Identifier Number', document: 'Federal Register document', bill: 'Bill' };

function checked(c, source) {
  if (!c) return '';
  const note = c.note ? ` ${c.note}` : '';
  if (c.status === 'ok') return `Checked ${day(c.date)}: ${plural(c.results, 'result')}.${note}`;
  if (c.status === 'empty') return `Checked ${day(c.date)}: no results yet.${note}`;
  if (c.status === 'unchecked') return `Not counted automatically, because ${source} needs a key; open the search to see current results.${note}`;
  return `The check on ${day(c.date)} did not finish; open the search to see current results.${note}`;
}

function searchHTML(s, sources) {
  const source = sources.get(s.source) || s.source;
  return `<li class="record watch-item">
<h4>${esc(s.title)}</h4>
<p>${esc(s.why)}</p>
<p class="record-meta">${esc(source)}. Search: <span class="query">${esc(s.query)}</span></p>
<p class="record-note">${esc(checked(s.checked, source))}</p>
<p class="watch-links"><a href="${href(s.official_url)}">Search ${esc(source)}</a> <a href="${href(s.policy_sentinel_url)}">Open in Policy Sentinel</a></p>
</li>`;
}

function followHTML(f) {
  const latest = f.latest ? `<p class="record-note">Latest: ${esc(f.latest.title)}, ${esc(day(f.latest.date))}.</p>` : '';
  const agency = f.agency ? `, ${f.agency}` : '';
  return `<li class="record watch-item">
<h4><a href="${href(f.url)}">${esc(f.title)}</a></h4>
<p class="record-meta">${esc(KINDS[f.kind] || f.kind)}: ${esc(f.identifier || f.value || f.id)}${esc(agency)}${f.importable ? '. In the importable list' : ''}</p>
<p>${esc(f.reason)}</p>${latest}
</li>`;
}

getJSON('data/policy-watch.json')
  .then((data) => {
    const forces = Object.values(data.task_forces);
    setFigure('policy-follow', forces.reduce((n, t) => n + t.follow.length, 0));
    setFigure('policy-searches', forces.reduce((n, t) => n + t.searches.length, 0));
    setFigure('policy-date', day(data.generated));
    const sources = new Map(data.policy_sentinel.sources.map((s) => [s.id, s.label]));
    for (const panel of document.querySelectorAll('[data-policy-watch]')) {
      const force = data.task_forces[panel.dataset.policyWatch];
      if (!force) continue;
      const searches = panel.querySelector('[data-policy-searches]');
      const follow = panel.querySelector('[data-policy-follow]');
      if (searches) searches.innerHTML = `<ul class="records" role="list">${force.searches.map((s) => searchHTML(s, sources)).join('')}</ul>`;
      if (follow) {
        follow.innerHTML = `<details class="disclosure"><summary>Follow list: ${esc(plural(force.follow.length, 'item'))}</summary>
<ul class="records" role="list">${force.follow.map(followHTML).join('')}</ul></details>`;
      }
      for (const el of panel.querySelectorAll('[data-policy-checked]')) el.textContent = day(data.generated);
      if (data.policy_sentinel.prefill_supported) panel.querySelector('[data-prefill-note]')?.setAttribute('hidden', '');
    }
  })
  .catch((error) => console.warn(error));
