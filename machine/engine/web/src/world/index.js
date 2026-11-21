// STUB — to be replaced by the world module owner. Contract: ARCHITECTURE.md §4.
export const SETS = ['lake_dock'];
export const PROPS = [];
export function createProp(ctx) { return new ctx.THREE.Group(); }
export function createSet(ctx, id, opts = {}) {
  const { THREE } = ctx; const group = new THREE.Group();
  const g = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#6a9a45' }));
  g.rotation.x = -Math.PI / 2; g.receiveShadow = true; group.add(g);
  const crowd = []; for (let i = 0; i < 12; i++) crowd.push({ x: -12 + i * 2.2, y: 0, z: -8, yaw: 0 });
  return { group, interior: false, waterLevel: null,
    marks: { A: { x: 0, y: 0, z: 0, yaw: 0 }, B: { x: 3, y: 0, z: 0, yaw: 0 }, C: { x: -3, y: 0, z: 0, yaw: 0 }, D: { x: 0, y: 0, z: -4, yaw: 0 }, crowd },
    pois: { lake: { x: 0, y: 0, z: -50 }, across: { x: 0, y: 0, z: -80 } },
    cameraHints: { establishing: { pos: [0, 12, 30], target: [0, 2, 0], fov: 50 }, aerial: { pos: [0, 60, 40], target: [0, 0, -20], fov: 50 }, wide: { pos: [0, 4, 20], target: [0, 2.5, 0], fov: 50 } },
    update() {} };
}
export function applyEnvironment(ctx, { time = 'day' } = {}) {
  const { THREE, scene } = ctx;
  scene.background = new THREE.Color(time === 'night' ? '#0b1630' : '#8fc1ee');
  scene.add(new THREE.HemisphereLight('#dfefff', '#6b5a40', 1.3));
  const d = new THREE.DirectionalLight('#ffffff', 2.0); d.position.set(20, 40, 25); d.castShadow = true; d.shadow.mapSize.set(2048, 2048);
  Object.assign(d.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40 }); scene.add(d);
}
