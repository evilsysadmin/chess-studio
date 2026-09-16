import * as THREE from 'three';

export const CHRONICLES_TACTICS_PARTY_READABILITY_SCALE = 0.84;
export const CHRONICLES_TACTICS_CUTAWAY_HEIGHT = 1.08;

const PARTY_IDS = Object.freeze(['rook', 'matthias', 'bishop', 'knight']);
const WALL_NAME = /^chronicles-iso-wall-(\d+)-(\d+)$/;

export function chroniclesTacticsWallCell(name) {
  const match = WALL_NAME.exec(String(name || ''));
  if (!match) return null;
  return { x: Number(match[1]), y: Number(match[2]) };
}

export function chroniclesTacticsNeedsInteriorCutaway(name) {
  const cell = chroniclesTacticsWallCell(name);
  if (!cell) return false;
  // Keep the outer crypt shell monumental. Interior blockers become tactical
  // cover so the behind-party camera can actually read enemies and routes.
  return cell.x > 0 && cell.y > 1;
}

function scaleParty(models) {
  PARTY_IDS.forEach((id) => {
    const model = models.get(id);
    if (!model || model.userData.chroniclesTacticsReadabilityScaled) return;
    model.scale.multiplyScalar(CHRONICLES_TACTICS_PARTY_READABILITY_SCALE);
    model.userData.chroniclesTacticsReadabilityScaled = true;
  });
}

function boxHeight(mesh) {
  return Number(mesh?.geometry?.parameters?.height || 0);
}

function sameWallColumn(a, b) {
  return Math.abs(Number(a?.position?.x || 0) - Number(b?.position?.x || 0)) < 0.001
    && Math.abs(Number(a?.position?.z || 0) - Number(b?.position?.z || 0)) < 0.001;
}

function cutAwayInteriorWalls(scene) {
  const dungeon = scene.getObjectByName('chronicles-isometric-dungeon');
  if (!dungeon?.children) return 0;

  let changed = 0;
  const children = [...dungeon.children];
  children.forEach((wall) => {
    if (!chroniclesTacticsNeedsInteriorCutaway(wall.name)) return;
    if (wall.userData.chroniclesTacticsCutaway) return;

    const sourceHeight = Math.max(0.01, boxHeight(wall) || 2.65);
    const scaleY = CHRONICLES_TACTICS_CUTAWAY_HEIGHT / sourceHeight;
    wall.scale.y *= scaleY;
    wall.position.y = CHRONICLES_TACTICS_CUTAWAY_HEIGHT / 2 - 0.02;
    wall.userData.chroniclesTacticsCutaway = true;
    changed += 1;

    children.forEach((detail) => {
      if (detail === wall || !detail.isMesh || !sameWallColumn(wall, detail)) return;
      const height = boxHeight(detail);
      if (!height || height > 0.2) return;

      if (height >= 0.1) {
        // The former wall cap becomes the cap of the waist-high tactical wall.
        detail.position.y = CHRONICLES_TACTICS_CUTAWAY_HEIGHT + height / 2 - 0.01;
        detail.visible = true;
      } else if (detail.position.y > CHRONICLES_TACTICS_CUTAWAY_HEIGHT * 0.78) {
        // High decorative bands would float after the cutaway; keep only the
        // low masonry band so the obstacle still reads as authored stone.
        detail.visible = false;
      }
    });
  });
  return changed;
}

function installReadabilityLights(scene, { coarsePointer }) {
  const existing = scene.getObjectByName('chronicles-tactics-readability-light');
  if (existing) return existing;

  const root = new THREE.Group();
  root.name = 'chronicles-tactics-readability-light';

  const cool = new THREE.DirectionalLight(0x9fb9c8, coarsePointer ? 0.28 : 0.42);
  cool.position.set(0, 5.5, 7.5);
  cool.target.position.set(0, 0.6, -2.5);
  root.add(cool, cool.target);

  const warm = new THREE.PointLight(0xd08b4d, coarsePointer ? 0.2 : 0.3, 11, 2);
  warm.position.set(-2.6, 2.1, 3.5);
  root.add(warm);

  scene.add(root);
  return root;
}

export function installChroniclesTacticsReadabilityArt(models, { coarsePointer = false } = {}) {
  if (!models?.get) return null;
  const partyRoot = PARTY_IDS.map((id) => models.get(id)?.parent).find(Boolean) || null;
  const scene = partyRoot?.parent || null;
  if (!scene?.add) return null;

  scaleParty(models);
  const cutawayWalls = cutAwayInteriorWalls(scene);
  const lights = installReadabilityLights(scene, { coarsePointer });

  return { cutawayWalls, lights };
}
