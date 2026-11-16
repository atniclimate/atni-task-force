// The Council Briefing: the page is the packet. Ready-made packets first; guard lines on every section; nothing stored, and nothing kept in the address but a
// landing; a section's plate starts only when it is ticked; the bar's actions; print hides the rail and the controls; every section is what its source page and
// its claims say, and the appendix lists every claim under its document.
const { JSDOM, ok, eq, read, open, fire, wait } = require('./lib');

const PAGE = 'http://localhost/site/briefing/index.html';
const html = read('site/briefing/index.html');
const manifest = JSON.parse(read('site/data/index.json'));
const PAGES = ['ai/index.html', 'data-centers/index.html', 'data-centers/resource-use/index.html', 'energy/index.html']; // scripts/build_briefing.py PAGES, in its order
const offered = manifest.plates.filter((p) => PAGES.includes(p.page)).sort((a, b) => PAGES.indexOf(a.page) - PAGES.indexOf(b.page));
const GUARD = /^(Default settings|Settings chosen by the reader), sources checked (between )?\d{2}\/\d{2}\/\d{4}( and \d{2}\/\d{2}\/\d{4})?\.$/;
const FOOT = 'This comparison does not decide a proposal.';
const words = (node) => node.textContent.replace(/\s+/g, ' ').trim();
// The question sets each page asks, as its meeting-sheet form holds them, or the Data Center page's older disclosures.
const sets = PAGES.flatMap((rel) => {
  const doc = new JSDOM(read(`site/${rel}`)).window.document;
  const asks = [...doc.querySelectorAll('form.asks fieldset.ask-set')].map((set) => ({ id: set.id, name: words(set.querySelector('legend')), items: [...set.querySelectorAll('.ask-q')].map(words), doc }));
  if (asks.length || rel !== 'data-centers/index.html') return asks;
  return [...doc.querySelectorAll('#checklists > details')].map((list) => ({ id: list.id, name: words(list.querySelector('summary')), items: [...list.querySelectorAll('li')].map(words), doc, note: words(doc.querySelector('.dc-wide-note:has(+ #checklists)')) }));
});

async function load(address = '') {
  return open(html, `${PAGE}${address}`, (window) => {
    window.ResizeObserver = class { observe() {} };
    window.document.elementFromPoint = () => null;
    window.Element.prototype.scrollIntoView = function () {};
    window.printed = [];
    window.print = () => { window.printed.push([...window.document.querySelectorAll('.packet-page[data-packet]:not([hidden])')].map((n) => n.dataset.packet).join()); };
    window.files = [];
    window.URL.createObjectURL = (blob) => { window.files.push({ blob }); return 'blob:file'; };
    window.URL.revokeObjectURL = () => {};
    window.HTMLAnchorElement.prototype.click = function () { window.files.at(-1).name = this.download; };
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async (t) => { window.clip = t; } } });
  });
}
const tick = (window, document, value, on = true) => {
  const box = document.getElementById(`pick-${value}`);
  box.checked = on;
  fire(window, box, 'change');
};
const shown = (document) => [...document.querySelectorAll('.packet-page:not([hidden])')].map((n) => n.id);
const fileText = (window, { blob }) => new Promise((resolve) => {
  const reader = new window.FileReader();
  reader.onload = () => resolve(reader.result);
  reader.readAsText(blob);
});
const typeInto = (window, input, value) => {
  input.value = value;
  fire(window, input, 'input');
};
const idsOf = (preset) => preset.querySelector('.preset-acts').dataset.ids.split(' ');
const sorted = (ids) => [...ids].sort().join();
const claimsOf = (document, id) => Object.keys(JSON.parse(document.getElementById(`plate-data-${id}`).textContent).receipts); // the plate's own receipts, as the build reads them
const statusOf = (document) => document.querySelector('[data-packet-status]').textContent;
const printing = async (window, before) => { for (let i = 0; i < 100 && window.printed.length === before; i += 1) await wait(50); }; // print waits for the plates to redraw

async function structure() {
  const { window: { document } } = new JSDOM(html);
  eq(document.documentElement.dataset.address, 'none', 'the page keeps nothing in the address');
  ok(document.querySelector('header.brief h1') && !document.querySelector('.page-band-figures') && /stored or sent/.test(document.querySelector('.brief-lead').textContent), 'a brief, no figures, and the privacy line in its lead (briefing-plates-27)');
  const pages = [...document.querySelectorAll('.packet-page')];
  eq(pages.length, 1 + offered.length + sets.length + 1, 'a cover, a section for each plate and each question set, and the appendix');
  for (const page of pages) {
    const head = page.querySelector('.packet-sheet > thead .packet-guard');
    const foot = page.querySelector('.packet-sheet > tfoot .packet-foot');
    ok(head && GUARD.test(head.textContent), `${page.id} opens on the guard line, in a head that repeats on paper: ${head?.textContent}`);
    eq(foot?.textContent, FOOT, `${page.id} closes on the foot line`);
    eq(page.querySelector('.packet-sheet').getAttribute('role'), 'presentation', `${page.id}: the frame is not read as a table`);
  }
  eq(pages[0].id, 'packet-cover', 'the cover comes first');
  eq(pages.at(-1).id, 'packet-sources', 'the appendix comes last');
  // Each plate is its source page's own built block, with its data, under the question it answers.
  const ids = [...document.querySelectorAll('.packet-plate')].map((n) => n.dataset.packet);
  eq(ids.join(), offered.map((p) => p.id).join(), 'plates in the rail\'s order of pages, the manifest\'s within a page');
  for (const entry of offered) {
    const section = document.getElementById(`packet-${entry.id}`);
    const figure = section.querySelector(`figure#${entry.id}`);
    ok(figure && document.getElementById(`plate-data-${entry.id}`), `${entry.id}: the block and its data are on the page`);
    eq(document.querySelector(`[data-contents] [data-title="${entry.id}"]`).textContent, figure.querySelector('.plate-title').textContent, `${entry.id}: the cover says what its title says`);
    const source = read(`site/${entry.page}`);
    const block = source.slice(source.indexOf(`<!-- plate:${entry.id} -->`), source.indexOf(`<!-- /plate:${entry.id} -->`));
    const own = block.match(/id="plate-data-[^"]+">(.*?)<\/script>/s)[1];
    ok(html.includes(own), `${entry.id}: the data block is a copy, byte for byte; if not, run python scripts/build_briefing.py`);
    eq(section.dataset.checked, entry.checked, `${entry.id}: its checked date comes from the manifest`);
    ok(words(section.querySelector('.packet-ask')).endsWith('?') && /^from the .+ web page$/.test(section.querySelector('.packet-from').textContent), `${entry.id}: it says what it answers and where it comes from, after its section number`);
    ok(Number(section.dataset.sheets) >= 1, `${entry.id}: it carries its sheet estimate`);
    eq(document.querySelector(`#pick-${entry.id} + a`)?.textContent, words(section.querySelector('.packet-ask')), `${entry.id}: the rail asks the same question (briefing-plates-21)`);
  }
  // The appendix: every claim of every plate once, under its document, with its status, and a partly verified one with its limit; no quotes on paper.
  const appendix = document.getElementById('packet-sources');
  const rows = new Map();
  for (const row of appendix.querySelectorAll('.packet-doc-claims > li')) for (const id of words(row.querySelector('.packet-ids')).split(', ')) {
    ok(!rows.has(id), `${id} is listed once`);
    rows.set(id, row);
  }
  for (const entry of offered) {
    const missing = claimsOf(document, entry.id).filter((id) => !rows.get(id)?.dataset.for.split(' ').includes(entry.id));
    eq(missing.join(), '', `${entry.id}: each of its claims is in the appendix, marked as cited by it`);
  }
  ok([...rows.values()].every((row) => /(^| )(verified|partly verified: .{20,})$/.test(words(row.querySelector('.packet-status')))), 'each row states its status, and a partly verified row its limit');
  ok([...appendix.querySelectorAll('.packet-doc')].every((doc) => doc.querySelector('.packet-doc-name a').href.startsWith('https://')), 'each document links its source');
  ok(!appendix.querySelector('blockquote'), 'no quotes on paper; they stay on the Sources pages under the claim id');
  // The question sets are their pages', word for word, numbered.
  ok(sets.length >= 8, `the Data Center page's eight sets at least: ${sets.length}`);
  for (const set of sets) {
    const section = document.getElementById(set.id);
    ok(section?.classList.contains('packet-checklist'), `${set.id}: a section of its own`);
    eq(words(section.querySelector('.packet-h')), set.name, `${set.id}: its name`);
    eq([...section.querySelectorAll('.packet-list > li')].map(words).join('|'), set.items.join('|'), `${set.id}: its items, verbatim`);
    if (set.note) eq(words(section.querySelector('.packet-provenance')), set.note, `${set.id}: the sentence that says where it comes from`);
    for (const mark of section.querySelectorAll('a.cr')) eq(mark.getAttribute('href'), `#src-${mark.dataset.claim}`, `${set.id}: a figure's mark lands on its claim in the appendix`);
  }
  const back = document.querySelector('#q-water a[href="#dc-cooling"]');
  if (back) eq(back.dataset.home, '../data-centers/#dc-cooling', 'a plate link has this page\'s id and a way home');
  const every = [...document.querySelectorAll('[id]')].map((n) => n.id);
  eq(new Set(every).size, every.length, 'no id twice');
  // The ready-made packets: each names only what the page offers; three print from the page, the fourth is the PDF (briefing-plates-20).
  const presets = [...document.querySelectorAll('.preset')];
  eq(presets.length, 4, 'four ready-made packets');
  const offers = new Set([...document.querySelectorAll('.briefing-rail input')].map((b) => b.value));
  ok(presets.every((p) => idsOf(p).length && idsOf(p).every((id) => offers.has(id))), 'each names only what the rail offers');
  ok(presets.slice(0, 3).every((p) => p.querySelector('[data-print-preset][data-js]') && p.querySelector('a[href="#customize-title"][data-customize]') && /about \d+ pages/.test(p.querySelector('.preset-count').textContent)), 'three print from the page, with a page estimate, and can be customized');
  ok(presets.every((p) => [...p.querySelectorAll('[data-customize], [data-print-preset]')].every((b) => b.getAttribute('aria-describedby') === p.querySelector('h3').id)), 'each packet\'s buttons are told apart by its name (critic 9)');
  for (const p of presets.slice(0, 3)) { // a packet lists what it holds in the order it prints (critic 11)
    const held = idsOf(p);
    const order = [...document.querySelectorAll('.packet-page[data-packet]')].map((n) => n.dataset.packet).filter((id) => held.includes(id));
    eq(held.join(), order.join(), `${p.id}: its list and its print share an order`);
  }
  ok(presets[3].querySelector('a.paper[href="atni-energy-briefing.pdf"]') && /\d+ pages, \d+\.\d MB/.test(presets[3].querySelector('.preset-file')?.textContent), 'the fourth is the PDF, its pages and size read from the file');
  eq(document.querySelectorAll('.paper').length, 1, 'one paper button on the page\'s first screen');
  // Without scripts the rail is a jump list and nothing that needs a script shows; the cover lists every section.
  ok([...document.querySelectorAll('.rail-item')].every((n) => n.querySelector('a[href^="#"]') && n.querySelector('input').matches('[data-js]:not([hidden])')), 'jump links, with ticks for scripts only');
  ok([...document.querySelectorAll('.rail-group')].every((g) => g.matches('details:not([open])') && /^\d+ (plates|checklists)$/.test(g.querySelector('[data-count]').textContent)), 'groups fold to a name and a count, so none hides in a scroll (briefing-plates-01)');
  ok(document.querySelector('.packet-bar').matches('[data-js]'), 'the bar needs scripts');
  eq(document.querySelector('.brief-meta .figure-num').textContent, offered.map((p) => p.checked).sort((a, b) => a.slice(6).localeCompare(b.slice(6)) || a.localeCompare(b)).at(-1), 'the brief dates the latest check');
}

async function rail() {
  const { window, document, errors } = await load();
  const cover = document.getElementById('packet-cover');
  eq(shown(document).join(), 'packet-cover', 'a new page holds the cover alone');
  ok(document.querySelector('.briefing-packet').classList.contains('is-live') && !cover.classList.contains('is-filled'), 'and says what to do');
  eq(document.querySelectorAll('.plate.is-live').length, 0, 'no plate starts until it is ticked (briefing-plates-18)');
  eq(document.documentElement.dataset.modelCheck, 'passed', 'the AI page\'s model runs here and agrees with itself');
  const boxes = [...document.querySelectorAll('.briefing-rail input[type="checkbox"]')];
  eq(boxes.length, offered.length + sets.length, 'a tick for each');
  ok(boxes.every((b) => b.nextElementSibling.tagName === 'LABEL' && b.nextElementSibling.htmlFor === b.id), 'each with its own label');
  ok(document.querySelector('.briefing-rail form').classList.contains('is-live'), 'the ticks show');
  eq(document.querySelector('[data-packet-count]').textContent, 'Nothing is in the packet yet.', 'the bar says the packet is empty');
  // A tick shows the plate, starts it, and the bar, the rail, the cover, and the appendix follow.
  tick(window, document, 'dc-project');
  eq(shown(document).join(), 'packet-cover,packet-dc-project,packet-sources', 'the plate and the appendix');
  ok(document.getElementById('dc-project').classList.contains('is-live'), 'the plate starts when it is ticked');
  ok(cover.classList.contains('is-filled'), 'the cover lists it');
  ok(/^1 plate, about \d+ pages$/.test(document.querySelector('[data-packet-count]').textContent), `the bar counts it: ${document.querySelector('[data-packet-count]').textContent}`);
  ok(document.querySelector('[data-packet-count]').closest('.packet-bar'), 'beside the actions');
  eq(document.getElementById('pick-dc-project').closest('.rail-group').querySelector('[data-count]').textContent, `1 of ${offered.filter((p) => p.page === 'data-centers/index.html').length}`, 'and so does its group');
  const section = document.getElementById('packet-dc-project');
  ok(section.querySelector('.packet-settings').hidden, 'at the defaults a plate prints no settings line; the guard line says so (critic 14)');
  eq(cover.querySelector('[data-chosen]').textContent, 'Every plate at its default settings.', 'the cover lists no default as a choice');
  const claims = claimsOf(document, 'dc-project');
  ok(cover.querySelector('[data-measured]').textContent.startsWith(`${new Set(claims).size} figures read from a source`), 'and counts its figures');
  ok(/formula rows\.$/.test(cover.querySelector('[data-modeled]').textContent), `and what is modeled: ${cover.querySelector('[data-modeled]').textContent}`);
  const listed = [...document.querySelectorAll('#packet-sources .packet-doc-claims > li:not([hidden]) .packet-ids')].flatMap((n) => words(n).split(', '));
  eq([...new Set(listed)].sort().join(), [...new Set(claims)].sort().join(), 'the appendix lists its claims and no others');
  ok([...document.querySelectorAll('#packet-sources .packet-doc:not([hidden])')].every((d) => d.dataset.for.split(' ').includes('dc-project')), 'under their documents');
  const dcDate = offered.find((p) => p.id === 'dc-project').checked;
  const guard = () => cover.querySelector('.packet-guard').textContent;
  eq(guard(), `Default settings, sources checked ${dcDate}.`, 'the guard line at the defaults');
  // Typed figures: everything on the page follows, and the address hears nothing.
  const before = window.location.href;
  typeInto(window, document.querySelector('#dc-project [data-param="p_mw"] input[type="number"]'), '200');
  eq(window.location.href, before, 'a typed figure stays out of the address');
  ok(!section.querySelector('.packet-settings').hidden && section.querySelector('.packet-settings').textContent.includes('Project size, MW: 200') && section.querySelector('.packet-settings').textContent.endsWith('chosen by the reader'), `the settings line says whose hand: ${section.querySelector('.packet-settings').textContent}`);
  const chosenWords = cover.querySelector('[data-chosen]').textContent;
  ok(chosenWords.includes('Project size, MW 200') && !chosenWords.includes('(default)') && chosenWords.endsWith('All other settings at their defaults.'), `the cover names only what moved: ${chosenWords}`);
  eq(guard(), `Settings chosen by the reader, sources checked ${dcDate}.`, 'and the guard line says so');
  const title = section.querySelector('.plate-title').textContent;
  ok(/\b200 MW\b/.test(title), `the title is live at the settings: ${title}`);
  eq(cover.querySelector('[data-contents] [data-title="dc-project"]').textContent, title, 'and in what the packet says');
  fire(window, section.querySelector('[data-copy]'), 'click');
  await wait(20);
  ok(!/localhost|https?:\/\/[^ ]*briefing/.test(window.clip), 'Copy reading carries no link to this page');
  eq([window.localStorage.length, window.sessionStorage.length, window.document.cookie.length].join(), '0,0,0', 'nothing is stored');
  const other = offered.find((p) => p.checked !== dcDate);
  if (other) {
    tick(window, document, other.id);
    ok(GUARD.test(guard()) && guard().includes('between') && guard().includes(other.checked) && guard().includes(dcDate), `the span where dates differ: ${guard()}`);
    ok([...document.querySelectorAll('.packet-guard')].every((n) => n.textContent === guard()), 'on every section');
    tick(window, document, other.id, false);
  }
  eq(errors.join(), '', 'no script errors');
}

async function address() {
  // An old ?add=, a #add= run, and a section's own id each tick what they name; the address then keeps only a landing (briefing-plates-04, -09).
  let { window, document, errors } = await load('?add=dc-project&add=q-water&add=nothing&p_mw=999&ai-same-hour=video');
  eq(shown(document).join(), 'packet-cover,packet-dc-project,q-water,packet-sources', 'a link may ask for plates and question sets');
  eq(`${window.location.search}${window.location.hash}`, '#customize', 'and is then dropped, landing on the list');
  ok(statusOf(document).includes('nothing'), `a name it cannot find is said, not hidden: ${statusOf(document)}`);
  eq(document.querySelector('#dc-project [data-param="p_mw"] input[type="number"]').value, '125', 'a typed figure from an address is ignored');
  eq(errors.join(), '', 'no script errors');
  ({ window, document, errors } = await load('#add=q-water.q-rates'));
  eq(shown(document).filter((id) => id !== 'packet-sources').join(), 'packet-cover,q-water,q-rates', 'the meeting sheet\'s #add= run');
  ok(document.getElementById('pick-q-water').closest('details').open, 'opens the group that holds it');
  eq(window.location.hash, '#customize', 'and drops it');
  eq(document.activeElement.id, 'customize-title', 'landing on the list\'s heading, so the bar stands stuck above it (critic 8)');
  ({ window, document, errors } = await load('#packet-dc-cooling'));
  ok(shown(document).includes('packet-dc-cooling'), 'a link to a section ticks it');
  eq(window.location.hash, '#packet-dc-cooling', 'and keeps its landing');
  eq(document.activeElement.id, 'packet-dc-cooling', 'where focus lands');
  eq(errors.join(), '', 'no script errors');
}

async function buttons() {
  const { window, document, errors } = await load();
  fire(window, document.querySelector('[data-print-packet]'), 'click');
  eq(window.printed.length, 0, 'an empty packet does not print');
  ok(statusOf(document).startsWith('The packet is empty.'), 'and says what to do instead');
  // A ready-made packet: Customize makes it the ticks; Print this packet prints it and leaves the reader's ticks alone.
  const [proposal, policy, energy] = document.querySelectorAll('.preset');
  fire(window, policy.querySelector('[data-customize]'), 'click');
  eq(sorted(shown(document).filter((id) => id !== 'packet-cover' && id !== 'packet-sources').map((id) => id.replace(/^packet-/, ''))), sorted(idsOf(policy)), 'Customize ticks the packet');
  tick(window, document, 'dc-project');
  const mine = shown(document).join();
  const root = document.documentElement;
  fire(window, energy.querySelector('[data-print-preset]'), 'click');
  ok(root.classList.contains('is-printing') && !window.printed.length, 'the packet takes the sheet\'s width before it prints, so its drawings redraw at that size');
  await printing(window, 0);
  eq(sorted(window.printed.at(-1).split(',')), sorted(idsOf(energy)), 'Print this packet prints that packet, once the plates have redrawn');
  fire(window, window, 'afterprint');
  eq(shown(document).join(), mine, 'and the reader\'s own ticks come back');
  ok(!root.classList.contains('is-printing'), 'and the page its own width');
  ok(proposal.querySelector('.preset-holds li'), 'a packet says what it holds');
  // The bar: print, download, untick, reset.
  fire(window, document.querySelector('[data-print-packet]'), 'click');
  await printing(window, 1);
  eq(sorted(window.printed.at(-1).split(',')), sorted([...idsOf(policy), 'dc-project']), 'Print what is ticked prints the ticks');
  fire(window, window, 'afterprint');
  typeInto(window, document.querySelector('#dc-project [data-param="p_mw"] input[type="number"]'), '300');
  fire(window, document.querySelector('[data-download-packet]'), 'click');
  const [file] = window.files;
  ok(/^council-briefing-\d{2}-\d{2}-\d{4}\.json$/.test(file.name), `the packet file is named for the day: ${file.name}`);
  const data = JSON.parse(await fileText(window, file));
  eq(Object.keys(data).join(), 'assembled,checked,plates,checklists', 'it holds the one object');
  eq(data.plates.find((p) => p.id === 'dc-project').state.p_mw, 300, 'at the reader\'s setting');
  eq(sorted(data.checklists), sorted(idsOf(policy).filter((id) => id.startsWith('q-'))), 'and the question sets, in the packet\'s order');
  ok(document.querySelector('.packet-bar-note').textContent.includes("Share it only where your Nation's figures may go") && statusOf(document) === 'These settings are saved as a file.', 'the privacy line stands beside the download, and the status line says what happened (critic 10)');
  fire(window, document.querySelector('[data-untick]'), 'click');
  eq(shown(document).join(), 'packet-cover', 'Untick all empties the packet');
  eq(document.querySelector('#dc-project [data-param="p_mw"] input[type="number"]').value, '300', 'and keeps a typed figure');
  fire(window, document.querySelector('[data-reset]'), 'click');
  eq(document.querySelector('#dc-project [data-param="p_mw"] input[type="number"]').value, '125', 'Reset settings takes it back');
  eq(errors.join(), '', 'no script errors');
}

async function checklists() {
  const { window, document, errors } = await load();
  const asking = document.querySelector('.briefing-rail input[data-asks]');
  if (asking) {
    const plateId = asking.dataset.asks.split(' ')[0];
    const note = asking.parentElement.querySelector('.rail-asks');
    ok(note.hidden, 'a set says nothing of a plate not chosen');
    tick(window, document, plateId);
    ok(!note.hidden && note.textContent.startsWith('asks about '), `a set names a plate it asks about: ${note.textContent}`);
    ok(!asking.checked, 'and does not tick itself');
    tick(window, document, plateId, false);
  }
  // Two sets from one page that say where they come from.
  const noted = [...document.querySelectorAll('.packet-checklist')].filter((s) => s.querySelector('.packet-provenance'));
  const lists = noted.filter((s) => s.dataset.from === noted[0]?.dataset.from).map((s) => s.id);
  ok(lists.length >= 2, 'the Data Center page\'s sets say where they come from');
  tick(window, document, lists[1]);
  ok(!document.querySelector(`#${lists[1]} .packet-provenance`).hidden, 'a set alone says where it comes from');
  tick(window, document, lists[0]);
  ok(!document.querySelector(`#${lists[0]} .packet-provenance`).hidden && document.querySelector(`#${lists[1]} .packet-provenance`).hidden, 'and with another from the same page, only the first says it (briefing-plates-07)');
  eq(errors.join(), '', 'no script errors');
}

// Every copy starts here as on its own page, whatever its kind (the meter, the countdown, the instruments), without its page's agenda or sheet.
async function copies() {
  const { window, document, errors } = await load();
  for (const entry of offered) tick(window, document, entry.id);
  const live = offered.filter((p) => document.getElementById(p.id).classList.contains('is-live')).map((p) => p.id);
  eq(live.join(), offered.map((p) => p.id).join(), 'every plate starts when ticked');
  ok(offered.every((p) => /^Settings: /.test(document.querySelector(`#packet-${p.id} .packet-settings`).textContent)), 'and its section reads its settings');
  ok(offered.every((p) => words(document.querySelector(`#${p.id} .plate-title`)).length > 0), 'and keeps its title');
  for (const root of document.querySelectorAll('.briefing-packet .countdown')) ok(root.classList.contains('has-today') && root.style.getPropertyValue('--today') !== '', 'the countdown places today');
  eq(document.querySelectorAll('.briefing-packet [data-add-briefing]').length, 0, 'no copy offers to add itself');
  eq(errors.join(), '', 'no script errors');
}

// Rules only a browser applies, held as text; scripts/page_check.js has no layout. The PDF route is in the report.
async function printRules() {
  const css = read('site/assets/css/briefing.css');
  const paper = css.slice(css.indexOf('@media print'));
  ok(/\.brief, \.presets, \.packet-bar, \.briefing-rail[^{]*\{ display: none !important; \}/.test(paper), 'print hides the brief, the packets, the bar, and the rail');
  ok(/\.packet-page, \.packet-page \+ \.packet-page \{[^}]*break-before: page/.test(paper), 'a section starts a sheet');
  ok(/\.packet-sheet \{ width: 100%; table-layout: fixed/.test(paper), 'its frame is a real table only there');
  ok(/\.packet-checklist:not\(\[hidden\]\) ~ \.packet-checklist:not\(\[hidden\]\) \{ break-before: auto/.test(paper), 'checklists after the first run on, not one to a sheet (critic 5)');
  ok(/grid-template-areas: "claim claim" "plot window" "under window"/.test(paper) && /\.plate-plot \{ min-height: 0; break-inside: avoid/.test(paper) && /\.plate-detail \{ display: block !important; break-inside: avoid/.test(paper), 'a plate prints its plot beside its readout and Reading, neither split (briefing-plates-08)');
  ok(/\.plate-table \{ width: 100%; \}/.test(paper), 'a Table keeps to the sheet\'s width, so Chrome never shrinks the printout');
  ok(/@page \{ margin: 0\.7in 0\.75in 0\.8in; \}/.test(css) && /html \{ font-size: 10\.5pt; \}/.test(paper) && read('scripts/briefing_pdf_print.js').includes('margin: 0.7in 0.75in 0.8in'), 'Print gives the PDF\'s sheets: its margins and its size');
  ok(/html\.is-printing \.briefing-packet \{ width: 672px; \}/.test(css), 'before printing, the packet takes the sheet\'s width (7in at 96 a inch)');
  ok(/@media screen \{ \.packet-sheet/.test(css), 'and a block on screen');
  ok(!/overflow-y: auto|max-height/.test(css), 'no inner scroll (briefing-plates-01)');
  ok(/\.packet-bar \{ position: sticky/.test(css) && read('site/assets/js/briefing.js').includes('scrollPaddingTop'), 'the bar stays in view, and the scroll padding keeps focus from under it (briefing-plates-02)');
  ok(/@media print \{\s*\.plate-controls, \.plate-switch,/.test(read('site/assets/css/site.css')), 'the kit keeps a plate\'s controls off paper');
  const script = read('site/assets/js/briefing.js');
  ok(!/localStorage|sessionStorage|document\.cookie|fetch\(|XMLHttpRequest|sendBeacon|history\.|location\.(href|hash) *=|innerHTML/.test(script), 'the script stores nothing, sends nothing, and writes the address only through siteAddress');
  ok(html.indexOf('/briefing.js') < html.indexOf('/plate.js'), 'briefing.js runs before the kit starts the plates');
}

module.exports = { groups: { structure, rail, address, buttons, checklists, copies, printRules } };
