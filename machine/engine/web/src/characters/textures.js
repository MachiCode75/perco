// Procedural canvas painters: Roblox-classic face decals, classic shirt/pants atlases, sign text, dials.
import { makeCanvas, canvasTexture, cached, shade, mix, luminance, hashStr, mulberry } from './util.js';

const INK = '#141414';
const TAU = Math.PI * 2;

// =====================================================================================  FACES
// Canvas = the whole front face of the head (u,v in 0..1, y down). Features stay in the flat centre.
function eyes(g, { dx = 0.14, y = 0.445, rx = 0.044, ry = 0.074 } = {}) {
  g.fillStyle = INK;
  for (const s of [-1, 1]) { g.beginPath(); g.ellipse(0.5 + s * dx, y, rx, ry, 0, 0, TAU); g.fill(); }
}
function stroke(g, w = 0.034) { g.strokeStyle = INK; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(); }
function brows(g, { y = 0.31, inner = 0, outer = 0, dx = 0.14, len = 0.12, w = 0.036 } = {}) {
  // inner/outer: vertical offsets (negative = higher) of the inner / outer brow ends
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(0.5 + s * (dx + len / 2), y + outer);
    g.lineTo(0.5 + s * (dx - len / 2), y + inner);
    stroke(g, w);
  }
}
function smileArc(g, { cx = 0.5, cy = 0.5, r = 0.17, a0 = 0.18, a1 = 0.82, w = 0.034 } = {}) {
  g.beginPath(); g.arc(cx, cy, r, a0 * Math.PI, a1 * Math.PI); stroke(g, w);
}
function frownArc(g, { cx = 0.5, cy = 0.76, r = 0.13, w = 0.034 } = {}) {
  g.beginPath(); g.arc(cx, cy, r, 1.2 * Math.PI, 1.8 * Math.PI); stroke(g, w);
}
function closedUp(g, y = 0.46, dx = 0.14, r = 0.058) { // ^ ^  (happy)
  for (const s of [-1, 1]) { g.beginPath(); g.arc(0.5 + s * dx, y + r * 0.35, r, 1.12 * Math.PI, 1.88 * Math.PI); stroke(g, 0.034); }
}
function closedDown(g, y = 0.43, dx = 0.14, r = 0.058) { // ‿ ‿ (sleep)
  for (const s of [-1, 1]) { g.beginPath(); g.arc(0.5 + s * dx, y - r * 0.35, r, 0.15 * Math.PI, 0.85 * Math.PI); stroke(g, 0.032); }
}
function squeezed(g, y = 0.44, dx = 0.14) { // > <
  for (const s of [-1, 1]) {
    const x = 0.5 + s * dx;
    g.beginPath();
    g.moveTo(x - s * 0.05, y - 0.05); g.lineTo(x + s * 0.045, y); g.lineTo(x - s * 0.05, y + 0.05);
    stroke(g, 0.034);
  }
}
function openMouth(g, path, { fill = '#3a0d0d', teeth = 0, tongue = null, w = 0.034 } = {}) {
  g.save(); path(); g.clip();
  g.fillStyle = fill; g.fillRect(0, 0, 1, 1);
  if (teeth) { g.fillStyle = '#ffffff'; g.fillRect(0, 0, 1, teeth); }
  if (tongue) { g.fillStyle = tongue[3] || '#e0605a'; g.beginPath(); g.ellipse(tongue[0], tongue[1], tongue[2], tongue[2] * 0.62, 0, 0, TAU); g.fill(); }
  g.restore();
  path(); stroke(g, w);
}
function tears(g, y0 = 0.5, dx = 0.14) {
  for (const s of [-1, 1]) {
    const x = 0.5 + s * (dx + 0.01);
    g.beginPath(); g.moveTo(x, y0); g.lineTo(x + s * 0.005, y0 + 0.17); g.quadraticCurveTo(x + s * 0.01, y0 + 0.27, x + s * 0.03, y0 + 0.33);
    g.strokeStyle = '#1e6fd0'; g.lineWidth = 0.075; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke();
    g.strokeStyle = '#6cc6ff'; g.lineWidth = 0.045; g.stroke();
    g.strokeStyle = '#d8f2ff'; g.lineWidth = 0.012; g.beginPath(); g.moveTo(x - s * 0.01, y0 + 0.03); g.lineTo(x - s * 0.008, y0 + 0.14); g.stroke();
  }
}

const FACE_DRAW = {
  neutral(g) { eyes(g); g.beginPath(); g.moveTo(0.42, 0.635); g.lineTo(0.58, 0.635); stroke(g); },
  smile(g) { eyes(g); smileArc(g); },
  happy(g) { closedUp(g); smileArc(g, { cy: 0.5, r: 0.18, a0: 0.12, a1: 0.88 }); },
  grin(g) {
    closedUp(g, 0.45);
    const path = () => { g.beginPath(); g.moveTo(0.31, 0.56); g.lineTo(0.69, 0.56); g.ellipse(0.5, 0.56, 0.19, 0.19, 0, 0, Math.PI); g.closePath(); };
    openMouth(g, path, { fill: '#ffffff', tongue: [0.5, 0.71, 0.08, '#e86a60'], w: 0.036 });
  },
  worried(g) {
    eyes(g, { ry: 0.068 }); brows(g, { y: 0.31, inner: -0.04, outer: 0.015, w: 0.032 });
    g.beginPath(); g.moveTo(0.41, 0.655); g.bezierCurveTo(0.46, 0.62, 0.54, 0.69, 0.59, 0.645); stroke(g, 0.032);
  },
  sad(g) { eyes(g, { ry: 0.068 }); brows(g, { y: 0.32, inner: -0.03, outer: 0.01, len: 0.1, w: 0.03 }); frownArc(g); },
  cry(g) {
    squeezed(g); brows(g, { y: 0.32, inner: -0.035, outer: 0.0, len: 0.1, w: 0.03 });
    const path = () => { g.beginPath(); g.moveTo(0.37, 0.72); g.ellipse(0.5, 0.72, 0.13, 0.11, 0, Math.PI, TAU); g.closePath(); };
    openMouth(g, path, { fill: '#5a1414', tongue: [0.5, 0.73, 0.06, '#d9534f'] });
    tears(g, 0.5);
  },
  scream(g) {
    eyes(g, { rx: 0.038, ry: 0.064, y: 0.43 }); brows(g, { y: 0.31, inner: 0.03, outer: -0.01, w: 0.036 });
    const path = () => { g.beginPath(); g.ellipse(0.5, 0.67, 0.12, 0.15, 0, 0, TAU); };
    openMouth(g, path, { fill: '#d7322b', teeth: 0.555, tongue: [0.5, 0.79, 0.07, '#f07a72'], w: 0.036 });
  },
  angry(g) {
    eyes(g, { y: 0.455, ry: 0.064 });
    // brows V (inner low) - thick
    brows(g, { y: 0.33, inner: 0.035, outer: -0.03, len: 0.14, w: 0.044 });
    frownArc(g, { cy: 0.77, r: 0.12 });
  },
  surprised(g) {
    eyes(g, { rx: 0.05, ry: 0.085, y: 0.44 });
    for (const s of [-1, 1]) { g.beginPath(); g.arc(0.5 + s * 0.14, 0.33, 0.06, 1.15 * Math.PI, 1.85 * Math.PI); stroke(g, 0.03); }
    const path = () => { g.beginPath(); g.ellipse(0.5, 0.67, 0.055, 0.075, 0, 0, TAU); };
    openMouth(g, path, { fill: '#3a0d0d' });
  },
  scared(g) {
    for (const s of [-1, 1]) {
      g.beginPath(); g.ellipse(0.5 + s * 0.14, 0.44, 0.07, 0.085, 0, 0, TAU); g.fillStyle = '#ffffff'; g.fill(); stroke(g, 0.026);
      g.beginPath(); g.ellipse(0.5 + s * 0.13, 0.455, 0.028, 0.036, 0, 0, TAU); g.fillStyle = INK; g.fill();
    }
    brows(g, { y: 0.3, inner: -0.04, outer: 0.01, len: 0.11, w: 0.03 });
    const path = () => { g.beginPath(); g.roundRect(0.37, 0.615, 0.26, 0.09, 0.03); };
    openMouth(g, path, { fill: '#ffffff', w: 0.03 });
    g.beginPath(); g.moveTo(0.38, 0.66); g.lineTo(0.62, 0.66); for (let i = 1; i < 5; i++) { g.moveTo(0.37 + i * 0.052, 0.62); g.lineTo(0.37 + i * 0.052, 0.70); } stroke(g, 0.012);
  },
  sleep(g) { closedDown(g); g.beginPath(); g.moveTo(0.45, 0.63); g.quadraticCurveTo(0.5, 0.655, 0.55, 0.63); stroke(g, 0.03); },
  smirk(g) {
    eyes(g, { ry: 0.07 });
    g.beginPath(); g.moveTo(0.57, 0.31); g.quadraticCurveTo(0.64, 0.27, 0.71, 0.3); stroke(g, 0.03);
    g.beginPath(); g.moveTo(0.39, 0.635); g.quadraticCurveTo(0.53, 0.67, 0.63, 0.575); stroke(g, 0.034);
  },
  talk(g) {
    eyes(g);
    const path = () => { g.beginPath(); g.moveTo(0.39, 0.6); g.lineTo(0.61, 0.6); g.ellipse(0.5, 0.6, 0.11, 0.1, 0, 0, Math.PI); g.closePath(); };
    openMouth(g, path, { fill: '#4a1212', teeth: 0.63, tongue: [0.5, 0.69, 0.05, '#e0605a'] });
  },
  talk_closed(g) { eyes(g); smileArc(g, { cy: 0.52, r: 0.12, a0: 0.2, a1: 0.8 }); },
  wink(g) {
    g.fillStyle = INK; g.beginPath(); g.ellipse(0.36, 0.445, 0.044, 0.074, 0, 0, TAU); g.fill();
    g.beginPath(); g.arc(0.64, 0.47, 0.058, 1.12 * Math.PI, 1.88 * Math.PI); stroke(g);
    smileArc(g, { r: 0.16 });
  },
};

export function faceTexture(ctx, face, skin) {
  const S = ctx.quality === 'preview' ? 128 : 256;
  return cached(ctx, `chr:tex:face:${face}:${skin}:${S}`, () => {
    const c = makeCanvas(S, S); const g = c.getContext('2d');
    g.fillStyle = skin; g.fillRect(0, 0, S, S);
    g.save(); g.scale(S, S);
    (FACE_DRAW[face] || FACE_DRAW.smile)(g);
    g.restore();
    return canvasTexture(c);
  });
}

// =====================================================================================  FABRICS
// All fabric drawing happens in stud units inside a face of a body-part box.
function star5(g, x, y, r, rot = 0) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot - Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath(); g.fill();
}
function daisy(g, x, y, r) {
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 6; i++) { const a = i * TAU / 6; g.beginPath(); g.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.42, r * 0.28, a, 0, TAU); g.fill(); }
  g.fillStyle = '#f2b93b'; g.beginPath(); g.arc(x, y, r * 0.28, 0, TAU); g.fill();
}

/** Fill rect (x,y,w,h) [studs, face-local] with a pattern; (ox,oy) = world-continuous coords of (x,y). */
export function fabric(g, pat, cols, x, y, w, h, ox = 0, oy = 0) {
  const c0 = cols[0], c1 = cols[1] || shade(c0, -0.4), c2 = cols[2] || c1;
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = c0; g.fillRect(x - 0.01, y - 0.01, w + 0.02, h + 0.02);
  const x0 = x - ox, y0 = y - oy; // origin of the world-continuous pattern in face coords
  switch (pat) {
    case 'stripes_h': case 'stripes': {
      const P = 0.36; g.fillStyle = c1;
      for (let k = Math.floor(oy / P) - 1; k * P < oy + h + P; k++) g.fillRect(x, y0 + k * P + P / 2, w, P / 2);
      break;
    }
    case 'stripes_v': {
      const P = 0.32; g.fillStyle = c1;
      for (let k = Math.floor(ox / P) - 1; k * P < ox + w + P; k++) g.fillRect(x0 + k * P + P / 2, y, P / 2, h);
      break;
    }
    case 'plaid': {
      const P = 0.34;
      g.globalAlpha = 0.22; g.fillStyle = c1;
      for (let k = Math.floor(oy / P) - 1; k * P < oy + h + P; k++) g.fillRect(x, y0 + k * P + 0.12, w, 0.1);
      for (let k = Math.floor(ox / P) - 1; k * P < ox + w + P; k++) g.fillRect(x0 + k * P + 0.12, y, 0.1, h);
      g.globalAlpha = 1; g.fillStyle = c1;
      for (let k = Math.floor(oy / P) - 1; k * P < oy + h + P; k++) g.fillRect(x, y0 + k * P, w, 0.05);
      for (let k = Math.floor(ox / P) - 1; k * P < ox + w + P; k++) g.fillRect(x0 + k * P, y, 0.05, h);
      if (cols[2]) {
        g.fillStyle = c2;
        for (let k = Math.floor(oy / P) - 1; k * P < oy + h + P; k++) g.fillRect(x, y0 + k * P + 0.235, w, 0.018);
        for (let k = Math.floor(ox / P) - 1; k * P < ox + w + P; k++) g.fillRect(x0 + k * P + 0.235, y, 0.018, h);
      }
      break;
    }
    case 'polka': {
      const P = 0.26; g.fillStyle = c1;
      for (let j = Math.floor(oy / P) - 1; j * P < oy + h + P; j++)
        for (let i = Math.floor(ox / P) - 1; i * P < ox + w + P; i++) {
          g.beginPath(); g.arc(x0 + i * P + (j & 1 ? P / 2 : 0), y0 + j * P + P / 2, 0.045, 0, TAU); g.fill();
        }
      break;
    }
    case 'stars': {
      const P = 0.5; g.fillStyle = c1;
      for (let j = Math.floor(oy / P) - 1; j * P < oy + h + P; j++)
        for (let i = Math.floor(ox / P) - 1; i * P < ox + w + P; i++) {
          const rr = mulberry(hashStr(i + ',' + j));
          star5(g, x0 + i * P + (j & 1 ? P / 2 : 0) + (rr() - 0.5) * 0.12, y0 + j * P + P / 2 + (rr() - 0.5) * 0.12, 0.075 + rr() * 0.03, rr());
        }
      break;
    }
    case 'floral': {
      const P = 0.62;
      for (let j = Math.floor(oy / P) - 1; j * P < oy + h + P; j++)
        for (let i = Math.floor(ox / P) - 1; i * P < ox + w + P; i++) {
          const rr = mulberry(hashStr('f' + i + ',' + j));
          daisy(g, x0 + i * P + (j & 1 ? P / 2 : 0) + (rr() - 0.5) * 0.15, y0 + j * P + P / 2 + (rr() - 0.5) * 0.15, 0.12 + rr() * 0.04);
        }
      break;
    }
    case 'argyle': {
      const DW = 0.5, DH = 0.62;
      for (let j = -1; j * DH / 2 < h + DH; j++)
        for (let i = -1; i * DW < w + DW; i++) {
          const cx = x + i * DW + (j & 1 ? DW / 2 : 0), cy = y + j * DH / 2;
          g.fillStyle = (j & 1) ? c1 : c0;
          if (!(j & 1)) continue;
          g.beginPath(); g.moveTo(cx, cy - DH / 2); g.lineTo(cx + DW / 2, cy); g.lineTo(cx, cy + DH / 2); g.lineTo(cx - DW / 2, cy); g.closePath(); g.fill();
        }
      g.strokeStyle = shade(c0, -0.45); g.lineWidth = 0.02; g.globalAlpha = 0.7;
      for (let i = -6; i < 10; i++) {
        g.beginPath(); g.moveTo(x + i * DW / 2 + DW / 4, y); g.lineTo(x + i * DW / 2 + DW / 4 + h * (DW / DH), y + h); g.stroke();
        g.beginPath(); g.moveTo(x + i * DW / 2 + DW / 4, y); g.lineTo(x + i * DW / 2 + DW / 4 - h * (DW / DH), y + h); g.stroke();
      }
      g.globalAlpha = 1;
      break;
    }
    case 'jeans': {
      g.fillStyle = shade(c0, 0.12); g.globalAlpha = 0.5;
      g.fillRect(x, y, w, 0.04);
      g.globalAlpha = 1;
      break;
    }
    default: break;
  }
  g.restore();
}

// Box net layout (studs): order = BoxGeometry groups px, nx, py, ny, pz, nz.
export function boxNet(w, h, d) {
  return {
    W: 2 * (w + d), H: h + 2 * d,
    px: [d + w, d, d, h], nx: [0, d, d, h], py: [d, 0, w, d], ny: [d, d + h, w, d], pz: [d, d, w, h], nz: [2 * d + w, d, w, h],
    ring: { nx: 0, pz: d, px: d + w, nz: 2 * d + w },
  };
}
// Run fn on a face with stud-unit transform & clip: fn(fw, fh, ringOffset)
function onFace(g, net, name, ppu, fn) {
  const [x, y, w, h] = net[name];
  g.save(); g.translate(x * ppu, y * ppu); g.scale(ppu, ppu);
  g.beginPath(); g.rect(0, 0, w, h); g.clip();
  fn(w, h, net.ring[name] ?? 0);
  g.restore();
}
const RING = ['nx', 'pz', 'px', 'nz'];

function ppuFor(ctx) { return ctx.quality === 'preview' ? 48 : 96; }

// Body pattern resolution for a shirt spec
function bodyFabric(sh) {
  const c = sh.colors;
  switch (sh.pattern) {
    case 'stripes_h': return ['stripes_h', [c[0], c[1]]];
    case 'stripes_v': return ['stripes_v', [c[0], c[1]]];
    case 'plaid': return ['plaid', [c[0], c[1], c[2]]];
    case 'polka': return ['polka', [c[0], c[1]]];
    case 'pajamas_stars': return ['stars', [c[0], c[1]]];
    case 'tee_logo': return c.length > 1 && c[1] !== c[0] ? ['stripes_h', [c[0], c[1]]] : ['solid', [c[0]]];
    case 'overalls': return c[2] && c[2] !== c[0] ? ['stripes_h', [c[0], c[2]]] : ['solid', [c[0]]];
    case 'argyle_vest': return ['solid', [c[2] || '#f4f4f0']]; // shirt under the vest
    case 'vest': return ['solid', [c[1] || '#f4f4f0']];
    default: return ['solid', [c[0]]];
  }
}
function sleeveFabric(sh) {
  if (sh.sleevePattern || sh.sleeveColors) {
    const cols = sh.sleeveColors || sh.colors;
    return [sh.sleevePattern || 'solid', cols];
  }
  switch (sh.pattern) {
    case 'argyle_vest': return ['solid', [sh.colors[2] || '#f4f4f0']];
    case 'vest': return ['solid', [sh.colors[1] || '#f4f4f0']];
    default: return bodyFabric(sh);
  }
}
function trimColor(sh) {
  const c = sh.colors;
  if (sh.pattern === 'tee_logo') return c[2] || shade(c[0], -0.3);
  if (sh.pattern === 'pajamas_stars') return c[2] || '#f4f4f4';
  return shade(c[0], luminance(c[0]) > 0.75 ? -0.12 : -0.22);
}

function drawLogo(g, kind, cx, cy, r, color) {
  if (kind === 'none') return;
  g.fillStyle = '#f7f7f2'; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
  g.strokeStyle = shade(color, -0.3); g.lineWidth = r * 0.06; g.stroke();
  g.fillStyle = color;
  if (kind === 'star') { star5(g, cx, cy, r * 0.7, 0); return; }
  if (kind === 'heart') {
    g.fillStyle = '#e0394a'; const s = r * 0.6;
    g.beginPath(); g.moveTo(cx, cy + s * 0.85); g.bezierCurveTo(cx - s * 1.3, cy - s * 0.1, cx - s * 0.55, cy - s * 1.0, cx, cy - s * 0.35);
    g.bezierCurveTo(cx + s * 0.55, cy - s * 1.0, cx + s * 1.3, cy - s * 0.1, cx, cy + s * 0.85); g.fill(); return;
  }
  if (kind === 'smiley') {
    g.fillStyle = '#f2c511'; g.beginPath(); g.arc(cx, cy, r * 0.72, 0, TAU); g.fill();
    g.fillStyle = INK; g.beginPath(); g.ellipse(cx - r * 0.25, cy - r * 0.15, r * 0.08, r * 0.14, 0, 0, TAU); g.ellipse(cx + r * 0.25, cy - r * 0.15, r * 0.08, r * 0.14, 0, 0, TAU); g.fill();
    g.strokeStyle = INK; g.lineWidth = r * 0.09; g.beginPath(); g.arc(cx, cy, r * 0.4, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke(); return;
  }
  if (typeof kind === 'string' && kind !== 'dino' && kind.length <= 4) {
    g.font = `900 ${r * 0.9}px Inter, 'DejaVu Sans', sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(kind.toUpperCase(), cx, cy + r * 0.05); return;
  }
  // dino (green, side view, facing right)
  const s = r / 0.3; g.save(); g.translate(cx, cy); g.scale(s, s);
  g.beginPath();
  g.moveTo(-0.22, 0.06); g.quadraticCurveTo(-0.12, -0.03, -0.02, -0.02); // tail to back
  g.quadraticCurveTo(0.04, -0.06, 0.08, -0.13); // neck
  g.quadraticCurveTo(0.12, -0.17, 0.19, -0.14); g.lineTo(0.2, -0.1); g.lineTo(0.12, -0.09); // head
  g.quadraticCurveTo(0.12, 0.0, 0.1, 0.06); g.lineTo(0.1, 0.12); g.lineTo(0.06, 0.12); g.lineTo(0.05, 0.07);
  g.lineTo(-0.04, 0.07); g.lineTo(-0.05, 0.12); g.lineTo(-0.09, 0.12); g.lineTo(-0.09, 0.07); g.closePath(); g.fill();
  g.fillStyle = shade(color, -0.35);
  for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(-0.1 + i * 0.045, -0.03 + i * -0.006); g.lineTo(-0.08 + i * 0.045, -0.075 - i * 0.008); g.lineTo(-0.06 + i * 0.045, -0.035 - i * 0.008); g.fill(); }
  g.fillStyle = INK; g.beginPath(); g.arc(0.155, -0.125, 0.012, 0, TAU); g.fill();
  g.restore();
}

function button(g, x, y, r = 0.045, c = '#e9e2cf') { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.strokeStyle = shade(c, -0.4); g.lineWidth = 0.012; g.stroke(); }

/** Torso texture (2x2x1): shirt (+ pants waist where relevant). */
export function torsoTexture(ctx, spec) {
  const sh = spec.shirt, skin = spec.skin;
  const key = `chr:tex:torso:${JSON.stringify(sh)}:${skin}:${spec.pants.color}:${ppuFor(ctx)}`;
  return cached(ctx, key, () => {
    const ppu = ppuFor(ctx), net = boxNet(2, 2, 1);
    const c = makeCanvas(net.W * ppu, net.H * ppu), g = c.getContext('2d');
    const [bp, bc] = bodyFabric(sh);
    g.fillStyle = bc[0]; g.fillRect(0, 0, c.width, c.height);
    const col = sh.colors, trim = trimColor(sh);
    for (const f of RING) onFace(g, net, f, ppu, (w, h, ro) => fabric(g, bp, bc, 0, 0, w, h, ro, 0));
    onFace(g, net, 'py', ppu, (w, h) => fabric(g, bp, bc, 0, 0, w, h, 0, 0));
    onFace(g, net, 'ny', ppu, (w, h) => { g.fillStyle = shade(bc[0], -0.1); g.fillRect(0, 0, w, h); });

    const P = sh.pattern;
    // ------------- garments over the base shirt
    if (P === 'argyle_vest' || P === 'vest') {
      const vc = col[0];
      for (const f of RING) onFace(g, net, f, ppu, (w, h, ro) => {
        if (P === 'argyle_vest') fabric(g, 'argyle', [vc, col[1]], 0, 0, w, h, ro, 0); else fabric(g, 'solid', [vc], 0, 0, w, h);
        g.fillStyle = shade(vc, -0.25); g.fillRect(0, h - 0.16, w, 0.16); // ribbed hem
        g.fillStyle = shade(vc, -0.35); for (let x = 0.03; x < w; x += 0.07) g.fillRect(x, h - 0.16, 0.018, 0.16);
      });
      onFace(g, net, 'pz', ppu, (w, h) => { // V opening showing the shirt + collar
        g.fillStyle = col[2] && P === 'argyle_vest' ? col[2] : (col[1] || '#f4f4f0');
        g.beginPath(); g.moveTo(w / 2 - 0.55, 0); g.lineTo(w / 2 + 0.55, 0); g.lineTo(w / 2, 0.85); g.closePath(); g.fill();
        g.strokeStyle = shade(vc, -0.3); g.lineWidth = 0.07; g.beginPath(); g.moveTo(w / 2 - 0.58, 0); g.lineTo(w / 2, 0.9); g.lineTo(w / 2 + 0.58, 0); g.stroke();
        // shirt collar points
        g.fillStyle = '#ffffff'; g.strokeStyle = '#cfcfcf'; g.lineWidth = 0.015;
        for (const s of [-1, 1]) { g.beginPath(); g.moveTo(w / 2 + s * 0.05, 0.02); g.lineTo(w / 2 + s * 0.4, 0.0); g.lineTo(w / 2 + s * 0.17, 0.26); g.closePath(); g.fill(); g.stroke(); }
        if (P === 'vest') for (let i = 0; i < 3; i++) button(g, w / 2 + 0.0, 1.05 + i * 0.28, 0.045, shade(vc, -0.45));
      });
    } else if (P === 'cardigan') {
      const cc = col[0], inner = col[1] || '#f4efe6';
      for (const f of RING) onFace(g, net, f, ppu, (w, h) => { g.fillStyle = shade(cc, -0.12); g.fillRect(0, h - 0.14, w, 0.14); g.fillStyle = shade(cc, -0.2); for (let x = 0.03; x < w; x += 0.07) g.fillRect(x, h - 0.14, 0.016, 0.14); });
      onFace(g, net, 'pz', ppu, (w, h) => {
        g.fillStyle = inner; g.beginPath(); g.moveTo(w / 2 - 0.42, 0); g.lineTo(w / 2 + 0.42, 0); g.lineTo(w / 2 + 0.2, h); g.lineTo(w / 2 - 0.2, h); g.closePath(); g.fill();
        g.strokeStyle = shade(cc, -0.18); g.lineWidth = 0.06;
        for (const s of [-1, 1]) { g.beginPath(); g.moveTo(w / 2 + s * 0.45, 0); g.lineTo(w / 2 + s * 0.22, h); g.stroke(); }
        // pockets
        g.lineWidth = 0.025; g.strokeStyle = shade(cc, -0.22);
        for (const s of [-1, 1]) g.strokeRect(w / 2 + s * 0.62 - 0.18, 1.25, 0.36, 0.34);
        for (let i = 0; i < 4; i++) button(g, w / 2 + 0.3, 0.55 + i * 0.36, 0.04, '#f2efe6');
      });
    } else if (P === 'suit') {
      const jc = col[0], shirtC = col[1] || '#f4f4f4', tie = col[2] || '#c0262d';
      onFace(g, net, 'pz', ppu, (w, h) => {
        g.fillStyle = shirtC; g.beginPath(); g.moveTo(w / 2 - 0.45, 0); g.lineTo(w / 2 + 0.45, 0); g.lineTo(w / 2, 1.05); g.closePath(); g.fill();
        // tie
        g.fillStyle = tie; g.beginPath(); g.moveTo(w / 2 - 0.08, 0.02); g.lineTo(w / 2 + 0.08, 0.02); g.lineTo(w / 2 + 0.05, 0.14); g.lineTo(w / 2 + 0.1, 0.9); g.lineTo(w / 2, 1.0); g.lineTo(w / 2 - 0.1, 0.9); g.lineTo(w / 2 - 0.05, 0.14); g.closePath(); g.fill();
        // lapels
        g.fillStyle = shade(jc, -0.3);
        for (const s of [-1, 1]) { g.beginPath(); g.moveTo(w / 2 + s * 0.45, 0); g.lineTo(w / 2 + s * 0.62, 0.0); g.lineTo(w / 2 + s * 0.5, 0.42); g.lineTo(w / 2 + s * 0.62, 0.5); g.lineTo(w / 2 + s * 0.06, 1.12); g.lineTo(w / 2 + s * 0.02, 1.05); g.closePath(); g.fill(); }
        g.strokeStyle = shade(jc, -0.5); g.lineWidth = 0.02; g.beginPath(); g.moveTo(w / 2, 1.05); g.lineTo(w / 2, h); g.stroke();
        button(g, w / 2 + 0.07, 1.3, 0.04, shade(jc, -0.55)); button(g, w / 2 + 0.07, 1.6, 0.04, shade(jc, -0.55));
        g.fillStyle = '#ffffff'; g.fillRect(w / 2 + 0.5, 0.62, 0.26, 0.06); g.beginPath(); g.moveTo(w / 2 + 0.52, 0.62); g.lineTo(w / 2 + 0.6, 0.53); g.lineTo(w / 2 + 0.66, 0.62); g.fill(); // pocket square
        g.strokeStyle = shade(jc, -0.4); g.lineWidth = 0.02; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(w / 2 + s * 0.4 - 0.18, 1.55); g.lineTo(w / 2 + s * 0.4 + 0.18, 1.55); g.stroke(); }
      });
    } else if (P === 'overalls') {
      const oc = col[1];
      for (const f of RING) onFace(g, net, f, ppu, (w, h) => { g.fillStyle = oc; g.fillRect(0, h - 0.62, w, 0.62); });
      onFace(g, net, 'pz', ppu, (w, h) => {
        g.fillStyle = oc; g.fillRect(w / 2 - 0.55, 0.55, 1.1, h); // bib
        g.fillRect(w / 2 - 0.85, 0, 0.26, 0.7); g.fillRect(w / 2 + 0.59, 0, 0.26, 0.7); // straps
        g.strokeStyle = shade(oc, 0.35); g.lineWidth = 0.018; g.setLineDash([0.05, 0.04]);
        g.strokeRect(w / 2 - 0.47, 0.63, 0.94, 0.6); g.setLineDash([]);
        g.fillStyle = shade(oc, -0.2); g.fillRect(w / 2 - 0.3, 0.8, 0.6, 0.35); // pocket
        button(g, w / 2 - 0.72, 0.68, 0.06, '#e8c23a'); button(g, w / 2 + 0.72, 0.68, 0.06, '#e8c23a');
      });
      onFace(g, net, 'nz', ppu, (w) => { g.fillStyle = oc; g.beginPath(); g.moveTo(w / 2 - 0.85, 0); g.lineTo(w / 2 - 0.6, 0); g.lineTo(w / 2 + 0.2, 1.4); g.lineTo(w / 2 - 0.05, 1.4); g.fill(); g.beginPath(); g.moveTo(w / 2 + 0.85, 0); g.lineTo(w / 2 + 0.6, 0); g.lineTo(w / 2 - 0.2, 1.4); g.lineTo(w / 2 + 0.05, 1.4); g.fill(); });
      onFace(g, net, 'py', ppu, (w, h) => { g.fillStyle = oc; g.fillRect(w / 2 - 0.85, 0, 0.26, h); g.fillRect(w / 2 + 0.59, 0, 0.26, h); });
    } else if (P === 'hoodie') {
      const hc = col[0];
      onFace(g, net, 'pz', ppu, (w, h) => {
        g.fillStyle = shade(hc, -0.15); g.beginPath(); g.moveTo(w / 2 - 0.55, 1.15); g.lineTo(w / 2 + 0.55, 1.15); g.lineTo(w / 2 + 0.75, h - 0.15); g.lineTo(w / 2 - 0.75, h - 0.15); g.closePath(); g.fill();
        g.strokeStyle = shade(hc, -0.3); g.lineWidth = 0.025; g.stroke();
        g.fillStyle = shade(hc, -0.25); g.fillRect(0, h - 0.15, w, 0.15);
        g.strokeStyle = col[1] || '#f4f4f4'; g.lineWidth = 0.035; g.lineCap = 'round';
        for (const s of [-1, 1]) { g.beginPath(); g.moveTo(w / 2 + s * 0.18, 0.18); g.lineTo(w / 2 + s * 0.22, 0.72); g.stroke(); }
        g.fillStyle = shade(hc, -0.3); g.beginPath(); g.ellipse(w / 2, 0, 0.42, 0.22, 0, 0, Math.PI); g.fill();
      });
      onFace(g, net, 'nz', ppu, (w, h) => {
        g.fillStyle = shade(hc, -0.12); g.beginPath(); g.moveTo(w / 2 - 0.6, 0); g.lineTo(w / 2 + 0.6, 0); g.quadraticCurveTo(w / 2 + 0.6, 0.9, w / 2, 0.95); g.quadraticCurveTo(w / 2 - 0.6, 0.9, w / 2 - 0.6, 0); g.fill();
        g.strokeStyle = shade(hc, -0.3); g.lineWidth = 0.025; g.stroke();
        g.fillStyle = shade(hc, -0.25); g.fillRect(0, h - 0.15, w, 0.15);
      });
      for (const f of ['nx', 'px']) onFace(g, net, f, ppu, (w, h) => { g.fillStyle = shade(hc, -0.25); g.fillRect(0, h - 0.15, w, 0.15); });
    } else if (P === 'dress') {
      for (const f of RING) onFace(g, net, f, ppu, (w, h) => { g.fillStyle = col[1] && col[1] !== col[0] ? col[1] : shade(col[0], -0.15); g.fillRect(0, h - 0.3, w, 0.12); });
    } else if (P === 'pajamas_stars') {
      onFace(g, net, 'pz', ppu, (w, h) => {
        g.strokeStyle = trim; g.lineWidth = 0.07; g.beginPath(); g.moveTo(w / 2 - 0.45, 0); g.lineTo(w / 2, 0.55); g.lineTo(w / 2 + 0.45, 0); g.stroke();
        g.beginPath(); g.moveTo(w / 2 + 0.08, 0.5); g.lineTo(w / 2 + 0.08, h); g.lineWidth = 0.04; g.stroke();
        for (let i = 0; i < 4; i++) button(g, w / 2 + 0.2, 0.75 + i * 0.32, 0.045, '#f4f4f4');
        g.lineWidth = 0.04; g.strokeRect(w / 2 - 0.75, 0.45, 0.4, 0.4); // breast pocket
      });
    } else if (P === 'tee_logo') {
      onFace(g, net, 'pz', ppu, (w) => drawLogo(g, sh.logo, w / 2, 0.98, 0.36, sh.logoColor));
    } else if (P === 'plaid') {
      onFace(g, net, 'pz', ppu, (w, h) => { g.strokeStyle = shade(col[0], -0.35); g.lineWidth = 0.02; g.beginPath(); g.moveTo(w / 2, 0.15); g.lineTo(w / 2, h); g.stroke(); for (let i = 0; i < 5; i++) button(g, w / 2 + 0.06, 0.4 + i * 0.32, 0.035, '#f0ead8'); });
    } else if (P === 'solid' && sh.sleeves === 'short') {
      onFace(g, net, 'pz', ppu, (w) => { g.strokeStyle = shade(col[0], -0.2); g.lineWidth = 0.02; g.strokeRect(w / 2 + 0.35, 0.45, 0.35, 0.38); }); // tee pocket
    }
    // ------------- necklines
    const neck = sh.neck;
    onFace(g, net, 'pz', ppu, (w) => {
      if (neck === 'round') {
        g.fillStyle = skin; g.beginPath(); g.ellipse(w / 2, 0, 0.34, 0.15, 0, 0, Math.PI); g.fill();
        g.strokeStyle = trim; g.lineWidth = sh.pattern === 'tee_logo' ? 0.09 : 0.06; g.beginPath(); g.ellipse(w / 2, 0, 0.36, 0.17, 0, 0, Math.PI); g.stroke();
      } else if (neck === 'v' && (P === 'solid' || P === 'stripes_h' || P === 'stripes_v' || P === 'polka' || P === 'plaid' || P === 'tee_logo' || P === 'dress')) {
        g.fillStyle = sh.inner || skin; g.beginPath(); g.moveTo(w / 2 - 0.3, 0); g.lineTo(w / 2 + 0.3, 0); g.lineTo(w / 2, 0.45); g.closePath(); g.fill();
        g.strokeStyle = trim; g.lineWidth = 0.06; g.beginPath(); g.moveTo(w / 2 - 0.32, 0); g.lineTo(w / 2, 0.48); g.lineTo(w / 2 + 0.32, 0); g.stroke();
      } else if (neck === 'collar') {
        g.fillStyle = skin; g.beginPath(); g.moveTo(w / 2 - 0.2, 0); g.lineTo(w / 2 + 0.2, 0); g.lineTo(w / 2, 0.3); g.closePath(); g.fill();
        const cc = sh.pattern === 'plaid' ? shade(col[0], -0.1) : '#f4f4f4';
        g.fillStyle = cc; g.strokeStyle = shade(cc, -0.3); g.lineWidth = 0.015;
        for (const s of [-1, 1]) { g.beginPath(); g.moveTo(w / 2 + s * 0.02, 0.3); g.lineTo(w / 2 + s * 0.42, 0.0); g.lineTo(w / 2 + s * 0.3, 0.32); g.closePath(); g.fill(); g.stroke(); }
      }
    });
    return canvasTexture(c);
  });
}

/** Arm texture (1x2x1). Bottom face = hand (skin). */
export function armTexture(ctx, spec) {
  const sh = spec.shirt, skin = spec.skin;
  const key = `chr:tex:arm:${JSON.stringify(sh)}:${skin}:${ppuFor(ctx)}`;
  return cached(ctx, key, () => {
    const ppu = ppuFor(ctx), net = boxNet(1, 2, 1);
    const c = makeCanvas(net.W * ppu, net.H * ppu), g = c.getContext('2d');
    const [sp, sc] = sleeveFabric(sh);
    g.fillStyle = skin; g.fillRect(0, 0, c.width, c.height);
    const len = sh.sleeves === 'long' ? 2 : sh.sleeves === 'short' ? 0.72 : 0;
    const trim = trimColor(sh), P = sh.pattern;
    for (const f of RING) onFace(g, net, f, ppu, (w, h, ro) => {
      if (len > 0) fabric(g, sp, sc, 0, 0, w, len, ro, 0);
      if (P === 'suit' && len >= 2) { g.fillStyle = sh.colors[1] || '#f4f4f4'; g.fillRect(0, h - 0.16, w, 0.16); g.fillStyle = shade(sh.colors[0], -0.25); g.fillRect(0, h - 0.34, w, 0.04); }
      else if (P === 'pajamas_stars' && len >= 2) { g.fillStyle = trim; g.fillRect(0, h - 0.2, w, 0.07); }
      else if ((P === 'hoodie' || P === 'cardigan' || P === 'stripes_h' && !sh.sleeveColors) && len >= 2) { g.fillStyle = shade(sc[0], -0.18); g.fillRect(0, h - 0.14, w, 0.14); }
      else if (len > 0 && len < 2 && (P === 'tee_logo' || P === 'overalls' || P === 'dress')) { g.fillStyle = P === 'tee_logo' ? trim : shade(sc[0], -0.15); g.fillRect(0, len - 0.1, w, 0.1); }
      else if (len > 0 && len < 2) { g.fillStyle = shade(sc[0], -0.12); g.fillRect(0, len - 0.05, w, 0.05); }
    });
    onFace(g, net, 'py', ppu, (w, h) => { if (len > 0) fabric(g, sp, sc, 0, 0, w, h, 0, 0); });
    // ny = hand, keep skin
    return canvasTexture(c);
  });
}

/** Leg texture (1x2x1): pants / shorts / skirt-legs + painted shoes. */
export function legTexture(ctx, spec) {
  const p = spec.pants, sh = spec.shirt, skin = spec.skin;
  const dressLegs = sh.pattern === 'dress';
  const key = `chr:tex:leg:${JSON.stringify(p)}:${dressLegs ? sh.colors[0] : ''}:${skin}:${ppuFor(ctx)}`;
  return cached(ctx, key, () => {
    const ppu = ppuFor(ctx), net = boxNet(1, 2, 1);
    const c = makeCanvas(net.W * ppu, net.H * ppu), g = c.getContext('2d');
    let base = p.color;
    let len = p.style === 'pants' ? 2 : p.style === 'shorts' ? 0.85 : p.style === 'skirt' ? 0.3 : 0;
    let pat = p.pattern === 'stripes' ? 'stripes_h' : p.pattern;
    let cols = [base, ...(p.colors || []).slice(1)];
    if (dressLegs && p.style === 'none') { base = sh.colors[0]; len = 2; pat = 'solid'; cols = [base]; }
    const shoes = p.shoes || (len >= 2 ? shade(base, luminance(base) > 0.3 ? -0.45 : 0.18) : '#3b2a20');
    g.fillStyle = skin; g.fillRect(0, 0, c.width, c.height);
    for (const f of RING) onFace(g, net, f, ppu, (w, h, ro) => {
      if (len > 0) fabric(g, pat, cols, 0, 0, w, len, ro, 2);
      if (p.style === 'shorts') { g.fillStyle = shade(base, -0.15); g.fillRect(0, len - 0.07, w, 0.07); }
      if (len >= 2 && (pat === 'solid' || pat === 'jeans' || pat === 'floral')) { g.fillStyle = shade(base, -0.12); g.fillRect(0, h - 0.34, w, 0.05); }
      g.fillStyle = shoes; g.fillRect(0, h - 0.22, w, 0.22);
      g.fillStyle = shade(shoes, -0.3); g.fillRect(0, h - 0.05, w, 0.05);
    });
    onFace(g, net, 'py', ppu, (w, h) => { g.fillStyle = len > 0 ? base : skin; g.fillRect(0, 0, w, h); });
    onFace(g, net, 'ny', ppu, (w, h) => { g.fillStyle = shade(shoes, -0.35); g.fillRect(0, 0, w, h); });
    return canvasTexture(c);
  });
}

// =====================================================================================  PROPS
const MARKER_COLORS = ['#1f4fd8', '#e3262b', '#1d9a3a', '#f08a1c', '#8a2be2'];
export function signTexture(ctx, text, opts = {}) {
  const txt = String(text == null ? 'HI!' : text).slice(0, 40);
  const W = ctx.quality === 'preview' ? 384 : 768, H = Math.round(W * 0.62);
  return cached(ctx, `chr:tex:sign:${txt}:${opts.color || ''}:${W}`, () => {
    const c = makeCanvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#f7f5ee'; g.fillRect(0, 0, W, H);
    // subtle paper shading
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(255,255,255,0.0)'); gr.addColorStop(1, 'rgba(180,170,150,0.18)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const words = txt.toUpperCase().split(/\s+/).filter(Boolean);
    const lines = [];
    // greedy wrap into max 3 lines
    let cur = '';
    const maxChars = Math.max(6, Math.ceil(txt.length / 2.2));
    for (const w of words) { if ((cur + ' ' + w).trim().length > maxChars && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
    if (cur) lines.push(cur);
    const nL = Math.min(3, lines.length || 1);
    const rng = mulberry(hashStr(txt));
    const fontFam = `'Comic Sans MS', 'Marker Felt', 'Chalkboard SE', Inter, 'DejaVu Sans', sans-serif`;
    let size = H * (nL === 1 ? 0.42 : nL === 2 ? 0.3 : 0.22);
    g.font = `900 ${size}px ${fontFam}`;
    const longest = Math.max(...lines.slice(0, 3).map(l => g.measureText(l).width + l.length * size * 0.08));
    if (longest > W * 0.86) { size *= (W * 0.86) / longest; g.font = `900 ${size}px ${fontFam}`; }
    g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineCap = 'round';
    let wordIdx = 0;
    const lineH = size * 1.12, y0 = H / 2 - (nL - 1) * lineH / 2 - (nL === 1 ? size * 0.08 : 0);
    for (let li = 0; li < nL; li++) {
      const line = lines[li];
      const parts = line.split(' ');
      const spacing = size * 0.06;
      let total = 0; for (const ch of line) total += g.measureText(ch).width + spacing;
      let x = W / 2 - total / 2;
      const y = y0 + li * lineH;
      for (const word of parts) {
        const color = opts.color || MARKER_COLORS[wordIdx % MARKER_COLORS.length];
        for (const ch of word) {
          const cw = g.measureText(ch).width;
          g.save(); g.translate(x + cw / 2, y + (rng() - 0.5) * size * 0.08); g.rotate((rng() - 0.5) * 0.14);
          g.fillStyle = (ch === '!' || ch === '?') && !opts.color ? MARKER_COLORS[(wordIdx + 2) % MARKER_COLORS.length] : color;
          g.strokeStyle = g.fillStyle; g.lineWidth = size * 0.11;
          g.textAlign = 'center';
          g.strokeText(ch, 0, 0); g.fillText(ch, 0, 0);
          // marker streak highlight
          g.globalAlpha = 0.18; g.strokeStyle = '#ffffff'; g.lineWidth = size * 0.025; g.strokeText(ch, -size * 0.02, -size * 0.02); g.globalAlpha = 1;
          g.restore();
          x += cw + spacing;
        }
        x += g.measureText(' ').width + spacing;
        wordIdx++;
      }
    }
    // underline squiggle (green marker)
    const uy = y0 + (nL - 1) * lineH + size * 0.68;
    if (uy < H - 8) {
      g.strokeStyle = MARKER_COLORS[2]; g.lineWidth = H * 0.022; g.beginPath();
      for (let x = W * 0.16; x <= W * 0.84; x += W / 40) g.lineTo(x, uy + Math.sin(x * 0.03) * H * 0.008 + (rng() - 0.5) * H * 0.006);
      g.stroke();
    }
    return canvasTexture(c);
  });
}

export function dialTexture(ctx) {
  return cached(ctx, 'chr:tex:dial', () => {
    const S = 256, c = makeCanvas(S, S), g = c.getContext('2d');
    g.fillStyle = '#c9ced6'; g.fillRect(0, 0, S, S);
    g.translate(S / 2, S / 2);
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, 0, S * 0.44, 0, TAU); g.fill();
    g.strokeStyle = '#8a9099'; g.lineWidth = S * 0.025; g.stroke();
    g.strokeStyle = '#151515';
    for (let i = 0; i < 60; i++) {
      const a = i / 60 * TAU, r0 = i % 5 ? S * 0.38 : S * 0.33;
      g.lineWidth = i % 5 ? S * 0.008 : S * 0.018;
      g.beginPath(); g.moveTo(Math.sin(a) * r0, -Math.cos(a) * r0); g.lineTo(Math.sin(a) * S * 0.42, -Math.cos(a) * S * 0.42); g.stroke();
    }
    g.fillStyle = '#151515'; g.font = `700 ${S * 0.09}px Inter, 'DejaVu Sans', sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    [['60', 0], ['15', 1], ['30', 2], ['45', 3]].forEach(([t, k]) => { const a = k * TAU / 4; g.fillText(t, Math.sin(a) * S * 0.25, -Math.cos(a) * S * 0.25); });
    g.strokeStyle = '#d62424'; g.lineWidth = S * 0.022; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, S * 0.06); g.lineTo(S * 0.02, -S * 0.36); g.stroke();
    g.fillStyle = '#d62424'; g.beginPath(); g.arc(0, 0, S * 0.03, 0, TAU); g.fill();
    return canvasTexture(c);
  });
}

export function letterTexture(ctx) {
  return cached(ctx, 'chr:tex:letter', () => {
    const W = 256, H = 160, c = makeCanvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#f6f1e4'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#c9bfa6'; g.lineWidth = 4; g.beginPath(); g.moveTo(4, 4); g.lineTo(W / 2, H * 0.58); g.lineTo(W - 4, 4); g.stroke();
    g.strokeRect(3, 3, W - 6, H - 6);
    g.fillStyle = '#c8282e'; const s = 22, cx = W / 2, cy = H * 0.56;
    g.beginPath(); g.moveTo(cx, cy + s * 0.85); g.bezierCurveTo(cx - s * 1.3, cy - s * 0.1, cx - s * 0.55, cy - s, cx, cy - s * 0.35); g.bezierCurveTo(cx + s * 0.55, cy - s, cx + s * 1.3, cy - s * 0.1, cx, cy + s * 0.85); g.fill();
    return canvasTexture(c);
  });
}

export function screenTexture(ctx) {
  return cached(ctx, 'chr:tex:screen', () => {
    const W = 64, H = 128, c = makeCanvas(W, H), g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#5fb6ff'); gr.addColorStop(1, '#2b5fd9');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) { g.beginPath(); g.roundRect(6 + i * 14, 14 + j * 20, 10, 10, 3); g.fill(); }
    return canvasTexture(c);
  });
}

export { mix };
