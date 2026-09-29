import { describe, expect, it } from 'vitest';
import {
  WAR_ROOM_MOBILE_FRAMING_VERSION,
  getWarRoomMobileFramingProfile,
} from './WarRoomMobileFraming.js';

describe('War Room mobile framing', () => {
  it('usa el perfil vertical board-first en teléfono táctil, también con shell ligeramente apaisado', () => {
    for (const aspect of [0.46, 1.16, 1.18]) {
      const phone = getWarRoomMobileFramingProfile({ aspect, coarsePointer: true, viewportWidth: 390 });
      expect(phone?.version).toBe(WAR_ROOM_MOBILE_FRAMING_VERSION);
      expect(phone?.mode).toBe('portrait-board-first');
    }
  });

  it('mantiene el landscape de teléfono cercano y centrado aunque portrait sea más cenital', () => {
    const portrait = getWarRoomMobileFramingProfile({ aspect: 1.16, coarsePointer: true, viewportWidth: 390 });
    const landscape = getWarRoomMobileFramingProfile({ aspect: 1.62, coarsePointer: true, viewportWidth: 851 });

    expect(landscape?.version).toBe(WAR_ROOM_MOBILE_FRAMING_VERSION);
    expect(landscape?.mode).toBe('landscape-board-first');
    expect(landscape.halfSpan).toBeLessThanOrEqual(4.5);
    expect(landscape.padding).toBe(1);
    expect(landscape.maxDistance).toBeLessThan(18);
    expect(landscape.targetZ).toBeLessThanOrEqual(0.08);
    expect(landscape.targetY).toBeLessThanOrEqual(0.4);
    expect(landscape.cameraY / landscape.cameraZ).toBeGreaterThan(0.8);
    expect(landscape.cameraY / landscape.cameraZ).toBeLessThan(portrait.cameraY / portrait.cameraZ);
  });

  it('aplica el cambio solo a móvil táctil y no toca desktop, tablet ancho ni puntero fino', () => {
    expect(getWarRoomMobileFramingProfile({ aspect: 1.62, coarsePointer: false, viewportWidth: 851 })).toBeNull();
    expect(getWarRoomMobileFramingProfile({ aspect: 1.62, coarsePointer: true, viewportWidth: 1080 })).toBeNull();
    expect(getWarRoomMobileFramingProfile({ aspect: 1.06, coarsePointer: true, viewportWidth: 1080 })).toBeNull();
  });

  it('iguala el picado landscape móvil con la cámara wide canónica de V1', () => {
    const phone = getWarRoomMobileFramingProfile({
      aspect: 1.8,
      coarsePointer: true,
      viewportWidth: 844,
    });

    expect(phone.mode).toBe('landscape-board-first');
    expect(phone.cameraY).toBe(9.2);
    expect(phone.cameraZ).toBe(9.55);
    expect(phone.cameraY / phone.cameraZ).toBeCloseTo(9.2 / 9.55, 6);
  });

});
