#!/usr/bin/env node
// Prints the Council Briefing's default packet to a PDF with headless Chrome. scripts/build_briefing_pdf.py names the plates and the date, then sets the PDF's metadata and checks it.
//   node scripts/briefing_pdf_print.js --out FILE --ids a,b,c --date MM/DD/YYYY --base https://atniclimate.github.io/atni-task-force/briefing/ --note "what the cover says" [--site DIR]
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
const REPLACES = 'Settings chosen by the reader,';

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
    if (!guard.textContent.startsWith(replaces)) throw new Error(`a guard line reads "${guard.textContent}", not the reader's settings line this sheet replaces`);
    guard.textContent = `Default settings,${guard.textContent.slice(replaces.length)} Built ${date}.`;
  }
  document.querySelector('[data-assembled]').textContent = ` ${date}`;
  const said = document.createElement('p');
  said.className = 'caption packet-default-note';
  said.textContent = note;
  document.querySelector('.packet-assembled').after(said);
  for (const term of document.querySelectorAll('.packet-rows dt')) if (term.textContent === 'Chosen by the reader') term.textContent = 'Settings';
  document.title = title;
  const origin = document.createElement('base');
  origin.href = base;
  document.head.prepend(origin);
}

async function main() {
  const out = take('out');
  const ids = take('ids').split(',').filter(Boolean);
  const date = take('date');
  const base = take('base');
  const note = take('note');
  const site = path.resolve(take('site') || path.join(ROOT, 'site'));
  if (!out || !ids.length || !/^\d{2}\/\d{2}\/\d{4}$/.test(date) || !base.startsWith('https://') || !note) throw new Error('Usage: node scripts/briefing_pdf_print.js --out FILE --ids a,b,c --date MM/DD/YYYY --base https://.../briefing/ --note "what the cover says" [--site DIR]');
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
    await page.goto(`http://127.0.0.1:${server.address().port}/briefing/`, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: SHEET });
    const picked = await page.evaluate((want) => {
      const boxes = [...document.querySelectorAll('.briefing-rail input[type="checkbox"]')];
      const missing = want.filter((id) => !boxes.some((b) => b.value === id));
      if (missing.length) throw new Error(`the Briefing offers no ${missing.join(', ')}`);
      for (const b of boxes) b.checked = want.includes(b.value);
      document.querySelector('.briefing-rail form').dispatchEvent(new Event('change', { bubbles: true }));
      return boxes.filter((b) => b.checked).length;
    }, ids);
    await page.waitForFunction(() => [...document.querySelectorAll('.packet-plate.is-chosen .plate')].every((p) => p.classList.contains('is-live')));
    await page.evaluate(() => new Promise((resolve) => { requestAnimationFrame(() => requestAnimationFrame(resolve)); }));
    await page.waitForTimeout(500); // the kit redraws a plate once its section has a width
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
