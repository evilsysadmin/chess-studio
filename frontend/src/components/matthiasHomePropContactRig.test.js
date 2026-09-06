import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  applyMatthiasPremiumHomePose,
  createMatthiasPremiumHome3D,
  disposeMatthiasPremiumHome3D,
} from './MatthiasPremiumHome3D.js';
import { applyMatthiasHomePropErgonomics } from './matthiasHomePropErgonomics.js';
import { applyMatthiasHomePrivateGameRig } from './matthiasHomePrivateGameRig.js';
import { rejoinMatthiasHomeEnvironmentForDispose } from './matthiasHomeInteractionScene.js';
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
  const target = new THREE.Vector3();
  node.getWorldPosition(target);
  return target;
}

function disposeRig(rig) {
  rejoinMatthiasHomeEnvironmentForDispose(rig);
  disposeMatthiasPremiumHome3D(rig);
}

describe('Matthias Home prop contact rig', () => {
  it('deja el café y su mesa anclados al mundo mientras la mano alcanza el asa', () => {
    const host = new THREE.Scene();
    const rig = createMatthiasPremiumHome3D();
    host.add(rig.root);
    const contact = apply(rig, 'sip', { reach: .46 });

    expect(MATTHIAS_HOME_PROP_CONTACT_RIG_VERSION).toBe('home-prop-contact-v4-world-anchored');
    expect(contact?.prop).toBe('cup');
    expect(contact?.staging).toBe('side-table');
    expect(contact?.interactionAnchor).toBe('home-object-interaction-anchor');
    expect(contact?.supportSolved).toBe(true);
    expect(contact?.assistSolved).toBe(false);

    const environment = rig.homeInteractionEnvironment;
    const surface = rig.activityRig.objectInteractionSurface;
    const cup = rig.activityRig.cup;
    const handle = environment.getObjectByName('campaign-cup-handle');
    const hand = rig.activityRig.supportGlove;

    expect(environment.parent).toBe(host);
    expect(surface.parent).toBe(environment);
    expect(cup.parent).toBe(environment);
    expect(surface.visible).toBe(true);
    expect(surface.userData.homeAttachmentPolicy).toBe('never-hand');
    expect(cup.userData.homeAttachmentPolicy).toBe('never-hand');
    expect(rig.root.getObjectByName('campaign-cup-handle')).toBeUndefined();
    expect(rig.root.getObjectByName('home-object-interaction-table-top')).toBeUndefined();
    expect(environment.getObjectByName('home-object-interaction-table-top')).toBeTruthy();
    expect(rig.activityRig.support.visible).toBe(true);
    expect(rig.activityRig.assist.visible).toBe(false);
    expect(rig.activityRig.supportGlove.material.color.getHex()).toBe(0xe1c58c);
    expect(rig.activityRig.support.getObjectByName('activity-support-contact-cuff')?.visible).toBe(true);
    expect(handle).toBeTruthy();
    expect(worldPosition(handle).distanceTo(worldPosition(hand))).toBeLessThan(.09);

    host.updateMatrixWorld(true);
    const cupBefore = worldPosition(cup);
    const tableBefore = worldPosition(surface);
    rig.root.position.x += .51;
    rig.root.position.y += .27;
    rig.root.rotation.z = .19;
    // Reaplicar el solver reproduce un frame real: ergonomics puede haber
    // intentado reescribir el prop, pero el anchor debe restaurarlo.
    const contactAgain = apply(rig, 'sip', { reach: .48 });
    host.updateMatrixWorld(true);

    expect(worldPosition(cup).distanceTo(cupBefore)).toBeLessThan(1e-6);
    expect(worldPosition(surface).distanceTo(tableBefore)).toBeLessThan(1e-6);
    expect(contactAgain?.supportSolved).toBe(true);
    expect(rig.root.userData.activityPropRelationship).toBe('environment-interaction');

    disposeRig(rig);
  });

  it('apoya libro en mobiliario world-anchored y conserva el expediente dedicado', () => {
    const host = new THREE.Scene();
    const rig = createMatthiasPremiumHome3D();
    host.add(rig.root);

    let contact = apply(rig, 'read', { headYaw: .10 });
    expect(contact?.prop).toBe('book');
    expect(contact?.staging).toBe('reading-desk');
    expect(contact?.supportSolved).toBe(true);
    expect(contact?.assistSolved).toBe(false);
    expect(rig.activityRig.objectInteractionSurface.visible).toBe(true);
    expect(rig.activityRig.book.parent).toBe(rig.homeInteractionEnvironment);
    expect(rig.activityRig.book.userData.homeAttachmentPolicy).toBe('never-hand');
    expect(rig.root.getObjectByName('activity-book')).toBeUndefined();
    expect(rig.homeInteractionEnvironment.getObjectByName('activity-book')).toBe(rig.activityRig.book);
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

    disposeRig(rig);
  });

  it('pone Chess Weekly sobre un escritorio world-anchored y deja una mano libre', () => {
    const host = new THREE.Scene();
    const rig = createMatthiasPremiumHome3D();
    host.add(rig.root);
    const contact = apply(rig, 'press', { headYaw: -.10, activityTime: 2.4 });

    expect(contact?.prop).toBe('press');
    expect(contact?.staging).toBe('reading-desk');
    expect(contact?.supportSolved).toBe(true);
    expect(contact?.assistSolved).toBe(false);
    expect(rig.activityRig.press.visible).toBe(true);
    expect(rig.activityRig.press.parent).toBe(rig.homeInteractionEnvironment);
    expect(rig.activityRig.press.userData.homeAttachmentPolicy).toBe('never-hand');
    expect(rig.activityRig.objectInteractionSurface.parent).toBe(rig.homeInteractionEnvironment);
    expect(rig.homeInteractionEnvironment.getObjectByName('home-object-interaction-table-top')).toBeTruthy();
    expect(rig.root.getObjectByName('home-object-interaction-table-top')).toBeUndefined();
    expect(rig.activityRig.support.visible).toBe(true);
    expect(rig.activityRig.assist.visible).toBe(false);
    expect(rig.root.userData.activityPropContactHands).toBe('interaction:1/0');
    expect(rig.root.userData.activityPropRelationship).toBe('environment-interaction');

    const turning = apply(rig, 'press', { headYaw: -.08, activityTime: 4.2 });
    expect(turning?.supportSolved).toBe(true);
    expect(rig.root.userData.activityPageTurn).toBeGreaterThan(.05);
    expect(turning?.assistSolved).toBe(false);

    disposeRig(rig);
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

    const reading = apply(rig, 'read', { headYaw: .08 });
    expect(reading?.prop).toBe('book');
    expect(rig.root.userData.activitySleepFaceClearance).toBe('inactive');
    expect(rig.root.rotation.z).toBe(0);
    expect(rig.activityRig.premiumSleep.visible).toBe(false);
    expect(rig.activityRig.supportGlove.position.z).toBeGreaterThan(.6);
    expect(rig.activityRig.assist.visible).toBe(false);
    expect(rig.root.userData.activityObjectStaging).toBe('reading-desk');

    disposeRig(rig);
  });

  it('apoya Partida privada en una mesa y no invade comida o sueño', () => {
    const host = new THREE.Scene();
    const rig = createMatthiasPremiumHome3D();
    host.add(rig.root);
    const next = pose('think', { activityTime: 4.2 });
    applyMatthiasPremiumHomePose(rig, next);
    applyMatthiasHomePropErgonomics(rig, next);
    applyMatthiasHomePrivateGameRig(rig, next);

    const contact = applyMatthiasHomePropContactRig(rig);
    expect(contact?.prop).toBe('chess');
    expect(contact?.boardSupport).toBeTruthy();

    const privateGameScene = rig.activityRig.privateGame;
    expect(privateGameScene).toBeTruthy();
    expect(privateGameScene.parent).toBe(rig.homeInteractionEnvironment);
    expect(rig.root.getObjectByName('private-game-table-top')).toBeUndefined();
    expect(rig.root.getObjectsByProperty('name', 'private-game-table-leg')).toHaveLength(0);
    expect(privateGameScene.getObjectByName('private-game-table-top')).toBeTruthy();
    expect(privateGameScene.getObjectsByProperty('name', 'private-game-table-leg')).toHaveLength(2);
    expect(rig.activityRig.support.visible).toBe(false);
    expect(rig.activityRig.assist.visible).toBe(false);
    expect(rig.root.userData.activityPropContactHands).toBe('board-rest/pointing-hand');
    expect(rig.root.userData.activityPropRelationship).toBe('environment-interaction');
    expect(rig.root.userData.activityInteractionAnchor).toBe('private-game-interaction-anchor');

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
    expect(rig.root.userData.activityInteractionAnchor).toBe('inactive');

    disposeRig(rig);
  });
});
