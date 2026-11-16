// The Council Briefing. Ready-made packets at the top; below them, ticks choose what the packet holds, each plate keeps its own state, and this reads them into the
// packet bar, the cover, each section's settings line, and the appendix. It stores nothing and sends nothing. From the address it reads only what to add,
// #add=a.b (or an old ?add=a&add=b) or a section's own id (#packet-dc-cooling), then drops everything after the anchor (plate.js writes nothing here:
// data-address="none"). Deferred and ahead of plate.js, so a section not chosen is hidden before the kit starts, and its plate starts when it is ticked
// (briefing-plates-18). Without scripts every section shows and the rail is a jump list. Text by textContent only.
(() => {
  const all = (selector, node = document) => [...node.querySelectorAll(selector)];
  const one = (selector, node = document) => node.querySelector(selector);
  const packet = one('.briefing-packet');
  const form = one('.briefing-rail form');
  const boxes = all('input[type="checkbox"]', form);
  const pages = all('.packet-page[data-packet]', packet);
  const cover = one('.packet-cover');
  const appendix = one('.packet-appendix');
  const pageOf = (id) => pages.find((n) => n.dataset.packet === id);
  const count = (n, single, many) => `${n.toLocaleString('en-US')} ${n === 1 ? single : many}`;
  const list = (items) => new Intl.ListFormat('en-US').format(items);
  const chosen = (name) => boxes.filter((b) => (!name || b.name === name) && b.checked).map((b) => b.value);
  const tick = (ids, keep = false) => { for (const b of boxes) b.checked = ids.includes(b.value) || (keep && b.checked); };
  const DOCS_A_SHEET = 20; // as scripts/build_briefing.py estimates the appendix
  // A group of the rail opens when it holds a tick; one the reader opened stays open.
  const openGroups = () => { for (const group of all('.rail-group', form)) if (one('input:checked', group)) group.open = true; };
  const show = () => {
    const on = new Set(chosen());
    for (const page of pages) page.hidden = !on.has(page.dataset.packet);
    return on;
  };

  // What the address asks for, read and then dropped, so a reload or a copied link carries nothing the reader set here (briefing-plates-04, -09).
  function asked() {
    const { anchor, params } = window.siteAddress.read();
    let target = null;
    try { target = anchor ? document.getElementById(decodeURIComponent(anchor)) : null; } catch { /* a broken escape names nothing */ }
    const old = new URLSearchParams(location.search).getAll('add'); // siteAddress keeps one value a name; an old link may repeat add=
    const ids = [...new Set([...params.getAll('add'), ...old].flatMap((v) => v.split('.')).filter(Boolean))];
    const section = target?.closest('.packet-page[data-packet]');
    if (section) ids.push(section.dataset.packet);
    if (params.toString() || location.search) window.siteAddress.write(ids.length && !anchor ? 'customize' : anchor, new URLSearchParams());
    return { ids, target: section ? target : ids.length ? one('#customize') : null, missing: ids.filter((id) => !boxes.some((b) => b.value === id)) };
  }
  const landing = asked();
  tick(landing.ids);
  openGroups();
  show();
  packet.classList.add('is-live');

  document.addEventListener('DOMContentLoaded', () => {
    const { plate } = window;
    const say = (words) => { one('[data-packet-status]').textContent = words; };
    const labelOf = (id) => pageOf(id).dataset.label;
    for (const box of boxes) { // the jump link becomes the tick's label
      const link = box.nextElementSibling;
      link.replaceWith(Object.assign(document.createElement('label'), { htmlFor: box.id, textContent: link.textContent }));
    }
    form.classList.add('is-live'); // the ticks and the bar held their place, unseen, since the first paint (briefing.css)
    for (const a of all('a[data-home]', packet)) a.dataset.here = a.getAttribute('href');
    const bar = one('.packet-bar');
    new ResizeObserver(() => { document.documentElement.style.scrollPaddingTop = `${bar.offsetHeight + 16}px`; }).observe(bar); // focus never lands under the bar

    // The latest date among the chosen, or the span where they differ by more than a day.
    function checkedWords(plates) {
      const days = plates.map((id) => pageOf(id).dataset.checked).filter(Boolean);
      const sorted = (days.length ? days : [cover.dataset.checked]).map((d) => [Date.parse(d), d]).sort((a, b) => a[0] - b[0]);
      const [first, last] = [sorted[0], sorted.at(-1)];
      return last[0] - first[0] > 86400000 ? `between ${first[1]} and ${last[1]}` : last[1];
    }
    // The cover lists only the settings a reader moved; the rest are at their defaults (briefing-plates-19, -24).
    function chosenLine(reads) {
      const lines = reads.filter((r) => r.changed).map((r) => {
        const li = document.createElement('li');
        li.append(Object.assign(document.createElement('b'), { textContent: labelOf(r.id) }), `: ${r.settings.filter((s) => s.changed).map((s) => `${s.label} ${s.word}`).join('; ')}`);
        return li;
      });
      const box = one('[data-chosen]');
      if (!lines.length) { box.textContent = 'Every plate at its default settings.'; return; }
      box.replaceChildren(Object.assign(document.createElement('ul'), { className: 'packet-chosen' }));
      box.firstChild.append(...lines, Object.assign(document.createElement('li'), { textContent: 'All other settings at their defaults.' }));
    }
    // The appendix shows a document while a chosen section cites it, and under it only those claims (briefing-plates-07, -11).
    function appendixFor(on) {
      const cited = (node) => node.dataset.for.split(' ').some((id) => on.has(id));
      let docs = 0;
      for (const doc of all('.packet-doc', appendix)) {
        const rows = all('.packet-doc-claims > li', doc);
        for (const row of rows) row.hidden = !cited(row);
        doc.hidden = rows.every((row) => row.hidden);
        docs += !doc.hidden;
      }
      appendix.hidden = !docs;
      return docs;
    }

    const watched = new Set();
    let syncing = false;
    function sync() {
      if (syncing) return; // a plate's own report, while this reads it
      syncing = true;
      try {
        const on = show();
        const plates = chosen('plate');
        const lists = chosen('list');
        for (const id of plates.filter((p) => !watched.has(p))) { watched.add(id); plate.onReading(id, sync); } // starts a plate the first time it is ticked
        const reads = plates.map((id) => plate.read(id));
        const guard = `${reads.some((r) => r.changed) ? 'Settings chosen by the reader' : 'Default settings'}, sources checked ${checkedWords(plates)}.`;
        for (const node of all('.packet-guard')) node.textContent = guard;
        for (const r of reads) {
          one('.packet-settings', pageOf(r.id)).textContent = !r.settings.length ? 'Settings: none on this plate' : r.changed ? `Settings: ${r.settings.map((s) => `${s.label}: ${s.word}`).join('; ')}; chosen by the reader` : 'Settings: defaults';
          for (const node of all(`[data-title="${r.id}"]`)) node.textContent = r.title;
        }
        // The cover: what the packet says, then how to read it. Measured and Modeled stand only while a plate is chosen (briefing-plates-05).
        cover.classList.toggle('is-filled', on.size > 0); // CSS shows the empty line or the contents, so the first paint is already the empty packet
        for (const item of all('[data-contents] > li')) item.hidden = !on.has(item.dataset.for);
        for (const row of all('[data-plates-only]', cover)) row.hidden = !plates.length;
        const status = new Map(reads.flatMap((r) => Object.entries(r.receipts).map(([claim, receipt]) => [claim, receipt.status])));
        for (const id of lists) for (const mark of all('[data-claim]', pageOf(id))) status.set(mark.dataset.claim, mark.dataset.status.startsWith('partly') ? 'partly' : 'verified');
        const partly = [...status.values()].filter((s) => s === 'partly').length;
        one('[data-measured]').textContent = `${count(status.size, 'figure', 'figures')} read from a source and cited by claim id; ${partly.toLocaleString('en-US')} of them partly verified, each with its limit printed.`;
        const models = [...new Set(plates.map((id) => pageOf(id).dataset.model).filter(Boolean))];
        if (plates.some((id) => 'formula' in pageOf(id).dataset)) models.push('formula rows');
        const modeled = list(models);
        one('[data-modeled]').textContent = models.length ? `${modeled[0].toUpperCase()}${modeled.slice(1)}.` : 'None on the chosen plates.';
        chosenLine(reads);
        const noted = new Set(); // where a page's question sets come from stands once, at its first chosen set (briefing-plates-07)
        for (const id of lists) {
          const note = one('.packet-provenance', pageOf(id));
          if (note) note.hidden = noted.has(pageOf(id).dataset.from);
          noted.add(pageOf(id).dataset.from);
        }
        const docs = appendixFor(on);
        // A link to a section not chosen goes to its home page instead of to nothing.
        for (const a of all('a[data-home]', packet)) a.setAttribute('href', one(a.dataset.here)?.closest('.packet-page')?.hidden === false ? a.dataset.here : a.dataset.home);
        for (const box of boxes.filter((b) => b.dataset.asks)) {
          const asks = box.dataset.asks.split(' ').filter((id) => plates.includes(id)).map(labelOf);
          const note = one('.rail-asks', box.parentElement);
          note.hidden = !asks.length;
          note.textContent = asks.length ? `asks about ${list(asks)}` : '';
        }
        // The bar and the rail say what is in the packet where the reader is looking (briefing-plates-03, -07).
        for (const group of all('.rail-group', form)) {
          const ticks = all('input', group);
          one('[data-count]', group).textContent = `${ticks.filter((b) => b.checked).length} of ${ticks.length}`;
        }
        const sheets = 1 + [...on].reduce((n, id) => n + Number(pageOf(id).dataset.sheets || 1), 0) + Math.ceil(docs / DOCS_A_SHEET);
        const parts = [plates.length ? count(plates.length, 'plate', 'plates') : '', lists.length ? count(lists.length, 'checklist', 'checklists') : ''].filter(Boolean);
        one('[data-packet-count]').textContent = on.size ? `${list(parts)}, about ${sheets} pages` : 'Nothing is in the packet yet.';
        return { plates, lists, reads };
      } finally {
        syncing = false;
      }
    }
    const empty = () => {
      if (chosen().length) return false;
      say('The packet is empty. Tick a plate or a checklist, or start from one of the packets above.');
      return true;
    };

    one('[data-assembled]').textContent = ` ${plate.today()}`;
    sync();
    if (landing.missing.length) say(`The link asked for ${count(landing.missing.length, 'item', 'items')} this page does not offer: ${list(landing.missing)}.`);
    if (landing.target) {
      landing.target.scrollIntoView();
      if (landing.target.tabIndex < 0 && !landing.target.hasAttribute('tabindex')) landing.target.tabIndex = -1;
      landing.target.focus({ preventScroll: true });
    }
    form.addEventListener('submit', (e) => e.preventDefault());
    form.addEventListener('change', sync);
    window.addEventListener('hashchange', () => { // a link on this page that asks to add, as the ones on other pages do
      const more = asked();
      if (!more.ids.some((id) => !chosen().includes(id))) return; // a link within the packet: the browser has already gone there
      tick(more.ids, true);
      openGroups();
      sync();
      more.target?.scrollIntoView();
    });

    document.addEventListener('click', (e) => {
      const button = e.target.closest('button, a');
      if (!button) return;
      const preset = button.closest('.preset-acts')?.dataset.ids.split(' ');
      if (button.matches('[data-customize]')) { // the packet becomes the ticks, and the link goes on to the list
        tick(preset);
        openGroups();
        sync();
        say(`The packet now holds ${one('[data-packet-count]').textContent}. Tick or untick to change it.`);
      } else if (button.matches('[data-print-preset]')) { // prints that packet and leaves the reader's own ticks as they were
        const before = chosen();
        tick(preset);
        sync();
        window.addEventListener('afterprint', () => { tick(before); sync(); }, { once: true });
        print();
      } else if (button.matches('[data-print-packet]')) {
        if (empty()) return;
        sync();
        print();
      } else if (button.matches('[data-download-packet]')) {
        if (empty()) return;
        const { plates, lists, reads } = sync();
        const assembled = plate.today();
        plate.save(`council-briefing-${assembled.replaceAll('/', '-')}.json`, `${JSON.stringify({ assembled, checked: checkedWords(plates), plates: reads.map(({ id, state, selected }) => ({ id, state, selected })), checklists: lists }, null, 2)}\n`, 'application/json');
        say("The packet file is downloaded. It holds the settings you typed: share it only where your Nation's figures may go.");
      } else if (button.matches('[data-untick]')) {
        tick([]);
        sync();
        say('Every tick is cleared. Settings you changed stay with their plates.');
      } else if (button.matches('[data-reset]')) {
        for (const id of watched) if (plate.read(id).changed) plate.reset(id);
        sync();
        say('Every plate is back at its default settings.');
      }
    });
  });
})();
