// The Council Briefing: the page is the packet. Guard lines on every section, nothing written to the address or to storage, the three buttons, print hides the rail and the controls,
// and every section is what its source page and its claims say.
const { JSDOM, ok, eq, read, open, fire, wait } = require('./lib');

const PAGE = 'http://localhost/site/briefing/index.html';
const html = read('site/briefing/index.html');
const manifest = JSON.parse(read('site/data/index.json'));
const offered = manifest.plates.filter((p) => ['ai/index.html', 'data-centers/index.html', 'energy/index.html'].includes(p.page));
const GUARD = /^Settings chosen by the reader, sources checked (between )?\d{2}\/\d{2}\/\d{4}( and \d{2}\/\d{2}\/\d{4})?\.$/;
const FOOT = 'This comparison does not decide a proposal.';

async function load(query = '') {
  return open(html, `${PAGE}${query}`, (window) => {
    window.ResizeObserver = class { observe() {} };
    window.document.elementFromPoint = () => null;
    window.Element.prototype.scrollIntoView = function () {};
    window.printed = 0;
    window.print = () => { window.printed += 1; };
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
const chosen = (document) => [...document.querySelectorAll('.packet-page.is-chosen')].map((n) => n.id);
const fileText = (window, { blob }) => new Promise((resolve) => {
  const reader = new window.FileReader();
  reader.onload = () => resolve(reader.result);
  reader.readAsText(blob);
});
const typeInto = (window, input, value) => {
  input.value = value;
  fire(window, input, 'input');
};

async function structure() {
  const { window: { document } } = new JSDOM(html);
  eq(document.documentElement.dataset.address, 'none', 'the page keeps nothing in the address');
  const pages = [...document.querySelectorAll('.packet-page')];
  eq(pages.length, 1 + offered.length * 2 + 8, 'a cover, a plate and its Sources for each plate, and eight lists');
  for (const page of pages) {
    const head = page.querySelector('.packet-sheet > thead .packet-guard');
    const foot = page.querySelector('.packet-sheet > tfoot .packet-foot');
    ok(head && GUARD.test(head.textContent), `${page.id} opens on the guard line, in a head that repeats on paper: ${head?.textContent}`);
    eq(foot?.textContent, FOOT, `${page.id} closes on the foot line`);
    eq(page.querySelector('.packet-sheet').getAttribute('role'), 'presentation', `${page.id}: the frame is not read as a table`);
  }
  eq(pages[0].id, 'packet-cover', 'the cover comes first');
  // Each plate is its source page's own built block, with its data; its Sources section follows it directly and holds no quote.
  const ids = [...document.querySelectorAll('.packet-plate')].map((n) => n.dataset.packet);
  eq(ids.join(), offered.map((p) => p.id).join(), 'plates in the manifest\'s order');
  for (const entry of offered) {
    const section = document.getElementById(`packet-${entry.id}`);
    const figure = section.querySelector(`figure#${entry.id}`);
    ok(figure && document.getElementById(`plate-data-${entry.id}`), `${entry.id}: the block and its data are on the page`);
    eq(figure.querySelector('.plate-title').textContent, entry.title, `${entry.id}: its title is the built one`);
    const source = read(`site/${entry.page}`);
    const block = source.slice(source.indexOf(`<!-- plate:${entry.id} -->`), source.indexOf(`<!-- /plate:${entry.id} -->`));
    const own = block.match(/id="plate-data-[^"]+">(.*?)<\/script>/s)[1];
    ok(html.includes(own), `${entry.id}: the data block is a copy, byte for byte; if not, run python scripts/build_briefing.py`);
    eq(section.dataset.checked, entry.checked, `${entry.id}: its checked date comes from the manifest`);
    const sources = section.nextElementSibling;
    eq(sources.id, `sources-${entry.id}`, `${entry.id}: its Sources follow it`);
    eq(sources.querySelector('[data-title]').textContent, entry.title, `${entry.id}: Sources names the plate`);
    eq([...sources.querySelectorAll('.packet-source')].map((n) => n.dataset.claim).join(), entry.claim_ids.join(), `${entry.id}: one row per receipt`);
    ok(!sources.querySelector('blockquote'), `${entry.id}: no quotes on paper; they stay on the site under the claim id`);
    ok([...sources.querySelectorAll('.packet-source')].every((n) => n.querySelector('a').href.startsWith('https://') && n.querySelector('.packet-claim').textContent === n.dataset.claim && /^(verified|partly verified)/.test(n.querySelector('.packet-status').textContent)), `${entry.id}: each row has its id, its status, and its link`);
    ok([...sources.querySelectorAll('.packet-source[data-status="partly"] .packet-status')].every((n) => n.textContent.startsWith('partly verified: ') && n.textContent.length > 20), `${entry.id}: a partly row states its limit`);
    eq(section.querySelector('.packet-receipts a').getAttribute('href'), `#sources-${entry.id}`, `${entry.id}: the receipts line goes to them`);
  }
  // The lists are the Data Center page's, word for word, numbered.
  const dc = new JSDOM(read('site/data-centers/index.html')).window.document;
  const lists = [...dc.querySelectorAll('#checklists > details')];
  eq(lists.length, 8, 'eight lists on the Data Center page');
  const words = (node) => node.textContent.replace(/\s+/g, ' ').trim();
  for (const list of lists) {
    const section = document.getElementById(list.id);
    ok(section?.classList.contains('packet-checklist'), `${list.id}: a section of its own`);
    eq(words(section.querySelector('.packet-h')), words(list.querySelector('summary')), `${list.id}: its name`);
    eq([...section.querySelectorAll('.packet-list > li')].map(words).join('|'), [...list.querySelectorAll('li')].map(words).join('|'), `${list.id}: its items, verbatim`);
    eq(words(section.querySelector('.packet-provenance')), words(dc.querySelector('.dc-wide-note:has(+ #checklists)')), `${list.id}: the sentence that says where it comes from`);
  }
  eq(document.querySelector('#q-water a[href="#dc-cooling"]')?.dataset.home, '../data-centers/#dc-cooling', 'a plate link has this page\'s id and a way home');
  // Every id is one id; every link in the copies still reaches something (the validator walks them).
  const every = [...document.querySelectorAll('[id]')].map((n) => n.id);
  eq(new Set(every).size, every.length, 'no id twice');
  // Without scripts the rail is a jump list and nothing that needs a script shows. With them, what the script shows holds its place from the first
  // paint, unseen until the form is wired, and the cover opens empty, so nothing moves when the script runs (briefing.css).
  const css = read('site/assets/css/briefing.css');
  ok([...document.querySelectorAll('.rail-item')].every((n) => n.querySelector('a[href^="#"]') && n.querySelector('input').matches('[data-js]:not([hidden])')), 'jump links, with ticks for scripts only');
  ok(document.querySelector('.rail-buttons').matches('[data-js]:not([hidden])') && css.includes('html:not(.has-js) .briefing-rail [data-js]') && css.includes('.has-js .briefing-rail form:not(.is-live) [data-js] { visibility: hidden; }'), 'and the buttons, which hold their place');
  ok(!document.querySelector('[data-empty]').hidden && css.includes('.has-js .packet-cover:not(.is-filled) [data-filled]'), 'the cover opens empty with scripts and lists every section without them');
  eq(document.querySelector('.page-band-figures .figure-num').textContent, String(offered.length), 'the band counts the plates on offer, from the manifest');
}

async function rail() {
  const { window, document, errors } = await load();
  const cover = document.getElementById('packet-cover');
  ok(document.documentElement.classList.contains('has-js'), 'a section not chosen is not laid out');
  eq(chosen(document).join(), 'packet-cover', 'a new page holds the cover alone');
  ok(document.querySelector('[data-empty]').textContent.startsWith('Nothing chosen yet.'), 'and says what to do');
  ok(!cover.classList.contains('is-filled'), 'and nothing else');
  eq(document.documentElement.dataset.modelCheck, 'passed', 'the AI page\'s model runs here and agrees with itself');
  const boxes = [...document.querySelectorAll('.briefing-rail input[type="checkbox"]')];
  eq(boxes.length, offered.length + 8, 'a tick for each');
  ok(boxes.every((b) => b.nextElementSibling.tagName === 'LABEL' && b.nextElementSibling.htmlFor === b.id), 'each with its own label');
  ok(document.querySelector('.briefing-rail form').classList.contains('is-live'), 'the ticks and buttons show');
  // A tick shows the plate and its Sources, and they say what they are.
  tick(window, document, 'dc-project');
  eq(chosen(document).join(), 'packet-cover,packet-dc-project,sources-dc-project', 'a plate and its Sources');
  ok(cover.classList.contains('is-filled'), 'and the cover lists them');
  ok(document.querySelector('[data-packet-status]').textContent.includes('1 plate'), 'a screen reader hears the count');
  const section = document.getElementById('packet-dc-project');
  eq(section.querySelector('.packet-settings').textContent, 'Settings: defaults', 'the settings line at the defaults');
  const covered = cover.querySelector('[data-chosen]').textContent;
  ok(covered.includes('Project size, MW 125 (default)') && covered.includes("Applicant's liters per kWh not set (blank)"), `the cover names every control: ${covered}`);
  ok(cover.querySelector('[data-measured]').textContent.startsWith(`${offered.find((p) => p.id === 'dc-project').claim_ids.length} figures read from a source`), 'and counts its figures');
  ok(/formula rows\.$/.test(cover.querySelector('[data-modeled]').textContent), `and what is modeled: ${cover.querySelector('[data-modeled]').textContent}`);
  // Typed figures: everything on the page follows, and the address hears nothing.
  const before = window.location.href;
  const typed = document.querySelector('#dc-project [data-param="p_mw"] input[type="number"]');
  typeInto(window, typed, '200');
  eq(window.location.href, before, 'a typed figure stays out of the address');
  ok(section.querySelector('.packet-settings').textContent.includes('Project size, MW: 200') && section.querySelector('.packet-settings').textContent.endsWith('chosen by the reader'), `the settings line says whose hand: ${section.querySelector('.packet-settings').textContent}`);
  ok(cover.querySelector('[data-chosen]').textContent.includes('Project size, MW 200 (your setting)'), 'so does the cover');
  const title = section.querySelector('.plate-title').textContent;
  ok(title.startsWith('200 MW'), `the title is live at the settings: ${title}`);
  eq(document.querySelector('#sources-dc-project [data-title]').textContent, title, 'in Sources');
  eq(cover.querySelector('[data-contents] [data-title="dc-project"]').textContent, title, 'and in Contents');
  // Copy, and the page's own record of what it kept.
  fire(window, section.querySelector('[data-copy]'), 'click');
  await wait(20);
  ok(!/localhost|https?:\/\/[^ ]*briefing/.test(window.clip), 'Copy Reading carries no link to this page');
  const stored = [window.localStorage.length, window.sessionStorage.length, window.document.cookie.length];
  eq(stored.join(), '0,0,0', 'nothing is stored');
  // The guard date: one date, or the span where they differ.
  const words = () => cover.querySelector('.packet-guard').textContent;
  const dcDate = offered.find((p) => p.id === 'dc-project').checked;
  eq(words(), `Settings chosen by the reader, sources checked ${dcDate}.`, 'one date when one date holds');
  const other = offered.find((p) => p.checked !== dcDate);
  tick(window, document, other.id);
  ok(GUARD.test(words()) && words().includes('between') && words().includes(other.checked) && words().includes(dcDate), `the span where they differ: ${words()}`);
  ok([...document.querySelectorAll('.packet-guard')].every((n) => n.textContent === words()), 'on every section');
  tick(window, document, other.id, false);
  eq(errors.join(), '', 'no script errors');
}

async function buttons() {
  const { window, document, errors } = await load('?add=dc-project&add=q-water&add=nothing&p_mw=999&ai-same-hour=video');
  eq(chosen(document).join(), 'packet-cover,packet-dc-project,sources-dc-project,q-water', 'a link may ask for plates and lists; a name it cannot find is nothing');
  eq(document.querySelector('#dc-project [data-param="p_mw"] input[type="number"]').value, '125', 'a typed figure from an address is ignored');
  fire(window, document.querySelector('[data-print-packet]'), 'click');
  eq(window.printed, 1, 'Print packet prints');
  typeInto(window, document.querySelector('#dc-project [data-param="p_mw"] input[type="number"]'), '300');
  fire(window, document.querySelector('[data-download-packet]'), 'click');
  const [file] = window.files;
  ok(/^council-briefing-\d{2}-\d{2}-\d{4}\.json$/.test(file.name), `the packet file is named for the day: ${file.name}`);
  const data = JSON.parse(await fileText(window, file));
  eq(Object.keys(data).join(), 'assembled,checked,plates,checklists', 'it holds the one object');
  eq(data.plates[0].id, 'dc-project', 'the plate');
  eq(data.plates[0].state.p_mw, 300, 'at the reader\'s setting');
  eq(data.checklists.join(), 'q-water', 'and the list');
  ok(document.querySelector('.rail-packet').textContent.includes('Share it only where your Nation\'s figures may go') && document.querySelector('.rail-packet').textContent.includes('Nothing is stored. Print or download before you close the page.'), 'the page says what the file holds and that nothing stays');
  fire(window, document.querySelector('[data-clear-packet]'), 'click');
  eq(chosen(document).join(), 'packet-cover', 'Clear empties the packet');
  eq(document.querySelector('#dc-project [data-param="p_mw"] input[type="number"]').value, '125', 'and takes a typed figure away');
  eq(errors.join(), '', 'no script errors');
}

async function checklists() {
  const { window, document, errors } = await load();
  const box = document.getElementById('pick-q-water');
  const note = box.parentElement.querySelector('.rail-asks');
  const link = document.querySelector('#q-water a[data-home]');
  ok(note.hidden, 'a list says nothing of a plate not chosen');
  eq(link.getAttribute('href'), '../data-centers/#dc-cooling', 'and its link goes to the plate\'s own page');
  tick(window, document, 'dc-cooling');
  ok(!note.hidden && note.textContent === 'asks about Cooling', `a list names a plate it asks about: ${note.textContent}`);
  ok(!box.checked, 'and does not tick itself');
  eq(link.getAttribute('href'), '#dc-cooling', 'its link stays on the page once the plate is here');
  tick(window, document, 'q-water');
  ok(chosen(document).includes('q-water'), 'a list is its own section');
  eq(errors.join(), '', 'no script errors');
}

// A claim prints once, at the first plate that cites it, and names the others.
async function sourcesOnce() {
  const shared = offered.flatMap((a, i) => offered.slice(i + 1).map((b) => [a, b, a.claim_ids.find((c) => b.claim_ids.includes(c))])).find(([, , c]) => c);
  ok(shared, 'two plates share a claim');
  const [first, second, claim] = shared;
  const { window, document, errors } = await load();
  tick(window, document, first.id);
  tick(window, document, second.id);
  const row = (id) => document.querySelector(`#sources-${id} .packet-source[data-claim="${claim}"]`);
  ok(!row(first.id).hidden && row(second.id).hidden, `${claim} prints once`);
  const label = document.getElementById(`packet-${second.id}`).dataset.label;
  ok(row(first.id).querySelector('.packet-also').textContent.includes(`Also cited by ${label}`), `and names ${label}`);
  tick(window, document, first.id, false);
  ok(!row(second.id).hidden && row(second.id).querySelector('.packet-also').textContent === '', 'alone again, it prints in its own place');
  eq(errors.join(), '', 'no script errors');
}

// Rules only a browser applies, held as text; scripts/page_check.js has no layout. The PDF route is in the report.
async function printRules() {
  const css = read('site/assets/css/briefing.css');
  const paper = css.slice(css.indexOf('@media print'));
  ok(/\.briefing-rail[^{]*\{ display: none !important; \}/.test(paper), 'print hides the rail');
  ok(/\.packet-page, \.packet-page \+ \.packet-page \{[^}]*break-before: page/.test(paper), 'a section starts a sheet');
  ok(/\.packet-sheet \{ width: 100%; table-layout: fixed/.test(paper), 'its frame is a real table only there');
  ok(/@media screen \{ \.packet-sheet/.test(css), 'and a block on screen');
  ok(paper.includes('.plate-view[data-view="sources"]'), 'a plate\'s own quoted Sources stay off the packet\'s paper');
  ok(/@media print \{\s*\.plate-controls, \.plate-switch,/.test(read('site/assets/css/site.css')), 'the kit keeps a plate\'s controls off paper');
  const script = read('site/assets/js/briefing.js');
  ok(!/localStorage|sessionStorage|document\.cookie|fetch\(|XMLHttpRequest|sendBeacon|history\.|location\.(href|hash) *=|innerHTML/.test(script), 'the script stores nothing, sends nothing, and writes nothing to the address');
}

module.exports = { groups: { structure, rail, buttons, checklists, sourcesOnce, printRules } };
