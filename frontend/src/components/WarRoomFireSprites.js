import * as THREE from 'three';
import { createFireSprites, disposeFireSprites } from './fireSprites.js';

// Soft GPU fire for the Blender War Room shells. v2 has no separate flame nodes (the fire is
// baked into the hearth), only practical-light anchors, so the sprites root a fixed offset
// below each anchor; v3's small stove gets a smaller plume above its flame nodes.
export const WAR_ROOM_V2_FIRE_ANCHORS = Object.freeze([
  { anchor: 'WR_ANCHOR_fireplace_practical', salt: 11 },
  { anchor: 'WR_ANCHOR_right_fireplace_practical', salt: 12 },
]);
export const WAR_ROOM_V2_FIRE = Object.freeze({
  drop: 0.52, forward: -0.05, height: 0.62, spreadX: 0.30, spreadZ: 0.05, size: 0.22,
});

const BAKED_FLAME_MATERIAL = /^WR_MAT_fire(_core)?$/;

/**
 * v2 bakes the hearth flames into batched meshes (materials WR_MAT_fire / WR_MAT_fire_core),
 * so the sprites would be drawn on top of a second fire. Hide just those slots near the
 * hearth anchors; the chandelier candles use the same materials far from the hearths.
 */
export function hideBakedHearthFlames(root, anchors, { radius = 1.4, maxY = 3.2 } = {}) {
  const centres = anchors.map((node) => node.getWorldPosition(new THREE.Vector3()));
  const undo = [];
  root.updateMatrixWorld?.(true);
  root.traverse?.((mesh) => {
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (!materials.some((material) => BAKED_FLAME_MATERIAL.test(material?.name || ''))) return;
    const at = mesh.getWorldPosition(new THREE.Vector3());
    if (at.y > maxY || !centres.some((c) => Math.abs(c.x - at.x) < radius)) return;
    if (Array.isArray(mesh.material)) {
      const original = mesh.material;
      mesh.material = original.map((material) => {
        if (!BAKED_FLAME_MATERIAL.test(material?.name || '')) return material;
        const hidden = material.clone();
        hidden.visible = false;
        return hidden;
      });
      undo.push(() => { mesh.material = original; });
    } else {
      const was = mesh.visible;
      mesh.visible = false;
      undo.push(() => { mesh.visible = was; });
    }
  });
  return () => undo.forEach((fn) => fn());
}

export function installWarRoomV2FireSprites(root, { coarsePointer = false, reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false } = {}) {
  if (reducedMotion) return () => {};
  const made = [];
  for (const { anchor, salt } of WAR_ROOM_V2_FIRE_ANCHORS) {
    const node = root?.getObjectByName?.(anchor);
    if (!node?.parent) continue;
    const cfg = WAR_ROOM_V2_FIRE;
    const points = createFireSprites({
      base: [node.position.x, node.position.y - cfg.drop, node.position.z + cfg.forward],
      salt,
      name: `${anchor}-fire-sprites`,
      coarsePointer,
      height: cfg.height,
      spreadX: cfg.spreadX,
      spreadZ: cfg.spreadZ,
      size: cfg.size,
    });
    node.parent.add(points);
    made.push(points);
  }
  if (made.length) root.userData.warRoomFireSprites = made.length;
  const restoreFlames = made.length
    ? hideBakedHearthFlames(root, WAR_ROOM_V2_FIRE_ANCHORS.map(({ anchor }) => root.getObjectByName(anchor)).filter(Boolean))
    : () => {};
  return () => {
    restoreFlames();
    made.forEach(disposeFireSprites);
    if (root?.userData) delete root.userData.warRoomFireSprites;
  };
}

export function installWarRoomV3StoveFireSprites(flames, { coarsePointer = false, reducedMotion = false } = {}) {
  const parent = flames?.[0]?.parent;
  if (reducedMotion || !parent) return () => {};
  const xs = flames.map((flame) => flame.position.x);
  const zs = flames.map((flame) => flame.position.z);
  const points = createFireSprites({
    base: [
      xs.reduce((a, b) => a + b, 0) / xs.length,
      Math.min(...flames.map((flame) => flame.position.y)) - 0.05,
      zs.reduce((a, b) => a + b, 0) / zs.length,
    ],
    salt: 21,
    name: 'war-room-v3-stove-fire-sprites',
    coarsePointer,
    height: 0.55,
    spreadX: 0.16,
    spreadZ: 0.10,
    size: 0.17,
  });
  parent.add(points);
  // The authored stove flames would be a second fire under the sprites: keep them rendering
  // (their onBeforeRender drives the flicker and light) but fully transparent.
  const restore = flames.map((flame) => {
    const original = flame.material;
    if (!original) return () => {};
    const faded = (Array.isArray(original) ? original : [original]).map((material) => {
      const clone = material.clone();
      clone.transparent = true;
      clone.opacity = 0;
      clone.depthWrite = false;
      return clone;
    });
    flame.material = Array.isArray(original) ? faded : faded[0];
    return () => { flame.material = original; };
  });
  return () => {
    restore.forEach((fn) => fn());
    disposeFireSprites(points);
  };
}
