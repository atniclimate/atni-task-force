// Tribal energy funding, read from data/energy-funding.json: upcoming deadlines (on the energy
// overview and the funding page), and on energy/funding/ the program catalog, the Grants.gov
// live layer, and the programs matched to each Tribe's ranked energy types.

import { esc, href, day, usDates, plural, getJSON, linkFilters, setFigure, addOptions } from './util.js';

const ORDER = ['open', 'forecasted', 'closed', 'terminated', 'rescinded', 'enjoined', 'unknown'];
const CATALOG = ['type', 'cooling', 'status'];
const CHECKS = { verified: 'Verified', needs_review: 'Needs review' };
const APPLIES = { applicable: 'Named by a program document', 'possible, confirm with agency': 'Possible; confirm with the agency' };

const rank = (status) => (ORDER.indexOf(status) + 1 || ORDER.length + 1);
const capital = (text) => (text ? text[0].toUpperCase() + text.slice(1) : '');
const sentence = (text) => (/[.!?)]$/.test(text) ? text : `${text}.`);
const statusTag = (p) => `<span class="tag status-${esc(p.status)}${p.status === 'open' ? '' : p.status === 'forecasted' ? ' is-hollow' : ' is-plain'}">${esc(capital(usDates(p.status_label || p.status)))}</span>`;
const host = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'source';
  }
};

function localISO(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function daysFromToday(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const now = new Date();
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
}
const when = (n) => (n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `In ${n} days`);

function pacific(iso) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.month}/${parts.day}/${parts.year} at ${parts.hour}:${parts.minute} ${parts.dayPeriod} ${parts.timeZoneName}`;
}

// Deadlines that have not passed, from program records and live notices; a list on any page.
function renderDeadlines(data) {
  const today = localISO();
  for (const list of document.querySelectorAll('[data-funding-deadlines]')) {
    const link = list.dataset.programLink || '#prog-';
    const items = [
      ...data.programs
        .filter((p) => p.deadline?.date >= today)
        .map((p) => ({ date: p.deadline.date, name: p.short_name, url: `${link}${p.id}`, what: p.deadline.what })),
      ...data.live.opportunities
        .filter((o) => o.close_date >= today)
        .map((o) => ({ date: o.close_date, name: o.title, url: o.url, what: `Grants.gov notice ${o.number} closes` })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    list.innerHTML = items.length
      ? items
          .map((d) => `<li class="deadline"><p class="deadline-date"><time datetime="${esc(d.date)}">${esc(day(d.date))}</time></p>
<p class="deadline-when">${esc(when(daysFromToday(d.date)))}</p>
<p class="deadline-what"><a href="${d.url.startsWith('#') || d.url.startsWith('funding/') ? esc(d.url) : href(d.url)}">${esc(d.name)}</a>: ${esc(sentence(usDates(d.what)))}</p></li>`)
          .join('')
      : `<li class="deadline"><p class="deadline-what">No upcoming deadline is recorded in the catalog. Statuses were checked ${esc(day(data.source.programs_status_as_of))}.</p></li>`;
  }
}

function programHTML(p, labels, filter) {
  const types = (ids) => ids.map((id) => labels.type.get(id) || id).join(', ');
  const fit = filter.type
    ? p.energy_types.includes(filter.type)
      ? `<p class="fit"><span class="tag">Names ${esc(labels.type.get(filter.type).toLowerCase())}</span></p>`
      : `<p class="fit"><span class="tag is-hollow">May fit ${esc(labels.type.get(filter.type).toLowerCase())}; confirm with the agency</span></p>`
    : '';
  const cooling = p.cooling_uses
    .map((c) => `<li${filter.cooling === c.use ? ' class="is-match"' : ''}><strong>${esc(labels.cooling.get(c.use) || c.use)}:</strong> ${esc(APPLIES[c.applicability] || c.applicability)}. ${esc(usDates(c.sentence))} <a href="${href(c.source)}">Source (${esc(host(c.source))})</a></li>`)
    .join('');
  const notes = [p.energy_type_note, p.assistance_listing_note && `Assistance listing: ${p.assistance_listing_note}`, p.sources_note]
    .filter(Boolean)
    .map((n) => `<p class="record-note">${esc(usDates(n))}</p>`)
    .join('');
  const facts = [
    ['Kind', p.kind],
    ['Tribal eligibility', p.tribal_eligibility],
    ['Funding level', p.funding_level],
    ['Where it applies', p.geography],
    ['Assistance listing', p.assistance_listing],
    ['Energy types named', types(p.energy_types)],
    ['May fit, confirm with the agency', types(p.energy_types_possible)],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(usDates(v))}</dd>`)
    .join('');
  return `<li class="record program" id="prog-${esc(p.id)}">
<p class="record-kicker">${esc(p.agency)}</p>
<h3><a href="${href(p.url)}">${esc(p.short_name)}</a></h3>
${p.name !== p.short_name ? `<p class="record-meta">${esc(p.name)}</p>` : ''}
<p class="status-line">${statusTag(p)} <span>Status checked ${esc(day(p.status_checked?.date))} on <a href="${href(p.status_checked?.url)}">${esc(host(p.status_checked?.url))}</a></span></p>
${p.deadline?.date ? `<p class="record-deadline"><strong>Deadline ${esc(day(p.deadline.date))}:</strong> ${esc(sentence(usDates(p.deadline.what)))}</p>` : ''}
${fit}
<p>${esc(usDates(p.status_note))}</p>
<details class="disclosure"><summary>Program details</summary>
<dl class="facts">${facts}</dl>
<h4>What the Program Pays For</h4><ul>${p.funds.map((f) => `<li>${esc(usDates(f))}</li>`).join('')}</ul>
${cooling ? `<h4>Cooling Uses</h4><ul>${cooling}</ul>` : ''}
${notes}
<h4>Sources</h4><ul class="doc-list">${p.sources.map((s) => `<li><a href="${href(s)}">${esc(host(s))}</a></li>`).join('')}</ul>
</details></li>`;
}

function renderCatalog(data, labels) {
  const app = document.getElementById('catalog-app');
  if (!app) return () => {};
  const form = app.querySelector('form');
  const field = (name) => form.elements.namedItem(name);
  const results = document.getElementById('catalog-results');
  const status = document.getElementById('catalog-status');
  const programs = [...data.programs].sort((a, b) => rank(a.status) - rank(b.status) || a.short_name.localeCompare(b.short_name));
  const fits = (p, type) => p.energy_types.includes(type) || p.energy_types_possible.includes(type);

  addOptions(field('type'), data.vocabulary.energy_types.map((t) => [t.id, t.label, programs.filter((p) => fits(p, t.id)).length]));
  addOptions(field('cooling'), data.vocabulary.cooling_uses.map((c) => [c.id, c.label, programs.filter((p) => p.cooling_uses.some((u) => u.use === c.id)).length]));
  addOptions(
    field('status'),
    Object.keys(data.vocabulary.statuses).map((s) => [s, capital(s), programs.filter((p) => p.status === s).length]),
  );
  document.getElementById('status-terms').innerHTML = Object.entries(data.vocabulary.statuses)
    .map(([k, v]) => `<dt>${esc(capital(k))}</dt><dd>${esc(v)}</dd>`)
    .join('');
  const writeParams = linkFilters(form, CATALOG);

  const render = () => {
    const [type, cooling, state] = CATALOG.map((n) => field(n).value);
    const shown = programs.filter(
      (p) => (!type || fits(p, type)) && (!cooling || p.cooling_uses.some((u) => u.use === cooling)) && (!state || p.status === state),
    );
    results.innerHTML = shown.map((p) => programHTML(p, labels, { type, cooling })).join('');
    const tally = ORDER.map((s) => [s, shown.filter((p) => p.status === s).length])
      .filter(([, n]) => n)
      .map(([s, n]) => `${n} ${s}`)
      .join(', ');
    status.textContent = shown.length
      ? `Showing ${shown.length} of ${plural(programs.length, 'program')}${tally ? ` (${tally})` : ''}. Statuses checked ${day(data.source.programs_status_as_of)}.`
      : 'No program matches. Clear the filters.';
    writeParams();
  };
  form.addEventListener('input', render);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    render();
  });
  const clear = () => {
    for (const name of CATALOG) field(name).value = '';
    render();
  };
  form.querySelector('[data-clear]').addEventListener('click', () => {
    clear();
    field('type').focus();
  });
  render();
  app.hidden = false;
  return clear;
}

function renderLive(data, labels) {
  const list = document.getElementById('live-results');
  if (!list) return;
  const { live } = data;
  setFigure('live-retrieved', pacific(live.retrieved));
  setFigure('live-queries', live.counts.queries);
  setFigure('live-kept', plural(live.counts.kept, 'notice'));
  setFigure('live-posted', live.counts.posted);
  setFigure('live-forecasted', live.counts.forecasted);
  setFigure('live-attribution', live.source.attribution);
  const programs = new Map(data.programs.map((p) => [p.id, p]));
  const money = (n) => (typeof n === 'number' ? `$${n.toLocaleString('en-US')}` : null);
  list.innerHTML = live.opportunities.length
    ? live.opportunities
        .map((o) => {
          const f = o.funding || {};
          const facts = [
            ['Status', `${capital(o.status)}. ${o.close_date ? `Closes ${day(o.close_date)}.` : sentence(o.close_note || '')}`],
            ['Posted', day(o.posted_date)],
            ['Estimated total', money(f.estimated_total)],
            ['Award range', f.award_floor && f.award_ceiling ? `${money(f.award_floor)} to ${money(f.award_ceiling)}` : null],
            ['Expected awards', f.expected_awards],
            ['Cost sharing', typeof f.cost_sharing === 'boolean' ? (f.cost_sharing ? 'Required' : 'Not required') : null],
            ['Energy types', o.energy_types.map((t) => `${labels.type.get(t) || t}${o.basis?.energy_types?.[t] === 'program' ? ' (through its program)' : ''}`).join(', ')],
          ]
            .filter(([, v]) => v || v === 0)
            .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`)
            .join('');
          const linked = o.program_ids
            .map((id) => programs.get(id))
            .filter(Boolean)
            .map((p) => `<a href="#prog-${esc(p.id)}">${esc(p.short_name)}</a>`)
            .join(', ');
          return `<li class="record"><p class="record-kicker">${esc(o.agency)}, ${esc(o.number)}</p>
<h3><a href="${href(o.url)}">${esc(o.title)}</a></h3>
<dl class="facts">${facts}</dl>${linked ? `<p>Catalog program: ${linked}.</p>` : ''}</li>`;
        })
        .join('')
    : '<li class="record"><p>No posted or forecasted notice matched at this retrieval.</p></li>';
}

function renderTribes(data, labels, clearCatalog) {
  const form = document.getElementById('tribe-form');
  const out = document.getElementById('tribe-results');
  if (!form || !out) return;
  const select = form.elements.namedItem('tribe');
  const programs = new Map(data.programs.map((p) => [p.id, p]));
  const notices = new Map(data.live.opportunities.map((o) => [o.number, o]));
  const tribes = [...data.tribes].sort((a, b) => a.name.localeCompare(b.name));
  addOptions(select, tribes.map((t) => [t.slug, t.name, t.matches.length ? plural(t.matches.length, 'ranked type') : 'no ranked type']));
  const writeParams = linkFilters(form, ['tribe']);

  const programList = (ids) =>
    ids.length
      ? `<ul class="match-list">${ids
          .map((id) => programs.get(id))
          .filter(Boolean)
          .map((p) => `<li><a href="#prog-${esc(p.id)}">${esc(p.short_name)}</a> ${statusTag(p)}</li>`)
          .join('')}</ul>`
      : '<p class="record-note">None in the catalog.</p>';

  const render = () => {
    const tribe = tribes.find((t) => t.slug === select.value);
    if (!tribe) {
      out.innerHTML = '';
      writeParams();
      return;
    }
    const entry = `../potential/#${encodeURIComponent(tribe.slug)}`;
    out.innerHTML = tribe.matches.length
      ? `<h3>${esc(tribe.name)}</h3>
<p>Energy types ranked from the Tribe's own public plans, in rank order, with the programs that match each. <a href="${entry}">See the plan evidence for this Tribe</a>.</p>
${tribe.matches
  .map((m) => {
    const live = m.live.map((n) => notices.get(n)).filter(Boolean);
    return `<section class="match" aria-labelledby="m-${esc(m.energy_type)}">
<h4 id="m-${esc(m.energy_type)}">${esc(m.rank)}. ${esc(labels.type.get(m.energy_type) || m.energy_type)}</h4>
<p class="match-tags"><span class="tag stage stage-${labels.stage(m.stage_label)}">${esc(m.stage_label)}</span> <span class="tag${m.potential_status === 'verified' ? '' : ' is-hollow'}">${esc(CHECKS[m.potential_status] || m.potential_status)}</span></p>
<p class="match-head">Programs that name this type</p>${programList(m.programs)}
<p class="match-head">Programs that may fit; confirm with the agency</p>${programList(m.programs_possible)}
${live.length ? `<p class="match-head">Grants.gov notices</p><ul class="match-list">${live.map((o) => `<li><a href="${href(o.url)}">${esc(o.title)}</a> (${esc(o.number)}, ${esc(o.status)})</li>`).join('')}</ul>` : ''}
</section>`;
  })
  .join('')}`
      : `<h3>${esc(tribe.name)}</h3><p>No energy type was ranked from this Tribe's public plans in the library, so no programs are matched. <a href="${entry}">See why on its entry</a>.</p>`;
    writeParams();
  };
  select.addEventListener('change', render);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    render();
  });
  render();
  form.hidden = false;

  // A program link must land on its card, so filters that hide the card are cleared first.
  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('a[href^="#prog-"]');
    if (link && !document.getElementById(link.getAttribute('href').slice(1))) clearCatalog();
  });
}

getJSON('data/energy-funding.json')
  .then((data) => {
    const stages = ['Goal or interest', 'Assessed or sited', 'Planned or funded', 'Installed or operating'];
    const labels = {
      type: new Map(data.vocabulary.energy_types.map((t) => [t.id, t.label])),
      cooling: new Map(data.vocabulary.cooling_uses.map((c) => [c.id, c.label])),
      stage: (label) => stages.indexOf(label) + 1,
    };
    setFigure('fund-programs', data.programs.length);
    setFigure('fund-open', data.programs.filter((p) => p.status === 'open').length);
    setFigure('fund-date', day(data.source.programs_status_as_of));
    setFigure('fund-tribes', data.tribes.length);
    setFigure('fund-tribes-with', data.tribes.filter((t) => t.matches.length).length);
    renderDeadlines(data);
    const clearCatalog = renderCatalog(data, labels);
    renderLive(data, labels);
    renderTribes(data, labels, clearCatalog);
    const target = window.location.hash && document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    if (target) target.scrollIntoView();
  })
  .catch((error) => {
    for (const note of document.querySelectorAll('[data-load-error]')) note.hidden = false;
    console.warn(error);
  });
