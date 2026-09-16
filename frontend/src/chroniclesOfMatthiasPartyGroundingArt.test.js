import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CHRONICLES_TACTICS_PARTY_GROUNDING_STYLE,
  installChroniclesTacticsPartyGrounding,
} from './chroniclesOfMatthiasPartyGroundingArt.js';

function partyModels() {
  const root = new THREE.Group();
  const models = new Map();
  [
    ['rook', -1.6, 0.08, 1.03],
    ['matthias', -0.54, 0.32, 1.07],
    ['bishop', 0.54, 0.32, 1.01],
    ['knight', 1.62, 0.08, 1.03],
  ].forEach(([id, x, z, scale]) => {
    const model = new THREE.Group();
    model.position.set(x, 0, z);
    model.scale.setScalar(scale);
    root.add(model);
    models.set(id, model);
  });
  return { root, models };
}

describe('Chronicles Tactics party grounding', () => {
  it('adds one restrained contact shadow under each party member', () => {
    const { root, models } = partyModels();
    const grounding = installChroniclesTacticsPartyGrounding(models, { coarsePointer: false });

    expect(grounding?.name).toBe('chronicles-party-grounding');
    expect(grounding?.children).toHaveLength(4);
    expect(root.getObjectByName('chronicles-party-contact-shadow-matthias')).toBeTruthy();
    grounding?.children.forEach((shadow) => {
      expect(shadow.position.y).toBeCloseTo(CHRONICLES_TACTICS_PARTY_GROUNDING_STYLE.y, 6);
      expect(shadow.renderOrder).toBe(3);
      expect(shadow.userData.chroniclesIsoCell).toBeUndefined();
      expect(shadow.userData.chroniclesIsoEnemyId).toBeUndefined();
    });
  });

  it('tracks the party formation coordinates instead of world-space positions', () => {
    const { models } = partyModels();
    const grounding = installChroniclesTacticsPartyGrounding(models);
    const matthias = models.get('matthias');
    const shadow = grounding?.getObjectByName('chronicles-party-contact-shadow-matthias');

    expect(shadow?.position.x).toBeCloseTo(matthias.position.x, 6);
    expect(shadow?.position.z).toBeCloseTo(matthias.position.z + 0.04, 6);
  });

  it('uses lower opacity on coarse pointers and is idempotent', () => {
    const { models } = partyModels();
    const first = installChroniclesTacticsPartyGrounding(models, { coarsePointer: true });
    const second = installChroniclesTacticsPartyGrounding(models, { coarsePointer: true });
    const material = first?.children[0]?.material;

    expect(second).toBe(first);
    expect(material?.opacity).toBe(CHRONICLES_TACTICS_PARTY_GROUNDING_STYLE.coarseOpacity);
  });

  it('fails closed without a party model map', () => {
    expect(installChroniclesTacticsPartyGrounding(null)).toBeNull();
  });
});
