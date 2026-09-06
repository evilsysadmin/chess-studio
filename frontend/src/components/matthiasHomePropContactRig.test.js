import { describe, expect, it } from 'vitest';
import {
  applyMatthiasPremiumHomePose,
  createMatthiasPremiumHome3D,
  disposeMatthiasPremiumHome3D,
} from './MatthiasPremiumHome3D.js';
import { applyMatthiasHomePropErgonomics } from './matthiasHomePropErgonomics.js';
import { applyMatthiasHomePrivateGameRig } from './matthiasHomePrivateGameRig.js';
import {
  applyMatthiasHomePropContactRig,
  clearMatthiasHomePropContactRig,
  MATTHIAS_HOME_PROP_CONTACT_RIG_VERSION,
} from './matthiasHomePropContactRig.js';

function pose(activityProfile, overrides = {}) {
  return {
    bodyY: 0,
    bodyYaw: 0,
    headPitch: 0,
    headYaw: 0,
    headRoll: 0,
    gazeX: 0,
    browBias: 0,
    smirk: 0,
    mouthOpen: 0,
    blink: 0,
    reach: .32,
    activityTime: 2.4,
    activityProfile,
    ...overrides,
  };
}

function apply(rig, activityProfile, overrides = {}) {
  const next = pose(activityProfile, overrides);
  applyMatthiasPremiumHomePose(rig, next);
  applyMatthiasHomePropErgonomics(rig, next);
  return applyMatthiasHomePropContactRig(rig);
}

function worldPosition(node) {
  node.updateMatrixWorld(true);
  return node.getWorldPosition(node.position.clone().set(0, 0, 0));
}

describe('Matthias Home prop contact rig', () => {
  it('deja el café en una mesa lateral y Matthias interactúa con el asa', () => {
    const rig = createMatthiasPremiumHome3D();
    const contact = apply(rig, 'sip', { reach: .46 });

    expect(MATTHIAS_HOME_PROP_CONTACT_RIG_VERSION).toBe('home-prop-contact-v3-contextual-interaction');
    expect(contact?.prop).toBe('cup');
    expect(contact?.staging).toBe('side-table');
    expect(contact?.supportSolved).toBe(true);
    expect(contact?.assistSolved).toBe(false);
    expect(rig.activityRig.objectInteractionSurface.visible).toBe(true);
    expect(rig.activityRig.cup.position.y).toBeLessThan(-.4);
    expect(rig.activityRig.support.visible).toBe(true);
    expect(rig.activityRig.assist.visible).toBe(false);
    expect(rig.activityRig.supportGlove.material.color.getHex()).toBe(0xe1c58c);
    expect(rig.activityRig.support.getObjectByName('activity-support-contact-cuff')?.visible).toBe(true);

    const handle = rig.root.getObjectByName('campaign-cup-handle');
    const hand = rig.activityRig.supportGlove;
    expect(handle).toBeTruthy();
    expect(worldPosition(handle).distanceTo(worldPosition(hand))).toBeLessThan(.09);
    expect(rig.root.userData.activityPropContact).toBe(MATTHIAS_HOME_PROP_CONTACT_RIG_VERSION);
    expect(rig.root.userData.activityPropRelationship).toBe('environment-interaction');

    disposeMatthiasPremiumHome3D(rig);
  });

  it('apoya libro y expediente en mobiliario en vez de sujetarlos ante el pecho', () => {
    const rig = createMatthiasPremiumHome3D();

    let contact = apply(rig, 'read', { headYaw: .10 });
    expect(contact?.prop).toBe('book');
    expect(contact?.staging).toBe('reading-desk');
    expect(contact?.supportSolved).toBe(true);
    expect(contact?.assistSolved).toBe(false);
    expect(rig.activityRig.objectInteractionSurface.visible).toBe(true);
    expect(rig.activityRig.book.position.y).toBeLessThan(-.58);
    expect(rig.activityRig.supportGlove.position.distanceTo(contact.supportTarget)).toBeLessThan(1e-6);
    expect(rig.activityRig.assist.visible).toBe(false);

    contact = apply(rig, 'dossier', { headYaw: -.08 });
    expect(contact?.prop).toBe('dossier');
    expect(contact?.staging).toBe('dossier-desk');
    expect(contact?.supportSolved).toBe(true);
    expect(contact?.assistSolved).toBe(false);
    expect(rig.activityRig.dossier.visible).toBe(false);
    expect(rig.activityRig.dossierMock.visible).toBe(true);
    expect(rig.activityRig.objectInteractionSurface.visible).toBe(false);
    expect(rig.root.getObjectByName('dossier-mock-open-file').position.y).toBeLessThan(-.55);
    expect(rig.activityRig.supportGlove.position.distanceTo(contact.supportTarget)).toBeLessThan(1e-6);
    expect(rig.activityRig.assist.visible).toBe(false);
    expect(rig.root.userData.activityPropRelationship).toBe('environment-interaction');

    disposeMatthiasPremiumHome3D(rig);
  });

  it('pone Chess Weekly sobre el escritorio y deja una mano libre', () => {
    const rig = createMatthiasPremiumHome3D();
    const contact = apply(rig, 'press', { headYaw: -.10, activityTime: 2.4 });

    expect(contact?.prop).toBe('press');
    expect(contact?.staging).toBe('reading-desk');
    expect(contact?.supportSolved).toBe(true);
    expect(contact?.assistSolved).toBe(false);
    expect(rig.activityRig.press.visible).toBe(true);
    expect(rig.activityRig.press.position.y).toBeLessThan(-.54);
    expect(rig.activityRig.press.scale.x).toBeLessThan(1);
    expect(rig.activityRig.press.rotation.x).toBeLessThan(-.55);
    expect(rig.activityRig.objectInteractionSurface.visible).toBe(true);
    expect(rig.root.getObjectByName('home-object-interaction-table-top')).toBeTruthy();
    expect(rig.activityRig.support.visible).toBe(true);
    expect(rig.activityRig.assist.visible).toBe(false);
    expect(rig.root.userData.activityPropContactHands).toBe('interaction:1/0');
    expect(rig.root.userData.activityPropRelationship).toBe('environment-interaction');

    const turning = apply(rig, 'press', { headYaw: -.08, activityTime: 4.2 });
    expect(turning?.supportSolved).toBe(true);
    expect(rig.root.userData.activityPageTurn).toBeGreaterThan(.05);
    expect(turning?.assistSolved).toBe(false);

    disposeMatthiasPremiumHome3D(rig);
  });

  it('mantiene las manos del sueño debajo y detrás de la cara, sin puntos sobre los ojos', () => {
    const rig = createMatthiasPremiumHome3D();
    const contact = apply(rig, 'sleep');

    expect(contact?.prop).toBe('blanket');
    expect(contact?.sleepSupport).toBe(true);
    expect(contact?.supportSolved).toBe(true);
    expect(contact?.assistSolved).toBe(true);
    expect(rig.activityRig.support.visible).toBe(true);
    expect(rig.activityRig.assist.visible).toBe(true);
    expect(rig.activityRig.supportGlove.position.y).toBeLessThan(.34);
    expect(rig.activityRig.assistGlove.position.y).toBeLessThan(.34);
    expect(rig.activityRig.supportGlove.position.z).toBeLessThan(.53);
    expect(rig.activityRig.assistGlove.position.z).toBeLessThan(.53);
    expect(rig.root.userData.activitySleepFaceClearance).toBe('hands-below-and-behind-face');
    expect(rig.root.userData.activityPropContactHands).toBe('sleep-head-support');

    // Waking into a book must hand control back to the environmental interaction
    // solver immediately; no sleep coordinates are allowed to leak forward.
    const reading = apply(rig, 'read', { headYaw: .08 });
    expect(reading?.prop).toBe('book');
    expect(rig.root.userData.activitySleepFaceClearance).toBe('inactive');
    expect(rig.root.rotation.z).toBe(0);
    expect(rig.activityRig.premiumSleep.visible).toBe(false);
    expect(rig.activityRig.supportGlove.position.z).toBeGreaterThan(.6);
    expect(rig.activityRig.assist.visible).toBe(false);
    expect(rig.root.userData.activityObjectStaging).toBe('reading-desk');

    disposeMatthiasPremiumHome3D(rig);
  });

  it('apoya Partida privada en una mesa y no invade comida o sueño', () => {
    const rig = createMatthiasPremiumHome3D();
    const next = pose('think', { activityTime: 4.2 });
    applyMatthiasPremiumHomePose(rig, next);
    applyMatthiasHomePropErgonomics(rig, next);
    applyMatthiasHomePrivateGameRig(rig, next);

    const contact = applyMatthiasHomePropContactRig(rig);
    expect(contact?.prop).toBe('chess');
    expect(contact?.boardSupport).toBeTruthy();
    expect(rig.root.getObjectByName('private-game-table-top')).toBeTruthy();
    expect(rig.root.getObjectsByProperty('name', 'private-game-table-leg')).toHaveLength(2);
    expect(rig.activityRig.support.visible).toBe(false);
    expect(rig.activityRig.assist.visible).toBe(false);
    expect(rig.root.userData.activityPropContactHands).toBe('board-rest/pointing-hand');
    expect(rig.root.userData.activityPropRelationship).toBe('environment-interaction');

    const sleepContact = apply(rig, 'sleep');
    expect(sleepContact?.prop).toBe('blanket');
    expect(sleepContact?.sleepSupport).toBe(true);
    expect(rig.root.userData.activityPropContact).toBe(MATTHIAS_HOME_PROP_CONTACT_RIG_VERSION);

    clearMatthiasHomePropContactRig(rig);
    expect(rig.activityRig.support.getObjectByName('activity-support-contact-cuff')?.visible ?? false).toBe(false);
    expect(rig.activityRig.assist.getObjectByName('activity-assist-contact-cuff')?.visible ?? false).toBe(false);
    expect(rig.activityRig.objectInteractionSurface?.visible ?? false).toBe(false);
    expect(rig.root.userData.activitySleepFaceClearance).toBe('inactive');
    expect(rig.root.userData.activityPropRelationship).toBe('inactive');

    disposeMatthiasPremiumHome3D(rig);
  });
});
