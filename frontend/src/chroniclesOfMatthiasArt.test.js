import { describe, expect, it } from 'vitest';
import { buildChroniclesCharacter, buildCorruptedPawn, buildGateJailer } from './chroniclesOfMatthiasArt.js';

describe('Chronicles of Matthias 3D cast art', () => {
  it('gives every party member a distinct expedition silhouette', () => {
    const ids = ['matthias', 'rook', 'bishop', 'knight'];
    const models = ids.map((id) => buildChroniclesCharacter(id));

    expect(models.map((model) => model.userData.chroniclesCharacterId)).toEqual(ids);
    expect(new Set(models.map((model) => model.userData.chroniclesSilhouette)).size).toBe(4);
    expect(models.map((model) => model.userData.chroniclesArtTier)).toEqual(ids.map(() => 'premium-cast-v2'));

    expect(models[0].getObjectByName('matthias-expedition-cap')).toBeTruthy();
    expect(models[1].getObjectByName('hildegard-tower-shield')).toBeTruthy();
    expect(models[2].getObjectByName('aziz-lantern')).toBeTruthy();
    expect(models[3].getObjectByName('morcilla-pack-left')).toBeTruthy();
  });

  it('adds premium readable detail without abandoning each chess-piece identity', () => {
    const matthias = buildChroniclesCharacter('matthias');
    const hildegard = buildChroniclesCharacter('rook');
    const aziz = buildChroniclesCharacter('bishop');
    const morcilla = buildChroniclesCharacter('knight');

    expect(matthias.getObjectByName('chronicles-nose')).toBeTruthy();
    expect(matthias.getObjectByName('matthias-lapel-left')).toBeTruthy();
    expect(matthias.getObjectByName('matthias-coat-button-2')).toBeTruthy();
    expect(matthias.getObjectByName('matthias-moustache-left')).toBeTruthy();

    expect(hildegard.getObjectByName('hildegard-pauldron-left')).toBeTruthy();
    expect(hildegard.getObjectByName('hildegard-face-slit')).toBeTruthy();
    expect(hildegard.getObjectByName('hildegard-eye-right')).toBeTruthy();
    expect(hildegard.getObjectByName('hildegard-shield-rivet-3')).toBeTruthy();

    expect(aziz.getObjectByName('aziz-scarf-clasp')).toBeTruthy();
    expect(aziz.getObjectByName('aziz-lantern-cage-ring')).toBeTruthy();
    expect(aziz.getObjectByName('aziz-lantern-cage-bar-1')).toBeTruthy();
    expect(aziz.getObjectByName('aziz-mitre-trim-right')).toBeTruthy();

    expect(morcilla.getObjectByName('morcilla-muzzle')).toBeTruthy();
    expect(morcilla.getObjectByName('morcilla-eye-left')).toBeTruthy();
    expect(morcilla.getObjectByName('morcilla-bridle-band')).toBeTruthy();
    expect(morcilla.getObjectByName('morcilla-pack-strap-right')).toBeTruthy();
  });

  it('gives fabric and leather a restrained physical sheen instead of plastic gloss', () => {
    const matthias = buildChroniclesCharacter('matthias');
    const hildegard = buildChroniclesCharacter('rook');
    const aziz = buildChroniclesCharacter('bishop');
    const morcilla = buildChroniclesCharacter('knight');

    expect(matthias.getObjectByName('matthias-expedition-coat').material.sheen).toBeGreaterThan(0.05);
    expect(hildegard.getObjectByName('hildegard-guard-body').material.sheen).toBeGreaterThan(0.05);
    expect(aziz.getObjectByName('aziz-bishop-robe').material.sheen).toBeGreaterThan(0.05);
    expect(morcilla.getObjectByName('morcilla-pack-left').material.sheen).toBeGreaterThan(0.05);
    expect(matthias.getObjectByName('matthias-coat-button-0').material.metalness).toBeGreaterThan(0.7);
  });

  it('turns the corrupted pawn into a readable enemy asset instead of a generic pawn primitive', () => {
    const enemy = buildCorruptedPawn();

    expect(enemy.userData.chroniclesEnemy).toBe('corrupted-pawn');
    expect(enemy.getObjectByName('corrupted-pawn-fissure-ring')).toBeTruthy();
    expect(enemy.getObjectByName('corrupted-pawn-eye-left')).toBeTruthy();
    expect(enemy.getObjectByName('corrupted-pawn-broken-collar')).toBeTruthy();
    expect(enemy.getObjectByName('corrupted-pawn-pauldron-left')).toBeTruthy();
    expect(enemy.getObjectByName('corrupted-pawn-neck-fissure')).toBeTruthy();
    expect(enemy.getObjectByName('corrupted-pawn-jaw-guard')).toBeTruthy();
    expect(enemy.userData.chroniclesGlowMaterials).toHaveLength(1);
    expect(enemy.userData.chroniclesGlowMaterials[0].emissiveIntensity).toBeGreaterThan(1);
  });

  it('gives the awakened gate encounter a corrupted rook silhouette of its own', () => {
    const jailer = buildGateJailer();

    expect(jailer.userData.chroniclesEnemy).toBe('gate-jailer');
    expect(jailer.userData.chroniclesSilhouette).toBe('corrupted-rook-jailer');
    expect(jailer.getObjectByName('gate-jailer-crown')).toBeTruthy();
    expect(jailer.getObjectByName('gate-jailer-key-ring')).toBeTruthy();
    expect(jailer.getObjectByName('gate-jailer-fissure-main')).toBeTruthy();
    expect(jailer.getObjectByName('gate-jailer-portcullis')).toBeTruthy();
    expect(jailer.getObjectByName('gate-jailer-lock-plate')).toBeTruthy();
    expect(jailer.getObjectByName('gate-jailer-keyhole')).toBeTruthy();
    expect(jailer.getObjectByName('gate-jailer-core')).toBeTruthy();
    expect(jailer.getObjectByName('gate-jailer-chain-anchor-1')).toBeTruthy();
    expect(jailer.userData.chroniclesGlowMaterials[0].emissiveIntensity).toBeGreaterThan(2);
  });

  it('keeps coarse-pointer geometry deliberately cheaper', () => {
    const desktop = buildChroniclesCharacter('matthias');
    const coarse = buildChroniclesCharacter('matthias', { coarsePointer: true });
    const desktopFace = desktop.getObjectByName('chronicles-face');
    const coarseFace = coarse.getObjectByName('chronicles-face');
    const desktopShoulder = desktop.getObjectByName('matthias-shoulder-left');
    const coarseShoulder = coarse.getObjectByName('matthias-shoulder-left');

    expect(desktopFace.geometry.attributes.position.count).toBeGreaterThan(coarseFace.geometry.attributes.position.count);
    expect(desktopShoulder.geometry.attributes.position.count).toBeGreaterThan(coarseShoulder.geometry.attributes.position.count);
  });
});
