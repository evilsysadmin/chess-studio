import * as THREE from 'three';

export const CHRONICLES_TACTICS_ENEMY_INTENT = Object.freeze({
  movementThreshold: 0.1,
  targetHalfSize: 0.72,
  floorY: 0.045,
});

const ROOT_NAME = 'chronicles-tactics-enemy-intent';
const ENEMY_PREFIX = 'chronicles-iso-enemy-';

export function chroniclesTacticsEnemyMotion(current, target) {
  if (!current || !target) return { moving: false, distance: 0 };
  const dx = Number(target.x || 0) - Number(current.x || 0);
  const dz = Number(target.z || 0) - Number(current.z || 0);
  const distance = Math.hypot(dx, dz);
  return {
    moving: distance > CHRONICLES_TACTICS_ENEMY_INTENT.movementThreshold,
    distance,
    dx,
    dz,
  };
}

function targetFrameGeometry() {
  const half = CHRONICLES_TACTICS_ENEMY_INTENT.targetHalfSize;
  return new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-half, 0, -half),
    new THREE.Vector3(half, 0, -half),
    new THREE.Vector3(half, 0, half),
    new THREE.Vector3(-half, 0, half),
  ]);
}

function pathGeometry() {
  return new THREE.BufferGeometry().setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3),
  );
}

function enemyIdFor(model) {
  return model?.userData?.chroniclesIsoEnemyId || (model?.name?.startsWith(ENEMY_PREFIX)
    ? model.name.slice(ENEMY_PREFIX.length)
    : '');
}

function discoverEnemyModels(scene) {
  const found = [];
  scene.traverse((object) => {
    const enemyId = enemyIdFor(object);
    if (enemyId) found.push({ enemyId, model: object });
  });
  return found;
}

function makeCue(root, enemyId, model, { coarsePointer }) {
  const material = new THREE.LineBasicMaterial({
    color: 0xa95745,
    transparent: true,
    opacity: coarsePointer ? 0.28 : 0.34,
    depthWrite: false,
  });
  material.userData.chroniclesIsoOwned = true;

  const frame = new THREE.LineLoop(targetFrameGeometry(), material);
  frame.name = `chronicles-tactics-enemy-target-${enemyId}`;
  frame.position.y = CHRONICLES_TACTICS_ENEMY_INTENT.floorY;
  frame.visible = false;
  frame.frustumCulled = false;
  root.add(frame);

  const pathMaterial = material.clone();
  pathMaterial.opacity = coarsePointer ? 0 : 0.2;
  pathMaterial.userData.chroniclesIsoOwned = true;
  const path = new THREE.Line(pathGeometry(), pathMaterial);
  path.name = `chronicles-tactics-enemy-path-${enemyId}`;
  path.visible = false;
  path.frustumCulled = false;
  root.add(path);

  return { enemyId, model, frame, path, phase: enemyId.length * 0.73 };
}

function updateCue(cue, time, { coarsePointer }) {
  const target = cue.model?.userData?.chroniclesIsoTarget;
  const motion = chroniclesTacticsEnemyMotion(cue.model?.position, target);
  const visible = Boolean(cue.model?.visible && target && motion.moving);
  cue.frame.visible = visible;
  cue.path.visible = visible && !coarsePointer;
  if (!visible) return;

  cue.frame.position.set(target.x, CHRONICLES_TACTICS_ENEMY_INTENT.floorY, target.z);
  const pulse = 1 + Math.sin(time * 5.2 + cue.phase) * 0.045;
  cue.frame.scale.setScalar(pulse);

  if (!coarsePointer) {
    const positions = cue.path.geometry.attributes.position;
    positions.setXYZ(0, cue.model.position.x, CHRONICLES_TACTICS_ENEMY_INTENT.floorY + 0.006, cue.model.position.z);
    positions.setXYZ(1, target.x, CHRONICLES_TACTICS_ENEMY_INTENT.floorY + 0.006, target.z);
    positions.needsUpdate = true;
  }
}

function attachEnemyCues(scene, root, options) {
  if (!scene || root.userData.chroniclesEnemyIntentAttached) return;
  const enemies = discoverEnemyModels(scene);
  const cues = enemies.map(({ enemyId, model }) => makeCue(root, enemyId, model, options));
  root.userData.chroniclesEnemyIntentAttached = true;
  root.userData.chroniclesEnemyIntentCues = cues;

  const previous = scene.onBeforeRender;
  const startedAt = performance.now();
  scene.onBeforeRender = function chroniclesEnemyIntentBeforeRender(...args) {
    previous?.apply(this, args);
    const time = (performance.now() - startedAt) / 1000;
    cues.forEach((cue) => updateCue(cue, time, options));
  };
}

export function installChroniclesTacticsEnemyIntentArt(scene, { coarsePointer = false } = {}) {
  if (!scene?.add) return null;
  const existing = scene.getObjectByName(ROOT_NAME);
  if (existing) return existing;

  const root = new THREE.Group();
  root.name = ROOT_NAME;
  root.userData.chroniclesEnemyIntentAttached = false;
  scene.add(root);

  // Enemy models are reconciled immediately after the party renderer is built.
  // Defer discovery one microtask so this pass stays decoupled from renderer
  // construction order and never scans the whole scene every frame.
  queueMicrotask(() => attachEnemyCues(scene, root, { coarsePointer }));
  return root;
}
