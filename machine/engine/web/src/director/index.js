// STUB — to be replaced by the engine-core owner. Contract: ARCHITECTURE.md §5.
export const FRAMINGS = ['medium'];
export const MOVES = ['static', 'push_in'];
export function frameShot(ctx, { framing = 'medium', move = 'static', subject, set, duration = 1.5 }) {
  const { THREE, camera } = ctx;
  let target = new THREE.Vector3(0, 3, 0), pos = new THREE.Vector3(0, 4, 14);
  if (subject && subject.root) { const p = subject.root.position; const yaw = subject.root.rotation.y; const dist = framing === 'close_up' ? 5 : 10;
    target = new THREE.Vector3(p.x, p.y + subject.height * 0.75, p.z); pos = new THREE.Vector3(p.x + Math.sin(yaw) * dist, target.y + 0.5, p.z + Math.cos(yaw) * dist); }
  else if (set?.cameraHints?.[framing]) { const h = set.cameraHints[framing]; pos = new THREE.Vector3(...h.pos); target = new THREE.Vector3(...h.target); }
  camera.fov = 50; camera.updateProjectionMatrix();
  return { update(t) { const k = move === 'push_in' ? 1 - 0.1 * (t / duration) : 1; camera.position.copy(target).addScaledVector(pos.clone().sub(target), k); camera.lookAt(target); } };
}
