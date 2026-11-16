// The meeting sheet (DIRECTION-R2 3.12): the page's one form.asks[data-sheet], a set's [data-sheet-add] and [data-sheet-open] share its checkboxes. Ticks
// ride in ask=, so a link keeps them; nothing is stored or sent. Print prints a clone of the sheet alone. No action is disabled: one that cannot run says why.
(() => {
  const form = document.querySelector('form[data-sheet]');
  if (!form) return;
  const boxes = [...form.querySelectorAll('input[name="ask"]')];
  const site = window.siteAddress;
  const briefing = new URL('../../briefing/', document.currentScript.src).href;
  const EMPTY = 'Tick a question to build the sheet.';
  const h = (tag, props, ...kids) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...kids);
    return node;
  };
  const button = (textContent, className = 'button button-secondary') => h('button', { type: 'button', className, textContent });
  const dialog = h('dialog', { className: 'drawer drawer-right sheet', id: 'meeting-sheet' });
  const body = h('div', { className: 'drawer-body' });
  const status = h('p', { className: 'caption sheet-status' });
  const print = button('Print the sheet', 'paper');
  const copy = button('Copy the questions');
  const add = h('a', { className: 'button button-secondary', textContent: 'Add these sets to a Council briefing' });
  const clear = button('Clear');
  dialog.setAttribute('aria-labelledby', 'meeting-sheet-title');
  dialog.setAttribute('closedby', 'any');
  status.setAttribute('role', 'status');
  dialog.append(
    h('div', { className: 'drawer-head' }, h('h2', { id: 'meeting-sheet-title', textContent: 'Meeting sheet' }), h('form', { method: 'dialog' }, h('button', { className: 'button button-secondary', textContent: 'Close' }))),
    body,
    h('div', { className: 'drawer-foot' }, print, copy, add, clear, status,
      h('p', { className: 'caption sheet-privacy', textContent: 'Nothing you tick is stored or sent: the ticks ride in this page’s address, so a copied link keeps them.' })),
  );
  document.body.append(dialog);

  let undo = null;
  let opener = null;
  const ticked = () => boxes.filter((b) => b.checked);
  const inSet = (adder) => boxes.filter((b) => b.closest('fieldset').id === adder.dataset.sheetAdd);
  const say = (text) => { status.textContent = text; };
  const legend = (set) => set.querySelector('legend').textContent.trim();
  // A question's words, a marked figure followed by its claim id in brackets, so the sheet carries its receipts onto paper.
  const words = (box) => {
    const q = box.parentElement.querySelector('.ask-q').cloneNode(true);
    q.querySelectorAll('a.cr').forEach((a) => a.replaceWith(`${a.textContent} [${a.dataset.claim}]`));
    return q.textContent.replace(/\s+/g, ' ').trim();
  };
  const render = () => {
    const sets = new Map();
    for (const b of ticked()) sets.set(b.closest('fieldset'), [...(sets.get(b.closest('fieldset')) || []), words(b)]);
    body.replaceChildren(...(sets.size ? [...sets].flatMap(([set, qs]) => [h('h3', { textContent: legend(set) }), h('ol', {}, ...qs.map((q) => h('li', { textContent: q })))]) : [h('p', { textContent: EMPTY })]));
    add.href = `${briefing}#add=${[...sets.keys()].map((set) => set.id).join('.')}`;
    document.querySelectorAll('[data-sheet-open]').forEach((b) => { b.textContent = `Meeting sheet (${ticked().length})`; });
    // A set in the sheet: its button says so where it was pressed, and takes it out again.
    document.querySelectorAll('[data-sheet-add]').forEach((b) => {
      const set = inSet(b);
      const on = set.length > 0 && set.every((x) => x.checked);
      b.classList.toggle('is-added', on);
      b.textContent = on ? `Remove this set from the sheet (${set.length})` : `Add this set to the sheet (${set.length})`;
    });
    return sets;
  };
  const save = () => {
    const { anchor, params } = site.read();
    const value = ticked().map((b) => b.value).join('.');
    if (value) params.set('ask', value);
    else params.delete('ask');
    site.write(anchor, params);
    render();
  };
  const load = () => {
    const asked = (site.read().params.get('ask') || '').split('.');
    boxes.forEach((b) => { b.checked = asked.includes(b.value); });
    render();
  };
  const fresh = () => { undo = null; clear.textContent = 'Clear'; say(''); };

  form.addEventListener('change', () => { fresh(); save(); });
  document.addEventListener('click', (e) => {
    const adder = e.target.closest('[data-sheet-add]');
    if (adder) {
      const set = inSet(adder);
      const on = set.every((b) => b.checked);
      set.forEach((b) => { b.checked = !on; });
      fresh();
      save();
    }
    if (e.target.closest('[data-sheet-open]')) {
      opener = e.target.closest('[data-sheet-open]');
      say('');
      render();
      dialog.showModal();
    }
  });
  dialog.addEventListener('close', () => opener?.focus());
  print.addEventListener('click', () => {
    if (!ticked().length) return say(EMPTY);
    const paper = h('div', { className: 'sheet-print' }, h('h1', { textContent: 'Meeting sheet' }), ...body.cloneNode(true).childNodes);
    document.body.append(paper);
    document.documentElement.classList.add('is-print-sheet');
    window.addEventListener('afterprint', () => { paper.remove(); document.documentElement.classList.remove('is-print-sheet'); }, { once: true });
    window.print();
  });
  copy.addEventListener('click', async () => {
    const sets = render();
    if (!sets.size) return say(EMPTY);
    const n = ticked().length;
    try {
      await navigator.clipboard.writeText([...sets].map(([set, qs]) => `${legend(set)}\n${qs.map((q, i) => `${i + 1}. ${q}`).join('\n')}`).join('\n\n'));
      say(`Copied ${n} ${n === 1 ? 'question' : 'questions'}.`);
    } catch {
      say('This browser blocked copying: select the questions above and copy them.');
    }
  });
  add.addEventListener('click', (e) => { if (!ticked().length) { e.preventDefault(); say(EMPTY); } });
  clear.addEventListener('click', () => {
    if (!undo && !ticked().length) return say(EMPTY);
    const back = undo;
    undo = back ? null : ticked();
    boxes.forEach((b) => { b.checked = !!back && back.includes(b); });
    save();
    clear.textContent = back ? 'Clear' : 'Undo clear';
  });
  window.addEventListener('hashchange', load);
  load();
})();
