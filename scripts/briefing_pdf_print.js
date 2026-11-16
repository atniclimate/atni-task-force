#!/usr/bin/env node
// Prints the Council Briefing's default packet to a PDF with headless Chrome. scripts/build_briefing_pdf.py names the plates and the date, then sets the PDF's metadata and checks it.
//   node scripts/briefing_pdf_print.js --out FILE --ids a,b,c --date MM/DD/YYYY --base https://atniclimate.github.io/atni-task-force/briefing/ --note "what the cover says" [--site DIR]
//   node scripts/briefing_pdf_print.js --measure FILE [--site DIR]   # what each part of the packet takes on paper, for the page estimates (see measure())
// Serves the site on an ephemeral port as capture.js does, ticks the plates in the Briefing's own rail, and prints what the page's own scripts drew, so the sheet is the one Print
// packet gives at the defaults: Letter, light, with 1rem set to 10.5pt, the design system's Report anchor. Playwright comes from local node_modules or the global npm root,
// and drives the installed Chrome. Any script error or failed request stops the build, since the sheet would be missing something.
const { execSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.csv': 'text/csv', '.txt': 'text/plain' };
const TITLE = 'Council Briefing, Default Packet | ATNI Energy Task Forces';
const FOOTER = 'Council Briefing, default packet | ATNI Energy Task Forces';
const REPLACES = 'Default settings,'; // the Briefing's own guard line at the defaults, which this sheet stamps with its build day

// Added to the page before its plates draw, so they lay out at the sizes they print at. 10.5pt is the design system's Report body (decision 0009); the page's sizes are rem.
// The page margins hold the running foot, in the design system's house style: the title in italic grey at left, the page number at right. Margin boxes are Chrome 131 and later.
const SHEET = `
@page { size: Letter; margin: 0.7in 0.75in 0.8in;
  @bottom-left { content: "${FOOTER}"; font: italic 400 8pt "Noto Sans", sans-serif; color: #3B3B3B; vertical-align: top; padding-top: 0.2in; }
  @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 400 8pt "Noto Sans", sans-serif; color: #3B3B3B; vertical-align: top; padding-top: 0.2in; }
}
html { font-size: 10.5pt; }
body { font-size: 1rem; }
/* Chrome builds an outline title from a heading's printed lines and drops the collapsed space where a line breaks ("about 15and 14 Wh"); pre-wrap keeps that space and changes nothing on paper. */
.packet-page :is(h1, h2, h3) { white-space: pre-wrap; }
`;

function take(name) {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? '' : process.argv[at + 1];
}

function loadPlaywright() {
  const roots = [path.join(ROOT, 'node_modules')];
  try { roots.push(execSync('npm root -g', { encoding: 'utf8' }).trim()); } catch (e) { /* the local folder may still have it */ }
  for (const root of roots) {
    for (const name of ['playwright', 'playwright-core', '@playwright/test', '@playwright/cli/node_modules/playwright-core']) {
      try { return require(path.join(root, name)); } catch (e) { /* try the next */ }
    }
  }
  throw new Error('Playwright was not found. Install it with: npm install -g @playwright/cli');
}

function serve(site) {
  const server = http.createServer((req, res) => {
    let file = path.join(site, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (file.startsWith(site) && fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!file.startsWith(site) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => { server.listen(0, '127.0.0.1', () => resolve(server)); });
}

// Runs in the page, after the packet is assembled. Every guard line says whose settings these are and when the sheet was built; the cover says when it was assembled, what the packet
// holds, and where the claim ids are, and does not say the reader chose what nobody chose; the title names the packet; and the base makes a link that leaves the sheet an address on
// the public site, while #links stay inside the PDF.
function prepare({ date, base, title, replaces, note }) {
  const guards = [...document.querySelectorAll('.packet-guard')];
  if (!guards.length) throw new Error('the packet has no guard lines');
  for (const guard of guards) {
    if (!guard.textContent.startsWith(replaces)) throw new Error(`a guard line reads "${guard.textContent}", not the default settings line this sheet stamps`);
    guard.textContent = `${guard.textContent} Built ${date}.`;
  }
  document.querySelector('[data-assembled]').textContent = ` ${date}`;
  const said = document.createElement('p');
  said.className = 'caption packet-default-note';
  said.textContent = note;
  document.querySelector('.packet-assembled').after(said);
  document.title = title;
  const origin = document.createElement('base');
  origin.href = base;
  document.head.prepend(origin);
}

// Prints at the sheet's size, as the Briefing's own Print buttons do: the packet narrows to the sheet's width and the plates redraw before the page prints.
async function atSheetSize(page) {
  await page.waitForFunction(() => [...document.querySelectorAll('.packet-plate:not([hidden]) .plate')].every((p) => p.classList.contains('is-live')));
  await page.evaluate(() => document.documentElement.classList.add('is-printing'));
  await page.evaluate(() => new Promise((resolve) => { requestAnimationFrame(() => requestAnimationFrame(resolve)); }));
  await page.waitForTimeout(500); // the kit redraws a plate once its section has its new width
}

const pagesOf = (pdf) => (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
const tickOnly = (page, ids) => page.evaluate((want) => {
  for (const b of document.querySelectorAll('.briefing-rail input[type="checkbox"]')) b.checked = want.includes(b.value);
  document.querySelector('.briefing-rail form').dispatchEvent(new Event('change', { bubbles: true }));
}, ids);

// --measure FILE: what the packet takes on paper, for build_briefing.py's page estimates. On a Letter sheet in print media: the cover's fixed lines and its line a
// section, each checklist's share of a sheet (they run on together), and the appendix's documents a sheet; then each plate printed alone, its sheets counted.
async function measure(page, file) {
  const sizes = await page.evaluate(() => {
    const h = (node) => node.getBoundingClientRect().height;
    const cover = document.querySelector('.packet-cover');
    cover.classList.add('is-filled');
    for (const node of document.querySelectorAll('[data-contents] > li, .packet-checklist, .packet-appendix, .packet-doc, .packet-doc-claims > li')) node.hidden = false;
    const sheet = 1056 - 1.5 * 96 - h(cover.querySelector('thead')) - h(cover.querySelector('tfoot')); // Letter, less the 0.7in and 0.8in margins and the lines each sheet repeats
    const items = [...cover.querySelectorAll('[data-contents] > li')];
    const gap = parseFloat(getComputedStyle(cover.querySelector('[data-contents]')).rowGap) || 0;
    const lines = items.reduce((n, li) => n + h(li) + gap, 0);
    const round = (n) => Math.round(n * 1000) / 1000;
    const share = Object.fromEntries([...document.querySelectorAll('.packet-checklist')].map((s) => [s.dataset.packet, round((h(s.querySelector('.packet-body')) + 32) / sheet)]));
    const docs = document.querySelectorAll('.packet-doc').length;
    return { cover: { base: round((h(cover.querySelector('.packet-body')) - lines) / sheet), item: round(lines / items.length / sheet) }, docs_a_sheet: round(docs / (h(document.querySelector('.packet-appendix .packet-body')) / sheet)), share };
  });
  await page.emulateMedia({ media: null }); // not 'screen', which page.pdf would then print in
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.addStyleTag({ content: '@media print { .site-header, .packet-cover, .packet-appendix { display: none !important; } }' }); // the plate's sheets alone
  const ids = await page.evaluate(() => [...document.querySelectorAll('.packet-plate')].map((s) => s.dataset.packet));
  const sheets = {};
  for (const id of ids) {
    await page.evaluate(() => document.documentElement.classList.remove('is-printing'));
    await tickOnly(page, [id]);
    await atSheetSize(page);
    sheets[id] = pagesOf(await page.pdf({ format: 'Letter', printBackground: true, preferCSSPageSize: true }));
  }
  const today = new Date();
  const measured = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;
  fs.writeFileSync(file, `${JSON.stringify({ measured, by: 'python scripts/build_briefing_pdf.py --measure', ...sizes, sheets }, null, 2)}\n`);
  return { file, plates: ids.length };
}

async function main() {
  const measuring = take('measure');
  const out = take('out');
  const ids = take('ids').split(',').filter(Boolean);
  const date = take('date');
  const base = take('base');
  const note = take('note');
  const site = path.resolve(take('site') || path.join(ROOT, 'site'));
  if (!measuring && (!out || !ids.length || !/^\d{2}\/\d{2}\/\d{4}$/.test(date) || !base.startsWith('https://') || !note)) throw new Error('Usage: node scripts/briefing_pdf_print.js --out FILE --ids a,b,c --date MM/DD/YYYY --base https://.../briefing/ --note "what the cover says" [--site DIR], or --measure FILE [--site DIR]');
  const { chromium } = loadPlaywright();
  const server = await serve(site);
  const problems = [];
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome' });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light', locale: 'en-US' });
    await ctx.addInitScript(() => { try { localStorage.setItem('atni-energy-theme', 'light'); } catch (e) { /* private window */ } });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => problems.push(`request failed: ${r.url()}`));
    page.on('response', (r) => { if (r.status() >= 400) problems.push(`${r.status()}: ${r.url()}`); });
    if (measuring) { // the sheet's width in print media first, with nothing ticked, so no plate starts or redraws while the lines are measured
      await page.setViewportSize({ width: 672, height: 1056 });
      await page.emulateMedia({ media: 'print' });
    }
    await page.goto(`http://127.0.0.1:${server.address().port}/briefing/`, { waitUntil: 'networkidle' });
    if (measuring) {
      const done = await measure(page, path.resolve(measuring));
      if (problems.length) throw new Error(`the page reported ${problems.length} problem(s) while it was measured:\n${problems.slice(0, 8).join('\n')}`);
      console.log(JSON.stringify(done));
      return;
    }
    await page.addStyleTag({ content: SHEET });
    const picked = await page.evaluate((want) => {
      const boxes = [...document.querySelectorAll('.briefing-rail input[type="checkbox"]')];
      const missing = want.filter((id) => !boxes.some((b) => b.value === id));
      if (missing.length) throw new Error(`the Briefing offers no ${missing.join(', ')}`);
      return want.length;
    }, ids);
    await tickOnly(page, ids);
    await atSheetSize(page);
    await page.evaluate(prepare, { date, base, title: TITLE, replaces: REPLACES, note });
    await page.evaluate(async () => { await Promise.all([...document.fonts].map((f) => f.load())); await document.fonts.ready; });
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    await page.pdf({ path: out, format: 'Letter', printBackground: true, preferCSSPageSize: true, tagged: true, outline: true });
    if (problems.length) throw new Error(`the page reported ${problems.length} problem(s), so the sheet may be missing something:\n${problems.slice(0, 8).join('\n')}`);
    console.log(JSON.stringify({ out: path.resolve(out), picked, bytes: fs.statSync(out).size }));
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise((resolve) => { server.close(resolve); });
  }
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
