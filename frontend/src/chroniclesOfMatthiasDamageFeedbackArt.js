import * as THREE from 'three';

const ROOT_NAME = 'chronicles-party-damage-feedback';
const PARTY_IDS = Object.freeze(['rook', 'matthias', 'bishop', 'knight']);

export const CHRONICLES_TACTICS_DAMAGE_FEEDBACK = Object.freeze({
  lifetimeMs: 180,
  floorY: 0.055,
});

export function chroniclesTacticsDamageTransition(previousRatio, nextRatio) {
  const previous = Number(previousRatio);
  const next = Number(nextRatio);
  if (!Number.isFinite(previous) || !Number.isFinite(next) || next >= previous) {
    return { hit: false, delta: 0, severity: 0 };
  }
  const delta = Math.max(0, previous - next);
  return {
    hit: true,
    delta,
    severity: Math.min(1, 0.35 + delta * 2.5),
  };
}

function ringGeometry() {
  const half = 0.55;
  return new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, -half),
    new THREE.Vector3(half, 0, 0),
    new THREE.Vector3(0, 0, half),
    new THREE.Vector3(-half, 0, 0),
  ]);
}

function slashGeometry() {
  return new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.28, 0.22, 0), new THREE.Vector3(0.28, 0.78, 0),
    new THREE.Vector3(0.25, 0.26, 0), new THREE.Vector3(-0.22, 0.70, 0),
  ]);
}

function makeMemberCue(root, memberId, model, { coarsePointer }) {
  const floorMaterial = new THREE.LineBasicMaterial({
    color: 0xb85a43,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  floorMaterial.userData.chroniclesIsoOwned = true;

  const floor = new THREE.LineLoop(ringGeometry(), floorMaterial);
  floor.name = `chronicles-party-hit-floor-${memberId}`;
  floor.position.set(model.position.x, CHRONICLES_TACTICS_DAMAGE_FEEDBACK.floorY, model.position.z);
  floor.visible = false;
  floor.frustumCulled = false;
  root.add(floor);

  const slashMaterial = floorMaterial.clone();
  slashMaterial.opacity = 0.82;
  slashMaterial.depthTest = false;
  slashMaterial.userData.chroniclesIsoOwned = true;
  const slash = new THREE.LineSegments(slashGeometry(), slashMaterial);
  slash.name = `chronicles-party-hit-slash-${memberId}`;
  slash.position.set(model.position.x, 0, model.position.z - 0.03);
  slash.visible = false;
  slash.frustumCulled = false;
  root.add(slash);

  if (coarsePointer) slash.visible = false;
  return { memberId, model, floor, slash, timer: null, coarsePointer };
}

function hideCue(cue) {
  cue.floor.visible = false;
  cue.slash.visible = false;
}

function flashCue(cue, transition) {
  if (!transition.hit) return;
  if (cue.timer) clearTimeout(cue.timer);

  const scale = 0.9 + transition.severity * 0.42;
  cue.floor.scale.setScalar(scale);
  cue.slash.scale.setScalar(0.82 + transition.severity * 0.34);
  cue.floor.visible = true;
  cue.slash.visible = !cue.coarsePointer;

  cue.timer = setTimeout(() => {
    cue.timer = null;
    hideCue(cue);
  }, CHRONICLES_TACTICS_DAMAGE_FEEDBACK.lifetimeMs);
}

function watchHpRatio(cue) {
  const userData = cue.model.userData;
  if (userData.chroniclesDamageFeedbackHpWatched) return;

  let currentRatio = userData.chroniclesIsoHpRatio;
  Object.defineProperty(userData, 'chroniclesIsoHpRatio', {
    configurable: true,
    enumerable: true,
    get() { return currentRatio; },
    set(nextRatio) {
      const transition = chroniclesTacticsDamageTransition(currentRatio, nextRatio);
      currentRatio = nextRatio;
      flashCue(cue, transition);
    },
  });
  userData.chroniclesDamageFeedbackHpWatched = true;
}

export function installChroniclesTacticsDamageFeedbackArt(models, { coarsePointer = false } = {}) {
  if (!models?.get) return null;
  const partyRoot = PARTY_IDS.map((id) => models.get(id)?.parent).find(Boolean) || null;
  if (!partyRoot?.add) return null;

  const existing = partyRoot.getObjectByName(ROOT_NAME);
  if (existing) return existing;

  const root = new THREE.Group();
  root.name = ROOT_NAME;
  partyRoot.add(root);

  const cues = PARTY_IDS
    .map((memberId) => ({ memberId, model: models.get(memberId) }))
    .filter(({ model }) => Boolean(model))
    .map(({ memberId, model }) => makeMemberCue(root, memberId, model, { coarsePointer }));
  cues.forEach(watchHpRatio);
  root.userData.chroniclesDamageFeedbackCues = cues;
  return root;
}
