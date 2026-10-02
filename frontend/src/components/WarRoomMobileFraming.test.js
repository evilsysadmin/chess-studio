import { describe, expect, it } from 'vitest';
import {
  WAR_ROOM_MOBILE_FRAMING_VERSION,
  getWarRoomMobileFramingProfile,
} from './WarRoomMobileFraming.js';
import {
  WAR_ROOM_CANONICAL_CAMERA_FOV,
  WAR_ROOM_CANONICAL_PLAY_PITCH,
} from './Board3DCameraProfiles.js';

describe('War Room mobile framing', () => {
  it('usa el perfil vertical board-first en teléfono táctil, también con shell ligeramente apaisado', () => {
    for (const aspect of [0.46, 1.16, 1.18]) {
      const phone = getWarRoomMobileFramingProfile({ aspect, coarsePointer: true, viewportWidth: 390 });
      expect(phone?.version).toBe(WAR_ROOM_MOBILE_FRAMING_VERSION);
      expect(phone?.mode).toBe('portrait-board-first');
    }
  });

  it('mantiene el mismo contrato óptico v4 en portrait y landscape y sólo adapta framing', () => {
    const portrait = getWarRoomMobileFramingProfile({ aspect: 1.16, coarsePointer: true, viewportWidth: 390 });
    const landscape = getWarRoomMobileFramingProfile({ aspect: 1.62, coarsePointer: true, viewportWidth: 851 });

    expect(landscape?.version).toBe(WAR_ROOM_MOBILE_FRAMING_VERSION);
    expect(landscape?.mode).toBe('landscape-board-first');
    expect(landscape.halfSpan).toBeLessThanOrEqual(4.5);
    expect(landscape.padding).toBe(1);
    expect(landscape.maxDistance).toBeGreaterThan(22);
    expect(landscape.targetZ).toBeLessThanOrEqual(0.08);
    expect(landscape.targetY).toBeLessThanOrEqual(0.4);
    for (const profile of [portrait, landscape]) {
      expect(profile.fov).toBe(WAR_ROOM_CANONICAL_CAMERA_FOV);
      expect(profile.cameraY).toBe(WAR_ROOM_CANONICAL_PLAY_PITCH.cameraY);
      expect(profile.cameraZ).toBe(WAR_ROOM_CANONICAL_PLAY_PITCH.cameraZ);
    }
  });

  it('aplica el cambio solo a móvil táctil y no toca desktop, tablet ancho ni puntero fino', () => {
    expect(getWarRoomMobileFramingProfile({ aspect: 1.62, coarsePointer: false, viewportWidth: 851 })).toBeNull();
    expect(getWarRoomMobileFramingProfile({ aspect: 1.62, coarsePointer: true, viewportWidth: 1080 })).toBeNull();
    expect(getWarRoomMobileFramingProfile({ aspect: 1.06, coarsePointer: true, viewportWidth: 1080 })).toBeNull();
  });

  it('iguala el landscape móvil con la cámara canónica de War Room v4', () => {
    const phone = getWarRoomMobileFramingProfile({
      aspect: 1.8,
      coarsePointer: true,
      viewportWidth: 844,
    });

    expect(phone.mode).toBe('landscape-board-first');
    expect(phone.fov).toBe(WAR_ROOM_CANONICAL_CAMERA_FOV);
    expect(phone.cameraY).toBe(WAR_ROOM_CANONICAL_PLAY_PITCH.cameraY);
    expect(phone.cameraZ).toBe(WAR_ROOM_CANONICAL_PLAY_PITCH.cameraZ);
    expect(phone.cameraY / phone.cameraZ).toBeCloseTo(
      WAR_ROOM_CANONICAL_PLAY_PITCH.cameraY / WAR_ROOM_CANONICAL_PLAY_PITCH.cameraZ,
      6,
    );
  });

});
