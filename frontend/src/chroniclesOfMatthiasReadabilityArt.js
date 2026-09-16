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
  // Keep the north/west outer crypt shell monumental. Interior blockers become
  // tactical cover so the behind-party camera can read enemies and routes.
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

export function installChroniclesTacticsReadabilityArt(models) {
  if (!models?.get) return null;
  const partyRoot = PARTY_IDS.map((id) => models.get(id)?.parent).find(Boolean) || null;
  const scene = partyRoot?.parent || null;
  if (!scene?.add) return null;

  scaleParty(models);
  return { cutawayWalls: cutAwayInteriorWalls(scene) };
}
