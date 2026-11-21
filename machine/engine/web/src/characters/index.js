// STUB — to be replaced by the characters module owner. Contract: ARCHITECTURE.md §3.
export const FACES = ['neutral', 'smile'];
export const POSES = ['stand'];
export const HAIR_STYLES = ['short'];
export const SHIRT_PATTERNS = ['solid'];
export const PROPS_HELD = [];
export function randomSpec(rng, o = {}) { return { build: 'adult', skin: '#f2c8a0', shirt: { pattern: 'solid', colors: ['#' + Math.floor(rng() * 0xffffff).toString(16).padStart(6, '0')] }, pants: { color: '#334' }, ...o }; }
export function createCharacter(ctx, spec = {}) {
  const { THREE } = ctx; const root = new THREE.Group();
  const s = spec.build === 'kid' ? 0.82 : 1;
  const mk = (w, h, d, c, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: c })); m.position.set(x, y, 0); m.castShadow = true; root.add(m); return m; };
  mk(2, 2, 1, spec.shirt?.colors?.[0] || '#36c', 0, 3);
  mk(1, 2, 1, spec.pants?.color || '#333', -0.5, 1); mk(1, 2, 1, spec.pants?.color || '#333', 0.5, 1);
  mk(1, 2, 1, spec.skin || '#f2c8a0', -1.5, 3); mk(1, 2, 1, spec.skin || '#f2c8a0', 1.5, 3);
  mk(1.2, 1.2, 1.2, spec.skin || '#f2c8a0', 0, 4.6);
  root.scale.setScalar(s);
  return { root, height: 5.2 * s, setFace() {}, setPose() {}, setProp() {}, update() {},
    anchors() { const v = (y) => root.localToWorld(new THREE.Vector3(0, y, 0)); return { head: v(4.6), eyes: v(4.7), chest: v(3.2), hands: v(2.2), feet: v(0) }; } };
}
