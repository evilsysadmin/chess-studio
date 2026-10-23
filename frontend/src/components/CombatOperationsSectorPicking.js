import * as THREE from 'three';
import { COMBAT_OPERATIONS_MAP_SURFACE } from '../combatOperationsMapProjection.js';

// Hit-test the *existing* physical seals in screen pixels. Enlarging the hit
// radius needs no invisible geometry, draw calls or alterations to chess picking.
export function pickCombatOperationsSector({ nodes, root, camera, rect, clientX, clientY, touchLike = false }) {
  if (!nodes?.length || !root || !camera || !rect?.width || !rect?.height) return null;
  root.updateWorldMatrix(true, false);
  camera.updateMatrixWorld();
  const cursorX = clientX - rect.left;
  const cursorY = clientY - rect.top;
  const radius = touchLike ? 26 : 16;
  let nearest = null;
  let distance = radius * radius;
  const point = new THREE.Vector3();
  for (const node of nodes) {
    point.set(node.x, node.y, COMBAT_OPERATIONS_MAP_SURFACE.nodeDepth);
    root.localToWorld(point);
    point.project(camera);
    if (point.z < -1 || point.z > 1) continue;
    const x = (point.x + 1) * rect.width / 2;
    const y = (1 - point.y) * rect.height / 2;
    const delta = (cursorX - x) ** 2 + (cursorY - y) ** 2;
    if (delta > distance) continue;
    nearest = node;
    distance = delta;
  }
  return nearest;
}

export function listenCombatOperationsSectorInspection({ canvas, camera, root, projection }) {
  if (!canvas || !projection?.nodes?.length || typeof projection.onInspect !== 'function') return () => {};
  let start = null;
  const onDown = (event) => {
    start = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const onCancel = () => { start = null; };
  const onUp = (event) => {
    const down = start;
    start = null;
    if (!down || down.id !== event.pointerId
      || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 12
      || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const sector = pickCombatOperationsSector({
      nodes: projection.nodes, root, camera,
      rect: canvas.getBoundingClientRect(),
      clientX: event.clientX, clientY: event.clientY,
      touchLike: event.pointerType === 'touch' || event.pointerType === 'pen',
    });
    if (sector) projection.onInspect(sector.id);
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  return () => {
    start = null;
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onCancel);
  };
}
