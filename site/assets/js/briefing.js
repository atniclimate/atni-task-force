// The Council Briefing: ticks choose what is in the packet, each plate keeps its own state, and this reads them into the cover and the settings lines. It stores nothing, sends nothing, and
// writes nothing to the address (plate.js honors data-address="none"). Without scripts every section shows and the rail is a jump list. Text by textContent only.
document.documentElement.classList.add('has-js'); // before the first paint, so a section not chosen is never laid out and its plate draws when it is ticked
document.addEventListener('DOMContentLoaded', () => {
  const { plate } = window;
  const all = (selector, node = document) => [...node.querySelectorAll(selector)];
  const one = (selector, node = document) => node.querySelector(selector);
  const packet = one('.briefing-packet');
  const form = one('.briefing-rail form');
  const boxes = all('input[type="checkbox"]', form);
  const sectionOf = (id) => one(`.packet-plate[data-packet="${id}"]`);
  const labelOf = (id) => one(`.packet-page[data-packet="${id}"][data-label]`).dataset.label;
  const count = (n, one_, many) => `${n.toLocaleString('en-US')} ${n === 1 ? one_ : many}`;
  const list = (items) => new Intl.ListFormat('en-US').format(items);

  form.classList.add('is-live'); // the ticks and buttons held their place, unseen, since the first paint (briefing.css)
  for (const box of boxes) { // the jump link becomes the tick's label
    const link = box.nextElementSibling;
    const label = Object.assign(document.createElement('label'), { htmlFor: box.id, textContent: link.textContent });
    link.replaceWith(label);
  }
  for (const a of all('a[data-home]', packet)) a.dataset.here = a.getAttribute('href');

  const chosen = (name) => boxes.filter((b) => b.name === name && b.checked).map((b) => b.value);

  // The latest date among the chosen, or the span where they differ by more than a day.
  function checkedWords(plates) {
    const days = plates.map((id) => sectionOf(id).dataset.checked).filter(Boolean);
    const sorted = (days.length ? days : [one('.packet-cover').dataset.checked]).map((d) => [Date.parse(d), d]).sort((a, b) => a[0] - b[0]);
    const [first, last] = [sorted[0], sorted.at(-1)];
    return last[0] - first[0] > 86400000 ? `between ${first[1]} and ${last[1]}` : last[1];
  }
  function chosenLine(reads) {
    const lines = reads.filter((r) => r.settings.length).map((r) => {
      const li = document.createElement('li');
      const name = Object.assign(document.createElement('b'), { textContent: labelOf(r.id) });
      li.append(name, `: ${r.settings.map((s) => `${s.label} ${s.word} (${s.word === 'not set' ? 'blank' : s.changed ? 'your setting' : 'default'})`).join('; ')}`);
      return li;
    });
    const box = one('[data-chosen]');
    if (!lines.length) box.textContent = 'The chosen plates have no settings.';
    else box.replaceChildren(Object.assign(document.createElement('ul'), { className: 'packet-chosen' }));
    if (lines.length) box.firstChild.append(...lines);
  }
  // A claim prints once, at the first plate that cites it, and names the others.
  function sourcesOnce(plates) {
    const first = new Map();
    for (const id of plates) {
      const section = one(`.packet-sources[data-packet="${id}"]`);
      const rows = all('.packet-source', section);
      for (const row of rows) {
        const claim = row.dataset.claim;
        one('.packet-also', row).textContent = '';
        row.hidden = first.has(claim);
        if (first.has(claim)) first.get(claim).push(id);
        else first.set(claim, [id]);
      }
      one('.packet-none', section).hidden = rows.some((row) => !row.hidden);
    }
    for (const id of plates) {
      for (const row of all('.packet-source:not([hidden])', one(`.packet-sources[data-packet="${id}"]`))) {
        const also = first.get(row.dataset.claim).slice(1);
        if (also.length) one('.packet-also', row).textContent = ` Also cited by ${list(also.map(labelOf))}.`;
      }
    }
    return first;
  }

  function sync() {
    const plates = chosen('plate');
    const lists = chosen('list');
    const on = new Set([...plates, ...lists]);
    for (const node of all('.packet-page[data-packet]')) node.classList.toggle('is-chosen', on.has(node.dataset.packet));
    const reads = plates.map((id) => plate.read(id));
    const words = `Settings chosen by the reader, sources checked ${checkedWords(plates)}.`;
    for (const node of all('.packet-guard')) node.textContent = words;
    for (const r of reads) {
      one('.packet-settings', sectionOf(r.id)).textContent = !r.settings.length ? 'Settings: none on this plate' : r.changed ? `Settings: ${r.settings.map((s) => `${s.label}: ${s.word}`).join('; ')}; chosen by the reader` : 'Settings: defaults';
      for (const node of all(`[data-title="${r.id}"]`)) node.textContent = r.title;
    }
    const cited = sourcesOnce(plates);
    const receipts = Object.assign({}, ...reads.map((r) => r.receipts));
    const partly = [...cited.keys()].filter((claim) => receipts[claim].status === 'partly').length;
    one('[data-measured]').textContent = `${count(cited.size, 'figure', 'figures')} read from a source and cited by claim id; ${partly.toLocaleString('en-US')} of them partly verified, each with its limit printed.`;
    const models = [...new Set(plates.map((id) => sectionOf(id).dataset.model).filter(Boolean))];
    if (plates.some((id) => has(sectionOf(id), 'formula'))) models.push('formula rows');
    const modeled = list(models);
    one('[data-modeled]').textContent = models.length ? `${modeled[0].toUpperCase()}${modeled.slice(1)}.` : 'None on the chosen plates.';
    chosenLine(reads);
    for (const item of all('[data-contents] > li')) item.hidden = !on.has(item.dataset.for);
    one('.packet-cover').classList.toggle('is-filled', on.size > 0); // CSS shows the empty line or the contents, so the first paint is already the empty packet
    // A link to a section not chosen goes to its home page instead of to nothing.
    for (const a of all('a[data-home]', packet)) a.setAttribute('href', one(a.dataset.here)?.closest('.packet-page').classList.contains('is-chosen') ? a.dataset.here : a.dataset.home);
    for (const box of boxes.filter((b) => b.dataset.asks)) {
      const asks = box.dataset.asks.split(' ').filter((id) => plates.includes(id)).map(labelOf);
      const note = one('.rail-asks', box.parentElement);
      note.hidden = !asks.length;
      note.textContent = asks.length ? `asks about ${list(asks)}` : '';
    }
    return { plates, lists, reads };
  }
  const has = (node, name) => name in node.dataset;
  const { today } = plate; // the kit's date, MM/DD/YYYY in the reader's own zone

  // A link may ask for plates: ../briefing/?add=dc-project. Nothing else is read from the address but a plate's own stops.
  for (const id of new URLSearchParams(location.search).getAll('add')) {
    const box = boxes.find((b) => b.value === id);
    if (box) box.checked = true;
  }
  one('[data-assembled]').textContent = ` ${today()}`;
  sync();
  const say = (words) => { one('[data-packet-status]').textContent = words; };
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('change', () => {
    const { plates, lists } = sync();
    say(`The packet holds ${count(plates.length, 'plate', 'plates')} and ${count(lists.length, 'checklist', 'checklists')}.`);
  });
  // A setting or a selection on a plate: the kit has already applied it, since these reach the packet after the plate.
  for (const type of ['input', 'click', 'keyup']) packet.addEventListener(type, sync);
  form.addEventListener('click', (e) => {
    if (e.target.closest('[data-print-packet]')) {
      sync();
      print();
    } else if (e.target.closest('[data-download-packet]')) {
      const { plates, lists, reads } = sync();
      const assembled = today();
      plate.save(`council-briefing-${assembled.replaceAll('/', '-')}.json`, `${JSON.stringify({ assembled, checked: checkedWords(plates), plates: reads.map(({ id, state, selected }) => ({ id, state, selected })), checklists: lists }, null, 2)}\n`, 'application/json');
      say('The packet file is downloaded.');
    } else if (e.target.closest('[data-clear-packet]')) {
      for (const r of chosen('plate').map((id) => plate.read(id))) if (r.changed) plate.reset(r.id);
      for (const box of boxes) box.checked = false;
      sync();
      say('The packet is empty, and every plate is back at its defaults.');
    }
  });
});
