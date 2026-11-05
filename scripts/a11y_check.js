#!/usr/bin/env node
// Runs axe-core on served pages in both themes: each tab panel of a workbench page, with its disclosures open and each plate's Sources and Table views shown.
//   node scripts/a11y_check.js --out FOLDER [--pages ai/,about/] [--themes dark,light] [--width 1440] [--unclip]
// Prints counts by impact, writes results.json to the folder, closes its server, and exits 1 on any serious or critical issue. Motion is reduced, so a fade cannot read as low contrast.
// axe-core comes from node_modules ("npm ci" once). Playwright comes from local node_modules or else the global npm root, and drives the installed Chrome.
const { execSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, 'site');
const AXE = path.join(ROOT, 'node_modules/axe-core/axe.min.js');
const PAGES = ['ai/', 'data-centers/', 'data-centers/resource-use/', 'energy/', 'library/', 'about/', 'summit/', 'briefing/'];
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.csv': 'text/csv', '.txt': 'text/plain' };
const BLOCKING = new Set(['serious', 'critical']);

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

function args() {
  const take = (name, fallback) => { const at = process.argv.indexOf(`--${name}`); return at < 0 ? fallback : process.argv[at + 1]; };
  const out = take('out');
  if (!out) throw new Error('Name the output folder: node scripts/a11y_check.js --out FOLDER [--pages ai/,about/] [--themes dark,light] [--width 1440]');
  return { out: path.resolve(out), pages: take('pages', PAGES.join(',')).split(','), themes: take('themes', 'dark,light').split(','), width: +take('width', '1440') };
}

// Runs in the page: every plate that is showing moves to this view (a view with no radio stays as it is).
function showView(view) {
  for (const radio of document.querySelectorAll(`.plate-views input[value="${view}"]`)) if (radio.offsetParent !== null || radio.closest('.plate-views').offsetParent !== null) radio.click();
}

const review = {}; // what axe could not decide, such as text over a gradient; a person looks at these, and they do not change the exit code
async function scan(page, context) {
  const { violations, incomplete } = await page.evaluate((scope) => window.axe.run(scope, { resultTypes: ['violations', 'incomplete'] }).then((r) => ({ violations: r.violations, incomplete: r.incomplete.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(' ')) })) })), context);
  for (const v of incomplete) review[v.id] = [...new Set([...(review[v.id] || []), ...v.nodes])];
  return violations.map((v) => ({ rule: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => ({ target: n.target.join(' '), html: n.html.slice(0, 200), why: n.failureSummary })) }));
}

// What axe cannot hear: the browser's own accessibility tree must expose each showing plot's selection as an option or cell, selected and named.
async function hearPlots(page) {
  const cdp = await page.context().newCDPSession(page);
  const { root } = await cdp.send('DOM.getDocument');
  const ids = await page.evaluate(() => [...document.querySelectorAll('.plate-plot[aria-activedescendant]')].filter((plot) => plot.clientWidth).map((plot) => plot.getAttribute('aria-activedescendant')));
  const nodes = [];
  for (const id of ids) {
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `[id="${id}"]` });
    const [n] = nodeId ? (await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false })).nodes : [{}];
    const selected = (n.properties || []).some((p) => p.name === 'selected' && p.value.value === true);
    if (!['option', 'gridcell'].includes(n.role?.value) || !selected || !n.name?.value) nodes.push({ target: `#${id}`, html: '', why: `The accessibility tree says role ${n.role?.value}, selected ${selected}, name "${n.name?.value || ''}". A screen reader cannot announce this selection.` });
  }
  await cdp.detach();
  return nodes.length ? [{ rule: 'plot-selection-heard', impact: 'serious', help: 'A plot\'s selection must be exposed as a selected, named option or cell', nodes }] : [];
}

async function scanPage(page, url, theme, record) {
  const tabs = await page.locator('[role=tab]').count();
  for (let i = 0; i < Math.max(tabs, 1); i += 1) {
    let tab = 'main';
    if (tabs) {
      const link = page.locator('[role=tab]').nth(i);
      tab = ((await link.getAttribute('href')) || `#${i}`).replace('#', '');
      await link.click();
      await page.waitForTimeout(150);
    }
    await page.evaluate(() => { for (const d of document.querySelectorAll('details')) d.open = true; });
    record(url, theme, tab, 'reading', [...await scan(page, 'html'), ...await hearPlots(page)]);
    for (const view of ['sources', 'table']) {
      if (!(await page.evaluate(() => document.querySelector('.plate .plate-views:not([hidden])') !== null))) break;
      await page.evaluate(showView, view);
      record(url, theme, tab, view, await scan(page, 'main'));
    }
    await page.evaluate(showView, 'reading');
  }
}

async function main() {
  const opt = args();
  fs.mkdirSync(opt.out, { recursive: true });
  const { chromium } = loadPlaywright();
  const server = await serve();
  const { port } = server.address();
  const results = [];
  const scripts = [];
  const record = (url, theme, tab, view, violations) => results.push({ url, theme, tab, view, violations });
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome' });
    for (const url of opt.pages) {
      for (const theme of opt.themes) {
        const ctx = await browser.newContext({ viewport: { width: opt.width, height: 900 }, colorScheme: theme, reducedMotion: 'reduce' });
        await ctx.addInitScript((t) => { try { localStorage.setItem('atni-energy-theme', t); } catch (e) { /* private window */ } }, theme);
        const page = await ctx.newPage();
        page.on('pageerror', (e) => scripts.push(`${url} ${theme}: ${e.message}`));
        await page.goto(`http://127.0.0.1:${port}/${url}`, { waitUntil: 'networkidle' });
        await page.addScriptTag({ path: AXE });
        // With --unclip every zone shows whole, so axe can decide the contrast of text that is scrolled out of view; it then says nothing about the zones' scrolling.
        if (process.argv.includes('--unclip')) await page.addStyleTag({ content: '.plate.is-live { height: auto !important; } .plate.is-live > :is(.plate-claim, .plate-detail) { overflow: visible !important; -webkit-mask-image: none !important; mask-image: none !important; }' });
        await scanPage(page, url, theme, record);
        await ctx.close();
      }
    }
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise((resolve) => { server.close(resolve); });
  }

  const byImpact = {};
  const byRule = new Map();
  for (const r of results) {
    for (const v of r.violations) {
      byImpact[v.impact] = (byImpact[v.impact] || 0) + v.nodes.length;
      const line = byRule.get(v.rule) || { impact: v.impact, help: v.help, nodes: 0, where: new Set() };
      line.nodes += v.nodes.length;
      line.where.add(`${r.url}#${r.tab} ${r.theme} ${r.view}`);
      byRule.set(v.rule, line);
    }
  }
  fs.writeFileSync(path.join(opt.out, 'results.json'), JSON.stringify({ scans: results.length, byImpact, scripts, review, results }, null, 2));
  console.log(`${results.length} scans on ${opt.pages.length} pages`);
  console.log(`By impact (nodes): ${['critical', 'serious', 'moderate', 'minor'].map((k) => `${k} ${byImpact[k] || 0}`).join(', ')}`);
  for (const [rule, l] of byRule) console.log(`  ${l.impact} ${rule}: ${l.nodes} nodes in ${l.where.size} scans (${l.help}); first at ${[...l.where][0]}`);
  for (const [rule, nodes] of Object.entries(review)) console.log(`  needs a person: ${rule}, ${nodes.length} distinct nodes`);
  for (const line of scripts) console.log(`  script error: ${line}`);
  console.log(`Results in ${path.join(path.basename(opt.out), 'results.json')}`);
  process.exit(Object.keys(byImpact).some((k) => BLOCKING.has(k)) ? 1 : 0);
}

main().catch((e) => { console.error(e.message || e); process.exit(2); });
