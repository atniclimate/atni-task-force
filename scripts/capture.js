#!/usr/bin/env node
// Serves site/ on an ephemeral port, takes screenshots, writes metrics.json, and closes its server. Use at integration, not per edit.
//   node scripts/capture.js --out work/site-refresh/shots/x3 --pages ai,home --widths 1440,390 --themes dark,light [--tabs] [--full] [--slow]
// Each view's metrics carry its cumulative layout shift since the load (cls, shifts a reader's own press caused left out), with the nodes of its largest shifts,
// so DIRECTION-R2 section 6's "cold-load CLS under 0.1" is measured, not reasoned. --slow loads at 4x CPU and an 80 ms, 6 Mbps network, where the first paint
// lands before the scripts run, as on a real connection; a local load often hides a shift that a slower one shows.
// --pages takes names from PAGES below, paths under site/ such as ai/sources/, or "all": every page, each page's Sources page, and the hub (CW 8). Playwright
// comes from local node_modules or else the global npm root, and drives the installed Chrome. A page's console errors and overflow go in the metrics and do
// not change the exit code.
const { execSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
// CAPTURE_SITE points at a scratch copy of site/, for design comps.
const SITE = process.env.CAPTURE_SITE ? path.resolve(process.env.CAPTURE_SITE) : path.join(ROOT, 'site');
const PAGES = { home: '', ai: 'ai/', 'data-centers': 'data-centers/', 'resource-use': 'data-centers/resource-use/', energy: 'energy/', potential: 'energy/potential/', funding: 'energy/funding/', library: 'library/', summit: 'summit/', about: 'about/', explorer: 'explorer/', briefing: 'briefing/' };
// Every page with an index.html under site/, by its name above where it has one; assets/ and data/ hold no pages.
const EVERY = (function pages(dir, rel) {
  const here = fs.existsSync(path.join(dir, 'index.html')) ? [rel] : [];
  return here.concat(...fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !(rel === '' && /^(assets|data)$/.test(e.name))).map((e) => pages(path.join(dir, e.name), `${rel}${e.name}/`)));
})(SITE, '').map((rel) => Object.keys(PAGES).find((name) => PAGES[name] === rel) || rel);
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.csv': 'text/csv', '.txt': 'text/plain' };

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

function serve() {
  const server = http.createServer((req, res) => {
    let file = path.join(SITE, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (file.startsWith(SITE) && fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!file.startsWith(SITE) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => { server.listen(0, '127.0.0.1', () => resolve(server)); });
}

// Runs in the page, before its own scripts: every layout shift a reader did not cause, from the first paint on.
function watchShifts() {
  window.__cls = { value: 0, shifts: [] };
  const name = (n) => (n ? `${n.nodeName.toLowerCase()}${n.id ? `#${n.id}` : ''}${typeof n.className === 'string' && n.className.trim() ? `.${n.className.trim().split(/\s+/).slice(0, 3).join('.')}` : ''}` : '?');
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue;
        window.__cls.value += e.value;
        window.__cls.shifts.push({ at: Math.round(e.startTime), value: +e.value.toFixed(4), nodes: (e.sources || []).slice(0, 4).map((s) => name(s.node)) });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch (e) { /* a browser without layout-shift entries reports null */ }
}

// Runs in the page.
function measure(vh) {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest('[hidden]') && getComputedStyle(e).visibility !== 'hidden'; };
  const de = document.documentElement;
  const panel = [...document.querySelectorAll('[role=tabpanel]')].find(vis);
  const scope = panel || document.querySelector('main') || document.body;
  const plate = [...scope.querySelectorAll('.plate')].find(vis);
  const edge = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), inView: b.top < vh, fullyInView: b.bottom <= vh }; };
  const clipped = [];
  for (const e of scope.querySelectorAll('*')) {
    const hasText = [...e.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
    if (!hasText || !vis(e) || e.clientHeight <= 1 || e.scrollHeight <= e.clientHeight + 1) continue; // 1px: inline, or screen-reader-only text
    clipped.push({ tag: e.tagName.toLowerCase(), cls: String(e.className).slice(0, 60), over: e.scrollHeight - e.clientHeight, overflow: getComputedStyle(e).overflowY, text: e.textContent.trim().slice(0, 60) });
  }
  return {
    overflowX: de.scrollWidth - de.clientWidth,
    heightMultiple: +(de.scrollHeight / vh).toFixed(2),
    fold: plate ? { plate: plate.dataset.plate, readout: edge(plate.querySelector('.readout, .reading')), plot: edge(plate.querySelector('.plate-plot')) } : null,
    clippedText: clipped.slice(0, 40),
    clippedTextCount: clipped.length,
    cls: window.__cls ? { value: +window.__cls.value.toFixed(4), largest: [...window.__cls.shifts].sort((a, b) => b.value - a.value).slice(0, 5) } : null,
  };
}

function args() {
  const take = (name, fallback) => { const at = process.argv.indexOf(`--${name}`); return at < 0 ? fallback : process.argv[at + 1]; };
  const out = take('out');
  if (!out) throw new Error('Name the output folder: node scripts/capture.js --out FOLDER [--pages ai,home] [--widths 1440] [--themes dark,light] [--tabs] [--full]');
  const names = take('pages', 'all');
  return {
    out: path.resolve(out),
    pages: names === 'all' ? EVERY : names.split(','),
    widths: take('widths', '1440').split(',').map(Number),
    themes: take('themes', 'dark,light').split(','),
    tabs: process.argv.includes('--tabs'),
    full: process.argv.includes('--full'),
    slow: process.argv.includes('--slow'),
  };
}

const heightFor = (w) => (w >= 1920 ? 1080 : w >= 1280 ? 900 : 844);

async function main() {
  const opt = args();
  fs.mkdirSync(opt.out, { recursive: true });
  const { chromium } = loadPlaywright();
  const server = await serve();
  const { port } = server.address();
  const views = {};
  let shots = 0;
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome' });
    for (const name of opt.pages) {
      const url = name in PAGES ? PAGES[name] : name;
      const label = name.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'home';
      for (const width of opt.widths) {
        for (const theme of opt.themes) {
          const height = heightFor(width);
          const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
          await ctx.addInitScript((t) => { try { localStorage.setItem('atni-energy-theme', t); } catch (e) { /* private window */ } }, theme);
          await ctx.addInitScript(watchShifts);
          const page = await ctx.newPage();
          if (opt.slow) {
            const cdp = await ctx.newCDPSession(page);
            await cdp.send('Network.enable');
            await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 80, downloadThroughput: 750000, uploadThroughput: 750000 });
            await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
          }
          const consoleErrors = [];
          const failedRequests = [];
          page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
          page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
          page.on('requestfailed', (r) => failedRequests.push(`${r.url()} ${(r.failure() || {}).errorText}`));
          page.on('response', (r) => { if (r.status() >= 400) failedRequests.push(`${r.url()} ${r.status()}`); });
          await page.goto(`http://127.0.0.1:${port}/${url}`, { waitUntil: 'networkidle' });
          await page.waitForTimeout(600);
          const tabCount = opt.tabs ? await page.locator('[role=tab]').count() : 0;
          for (let i = 0; i < Math.max(tabCount, 1); i += 1) {
            let tab = 'main';
            if (tabCount) {
              const link = page.locator('[role=tab]').nth(i);
              tab = ((await link.getAttribute('href')) || `#${i}`).replace('#', '');
              await link.click();
              await page.waitForTimeout(500);
            }
            const shot = `${label}-${tab}-${width}-${theme}`;
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.screenshot({ path: path.join(opt.out, `${shot}.png`) });
            shots += 1;
            if (opt.full) { await page.screenshot({ path: path.join(opt.out, `${shot}-full.png`), fullPage: true }); shots += 1; }
            views[shot] = { ...(await page.evaluate(measure, height)), consoleErrors: [...consoleErrors], failedRequests: [...failedRequests] };
          }
          await ctx.close();
        }
      }
    }
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise((resolve) => { server.close(resolve); });
  }
  fs.writeFileSync(path.join(opt.out, 'metrics.json'), JSON.stringify({ shots, views }, null, 2));
  const shifty = Object.entries(views).filter(([, v]) => v.cls && v.cls.value >= 0.1).map(([k, v]) => `${k} ${v.cls.value}`);
  console.log(`${shots} screenshots and metrics.json in ${opt.out}${shifty.length ? `; layout shift at or over 0.1: ${shifty.join(', ')}` : '; every view under 0.1 layout shift'}`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
