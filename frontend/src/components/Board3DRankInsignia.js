import * as THREE from 'three';
import { pieceRankInsignia } from '../combatRanks.js';

export const BOARD3D_RANK_INSIGNIA_NAME = 'combat-rank-insignia';

const FAMILY_FINISH = Object.freeze({
  enlisted: 0xb47d42,
  nco: 0xc59a52,
  officer: 0xd2b16a,
  senior: 0xd8c08a,
  general: 0xe1cf9c,
});

function rectShape(width, height, x = 0, y = 0) {
  const shape = new THREE.Shape();
  shape.moveTo(x - width / 2, y - height / 2);
  shape.lineTo(x + width / 2, y - height / 2);
  shape.lineTo(x + width / 2, y + height / 2);
  shape.lineTo(x - width / 2, y + height / 2);
  shape.closePath();
  return shape;
}

function polygonShape(points) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], index) => {
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  return shape;
}

function chevronShape(offsetY = 0) {
  return polygonShape([
    [-0.082, 0.018 + offsetY],
    [0, -0.036 + offsetY],
    [0.082, 0.018 + offsetY],
    [0.082, 0.046 + offsetY],
    [0, -0.008 + offsetY],
    [-0.082, 0.046 + offsetY],
  ]);
}

function shieldShape() {
  return polygonShape([
    [-0.074, 0.045], [0.074, 0.045], [0.065, -0.014],
    [0, -0.062], [-0.065, -0.014],
  ]);
}

function diamondShape(size = 0.065, y = 0) {
  return polygonShape([[0, y + size], [size, y], [0, y - size], [-size, y]]);
}

function leafShape() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.065);
  shape.bezierCurveTo(0.09, -0.035, 0.09, 0.04, 0, 0.07);
  shape.bezierCurveTo(-0.09, 0.04, -0.09, -0.035, 0, -0.065);
  shape.closePath();
  return shape;
}

function eagleShape() {
  return polygonShape([
    [0, 0.018], [-0.035, 0.056], [-0.12, 0.04], [-0.072, 0.004],
    [-0.112, -0.028], [-0.036, -0.02], [0, -0.065],
    [0.036, -0.02], [0.112, -0.028], [0.072, 0.004],
    [0.12, 0.04], [0.035, 0.056],
  ]);
}

function starShape() {
  const shape = new THREE.Shape();
  const outer = 0.078;
  const inner = 0.034;
  for (let index = 0; index < 10; index += 1) {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = Math.PI / 2 + index * Math.PI / 5;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function shapesForIcon(icon) {
  switch (icon) {
    case 'diamond': return [diamondShape(0.064)];
    case 'chevron': return [chevronShape()];
    case 'shield': return [shieldShape()];
    case 'bar': return [rectShape(0.132, 0.032)];
    case 'double-bar': return [rectShape(0.132, 0.028, 0, -0.026), rectShape(0.132, 0.028, 0, 0.026)];
    case 'leaf': return [leafShape()];
    case 'eagle': return [eagleShape()];
    case 'star': return [starShape()];
    default: return [];
  }
}

export function board3DRankInsigniaPlan(rankOrLevel) {
  const insignia = pieceRankInsignia(rankOrLevel);
  if (!insignia?.icon || insignia.icon === 'none') return null;
  return Object.freeze({
    rankId: insignia.rankId,
    label: insignia.label,
    icon: insignia.icon,
    family: insignia.family,
    color: FAMILY_FINISH[insignia.family] || FAMILY_FINISH.nco,
  });
}

function disposeInsignia(object) {
  if (!object) return;
  object.traverse?.((child) => {
    child.geometry?.dispose?.();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material?.dispose?.());
  });
}

function removeExisting(piece) {
  const existing = piece?.getObjectByName?.(BOARD3D_RANK_INSIGNIA_NAME);
  if (!existing) return false;
  existing.parent?.remove(existing);
  disposeInsignia(existing);
  return true;
}

export function buildBoard3DRankInsignia(rankOrLevel, {
  faceTowardCamera = true,
  coarsePointer = false,
} = {}) {
  const plan = board3DRankInsigniaPlan(rankOrLevel);
  if (!plan) return null;

  const shapes = shapesForIcon(plan.icon);
  if (!shapes.length) return null;

  const depth = coarsePointer ? 0.018 : 0.015;
  const geometry = new THREE.ExtrudeGeometry(shapes, {
    depth,
    bevelEnabled: !coarsePointer,
    bevelThickness: coarsePointer ? 0 : 0.004,
    bevelSize: coarsePointer ? 0 : 0.003,
    bevelSegments: coarsePointer ? 0 : 1,
    curveSegments: coarsePointer ? 4 : 8,
  });
  const material = new THREE.MeshPhysicalMaterial({
    color: plan.color,
    metalness: 0.78,
    roughness: 0.3,
    clearcoat: 0.28,
    clearcoatRoughness: 0.22,
    envMapIntensity: 0.92,
  });
  const mesh = new THREE.Mesh(geometry, material);
  const front = faceTowardCamera ? 1 : -1;

  mesh.name = BOARD3D_RANK_INSIGNIA_NAME;
  mesh.position.set(0, 0.13, front * 0.347);
  if (front < 0) mesh.rotation.y = Math.PI;
  mesh.scale.setScalar(coarsePointer ? 1.08 : 1);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 3;
  mesh.userData.board3DRankInsignia = true;
  mesh.userData.rankId = plan.rankId;
  mesh.userData.rankLabel = plan.label;
  mesh.userData.rankIcon = plan.icon;
  mesh.userData.rankFront = front;
  mesh.userData.diegeticFinish = 'raised-brass-plinth-v1';
  return mesh;
}

export function syncBoard3DRankInsignias(pieceMeshes, {
  pieceLevels,
  pieceRankLevels,
  faceTowardCamera = true,
  coarsePointer = false,
} = {}) {
  if (!pieceMeshes?.entries) return 0;
  const front = faceTowardCamera ? 1 : -1;
  let visible = 0;

  for (const [square, piece] of pieceMeshes.entries()) {
    if (!piece) continue;
    const rankOrLevel = pieceRankLevels?.[square] ?? pieceLevels?.[square];
    const plan = board3DRankInsigniaPlan(rankOrLevel);
    const existing = piece.getObjectByName?.(BOARD3D_RANK_INSIGNIA_NAME) || null;

    if (!plan) {
      if (existing) removeExisting(piece);
      delete piece.userData.board3DRankId;
      continue;
    }

    if (existing?.userData?.rankId === plan.rankId && existing.userData.rankFront === front) {
      piece.userData.board3DRankId = plan.rankId;
      visible += 1;
      continue;
    }

    if (existing) removeExisting(piece);
    const insignia = buildBoard3DRankInsignia(rankOrLevel, { faceTowardCamera, coarsePointer });
    if (!insignia) continue;
    piece.add(insignia);
    piece.userData.board3DRankId = plan.rankId;
    visible += 1;
  }

  return visible;
}
