import { describe, expect, it } from 'vitest';
import { buildSchoolRoomLayer, SCHOOL_ROOM_SCENE_VERSION } from './SchoolRoomShell.js';

const THEME = { frame: 0x24130c };

describe('School Room 3D shell', () => {
  it('builds the canonical academy composition for desktop', () => {
    const room = buildSchoolRoomLayer(THEME, true, false);

    expect(room.name).toBe('matthias-school-room-layer');
    expect(room.userData.schoolRoomCanonical).toBe(true);
    expect(room.userData.schoolRoomSceneVersion).toBe(SCHOOL_ROOM_SCENE_VERSION);
    expect(room.userData.schoolRoomDeskCount).toBe(6);
    expect(room.userData.schoolRoomRenderLite).toBe(false);
    expect(room.getObjectByName('school-chalkboard')).toBeTruthy();
    expect(room.getObjectByName('school-bookcase-left')).toBeTruthy();
    expect(room.getObjectByName('school-bookcase-right')).toBeTruthy();
    expect(room.getObjectByName('teacher-desk')).toBeTruthy();
    expect(room.getObjectByName('school-fireplace')).toBeTruthy();
    expect(room.getObjectByName('school-chandelier')).toBeTruthy();
  });

  it('keeps the classroom identity while trimming mobile geometry', () => {
    const room = buildSchoolRoomLayer(THEME, true, true);

    expect(room.userData.schoolRoomDeskCount).toBe(4);
    expect(room.userData.schoolRoomRenderLite).toBe(true);
    expect(room.getObjectByName('school-chalkboard')).toBeTruthy();
    expect(room.getObjectByName('school-bookcase-left')).toBeTruthy();
    expect(room.getObjectByName('school-bookcase-right')).toBeTruthy();
    expect(room.getObjectByName('school-fireplace')).toBeFalsy();
    expect(room.getObjectByName('school-chandelier')).toBeTruthy();
  });
});
