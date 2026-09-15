import { describe, expect, it } from 'vitest';
import { buildScavengerKnight } from './chroniclesOfMatthiasScavengerKnight.js';
import { buildSpectralBishop } from './chroniclesOfMatthiasSpectralBishop.js';

function materials(root) {
  const found = [];
  root.traverse((node) => {
    const values = Array.isArray(node.material) ? node.material : [node.material];
    values.filter(Boolean).forEach((material) => found.push(material));
  });
  return found;
}

describe('Chronicles Tactics premium enemy art', () => {
  it('gives the scavenger knight a readable armored threat silhouette', () => {
    const model = buildScavengerKnight();
    expect(model.userData.chroniclesArtTier).toBe('premium-threat-v2');
    expect(model.getObjectByName('scavenger-knight-amber-eye-left')).toBeTruthy();
    expect(model.getObjectByName('scavenger-knight-amber-eye')).toBeTruthy();
    expect(model.getObjectByName('scavenger-knight-muzzle-spike')).toBeTruthy();
    expect(model.getObjectByName('scavenger-knight-scrap-chest')).toBeTruthy();
    expect(materials(model).every((entry) => entry.userData.chroniclesOwnedMaterial)).toBe(true);
  });

  it('gives the spectral bishop a restrained halo/core silhouette and owned materials', () => {
    const model = buildSpectralBishop();
    expect(model.userData.chroniclesArtTier).toBe('premium-threat-v2');
    expect(model.getObjectByName('spectral-bishop-head-halo')).toBeTruthy();
    expect(model.getObjectByName('spectral-bishop-chest-core')).toBeTruthy();
    expect(model.getObjectByName('spectral-bishop-wisp-left')).toBeTruthy();
    expect(model.getObjectByName('spectral-bishop-wisp-right')).toBeTruthy();
    expect(materials(model).every((entry) => entry.userData.chroniclesOwnedMaterial)).toBe(true);
  });
});
