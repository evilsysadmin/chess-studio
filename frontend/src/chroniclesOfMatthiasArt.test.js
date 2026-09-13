import { describe, expect, it } from 'vitest';
import { buildChroniclesCharacter, buildCorruptedPawn, buildGateJailer } from './chroniclesOfMatthiasArt.js';

describe('Chronicles of Matthias 3D cast art', () => {
  it('gives every party member a distinct expedition silhouette', () => {
    const ids = ['matthias', 'rook', 'bishop', 'knight'];
    const models = ids.map((id) => buildChroniclesCharacter(id));

    expect(models.map((model) => model.userData.chroniclesCharacterId)).toEqual(ids);
    expect(new Set(models.map((model) => model.userData.chroniclesSilhouette)).size).toBe(4);

    expect(models[0].getObjectByName('matthias-expedition-cap')).toBeTruthy();
    expect(models[1].getObjectByName('hildegard-tower-shield')).toBeTruthy();
    expect(models[2].getObjectByName('aziz-lantern')).toBeTruthy();
    expect(models[3].getObjectByName('morcilla-pack-left')).toBeTruthy();
  });

  it('turns the corrupted pawn into a readable enemy asset instead of a generic pawn primitive', () => {
    const enemy = buildCorruptedPawn();

    expect(enemy.userData.chroniclesEnemy).toBe('corrupted-pawn');
    expect(enemy.getObjectByName('corrupted-pawn-fissure-ring')).toBeTruthy();
    expect(enemy.getObjectByName('corrupted-pawn-eye-left')).toBeTruthy();
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
    expect(jailer.userData.chroniclesGlowMaterials[0].emissiveIntensity).toBeGreaterThan(2);
  });

  it('keeps coarse-pointer geometry deliberately cheaper', () => {
    const desktop = buildChroniclesCharacter('matthias');
    const coarse = buildChroniclesCharacter('matthias', { coarsePointer: true });
    const desktopFace = desktop.getObjectByName('chronicles-face');
    const coarseFace = coarse.getObjectByName('chronicles-face');

    expect(desktopFace.geometry.attributes.position.count).toBeGreaterThan(coarseFace.geometry.attributes.position.count);
  });
});
