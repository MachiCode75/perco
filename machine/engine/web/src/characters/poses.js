// Pose library. Each pose is a pure function of time → joint targets (deterministic, smooth).
// Arms are given as direction vectors (shoulder → hand) in upper-body space: +x = character's left,
// +y = up, +z = forward. Legs use Euler rotations at the hip (rx < 0 swings the leg forward).
// Body space: origin at feet, hips pivot at y = 2, shoulders at (±1.5, 3.5).

const TAU = Math.PI * 2;
const S = Math.sin, C = Math.cos;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };

/** arm direction from a forward swing angle a (rad, + = forward) and outward lean */
const swing = (a, out = 0.06) => [out, -C(a), S(a)];
/** direction from shoulder (side s=+1 left/-1 right) toward a body-space point */
function toward(s, x, y, z) { return [x * s - 1.5 * s, y - 3.5, z]; }

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
    const sp = o.speed || 1, ph = TAU * 1.6 * sp * t, A = 0.6 * (o.amplitude || 1);
    J.legL.rx = -A * S(ph); J.legR.rx = A * S(ph);
    J.armL = swing(-A * 0.95 * S(ph), 0.06); J.armR = swing(A * 0.95 * S(ph), -0.06);
    J.hips.y = 2 + 0.07 * Math.abs(C(ph));
    J.upper.ry = 0.05 * S(ph); J.neck.ry = -0.04 * S(ph);
  },
  run(J, t, o) {
    const sp = o.speed || 1, ph = TAU * 2.5 * sp * t, A = 1.0 * (o.amplitude || 1);
    J.legL.rx = -A * S(ph); J.legR.rx = A * S(ph);
    J.armL = swing(-1.15 * S(ph), 0.12); J.armR = swing(1.15 * S(ph), -0.12);
    J.hips.y = 2 + 0.22 * Math.abs(C(ph)); J.upper.rx = 0.2; J.neck.rx = -0.12;
    J.upper.ry = 0.08 * S(ph);
  },
  sit(J, t, o) {
    breathe(J, t, 0.8);
    const seat = o.seat == null ? 1.5 : +o.seat;
    J.hips.y = seat + 0.5;
    J.legL.rx = J.legR.rx = -Math.PI / 2;
    J.legL.rz = 0.03; J.legR.rz = -0.03;
    J.armL = [0.06, -0.62, 0.78]; J.armR = [-0.06, -0.62, 0.78];
  },
  binoculars(J, t) {
    breathe(J, t, 0.5);
    J.armL = toward(1, 0.36, 4.72, 1.15); J.armR = toward(-1, -0.36, 4.72, 1.15);
    J.twistL = -0.3; J.twistR = 0.3;
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
    const t0 = o.at || 0, dur = o.duration || 0.65;
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
    const P = o.period || 0.8, ph = ((t % P) + P) % P / P;
    const h = 4 * (o.height || 1.3) * ph * (1 - ph);
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
    const ph = TAU * 0.75 * (o.speed || 1) * t;
    J.legL.rx = -0.22 * S(ph); J.legR.rx = 0.22 * S(ph);
    J.armL = [0.62, -0.55 + 0.06 * S(ph), 0.3]; J.armR = [-0.62, -0.55 - 0.06 * S(ph), 0.3];
    J.upper.rz = 0.04 * S(ph); J.hips.y = 2 + 0.04 * Math.abs(C(ph));
  },
  carry(J, t) {
    breathe(J, t, 0.7);
    J.armL = [-0.02, -0.42, 0.92]; J.armR = [0.02, -0.42, 0.92];
    J.upper.rx = -0.04;
  },
};

export function computePose(id, t, opts = {}, elder = false) {
  const J = basePose();
  const fn = POSE_FN[id] || POSE_FN.stand;
  fn(J, t, opts || {});
  if (elder && id !== 'lie' && id !== 'fall') { J.upper.rx += 0.07; J.neck.rx -= 0.04; }
  return J;
}

export { ease };
