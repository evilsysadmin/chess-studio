import * as THREE from 'three';

export const CHRONICLES_TACTICS_PARTY_GROUNDING_STYLE = Object.freeze({
  motif: 'contact-shadows',
  desktopOpacity: 0.2,
  coarseOpacity: 0.14,
  y: 0.016,
});

const PARTY_IDS = Object.freeze(['rook', 'matthias', 'bishop', 'knight']);

export function installChroniclesTacticsPartyGrounding(models, { coarsePointer = false } = {}) {
  if (!models?.get) return null;
  const partyRoot = PARTY_IDS.map((id) => models.get(id)?.parent).find(Boolean) || null;
  if (!partyRoot?.add) return null;

  const existing = partyRoot.getObjectByName?.('chronicles-party-grounding');
  if (existing) return existing;

  const root = new THREE.Group();
  root.name = 'chronicles-party-grounding';

  const material = new THREE.MeshBasicMaterial({
    color: 0x100d0b,
    transparent: true,
    opacity: coarsePointer
      ? CHRONICLES_TACTICS_PARTY_GROUNDING_STYLE.coarseOpacity
      : CHRONICLES_TACTICS_PARTY_GROUNDING_STYLE.desktopOpacity,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  });
  material.userData.chroniclesIsoOwned = true;
  const geometry = new THREE.CircleGeometry(1, coarsePointer ? 12 : 20);

  PARTY_IDS.forEach((id) => {
    const model = models.get(id);
    if (!model) return;
    const scale = Math.max(0.86, Number(model.scale?.x) || 1);
    const shadow = new THREE.Mesh(geometry, material);
    shadow.name = `chronicles-party-contact-shadow-${id}`;
    shadow.position.set(model.position.x, CHRONICLES_TACTICS_PARTY_GROUNDING_STYLE.y, model.position.z + 0.04);
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(0.52 * scale, 0.27 * scale, 1);
    shadow.castShadow = false;
    shadow.receiveShadow = false;
    shadow.renderOrder = 3;
    root.add(shadow);
  });

  partyRoot.add(root);
  return root;
}
