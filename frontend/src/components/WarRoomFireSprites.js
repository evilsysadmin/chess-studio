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
  return () => {
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
  return () => disposeFireSprites(points);
}
