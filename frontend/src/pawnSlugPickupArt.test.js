import { describe, expect, it } from 'vitest';
import { PAWN_SLUG_PICKUP_ART_META, createPickupModel } from './pawnSlugPickupArt.js';

const TYPES = ['machinegun', 'shotgun', 'panzerfaust', 'grenade', 'medkit'];

function meshCount(root) {
  let count = 0;
  root.traverse((node) => { if (node.isMesh) count += 1; });
  return count;
}

describe('Pawn Slug premium pickup art', () => {
  it('gives every pickup a distinct premium field-kit identity', () => {
    for (const type of TYPES) {
      const model = createPickupModel(type);
      expect(model.name).toBe(`pawn-slug-pickup-${type}`);
      expect(model.userData).toMatchObject({
        pawnSlugPickup: true,
        pickupType: type,
        premiumArt: 'field-kit-v2',
        dynamicLights: 0,
      });
      expect(PAWN_SLUG_PICKUP_ART_META.silhouettes[type]).toBeTruthy();
    }
    expect(new Set(Object.values(PAWN_SLUG_PICKUP_ART_META.silhouettes)).size).toBe(TYPES.length);
  });

  it('keeps contact grounding and runtime collision contract unchanged', () => {
    for (const type of TYPES) {
      expect(createPickupModel(type).getObjectByName('pawn-slug-pickup-contact-shadow')).toBeTruthy();
    }
    expect(PAWN_SLUG_PICKUP_ART_META.genericRuntimeHitbox).toEqual({ width: 0.9, height: 0.9 });
    expect(PAWN_SLUG_PICKUP_ART_META.dynamicLights).toBe(0);
  });

  it('keeps each pickup small enough for arcade runtime use', () => {
    for (const type of TYPES) {
      expect(meshCount(createPickupModel(type))).toBeLessThanOrEqual(12);
    }
  });

  it('exposes readable class-specific hero details', () => {
    expect(createPickupModel('machinegun').getObjectByName('pawn-slug-pickup-machinegun-belt')).toBeTruthy();
    expect(createPickupModel('shotgun').getObjectByName('pawn-slug-pickup-shotgun-shells')).toBeTruthy();
    expect(createPickupModel('panzerfaust').getObjectByName('pawn-slug-pickup-panzerfaust-cradle')).toBeTruthy();
    expect(createPickupModel('grenade').getObjectByName('pawn-slug-pickup-grenades')).toBeTruthy();
    expect(createPickupModel('medkit').getObjectByName('pawn-slug-pickup-medkit-satchel')).toBeTruthy();
  });
});
