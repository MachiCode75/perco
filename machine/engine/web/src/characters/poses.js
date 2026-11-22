// Pose library. Each pose is a pure function of time → joint targets (deterministic, smooth).
// Arms are given as direction vectors (shoulder → hand) in upper-body space: +x = character's left,
// +y = up, +z = forward. Legs use Euler rotations at the hip (rx < 0 swings the leg forward).
// Body space: origin at feet, hips pivot at y = 2, shoulders at (±1.5, 3.5).

const TAU = Math.PI * 2;
const S = Math.sin, C = Math.cos;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const frac = (x) => x - Math.floor(x);
const lerp = (a, b, k) => a + (b - a) * k;
const lerp3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : (typeof v === 'string' && v.trim() !== '' && isFinite(+v) ? +v : d);
/** Contact pulse in 0..1 (1 = the hand touches the surface): accelerating approach, eased rebound. */
function hitPulse(t, hz, at = 0.35) { const u = frac(t * hz); return u < at ? (u / at) * (u / at) : 1 - ease((u - at) / (1 - at)); }
/** Shot-relative time for one-shot / counted actions (opts.T is the raw shot time, opts.at a start delay). */
const shotT = (t, o) => num(o.T, t) - num(o.at, 0);
const sideOf = (o) => (o.side === 'left' ? -1 : 1);
/** body-space direction → upper-body-space direction when the torso is pitched forward by rx */
function unpitch(rx, d) { const c = C(rx), s = S(rx); return [d[0], d[1] * c + d[2] * s, -d[1] * s + d[2] * c]; }
/** Put a right-arm direction (and shoulder offset) on the acting arm; the other arm relaxes. side:'left' mirrors. */
function oneArm(J, o, d, off = null, rest = [-0.07, -1, 0.04]) {
  if (o.side === 'left') { J.armL = mirror(d); J.armR = rest; if (off) J.offL = [-off[0], off[1], off[2]]; }
  else { J.armR = d; J.armL = mirror(rest); if (off) J.offR = off; }
}

/** arm direction from a forward swing angle a (rad, + = forward) and outward lean */
const swing = (a, out = 0.06) => [out, -C(a), S(a)];
/** direction from shoulder (side s=+1 left/-1 right) toward a body-space point */
function toward(s, x, y, z) { return [x - 1.5 * s, y - 3.5, z]; }

export function basePose() {
  return {
    body: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
    hips: { y: 2, rx: 0, rz: 0 },
    upper: { rx: 0, ry: 0, rz: 0, y: 0 },
    neck: { rx: 0, ry: 0, rz: 0 },
    armL: [0.05, -1, 0], armR: [-0.05, -1, 0],
    legL: { rx: 0, ry: 0, rz: 0 }, legR: { rx: 0, ry: 0, rz: 0 },
    twistL: 0, twistR: 0,
  };
}

function breathe(J, t, k = 1) {
  J.upper.y += 0.018 * k * S(TAU * t / 3.4);
  J.armL[0] += 0.02 * k * S(TAU * t / 3.4 + 0.6);
  J.armR[0] -= 0.02 * k * S(TAU * t / 3.4 + 0.6);
  J.neck.rx += 0.012 * k * S(TAU * t / 3.4 + 1.1);
}
function mirror(d) { return [-d[0], d[1], d[2]]; }

// opts: { side: 'right'|'left', speed, seat, at, face, amplitude }
export const POSE_FN = {
  stand(J, t) { breathe(J, t); },
  idle(J, t) {
    breathe(J, t, 1.3);
    J.armL = [0.14, -1, 0.03]; J.armR = [-0.14, -1, 0.03];
    J.neck.ry = 0.12 * S(TAU * t / 5.5); J.neck.rx += 0.03 * S(TAU * t / 7);
    J.hips.rz = 0.025 * S(TAU * t / 4.2); J.upper.rz = -0.03 * S(TAU * t / 4.2);
    J.legL.rz = 0.03 * S(TAU * t / 4.2); J.legR.rz = 0.03 * S(TAU * t / 4.2);
  },
  wave(J, t, o) {
    breathe(J, t);
    const a = 2.55 + 0.32 * S(TAU * 2.1 * t);
    const up = [-S(a), -C(a), 0.22];
    if (o.side === 'left') { J.armL = mirror(up); J.armR = [-0.08, -1, 0.02]; }
    else { J.armR = up; J.armL = [0.08, -1, 0.02]; }
    J.neck.rz = (o.side === 'left' ? -1 : 1) * 0.06; J.neck.rx = -0.04;
    J.upper.rz = 0.02 * S(TAU * 2.1 * t);
  },
  walk(J, t, o) {
    const sp = num(o.speed, 1), ph = TAU * 1.6 * sp * t, A = 0.6 * num(o.amplitude, 1);
    J.legL.rx = -A * S(ph); J.legR.rx = A * S(ph);
    J.armL = swing(-A * 0.95 * S(ph), 0.06); J.armR = swing(A * 0.95 * S(ph), -0.06);
    J.hips.y = 2 + 0.07 * Math.abs(C(ph));
    J.upper.ry = 0.05 * S(ph); J.neck.ry = -0.04 * S(ph);
  },
  run(J, t, o) {
    const sp = num(o.speed, 1), ph = TAU * 2.5 * sp * t, A = 1.0 * num(o.amplitude, 1);
    J.legL.rx = -A * S(ph); J.legR.rx = A * S(ph);
    J.armL = swing(-1.15 * S(ph), 0.12); J.armR = swing(1.15 * S(ph), -0.12);
    J.hips.y = 2 + 0.22 * Math.abs(C(ph)); J.upper.rx = 0.2; J.neck.rx = -0.12;
    J.upper.ry = 0.08 * S(ph);
  },
  sit(J, t, o) {
    breathe(J, t, 0.8);
    const seat = o.seat == null ? 1.5 : num(o.seat, 1.5);
    J.hips.y = seat + 0.5; J.seated = true;
    J.legL.rx = J.legR.rx = -Math.PI / 2;
    J.legL.rz = 0.03; J.legR.rz = -0.03;
    J.armL = [0.06, -0.62, 0.78]; J.armR = [-0.06, -0.62, 0.78];
  },
  binoculars(J, t) {
    breathe(J, t, 0.5);
    J.armL = toward(1, 0.78, 4.62, 1.2); J.armR = toward(-1, -0.78, 4.62, 1.2);
    J.twistL = -0.15; J.twistR = 0.15;
    J.neck.rx = -0.04 + 0.015 * S(TAU * t / 2.7); J.neck.ry = 0.05 * S(TAU * t / 4.1);
  },
  hold_sign(J, t) {
    breathe(J, t, 0.7);
    J.armL = [0.03, -0.17, 1]; J.armR = [-0.03, -0.17, 1];
    J.upper.y += 0.03 * S(TAU * t / 1.9);
  },
  point(J, t, o) {
    breathe(J, t);
    const d = [-0.28, 0.08 + 0.02 * S(TAU * t / 1.7), 1];
    if (o.side === 'left') { J.armL = mirror(d); J.armR = [-0.06, -1, 0.02]; J.neck.ry = 0.12; }
    else { J.armR = d; J.armL = [0.06, -1, 0.02]; J.neck.ry = -0.12; }
  },
  arms_up(J, t) {
    const w = 0.12 * S(TAU * 1.6 * t);
    J.armL = [0.42 + w, 1, 0.1]; J.armR = [-0.42 + w, 1, 0.1];
    J.hips.y = 2 + 0.05 * Math.abs(S(TAU * 1.6 * t)); J.neck.rx = -0.08;
  },
  hug(J, t) {
    breathe(J, t, 0.8);
    J.armL = [-0.55, -0.12, 0.85]; J.armR = [0.55, -0.12, 0.85];
    J.twistL = 0.5; J.twistR = -0.5;
    J.neck.rz = 0.1; J.neck.rx = 0.08; J.upper.rx = 0.06;
  },
  cry(J, t) {
    J.armL = toward(1, 0.95, 4.25, 1.05); J.armR = toward(-1, -0.95, 4.25, 1.05);
    J.twistL = -0.25; J.twistR = 0.25;
    const sob = S(TAU * 3.2 * t);
    J.neck.rx = 0.16 + 0.05 * sob; J.upper.rx = 0.07 + 0.02 * sob;
    J.upper.rz = 0.025 * S(TAU * 7 * t); J.upper.y = 0.03 * Math.abs(sob);
  },
  shrug(J, t) {
    const k = 0.5 + 0.5 * S(TAU * t / 1.6);
    J.armL = [0.75, -0.4 + 0.12 * k, 0.5]; J.armR = [-0.75, -0.4 + 0.12 * k, 0.5];
    J.twistL = 0.6; J.twistR = -0.6;
    J.neck.rz = 0.14; J.upper.y = 0.05 * k;
  },
  look_down(J, t) {
    breathe(J, t);
    J.neck.rx = 0.42; J.upper.rx = 0.1; J.armL = [0.06, -1, 0.14]; J.armR = [-0.06, -1, 0.14];
  },
  lie(J, t, o) {
    const faceDown = o.face === 'down';
    J.body.rx = faceDown ? Math.PI / 2 : -Math.PI / 2; J.body.y = 0.5;
    J.armL = [0.22, -1, 0]; J.armR = [-0.22, -1, 0];
    J.upper.y = 0.012 * S(TAU * t / 3.6);
    J.legL.rz = 0.05; J.legR.rz = -0.05;
  },
  fall(J, t, o) {
    const t0 = num(o.at, 0), dur = Math.max(0.05, num(o.duration, 0.65));
    const k = clamp01((t - t0) / dur), p = k * k;
    const dirn = o.direction === 'forward' ? 1 : -1;
    J.body.rx = dirn * p * Math.PI / 2; J.body.y = 0.5 * p;
    const fl = (1 - k) * 0.35;
    J.armL = [0.6, 0.55 + fl * S(TAU * 4 * t), 0.25]; J.armR = [-0.6, 0.55 - fl * S(TAU * 4 * t + 1), 0.25];
    if (k >= 1) { J.armL = [0.75, 0.35, 0.1]; J.armR = [-0.75, 0.35, 0.1]; }
    J.legL.rx = -0.35 * (1 - p) * S(TAU * 3 * t) - 0.2 * (1 - k); J.legR.rx = 0.35 * (1 - p) * S(TAU * 3 * t);
    J.neck.rx = dirn * -0.2 * (1 - k);
  },
  jump(J, t, o) {
    const P = Math.max(0.2, num(o.period, 0.8)), ph = ((t % P) + P) % P / P;
    const h = 4 * num(o.height, 1.3) * ph * (1 - ph);
    J.body.y = h;
    const air = Math.min(1, h / 0.6);
    J.armL = [0.35 + 0.3 * air, -1 + 1.9 * air, 0.15]; J.armR = [-0.35 - 0.3 * air, -1 + 1.9 * air, 0.15];
    J.legL.rx = -0.3 * air; J.legR.rx = 0.2 * air; J.legL.rz = 0.08 * air; J.legR.rz = -0.08 * air;
  },
  talk(J, t, o) {
    breathe(J, t);
    J.neck.rx = 0.035 * S(TAU * 2.3 * t) + 0.02 * S(TAU * 3.7 * t + 1);
    J.neck.ry = 0.06 * S(TAU * 0.7 * t);
    const g = 0.5 + 0.5 * S(TAU * 0.9 * t);
    const d = [-0.25, -0.75 + 0.25 * g, 0.6];
    if (o.side === 'left') { J.armL = mirror(d); J.armR = [-0.08, -1, 0.04]; }
    else { J.armR = d; J.armL = [0.08, -1, 0.04]; }
  },
  wade(J, t, o) {
    const ph = TAU * 0.75 * num(o.speed, 1) * t;
    J.legL.rx = -0.22 * S(ph); J.legR.rx = 0.22 * S(ph);
    J.armL = [0.62, -0.55 + 0.06 * S(ph), 0.3]; J.armR = [-0.62, -0.55 - 0.06 * S(ph), 0.3];
    J.upper.rz = 0.04 * S(ph); J.hips.y = 2 + 0.04 * Math.abs(C(ph));
  },
  carry(J, t, o) { // opts.narrow (set automatically for small held props): hands meet in front of the chest around the prop
    breathe(J, t, 0.7);
    if (o.narrow) { J.armL = [-0.62, -0.42, 0.92]; J.armR = [0.62, -0.42, 0.92]; J.twistL = 0.2; J.twistR = -0.2; }
    else { J.armL = [-0.02, -0.42, 0.92]; J.armR = [0.02, -0.42, 0.92]; }
    J.upper.rx = -0.04;
  },
  // ---- v2: creepy / creature poses (work for every humanoid)
  reach(J, t, o) {
    const w = 0.06 * S(TAU * 0.45 * t);
    J.armL = [0.12, 0.12 + w, 1]; J.armR = [-0.12, 0.12 - w, 1];
    J.upper.rx = 0.12; J.neck.rz = 0.12 * S(TAU * 0.2 * t); J.neck.rx = -0.05;
    J.upper.y = 0.02 * S(TAU * t / 3);
  },
  loom(J, t, o) {
    J.upper.rx = 0.42 + 0.03 * S(TAU * t / 3.2); J.neck.rx = -0.28;
    J.armL = [0.18, -1, 0.55 + 0.05 * S(TAU * t / 2.6)]; J.armR = [-0.18, -1, 0.55 + 0.05 * S(TAU * t / 2.6 + 1)];
    J.hips.rz = 0.03 * S(TAU * t / 4);
  },
  lean(J, t, o) {
    const s = o.side === 'left' ? -1 : 1;
    J.upper.rz = s * (0.28 + 0.02 * S(TAU * t / 3)); J.neck.rz = s * 0.35; J.hips.rz = s * 0.04;
    J.armL = [0.05 + s * 0.25, -1, 0.02]; J.armR = [-0.05 + s * 0.25, -1, 0.02];
  },
  hunch(J, t) { // furry giant idle: gorilla sway
    const k = S(TAU * t / 3.4);
    J.upper.rx = 0.22; J.neck.rx = -0.18; J.hips.rz = 0.04 * k; J.upper.rz = -0.05 * k;
    J.armL = [0.16, -1, 0.22 + 0.06 * S(TAU * t / 2.7)]; J.armR = [-0.16, -1, 0.22 + 0.06 * S(TAU * t / 2.7 + 1.4)];
    J.upper.y = 0.04 * S(TAU * t / 3.4 + 0.8); J.neck.ry = 0.1 * S(TAU * t / 6.5);
  },
  lumber(J, t, o) { // heavy slow walk with side rocking (big stride + arm swing so it reads under the fur)
    const ph = TAU * 0.85 * num(o.speed, 1) * t, A = 0.58 * num(o.amplitude, 1), sp = S(ph);
    J.legL.rx = -A * sp; J.legR.rx = A * sp; J.legDrop = 1 - C(A * sp) - 0.05 * Math.abs(C(ph));
    J.armL = swing(-0.6 * sp + 0.2, 0.16); J.armR = swing(0.6 * sp + 0.2, -0.16);
    J.hips.rz = 0.08 * sp; J.upper.rz = -0.05 * sp; J.upper.rx = 0.26; J.neck.rx = -0.22; J.upper.ry = 0.1 * sp;
  },
  arms_out(J, t) { // scarecrow on a post
    J.armL = [1, -0.12, 0.02]; J.armR = [-1, -0.12, 0.02];
    J.neck.rz = 0.32 + 0.03 * S(TAU * t / 5); J.neck.rx = 0.12; J.legL.rz = 0.02; J.legR.rz = -0.02;
  },
  // ---- v3: action poses (shot-relative ones read opts.T = raw shot time, opts.at = start delay)
  tap(J, t, o) { // knuckle-tap on a window at face height, ~3 Hz; opts: rate, times, side, at
    breathe(J, t, 0.6);
    const T = shotT(t, o), hz = num(o.rate, 3);
    let k = T < 0 ? 0 : hitPulse(T, hz, 0.4);
    if (num(o.times, 0) > 0 && T * hz >= num(o.times, 0)) k = 0;
    const e = 0.36 + 0.14 * (1 - k), s = sideOf(o);
    oneArm(J, o, [0.16, S(e), C(e)], [0, 0, 0.2 * k]);
    J.upper.rx = 0.05 + 0.04 * k; J.upper.ry = s * 0.14; J.neck.ry = -s * 0.1; J.neck.rx = -0.1 + 0.03 * k;
  },
  knock(J, t, o) { // fist knocking forward (door), ~3 knocks/s; opts: rate, times, side, at
    breathe(J, t, 0.5);
    const T = shotT(t, o), hz = num(o.rate, 3);
    let k = T < 0 ? 0 : hitPulse(T, hz, 0.45);
    if (num(o.times, 0) > 0 && T * hz >= num(o.times, 0)) k = 0;
    const e = 0.1 + 0.3 * (1 - k), s = sideOf(o);
    oneArm(J, o, [0.22, S(e), C(e)], [0, 0.05 * (1 - k), -0.15 + 0.42 * k], [-0.1, -1, 0.15]);
    J.upper.ry = s * (0.1 + 0.1 * k); J.upper.rx = 0.03 + 0.05 * k; J.neck.ry = -s * 0.12; J.neck.rx = -0.03;
  },
  hammer(J, t, o) { // right arm hammering at chest height ~2.5 Hz (pairs with the held prop 'hammer'); the other hand holds the nail
    breathe(J, t, 0.5);
    const T = shotT(t, o), hz = num(o.rate, 2.5), u = frac(Math.max(0, T) * hz);
    let e, hit = 0;
    if (u < 0.55) e = -0.12 + 0.97 * ease(u / 0.55);
    else if (u < 0.72) { const v = (u - 0.55) / 0.17; e = 0.85 - 1.0 * v * v; }
    else { const v = (u - 0.72) / 0.28; e = -0.15 + 0.03 * ease(v); hit = 1 - v; }
    const s = sideOf(o);
    oneArm(J, o, [0.2, S(e), C(e)], [0, 0, 0.06 * hit]);
    const hold = toward(1, 0.15, 3.2, 1.45);
    if (s > 0) J.armL = hold; else J.armR = mirror(hold);
    J.upper.rx = 0.06 + 0.04 * hit; J.upper.ry = s * 0.12; J.neck.rx = 0.04; J.neck.ry = -s * 0.06;
    J.upper.y += 0.015 * hit;
  },
  pull_curtain(J, t, o) { // both hands sweep from the sides to the middle (closing); opts: direction 'open', side (one hand), period, at
    breathe(J, t, 0.5);
    const T = Math.max(0, shotT(t, o)), P = Math.max(1.2, num(o.period, 1.8)), u = frac(T / P) * P;
    let k = u < 0.85 ? ease(u / 0.85) : u < P - 0.35 ? 1 : 1 - ease((u - (P - 0.35)) / 0.35);
    if (o.direction === 'open') k = 1 - k;
    const e = 0.32 + 0.05 * S(Math.PI * k), ce = C(e), se = S(e);
    const psi = lerp(1.0, -0.5, k); // left-arm yaw (+ = out to the side)
    const dL = [S(psi) * ce, se, C(psi) * ce];
    if (o.side === 'left' || o.side === 'right') { const rest = [0.07, -1, 0.06]; if (o.side === 'left') { J.armL = dL; J.armR = mirror(rest); } else { J.armR = mirror(dL); J.armL = rest; } }
    else { J.armL = dL; J.armR = mirror(dL); }
    J.upper.rx = 0.04 + 0.05 * S(Math.PI * k); J.neck.rx = -0.08; J.upper.y += 0.03 * S(Math.PI * k);
    J.upper.ry = o.side === 'left' ? -0.12 : o.side === 'right' ? 0.12 : 0;
  },
  peek(J, t, o) { // lean sideways (~15°), head tilted, peeking through a gap; one hand holds the edge; opts: side
    const s = sideOf(o), k = 0.5 + 0.5 * S(TAU * num(o.T, t) / 2.6 - 1.2);
    J.upper.rz = s * (0.22 + 0.07 * k); J.hips.rz = s * 0.05; J.body.x = -s * 0.14 * k; J.upper.rx = 0.08;
    J.neck.rz = s * (0.26 + 0.08 * k); J.neck.ry = s * 0.1; J.neck.rx = 0.02;
    const edge = toward(-1, -1.05, 4.7, 1.25);
    if (s > 0) { J.armR = edge; J.armL = [0.06, -1, 0.1]; } else { J.armL = mirror(edge); J.armR = [-0.06, -1, 0.1]; }
    J.legL.rz = 0.03; J.legR.rz = -0.03;
  },
  nod(J, t, o) {
    breathe(J, t);
    const w = S(TAU * num(o.rate, 1.8) * t);
    J.neck.rx = 0.1 + 0.17 * w; J.upper.rx = 0.015 * w;
    J.armL = [0.08, -1, 0.03]; J.armR = [-0.08, -1, 0.03];
  },
  shake_head(J, t, o) {
    breathe(J, t);
    const w = S(TAU * num(o.rate, 2.2) * t);
    J.neck.ry = 0.4 * w; J.neck.rx = 0.07; J.upper.ry = -0.035 * w;
    J.armL = [0.08, -1, 0.03]; J.armR = [-0.08, -1, 0.03];
  },
  look_around(J, t, o) { // nervous: head darts left↔right and dwells, torso follows a little, hands clasped
    breathe(J, t, 1.2);
    const f = num(o.rate, 0.42), sq = (x) => Math.tanh(2.6 * x) / Math.tanh(2.6);
    const a = sq(S(TAU * f * t)), b = sq(S(TAU * f * t - 0.5));
    J.neck.ry = 0.62 * a; J.upper.ry = 0.16 * b; J.neck.rx = -0.03 + 0.05 * S(TAU * 0.9 * t);
    J.armL = toward(1, 0.72, 2.95, 1.0); J.armR = toward(-1, -0.72, 2.95, 1.0); J.twistL = -0.3; J.twistR = 0.3;
    J.upper.rx = 0.05; J.upper.rz = 0.008 * S(TAU * 8.5 * t);
  },
  rock(J, t, o) { // gentle soothing side-to-side rocking, arms cradling (humming)
    const ph = TAU * t / Math.max(0.6, num(o.period, 1.9)), w = S(ph);
    J.upper.rz = 0.075 * w; J.hips.rz = -0.02 * w; J.body.x = 0.05 * w;
    J.neck.rz = 0.1 * S(ph - 0.5); J.neck.rx = 0.12; J.upper.y = 0.02 * S(2 * ph);
    J.armL = [-0.5, -0.55, 0.75]; J.armR = [0.5, -0.55, 0.75]; J.twistL = 0.4; J.twistR = -0.4;
  },
  sit_rock(J, t, o) { // seated forward/back rocking (humming in the dark); opts: seat, period
    POSE_FN.sit(J, t, o);
    const ph = TAU * t / Math.max(0.6, num(o.period, 2.0)), w = S(ph);
    J.upper.rx = 0.14 + 0.13 * w; J.neck.rx = 0.06 - 0.09 * w; J.upper.rz = 0.03 * S(ph * 0.5); J.neck.rz = 0.09 * S(ph - 0.6);
    J.armL = [-0.28, -0.62, 0.75]; J.armR = [0.28, -0.62, 0.75]; J.twistL = 0.3; J.twistR = -0.3;
  },
  offer(J, t) { // both arms forward at chest height, hands together, holding out the prop
    breathe(J, t, 0.6);
    const b = 0.035 * S(TAU * t / 1.7);
    J.armL = [-0.68, -0.12 + b, 1]; J.armR = [0.68, -0.12 + b, 1]; J.twistL = 0.25; J.twistR = -0.25;
    J.upper.rx = 0.09; J.neck.rx = 0.06; J.offL = [0, 0, 0.12]; J.offR = [0, 0, 0.12];
  },
  count(J, t, o) { // pointing hand jumps across n positions (3–7) over the shot; opts: n, interval, spread, side, at
    breathe(J, t, 0.6);
    const n = Math.max(1, Math.min(12, Math.round(num(o.n ?? o.count, 5)))), iv = Math.max(0.15, num(o.interval, 0.42)), spread = num(o.spread, 1.15);
    const T = shotT(t, o), f = Math.max(0, T / iv), i = Math.min(n - 1, Math.floor(f)), u = f >= n ? 1 : f - Math.floor(f);
    const pos = (j) => (n === 1 ? 0 : -spread / 2 + spread * j / (n - 1));
    const m = i === 0 ? 1 : ease(u / 0.3), phi = lerp(pos(Math.max(0, i - 1)), pos(i), m);
    const jab = T < 0 || f >= n + 0.5 ? 0 : (u > 0.28 ? S(Math.PI * clamp01((u - 0.28) / 0.4)) : 0);
    const s = sideOf(o), e = 0.1 + 0.07 * jab;
    oneArm(J, o, [S(phi) * C(e), S(e), C(phi) * C(e)], [0, 0, 0.16 * jab]);
    J.neck.ry = s * phi * 0.6; J.upper.ry = s * (phi * 0.25 + 0.08); J.neck.rx = 0.04;
  },
  crouch(J, t) { // hiding low: kneeling, curled forward, hands over the head, trembling
    J.kneel = true;
    J.legL.rx = J.legR.rx = Math.PI / 2 - 0.04; J.legL.rz = 0.05; J.legR.rz = -0.05;
    J.upper.rx = 0.5 + 0.02 * S(TAU * t / 2.3); J.upper.rz = 0.012 * S(TAU * 9 * t) + 0.007 * S(TAU * 13 * t + 1);
    J.neck.rx = 0.32; J.upper.y = 0.015 * S(TAU * t / 1.6);
    J.armL = toward(1, 0.42, 5.15, 0.4); J.armR = toward(-1, -0.42, 5.15, 0.4); J.twistL = -0.3; J.twistR = 0.3;
  },
  tiptoe(J, t, o) { // slow sneaky walk cycle in place, on the toes, arms raised a little
    const ph = TAU * 0.7 * num(o.speed, 1) * t, A = num(o.amplitude, 1), s = S(ph);
    // high, careful forward steps (one leg lifts forward while the other stays planted)
    J.legL.rx = A * (s > 0 ? -0.62 * s : -0.16 * s); J.legR.rx = A * (s < 0 ? 0.62 * s : 0.16 * s);
    J.hips.y = 2 + 0.05 + 0.05 * Math.abs(s);
    J.upper.rx = 0.24; J.neck.rx = -0.2; J.neck.ry = 0.25 * S(ph * 0.5);
    J.armL = [0.2, -0.38 + 0.08 * s, 0.85]; J.armR = [-0.2, -0.38 - 0.08 * s, 0.85]; J.twistL = -0.2; J.twistR = 0.2;
    J.upper.ry = 0.05 * s; J.body.y = 0.02 * Math.abs(s);
  },
  sleep_lie(J, t, o) { // lying on the back asleep: hands folded on the stomach, head turned, slow breathing
    POSE_FN.lie(J, t, o);
    J.armL = toward(1, 0.38, 2.75, 0.85); J.armR = toward(-1, -0.38, 2.9, 0.85); J.twistL = -0.4; J.twistR = 0.4;
    J.upper.y = 0.022 * S(TAU * t / 4); J.neck.rz = 0.24; J.neck.rx = 0.04;
  },
  // ---- v3: creature-scale actions (they work for every humanoid; the furry giant has tuned variants below)
  bend(J, t, o) { // torso bent forward ~65° with the head level, looking into something low (a house window)
    const a = num(o.angle, 1.15);
    J.upper.rx = a + 0.03 * S(TAU * t / 3.2);
    J.neck.rx = -Math.min(1.05, a * 0.8) + 0.04 * S(TAU * t / 4.1); J.neck.ry = 0.08 * S(TAU * t / 5);
    J.body.z = -0.35 * a;
    const hang = unpitch(J.upper.rx, [0.12, -0.9, 0.42]);
    J.armL = hang; J.armR = mirror(hang);
    J.legL.rz = 0.05; J.legR.rz = -0.05;
  },
  pinch(J, t, o) { // one hand reaches forward and delicately pinches (slow: reach 0–0.9 s, pinch, lift from 1.5 s)
    breathe(J, t, 0.4);
    const T = shotT(t, o), reach = ease(T / 0.9), lift = ease((T - 1.5) / 1.2);
    const e = -0.95 + 0.62 * reach + 0.3 * lift;
    oneArm(J, o, [0.2, S(e), C(e)], [0, 0, 0.12 * reach]);
    J.pinch = ease((T - 0.8) / 0.5);
    J.upper.rx = 0.1 * reach; J.neck.rx = 0.25 * reach - 0.12 * lift; J.upper.ry = sideOf(o) * 0.08;
  },
  spread(J, t, o) { // both arms open wide sideways (protective); opens over 0.6 s unless opts.instant
    const T = shotT(t, o), k = o.instant ? 1 : ease(T / 0.6), b = 0.03 * S(TAU * t / 2.8);
    const wide = [1, 0.16 + b, 0.26], rest = [0.15, -1, 0.1];
    J.armL = lerp3(rest, wide, k); J.armR = mirror(lerp3(rest, wide, k));
    J.legL.rz = 0.14 * k; J.legR.rz = -0.14 * k; J.legDrop = 1 - C(0.14 * k);
    J.upper.rx = -0.05 * k; J.neck.rx = -0.04; J.upper.y = 0.02 * S(TAU * t / 2.8);
  },
  straddle(J, t, o) { // legs wide apart, standing over something, looking down; opts: width (rad), angle (torso bend)
    const w = Math.max(0, Math.min(0.9, num(o.width, 0.42)));
    J.legL.rz = w; J.legR.rz = -w; J.legDrop = 1 - C(w);
    J.upper.rx = num(o.angle, 0.15) + 0.02 * S(TAU * t / 3.5); J.neck.rx = 0.32;
    J.armL = [0.32, -1, 0.12 + 0.04 * S(TAU * t / 3)]; J.armR = [-0.32, -1, 0.12 + 0.04 * S(TAU * t / 3 + 1)];
    J.hips.rz = 0.03 * S(TAU * t / 4); J.upper.rz = -0.03 * S(TAU * t / 4);
  },
  step(J, t, o) { // one big slow stride (then the other leg): swing 75% of the period, plant + thud, hold; opts: period, amplitude, lift
    const P = Math.max(0.5, num(o.period, 1.4)), T = Math.max(0, shotT(t, o)), u = T / P, i = Math.floor(u), f = u - i;
    const g = ease(f / 0.75), sg = i % 2 === 0 ? 1 : -1, s = sg * (2 * g - 1);
    const A = 0.55 * num(o.amplitude, 1), lift = num(o.lift, 0.35) * S(Math.PI * g) * (f < 0.75 ? 1 : 0);
    J.legL.rx = -A * s - (sg > 0 ? lift : 0); J.legR.rx = A * s - (sg < 0 ? lift : 0);
    J.legDrop = 1 - C(A * Math.abs(s));
    const thud = f > 0.75 ? Math.exp(-(f - 0.75) * P * 9) * S((f - 0.75) * P * 30) : 0;
    J.body.y = -0.07 * Math.abs(thud); J.upper.rx = 0.16 + 0.05 * Math.abs(s) + 0.04 * thud; J.neck.rx = -0.1;
    J.armL = swing(0.85 * A * s + 0.1, 0.14); J.armR = swing(-0.85 * A * s + 0.1, -0.14);
    J.upper.ry = 0.1 * s; J.hips.rz = 0.05 * s * (1 - g);
  },
  // ---- furry giant variants (mapped in creatures.js)
  giant_tap(J, t, o) { // leaning down, one arm reaching forward/down, index finger tapping ~3 Hz
    const a = num(o.angle, 0.78), T = shotT(t, o), hz = num(o.rate, 3);
    let k = T < 0 ? 0 : hitPulse(T, hz, 0.4);
    if (num(o.times, 0) > 0 && T * hz >= num(o.times, 0)) k = 0;
    J.upper.rx = a + 0.02 * k; J.neck.rx = -0.55; J.body.z = -0.25;
    const d = unpitch(J.upper.rx, [0.16, -0.42 - 0.08 * k, 1]);
    oneArm(J, o, d, [0, 0, 0.12 * k], unpitch(J.upper.rx, [-0.16, -1, 0.25]));
    J.finger = 1 - k; J.upper.ry = sideOf(o) * 0.1; J.neck.ry = -sideOf(o) * 0.08;
  },
  giant_knock(J, t, o) { // big fist knocking downward (on a roof), ~2 Hz
    const T = shotT(t, o), hz = num(o.rate, 2), u = frac(Math.max(0, T) * hz);
    let e, hit = 0;
    if (u < 0.55) e = -0.75 + 1.2 * ease(u / 0.55);
    else if (u < 0.72) { const v = (u - 0.55) / 0.17; e = 0.45 - 1.25 * v * v; }
    else { const v = (u - 0.72) / 0.28; e = -0.8 + 0.05 * ease(v); hit = 1 - v; }
    const a = 0.32 + 0.06 * hit;
    J.upper.rx = a; J.neck.rx = 0.05; J.body.y = -0.06 * hit;
    oneArm(J, o, unpitch(a, [0.2, S(e), C(e)]), null, unpitch(a, [-0.18, -1, 0.3]));
    J.upper.ry = sideOf(o) * 0.12;
  },
  giant_pinch(J, t, o) { // bent down, hand slowly reaches forward/down, two fingers pinch, then lifts it (slow)
    const T = shotT(t, o), reach = ease(T / 1.0), lift = ease((T - 1.5) / 1.3);
    const a = 0.85 - 0.35 * lift;
    J.upper.rx = a; J.neck.rx = -0.4 + 0.1 * lift; J.body.z = -0.25;
    const e = -0.9 + 0.5 * reach + 0.45 * lift;
    oneArm(J, o, unpitch(a, [0.2, S(e), C(e)]), [0, 0, 0.15 * reach], unpitch(a, [-0.15, -1, 0.2]));
    J.pinch = ease((T - 0.85) / 0.6); J.finger = 0;
    J.upper.ry = sideOf(o) * 0.08;
  },
  creep(J, t) { // tall thin idle: slow unnatural sway
    J.upper.rz = 0.05 * S(TAU * t / 5.5); J.neck.rz = 0.22 * S(TAU * t / 7) + 0.1; J.neck.rx = 0.06;
    J.armL = [0.05, -1, 0.04 + 0.03 * S(TAU * t / 4)]; J.armR = [-0.05, -1, 0.04 + 0.03 * S(TAU * t / 4 + 2)];
  },
};

const NO_STOOP = new Set(['lie', 'fall', 'sleep_lie', 'crouch', 'bend', 'giant_tap', 'giant_pinch']);
export function computePose(id, t, opts = {}, elder = false) {
  const J = basePose();
  const fn = POSE_FN[id] || POSE_FN.stand;
  fn(J, t, opts || {});
  if (elder && !NO_STOOP.has(id)) { J.upper.rx += 0.07; J.neck.rx -= 0.04; }
  return J;
}

export { ease };
