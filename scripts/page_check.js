#!/usr/bin/env node
// Runs the jsdom page checks. No browser and no network.
//   node scripts/page_check.js --all
//   node scripts/page_check.js --page ai     (plate, dc, ai, ru, explorer, library, energy, briefing)
// Exit 1 on a failed check and 2 on bad arguments. Budgets in tests/budgets.json only print warnings; they never change the exit code.
// Needs "npm ci" once. The Explorer page reads 300 oracle cases and takes ten to fifteen minutes (825 seconds on 11/06/2026); run it last.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const PAGES = ['plate', 'dc', 'ai', 'ru', 'explorer', 'library', 'energy', 'briefing'];
const ALIASES = { 'data-centers': 'dc', 'resource-use': 'ru', kit: 'plate' };

function htmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return htmlFiles(full);
    return e.name.endsWith('.html') ? [full] : [];
  });
}

function printBudgets() {
  const file = path.join(ROOT, 'tests/budgets.json');
  if (!fs.existsSync(file)) { console.log('budgets: tests/budgets.json not found, nothing to compare'); return; }
  let budgets;
  try {
    budgets = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.log(`WARNING budgets: tests/budgets.json is not valid JSON, so budgets were not compared: ${error.message}`);
    return;
  }
  const warnAt = budgets.warn_at || 0.9;
  const report = (rel, used, cap, unit) => {
    const shown = `${rel} is ${used.toLocaleString('en-US')} ${unit} of its ${cap.toLocaleString('en-US')} ${unit} budget`;
    if (used > cap) console.log(`WARNING OVER BUDGET: ${shown}. Trim it, or raise its line in tests/budgets.json with a reason.`);
    else if (used >= warnAt * cap) console.log(`warning: ${shown}, past ${Math.round(warnAt * 100)} percent.`);
  };
  for (const [rel, cap] of Object.entries(budgets.scripts || {})) {
    const full = path.join(ROOT, rel);
    if (fs.existsSync(full)) report(rel, fs.statSync(full).size, cap, 'bytes');
    else console.log(`warning: tests/budgets.json names ${rel}, which does not exist. Remove that line.`);
  }
  const pages = budgets.pages_gzip_kb || {};
  for (const full of htmlFiles(path.join(ROOT, 'site'))) {
    const rel = path.relative(ROOT, full).replace(/\\/g, '/');
    const cap = pages[rel] || pages.default;
    if (cap) report(rel, +(zlib.gzipSync(fs.readFileSync(full), { level: 9 }).length / 1024).toFixed(1), cap, 'KB gzipped');
  }
}

// One page, in this process, so a page's windows and timers end with it.
async function runPage(name) {
  let failed = false;
  let lib;
  try {
    lib = require('./page_checks/lib');
    const { groups } = require(`./page_checks/${name}`);
    for (const [group, run] of Object.entries(groups)) {
      try {
        await run();
        console.log(`ok   ${group}`);
      } catch (error) {
        failed = true;
        console.log(`FAIL ${group}: ${error.message}\n${(error.stack || '').split('\n').slice(1, 5).join('\n')}`);
      }
    }
  } catch (error) {
    failed = true;
    console.log(`FAIL ${name}: ${error.message}`);
  }
  return { failed, checks: lib ? lib.count(0) : 0 };
}

function spawnPage(name) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [__filename, '--page', name, '--no-budgets'], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
    child.on('close', (code) => resolve({ name, code, checks: +(new RegExp(`^${name}: (\\d+) checks`, 'm').exec(out) || [])[1] || 0 }));
  });
}

async function main() {
  const args = process.argv.slice(2);
  const at = args.indexOf('--page');
  const name = at >= 0 ? (ALIASES[args[at + 1]] || args[at + 1]) : null;
  if (args.includes('--all')) {
    const results = [];
    for (const page of PAGES) {
      console.log(`--- ${page}`);
      results.push(await spawnPage(page));
    }
    printBudgets();
    const bad = results.filter((r) => r.code !== 0);
    console.log(`page_check: ${results.map((r) => `${r.name} ${r.checks.toLocaleString('en-US')}`).join(', ')}; ${bad.length ? `FAILED: ${bad.map((r) => r.name).join(', ')}` : 'all passed'}`);
    return bad.length ? 1 : 0;
  }
  if (!PAGES.includes(name)) {
    console.log('Usage: node scripts/page_check.js --all, or --page plate|dc|ai|ru|explorer|library|energy|briefing');
    return 2;
  }
  const { failed, checks } = await runPage(name);
  console.log(`${name}: ${checks} checks${failed ? ', FAILED' : ''}`);
  if (!args.includes('--no-budgets')) printBudgets();
  return failed ? 1 : 0;
}

// exit once the last line has flushed: jsdom timers would otherwise hold the process open
main().then((code) => process.stdout.write('', () => process.exit(code)));
