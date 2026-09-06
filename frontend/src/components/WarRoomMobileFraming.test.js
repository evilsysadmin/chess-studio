import { describe, expect, it } from 'vitest';
import {
  WAR_ROOM_MOBILE_FRAMING_VERSION,
  getWarRoomMobileFramingProfile,
} from './WarRoomMobileFraming.js';

describe('War Room mobile portrait framing', () => {
  it('abre el encuadre del teléfono para que tablero y sala compartan la primera pantalla', () => {
    const phone = getWarRoomMobileFramingProfile({
      aspect: 1.16,
      coarsePointer: true,
      viewportWidth: 390,
    });

    expect(phone?.version).toBe(WAR_ROOM_MOBILE_FRAMING_VERSION);
    expect(phone.halfSpan).toBeGreaterThanOrEqual(5.35);
    expect(phone.padding).toBeLessThanOrEqual(1.05);
    expect(phone.minDistance).toBeGreaterThan(16);
    expect(phone.maxDistance).toBeGreaterThan(21);
    expect(phone.targetZ).toBeGreaterThan(0.6);
    expect(phone.targetY).toBeGreaterThan(0.9);
  });

  it('mantiene el preset de teléfono aunque el shell 3D sea ligeramente apaisado', () => {
    const screenshotLikePhone = getWarRoomMobileFramingProfile({
      aspect: 1.18,
      coarsePointer: true,
      viewportWidth: 390,
    });

    expect(screenshotLikePhone?.version).toBe(WAR_ROOM_MOBILE_FRAMING_VERSION);
    expect(screenshotLikePhone.halfSpan).toBe(5.4);
    expect(screenshotLikePhone.targetZ).toBe(0.65);
  });

  it('no toca desktop, tablet landscape ni punteros finos', () => {
    expect(getWarRoomMobileFramingProfile({ aspect: 1.16, coarsePointer: false, viewportWidth: 390 })).toBeNull();
    expect(getWarRoomMobileFramingProfile({ aspect: 1.45, coarsePointer: true, viewportWidth: 780 })).toBeNull();
    expect(getWarRoomMobileFramingProfile({ aspect: 1.06, coarsePointer: true, viewportWidth: 1080 })).toBeNull();
  });

  it('da al teléfono algo más de aire que a una pantalla móvil grande', () => {
    const phone = getWarRoomMobileFramingProfile({ aspect: 1.16, coarsePointer: true, viewportWidth: 390 });
    const tabletPortrait = getWarRoomMobileFramingProfile({ aspect: 1.12, coarsePointer: true, viewportWidth: 720 });

    expect(phone.halfSpan).toBeGreaterThan(tabletPortrait.halfSpan);
    expect(phone.targetZ).toBeGreaterThan(tabletPortrait.targetZ);
    expect(phone.cameraZ).toBeGreaterThan(tabletPortrait.cameraZ);
    expect(phone.maxDistance).toBeGreaterThan(tabletPortrait.maxDistance);
  });
});
