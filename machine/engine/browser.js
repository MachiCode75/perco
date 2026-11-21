// Shared helper: launch headless Chromium with the runtime page loaded and initialised.
const path = require('path');
function loadPlaywright() {
  try { return require('playwright'); } catch (e) {
    const root = require('child_process').execSync('npm root -g').toString().trim();
    return require(path.join(root, 'playwright'));
  }
}
async function openRuntime({ width = 720, height = 1280, quality = 'final' } = {}) {
  const { chromium } = loadPlaywright();
  const { start } = require('./server');
  const srv = await start(0);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width, height } });
  const logs = [];
  page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
  await page.goto(srv.url + 'engine/web/index.html');
  await page.waitForFunction('window.engine !== undefined', null, { timeout: 30000 });
  await page.evaluate((o) => window.engine.init(o), { width, height, quality });
  return { page, logs, async close() { await browser.close(); srv.server.close(); } };
}
function dataUrlToBuffer(u) { return Buffer.from(u.slice(u.indexOf(',') + 1), 'base64'); }
module.exports = { openRuntime, dataUrlToBuffer, loadPlaywright };
