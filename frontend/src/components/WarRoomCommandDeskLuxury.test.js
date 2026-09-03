import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  applyWarRoomCommandDeskLuxury,
  WAR_ROOM_COMMAND_DESK_LUXURY_VERSION,
} from './WarRoomCommandDeskLuxury.js';

function material(color = 0x333333) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.6, clearcoat: 0.1 });
}

function addNamedBox(parent, name, position = [0, 0, 0], mat = material()) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
  mesh.name = name;
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function makeRoom() {
  const root = new THREE.Group();
  const desk = new THREE.Group();
  desk.name = 'command-cabinet';
  const art = new THREE.Group();
  art.name = 'war-room-teutonic-command-desk-v28';
  addNamedBox(art, 'war-room-command-desk-top');
  addNamedBox(art, 'war-room-command-desk-drawer');
  addNamedBox(art, 'war-room-command-desk-pedestal');
  addNamedBox(art, 'war-room-command-desk-brass-rim', [0, 0, 0], material(0x93692a));
  addNamedBox(art, 'war-room-command-desk-pull', [0, 0, 0], material(0x93692a));
  desk.add(art);
  root.add(desk);

  const chair = new THREE.Group();
  chair.name = 'war-room-teutonic-command-chair';
  root.add(chair);
  return { root, desk, art, chair };
}

describe('War Room command desk luxury dressing', () => {
  it('turns the central desk into a restrained premium military strategy station', () => {
    const { root, desk, art, chair } = makeRoom();
    expect(applyWarRoomCommandDeskLuxury(root, { towardBoard: 1 })).toBe(1);

    const luxury = art.getObjectByName('war-room-command-desk-luxury-v1');
    expect(luxury).toBeTruthy();
    expect(luxury.userData.warRoomCommandDeskLuxuryVersion).toBe(WAR_ROOM_COMMAND_DESK_LUXURY_VERSION);
    expect(luxury.userData.warRoomCommandDeskLuxuryPurpose).toBe('luxurious-military-strategy-desk');

    expect(luxury.getObjectByName('war-room-command-desk-command-leather-mat')).toBeTruthy();
    expect(luxury.getObjectByName('war-room-command-desk-luxury-front-brass-rail')).toBeTruthy();
    expect(luxury.getObjectByName('war-room-command-desk-luxury-front-walnut-rail')).toBeTruthy();

    const lamp = luxury.getObjectByName('war-room-command-desk-strategy-lamp');
    expect(lamp).toBeTruthy();
    expect(lamp.userData.commandDeskRole).toBe('warm-strategy-lamp');
    const lampLight = lamp.getObjectByName('war-room-command-desk-strategy-lamp-light');
    expect(lampLight?.isPointLight).toBe(true);
    expect(lampLight.castShadow).toBe(false);

    const folio = luxury.getObjectByName('war-room-command-desk-campaign-folio');
    expect(folio).toBeTruthy();
    expect(folio.userData.commandDeskRole).toBe('closed-campaign-dossier');
    expect(folio.position.x).toBeGreaterThan(0.75);

    const badge = luxury.getObjectByName('war-room-command-desk-command-badge');
    expect(badge).toBeTruthy();
    expect(badge.userData.commandDeskRole).toBe('matthias-command-crest');

    const cornerGuards = [];
    luxury.traverse((object) => {
      if (object.name === 'war-room-command-desk-luxury-corner-guard') cornerGuards.push(object);
    });
    expect(cornerGuards).toHaveLength(4);

    const chairTrim = chair.getObjectByName('war-room-command-chair-luxury-trim');
    expect(chairTrim).toBeTruthy();
    expect(chairTrim.userData.commandDeskRole).toBe('matthias-strategy-seat-trim');
    expect(chair.userData.warRoomCommandSeatPurpose).toBe('matthias-strategy-seat');

    expect(art.userData.warRoomCommandDeskPremiumMaterialPass).toBe(WAR_ROOM_COMMAND_DESK_LUXURY_VERSION);
    expect(desk.userData.warRoomCommandDeskLuxury).toBe(WAR_ROOM_COMMAND_DESK_LUXURY_VERSION);
    expect(applyWarRoomCommandDeskLuxury(root, { towardBoard: 1 })).toBe(0);
  });

  it('keeps premium desk geometry and its extra light out of the coarse/mobile scene', () => {
    const { root, art, chair } = makeRoom();
    expect(applyWarRoomCommandDeskLuxury(root, { towardBoard: 1, coarsePointer: true })).toBe(0);
    expect(art.getObjectByName('war-room-command-desk-luxury-v1')).toBeFalsy();
    expect(chair.getObjectByName('war-room-command-chair-luxury-trim')).toBeFalsy();
  });
});
