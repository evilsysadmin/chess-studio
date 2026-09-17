import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CHRONICLES_DEFAULT_LOADOUT_SIGNATURES,
  CHRONICLES_DEFAULT_LOADOUT_SLOTS,
  CHRONICLES_DEFAULT_LOADOUT_VERSION,
  installChroniclesDefaultLoadoutArt,
} from './chroniclesOfMatthiasPartyEquipmentArt.js';

describe('Chronicles Tactics modular default loadouts', () => {
  it('gives every party member the same future equipment slot contract', () => {
    ['matthias', 'rook', 'bishop', 'knight'].forEach((memberId) => {
      const memberRoot = new THREE.Group();
      const cancel = installChroniclesDefaultLoadoutArt(memberRoot, memberId);
      const loadout = memberRoot.getObjectByName(`chronicles-default-loadout-${memberId}`);

      expect(loadout).toBeTruthy();
      expect(loadout.userData.chroniclesLoadoutVersion).toBe(CHRONICLES_DEFAULT_LOADOUT_VERSION);
      expect(CHRONICLES_DEFAULT_LOADOUT_SLOTS.map((slotName) => (
        Boolean(loadout.getObjectByName(`chronicles-loadout-slot-${slotName}`))
      ))).toEqual(CHRONICLES_DEFAULT_LOADOUT_SLOTS.map(() => true));
      CHRONICLES_DEFAULT_LOADOUT_SIGNATURES[memberId].forEach((name) => {
        expect(loadout.getObjectByName(name)).toBeTruthy();
      });

      cancel();
      expect(memberRoot.getObjectByName(`chronicles-default-loadout-${memberId}`)).toBeFalsy();
    });
  });

  it('does not stack duplicate default loadouts on the same member root', () => {
    const memberRoot = new THREE.Group();
    const cancel = installChroniclesDefaultLoadoutArt(memberRoot, 'rook');
    const secondCancel = installChroniclesDefaultLoadoutArt(memberRoot, 'rook');

    expect(memberRoot.children.filter((child) => child.name === 'chronicles-default-loadout-rook')).toHaveLength(1);

    secondCancel();
    expect(memberRoot.getObjectByName('chronicles-default-loadout-rook')).toBeTruthy();
    cancel();
    expect(memberRoot.getObjectByName('chronicles-default-loadout-rook')).toBeFalsy();
  });

  it('keeps coarse-pointer loadouts deliberately cheaper', () => {
    const desktopRoot = new THREE.Group();
    const coarseRoot = new THREE.Group();
    const cancelDesktop = installChroniclesDefaultLoadoutArt(desktopRoot, 'bishop');
    const cancelCoarse = installChroniclesDefaultLoadoutArt(coarseRoot, 'bishop', { coarsePointer: true });

    const desktopHalo = desktopRoot.getObjectByName('aziz-loadout-lantern-halo');
    const coarseHalo = coarseRoot.getObjectByName('aziz-loadout-lantern-halo');
    expect(desktopHalo.geometry.attributes.position.count).toBeGreaterThan(coarseHalo.geometry.attributes.position.count);

    cancelDesktop();
    cancelCoarse();
  });
});
