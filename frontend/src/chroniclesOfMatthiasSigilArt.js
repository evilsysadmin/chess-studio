import * as THREE from 'three';

const ROOT_NAME = 'chronicles-tactics-inlaid-sigil';
const LEGACY_NAME = 'chronicles-iso-sigil';

export const CHRONICLES_TACTICS_SIGIL_STYLE = Object.freeze({
  radius: 0.78,
  outerWidth: 0.052,
  innerWidth: 0.036,
  runeWidth: 0.026,
  color: 0xa98247,
  opacity: 0.62,
});

function point(radius, angle) {
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
}

function strip(segments, from, to, width) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz) || 1;
  const nx = (-dz / length) * width * 0.5;
  const nz = (dx / length) * width * 0.5;
  const a = [from.x + nx, 0, from.z + nz];
  const b = [from.x - nx, 0, from.z - nz];
  const c = [to.x - nx, 0, to.z - nz];
  const d = [to.x + nx, 0, to.z + nz];
  segments.push(a, b, c, a, c, d);
}

export function chroniclesTacticsSigilSegments() {
  const result = [];
  const radius = CHRONICLES_TACTICS_SIGIL_STYLE.radius;
  const octagon = Array.from({ length: 8 }, (_, index) => point(radius, Math.PI / 8 + index * Math.PI / 4));
  // Two deliberate breaks keep this from reading as another perfect UI ring.
  const omitted = new Set([2, 6]);
  octagon.forEach((from, index) => {
    if (omitted.has(index)) return;
    strip(result, from, octagon[(index + 1) % octagon.length], CHRONICLES_TACTICS_SIGIL_STYLE.outerWidth);
  });

  const diamond = Array.from({ length: 4 }, (_, index) => point(0.43, Math.PI / 4 + index * Math.PI / 2));
  diamond.forEach((from, index) => {
    strip(result, from, diamond[(index + 1) % diamond.length], CHRONICLES_TACTICS_SIGIL_STYLE.innerWidth);
  });

  for (let index = 0; index < 8; index += 1) {
    const angle = index * Math.PI / 4;
    strip(result, point(0.51, angle), point(0.67, angle), CHRONICLES_TACTICS_SIGIL_STYLE.runeWidth);
  }

  // Four short centre cuts make the motif authored rather than a generic target reticle.
  const centre = 0.15;
  const centreRadius = 0.09;
  [
    [{ x: -centre, z: -centreRadius }, { x: -centreRadius, z: -centre }],
    [{ x: centreRadius, z: -centre }, { x: centre, z: -centreRadius }],
    [{ x: centre, z: centreRadius }, { x: centreRadius, z: centre }],
    [{ x: -centreRadius, z: centre }, { x: -centre, z: centreRadius }],
  ].forEach(([from, to]) => strip(result, from, to, CHRONICLES_TACTICS_SIGIL_STYLE.runeWidth));
  return result;
}

export function buildChroniclesTacticsSigilGeometry() {
  const triangles = chroniclesTacticsSigilSegments();
  const flat = triangles.flat();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(flat, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

export function installChroniclesTacticsSigilArt(scene) {
  if (!scene?.add) return null;
  const existing = scene.getObjectByName(ROOT_NAME);
  if (existing) return existing;

  const legacy = scene.getObjectByName(LEGACY_NAME);
  if (!legacy?.parent || !legacy.visible) return null;
  legacy.visible = false;
  legacy.userData.chroniclesSigilReplacement = 'inlaid-v1';

  const root = new THREE.Group();
  root.name = ROOT_NAME;
  root.position.copy(legacy.position);
  root.position.y += 0.018;

  const material = new THREE.MeshBasicMaterial({
    color: CHRONICLES_TACTICS_SIGIL_STYLE.color,
    transparent: true,
    opacity: CHRONICLES_TACTICS_SIGIL_STYLE.opacity,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  material.userData.chroniclesIsoOwned = true;

  const inlay = new THREE.Mesh(buildChroniclesTacticsSigilGeometry(), material);
  inlay.name = 'chronicles-tactics-inlaid-sigil-mesh';
  inlay.renderOrder = 5;
  inlay.castShadow = false;
  inlay.receiveShadow = false;
  root.add(inlay);
  legacy.parent.add(root);

  root.userData.chroniclesSigilDrawCalls = 1;
  root.userData.chroniclesSigilLegacyName = LEGACY_NAME;
  return root;
}
