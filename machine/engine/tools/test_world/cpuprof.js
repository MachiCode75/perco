// CPU-time profile (load-independent): GPU-process CPU ms per frame, scene vs calibration scene.
// node engine/tools/test_world/cpuprof.js --set lake_dock --view wide,establishing [--time day]
const fs = require('fs'); const { execSync } = require('child_process');
const { loadPlaywright } = require('../../browser'); const { start } = require('../../server');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]]) : a), []));
const HZ = 100;
function cpu(pids) { let t = 0; for (const p of pids) { try { const f = fs.readFileSync(`/proc/${p}/stat`, 'utf8').split(') ')[1].split(' '); t += (+f[11] + +f[12]); } catch (e) {} } return t * 1000 / HZ; }
(async () => {
  const { chromium } = loadPlaywright(); const srv = await start(0);
  const tag = 'twprof' + process.pid;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] , env: { ...process.env, TWPROF: tag } });
  const page = await browser.newPage({ viewport: { width: 720, height: 1280 } }); page.on('pageerror', e => console.log('pageerror', e.message));
  await page.goto(srv.url + 'engine/tools/test_world/index.html'); await page.waitForFunction('window.__ready === true');
  await page.evaluate(() => window.tw.init({ width: 720, height: 1280 }));
  const root = browser.process ? null : null;
  // my processes: those whose environment carries TWPROF=<tag>
  const all = execSync('ls /proc').toString().split('\n').filter((p) => /^\d+$/.test(p)).filter((p) => { try { return fs.readFileSync(`/proc/${p}/environ`, 'utf8').includes('TWPROF=' + tag); } catch (e) { return false; } });
  // add all descendants (gpu-process, zygote, renderers)
  const ppid = (p) => { try { return fs.readFileSync(`/proc/${p}/stat`, 'utf8').split(') ')[1].split(' ')[1]; } catch (e) { return null; } };
  const pids = execSync('ls /proc').toString().split('\n').filter((p) => /^\d+$/.test(p));
  let grew = true; while (grew) { grew = false; for (const p of pids) if (!all.includes(p) && all.includes(ppid(p))) { all.push(p); grew = true; } }
  console.log('tracking', all.length, 'processes');
  const N = +(args.n || 4);
  for (const set of String(args.set || 'lake_dock').split(',')) {
    await page.evaluate((s) => window.tw.load(s), { set, time: args.time || 'day', weather: args.weather || 'clear', actors: [{ mark: 'A' }, { mark: 'B' }, { mark: 'C' }, { mark: 'D' }], crowd: { count: 6 } });
    for (const v of String(args.view || 'wide').split(',')) {
      await page.evaluate((vv) => window.tw.view(vv), v);
      await page.evaluate(() => window.tw.renderN(2, 'scene')); await page.evaluate(() => window.tw.renderN(2, 'calib'));
      let c0 = cpu(all); await page.evaluate((n) => window.tw.renderN(n, 'scene'), N); const sc = (cpu(all) - c0) / N;
      c0 = cpu(all); await page.evaluate((n) => window.tw.renderN(n, 'calib'), N); const cb = (cpu(all) - c0) / N;
      console.log(`${set} ${v}: scene ${sc.toFixed(0)} cpu-ms/frame, calib ${cb.toFixed(0)} → ratio ${(sc / cb).toFixed(2)}`);
      if (args.ab) { const res = {}; for (const t of String(args.ab).split(',')) { await page.evaluate((tt) => window.tw.toggle(tt), t); await page.evaluate(() => window.tw.renderN(1, 'scene')); const c1 = cpu(all); await page.evaluate((n) => window.tw.renderN(n, 'scene'), N); res[t] = Math.round((cpu(all) - c1) / N); } await page.evaluate(() => window.tw.toggle('none')); console.log('   ', JSON.stringify(res)); }
    }
  }
  await browser.close(); srv.server.close();
})();
