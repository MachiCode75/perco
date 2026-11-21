#!/usr/bin/env node
// Node shot renderer. Contract: ARCHITECTURE.md §7. Owner: engine-core.
//
// node engine/render.js --episode episodes/<slug>/episode.json --timeline build/<slug>/timeline.json \
//      [--out build/<slug>/shots] [--only 001,002,010-014] [--quality preview|final] [--workers 2] [--force]
//      [--crf 18] [--preset medium] [--jpeg 0.92] [--no-code-hash] [--dry-run] [--restart-every 20]
//
// Writes one silent H.264 MP4 per shot (exactly `frames` frames, t = frame / fps), verifies frame counts with
// ffprobe, skips shots that are up to date (content hash of the resolved shot + frame count + engine code), and
// writes build/<slug>/render_report.json. One failing shot never stops the run (exit code 1 if any failed).
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');
const { openRuntime, dataUrlToBuffer, parseArgs, resolveShot } = require('./browser');
const { start: startServer, ROOT } = require('./server');

const args = parseArgs();
const die = (m) => { console.error('render: ' + m); process.exit(2); };
if (!args.episode || args.episode === true) die('usage: node engine/render.js --episode <episode.json> --timeline <timeline.json> [--out dir] [--only ids] [--quality preview|final] [--workers N] [--force]');

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { die(`cannot read ${f}: ${e.message}`); } };
const episodePath = path.resolve(args.episode);
const episode = readJson(episodePath);
const slug = String(episode.id || path.basename(path.dirname(episodePath)));
const timelinePath = args.timeline && args.timeline !== true ? path.resolve(args.timeline) : path.join(ROOT, 'build', slug, 'timeline.json');
let timeline;
if (fs.existsSync(timelinePath)) timeline = readJson(timelinePath);
else {
  console.warn(`render: timeline ${timelinePath} not found → synthesising one from shot durations (1.5 s default)`);
  let t = 0; const shots = [];
  for (const s of episode.shots || []) { const f = Math.max(1, Math.round((s.duration > 0 ? s.duration : 1.5) * 30)); shots.push({ id: s.id, start: t, end: t + f / 30, frames: f }); t += f / 30; }
  timeline = { fps: 30, width: 720, height: 1280, duration: t, shots };
}
const fps = Number(args.fps) || timeline.fps || 30;
const width = Number(args.width) || timeline.width || 720;
const height = Number(args.height) || timeline.height || 1280;
const quality = args.quality === 'preview' ? 'preview' : 'final';
const workersN = Math.max(1, Math.min(8, Number(args.workers) || 2));
const crf = Number(args.crf) || 18;
const preset = typeof args.preset === 'string' ? args.preset : (quality === 'preview' ? 'veryfast' : 'medium');
const jpegQ = Math.min(1, Math.max(0.3, Number(args.jpeg) || 0.92));
const restartEvery = Number(args['restart-every']) || 20;
const outDir = path.resolve(args.out && args.out !== true ? args.out : path.join(ROOT, 'build', slug, 'shots'));
const reportPath = path.join(path.dirname(outDir), 'render_report.json');
const metaDir = path.join(outDir, '.meta');
fs.mkdirSync(metaDir, { recursive: true });

// ---------------------------------------------------------------- shot selection
function parseOnly(s) {
  if (!s || s === true) return null;
  const set = new Set();
  for (const part of String(s).split(',').map((x) => x.trim()).filter(Boolean)) {
    const m = /^(\d+)-(\d+)$/.exec(part);
    if (m) { const w = m[1].length; for (let i = +m[1]; i <= +m[2]; i++) set.add(String(i).padStart(w, '0')); } else set.add(part);
  }
  return set;
}
const only = parseOnly(args.only);
const tlById = new Map((timeline.shots || []).map((s) => [String(s.id), s]));
const epShots = Array.isArray(episode.shots) ? episode.shots : [];
for (const id of tlById.keys()) if (!epShots.some((s) => String(s.id) === id)) console.warn(`render: timeline shot ${id} is not in the episode (ignored)`);

// engine code hash: any change to the runtime / modules invalidates rendered shots
function codeHash() {
  const h = crypto.createHash('sha1');
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|mjs|html|json|glsl)$/.test(f.name)) { h.update(path.relative(ROOT, p)); h.update(fs.readFileSync(p)); } } };
  walk(path.join(ROOT, 'engine', 'web'));
  return h.digest('hex').slice(0, 12);
}
const CODE = args['no-code-hash'] ? 'any' : codeHash();

const jobs = [];
for (const s of epShots) {
  const id = String(s.id);
  if (only && !only.has(id)) continue;
  let tl = tlById.get(id);
  const warnings = [];
  if (!tl) { const f = Math.max(1, Math.round((s.duration > 0 ? s.duration : 1.5) * fps)); tl = { id, frames: f }; warnings.push(`shot ${id} not in timeline → ${f} frames`); }
  const frames = Math.max(1, Math.round(Number(tl.frames) || ((tl.end - tl.start) * fps) || 45));
  const r = resolveShot(episode, s, { frames, fps });
  warnings.push(...r.warnings);
  const hash = crypto.createHash('sha1').update(JSON.stringify({ shot: r.shot, frames, fps, width, height, quality, crf, jpegQ, code: CODE })).digest('hex').slice(0, 16);
  jobs.push({ id, frames, shot: r.shot, hash, warnings, file: path.join(outDir, `${id}.mp4`), meta: path.join(metaDir, `${id}.json`) });
}
if (only) for (const id of only) if (!jobs.some((j) => j.id === id)) console.warn(`render: --only ${id}: no such shot`);

function upToDate(j) {
  if (args.force) return false;
  if (!fs.existsSync(j.file)) return false;
  if (fs.existsSync(j.meta)) { try { const m = JSON.parse(fs.readFileSync(j.meta, 'utf8')); return m.hash === j.hash && m.frames === j.frames; } catch (e) { return false; } }
  const t = fs.statSync(j.file).mtimeMs; // no meta (rendered elsewhere): fall back to mtimes
  return t > fs.statSync(episodePath).mtimeMs && (!fs.existsSync(timelinePath) || t > fs.statSync(timelinePath).mtimeMs);
}

// ---------------------------------------------------------------- helpers
function ffprobeFrames(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets,width,height,avg_frame_rate', '-of', 'json', file]).toString();
  const s = JSON.parse(out).streams[0] || {};
  return { frames: Number(s.nb_read_packets), width: s.width, height: s.height, rate: s.avg_frame_rate };
}
const fmtT = (s) => (!isFinite(s) ? '?' : s >= 3600 ? `${Math.floor(s / 3600)}h${String(Math.floor(s / 60) % 60).padStart(2, '0')}m` : s >= 60 ? `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, '0')}s` : `${s.toFixed(0)}s`);
const withTimeout = (p, ms, what) => { let h; return Promise.race([p, new Promise((_, rej) => { h = setTimeout(() => rej(new Error(`timeout after ${ms / 1000}s: ${what}`)), ms); })]).finally(() => clearTimeout(h)); };

const report = {
  episode: path.relative(ROOT, episodePath), timeline: path.relative(ROOT, timelinePath), slug, out: path.relative(ROOT, outDir),
  started: new Date().toISOString(), finished: null, fps, width, height, quality, workers: workersN, crf, preset, code: CODE,
  totals: {}, shots: [],
};
const results = new Map();
function writeReport() {
  report.shots = jobs.map((j) => results.get(j.id) || { id: j.id, status: 'pending', frames: j.frames });
  const done = report.shots.filter((r) => r.status === 'ok');
  report.totals = {
    shots: jobs.length, ok: done.length, skipped: report.shots.filter((r) => r.status === 'skipped').length,
    error: report.shots.filter((r) => r.status === 'error').length,
    framesRendered: done.reduce((a, r) => a + r.frames, 0),
    msPerFrame: done.length ? Math.round(done.reduce((a, r) => a + r.ms, 0) / Math.max(1, done.reduce((a, r) => a + r.frames, 0))) : null,
    wallSeconds: +((Date.now() - T0) / 1000).toFixed(1),
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
}

// ---------------------------------------------------------------- render one shot
let framesDone = 0, framesTodo = 0;
const T0 = Date.now();
const live = new Set(); // running ffmpeg processes (killed on SIGINT)

async function renderShot(rt, j, tag) {
  const t0 = Date.now();
  const logStart = rt.logs.length;
  const tmp = j.file.replace(/\.mp4$/, `.tmp${process.pid}.mp4`);
  let ff = null, ffErr = '';
  try {
    const info = await withTimeout(rt.page.evaluate((s) => window.engine.loadShot(s), j.shot), 180000, 'loadShot');
    const loadMs = Date.now() - t0;
    ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', preset, '-pix_fmt', 'yuv420p', '-crf', String(crf), '-r', String(fps),
      '-frames:v', String(j.frames), '-movflags', '+faststart', '-an', tmp], { stdio: ['pipe', 'ignore', 'pipe'] });
    live.add(ff);
    ff.stderr.on('data', (d) => { ffErr += d.toString(); });
    const ffDone = new Promise((res) => ff.on('close', (code) => res(code)));
    ff.stdin.on('error', () => {}); // EPIPE is reported through the exit code
    let lastLog = Date.now();
    const tr = Date.now();
    for (let i = 0; i < j.frames; i++) {
      const url = await withTimeout(rt.page.evaluate(([t, q]) => window.engine.renderFrame(t, 'image/jpeg', q), [i / fps, jpegQ]), 120000, `frame ${i}`);
      const buf = dataUrlToBuffer(url);
      if (!buf.length) throw new Error(`empty frame ${i}`);
      if (ff.exitCode !== null) throw new Error(`ffmpeg exited early: ${ffErr.trim()}`);
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      framesDone++;
      if (Date.now() - lastLog > 8000) {
        lastLog = Date.now();
        const msf = (Date.now() - tr) / (i + 1);
        const rate = framesDone / ((Date.now() - T0) / 1000);
        console.log(`${tag} ${j.id} ${i + 1}/${j.frames} frames  ${msf.toFixed(0)} ms/f  | total ${framesDone}/${framesTodo}  ETA ${fmtT((framesTodo - framesDone) / rate)}`);
      }
    }
    ff.stdin.end();
    const code = await ffDone; live.delete(ff);
    if (code !== 0) throw new Error(`ffmpeg failed (${code}): ${ffErr.trim().slice(-400)}`);
    const probe = ffprobeFrames(tmp);
    if (probe.frames !== j.frames) throw new Error(`frame count mismatch: ffprobe ${probe.frames} ≠ ${j.frames}`);
    if (probe.width !== width || probe.height !== height) throw new Error(`size mismatch: ${probe.width}x${probe.height}`);
    fs.renameSync(tmp, j.file);
    const ms = Date.now() - t0;
    const warnings = [...new Set([...j.warnings, ...(info && info.warnings ? info.warnings : []),
      ...rt.logs.slice(logStart).filter((l) => /^\[(warning|error|pageerror)/.test(l)).map((l) => l.replace(/^\[\w+\]\s*/, '')).filter((l) => !l.startsWith('[engine]'))])].slice(0, 50);
    const rec = { id: j.id, status: 'ok', frames: j.frames, probedFrames: probe.frames, ms, loadMs, msPerFrame: Math.round((ms - loadMs) / j.frames), file: path.relative(ROOT, j.file), camera: info && info.camera, warnings };
    fs.writeFileSync(j.meta, JSON.stringify({ hash: j.hash, frames: j.frames, rendered: new Date().toISOString(), ms }, null, 1));
    return rec;
  } catch (e) {
    if (ff) { try { ff.kill('SIGKILL'); } catch (err) { /* */ } live.delete(ff); }
    try { fs.unlinkSync(tmp); } catch (err) { /* */ }
    const err = new Error(e.message); err.logs = rt.logs.slice(logStart).slice(-25); throw err;
  }
}

// ---------------------------------------------------------------- main
(async () => {
  const todo = [];
  for (const j of jobs) {
    if (upToDate(j)) results.set(j.id, { id: j.id, status: 'skipped', frames: j.frames, file: path.relative(ROOT, j.file), reason: 'up to date' });
    else todo.push(j);
  }
  framesTodo = todo.reduce((a, j) => a + j.frames, 0);
  console.log(`render: ${slug}: ${jobs.length} shots (${todo.length} to render, ${jobs.length - todo.length} up to date), ${framesTodo} frames, ${width}x${height}@${fps}, quality=${quality}, workers=${Math.min(workersN, todo.length || 1)}, code=${CODE}`);
  if (args['dry-run']) { for (const j of jobs) console.log(`  ${j.id}  ${j.frames} frames  ${todo.includes(j) ? 'RENDER' : 'skip'}  ${j.warnings.join('; ')}`); return; }
  writeReport();
  if (!todo.length) { report.finished = new Date().toISOString(); writeReport(); console.log(`render: nothing to do → ${path.relative(process.cwd(), reportPath)}`); return; }

  const server = await startServer(0);
  const queue = todo.slice();
  const runtimes = new Set();
  let stopping = false;
  process.on('SIGINT', async () => {
    if (stopping) process.exit(130); stopping = true;
    console.log('render: interrupted — cleaning up');
    for (const f of live) try { f.kill('SIGKILL'); } catch (e) { /* */ }
    for (const r of runtimes) await r.close().catch(() => {});
    report.finished = new Date().toISOString(); report.interrupted = true; writeReport(); process.exit(130);
  });

  async function worker(wi) {
    const tag = `[w${wi}]`;
    let rt = null, count = 0;
    while (queue.length && !stopping) {
      const j = queue.shift();
      try {
        if (!rt || count >= restartEvery) {
          if (rt) { runtimes.delete(rt); await rt.close(); }
          rt = await openRuntime({ width, height, quality, server, options: { quality, jpegQuality: jpegQ } }); runtimes.add(rt); count = 0;
        }
        console.log(`${tag} ${j.id} start (${j.frames} frames)`);
        const rec = await renderShot(rt, j, tag);
        results.set(j.id, rec);
        console.log(`${tag} ${j.id} ok  ${j.frames} frames  ${(rec.ms / 1000).toFixed(1)}s  (${rec.msPerFrame} ms/f, load ${rec.loadMs} ms)${rec.warnings.length ? `  ${rec.warnings.length} warning(s)` : ''}`);
      } catch (e) {
        results.set(j.id, { id: j.id, status: 'error', frames: j.frames, error: e.message, logs: e.logs || [], warnings: j.warnings });
        console.error(`${tag} ${j.id} ERROR: ${e.message}`);
        if (e.logs && e.logs.length) console.error(e.logs.slice(-8).map((l) => `${tag}    ${l}`).join('\n'));
        if (rt) { runtimes.delete(rt); await rt.close().catch(() => {}); rt = null; } // fresh browser after any failure
      }
      count++;
      writeReport();
    }
    if (rt) { runtimes.delete(rt); await rt.close().catch(() => {}); }
  }
  await Promise.all(Array.from({ length: Math.min(workersN, todo.length) }, (_, i) => worker(i + 1)));
  server.server.close();
  report.finished = new Date().toISOString();
  writeReport();
  const tt = report.totals;
  console.log(`render: done in ${fmtT(tt.wallSeconds)} — ok ${tt.ok}, skipped ${tt.skipped}, errors ${tt.error}; ${tt.framesRendered} frames, ${tt.msPerFrame ?? '-'} ms/frame per worker → ${path.relative(process.cwd(), reportPath)}`);
  process.exitCode = tt.error ? 1 : 0;
})().catch((e) => { console.error('render: fatal', e); process.exit(1); });
