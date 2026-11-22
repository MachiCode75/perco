// Shared helper: launch headless Chromium with the runtime page loaded and initialised.
//   const rt = await openRuntime({ width, height, quality, server?, options? })
//   await rt.page.evaluate(...); rt.logs (console lines); await rt.close()
const path = require('path');
function loadPlaywright() {
  try { return require('playwright'); } catch (e) {
    const root = require('child_process').execSync('npm root -g').toString().trim();
    return require(path.join(root, 'playwright'));
  }
}
const CHROME_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];

// One static server can be shared by several runtimes (pass `server` from require('./server').start()).
async function openRuntime({ width = 720, height = 1280, quality = 'final', server = null, options = null, timeout = 60000 } = {}) {
  const { chromium } = loadPlaywright();
  const { start } = require('./server');
  const srv = server || await start(0);
  const browser = await chromium.launch({ args: CHROME_ARGS });
  let closed = false;
  try {
    const page = await browser.newPage({ viewport: { width: Math.min(width, 1920), height: Math.min(height, 1920) } });
    page.setDefaultTimeout(timeout);
    const logs = [];
    page.on('console', (m) => { if (!/GPU stall due to ReadPixels/.test(m.text())) logs.push(`[${m.type()}] ${m.text()}`); if (logs.length > 2000) logs.splice(0, 1000); });
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
    page.on('crash', () => logs.push('[crash] page crashed'));
    await page.goto(srv.url + 'engine/web/index.html');
    await page.waitForFunction('window.engine !== undefined', null, { timeout: 30000 }).catch((e) => {
      throw new Error(`runtime did not start: ${e.message}\n${logs.slice(-15).join('\n')}`);
    });
    await page.evaluate((o) => window.engine.init(o), { width, height, quality });
    if (options) await page.evaluate((o) => window.engine.setOptions(o), options);
    return {
      page, logs, browser, server: srv,
      async close() {
        if (closed) return; closed = true;
        try { await browser.close(); } catch (e) { /* already gone */ }
        if (!server) try { srv.server.close(); } catch (e) { /* */ }
      },
    };
  } catch (e) {
    try { await browser.close(); } catch (err) { /* */ }
    if (!server) try { srv.server.close(); } catch (err) { /* */ }
    throw e;
  }
}
function dataUrlToBuffer(u) { return Buffer.from(u.slice(u.indexOf(',') + 1), 'base64'); }

// Tiny argv parser: --key value, --flag, --key=value.
function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const eq = a.indexOf('=');
    if (eq > 0) { out[a.slice(2, eq)] = a.slice(eq + 1); continue; }
    const k = a.slice(2); const n = argv[i + 1];
    if (n !== undefined && !n.startsWith('--')) { out[k] = n; i++; } else out[k] = true;
  }
  return out;
}

// Episode shot → resolvedShot (ARCHITECTURE §6/§8): cast refs → full specs, seed, duration.
function hash32(s) { let h = 2166136261 >>> 0; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function resolveShot(ep, shot, { frames = null, fps = 30 } = {}) {
  const warnings = [];
  const s = JSON.parse(JSON.stringify(shot || {}));
  const cast = (ep && ep.cast) || {};
  s.actors = (Array.isArray(s.actors) ? s.actors : []).filter((a) => a && typeof a === 'object').map((a) => {
    const id = String(a.id || '');
    let spec = a.spec || null;
    if (!spec && cast[id]) spec = cast[id];
    if (!spec && id && !/^extra:/.test(id)) warnings.push(`actor "${id}" not in cast → random townsperson`);
    // per-shot extra accessories (e.g. a sleep mask only in the bedtime shots): a.wear = [acc, …]
    if (Array.isArray(a.wear) && a.wear.length) {
      spec = JSON.parse(JSON.stringify(spec || {}));
      spec.accessories = [...(Array.isArray(spec.accessories) ? spec.accessories : []), ...a.wear];
    }
    return { ...a, id, spec };
  });
  // a subject that is a cast member but missing from actors gets added (auto-placed)
  const subj = typeof s.subject === 'string' ? s.subject.replace(/^actor:/, '') : null;
  if (subj && subj !== 'set' && !subj.includes(':') && !s.actors.some((a) => a.id === subj) && cast[subj]) {
    s.actors.push({ id: subj, spec: cast[subj] });
    warnings.push(`subject "${subj}" not in actors → added`);
  }
  if (s.seed == null) s.seed = hash32(`${(ep && ep.id) || 'ep'}:${s.id}`);
  if (frames != null) { s.frames = frames; s.duration = frames / fps; } else if (!(s.duration > 0)) s.duration = 1.5;
  s.fps = fps;
  return { shot: s, warnings };
}
module.exports = { openRuntime, dataUrlToBuffer, loadPlaywright, parseArgs, resolveShot, hash32, CHROME_ARGS };
