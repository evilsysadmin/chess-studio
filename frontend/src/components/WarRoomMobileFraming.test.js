import { describe, expect, it } from 'vitest';
import {
  WAR_ROOM_MOBILE_FRAMING_VERSION,
  getWarRoomMobileFramingProfile,
} from './WarRoomMobileFraming.js';

describe('War Room mobile framing', () => {
  it('mantiene el teléfono vertical con sala visible y tablero táctil', () => {
    const phone = getWarRoomMobileFramingProfile({
      aspect: 1.16,
      coarsePointer: true,
      viewportWidth: 390,
    });

    expect(phone?.version).toBe(WAR_ROOM_MOBILE_FRAMING_VERSION);
    expect(phone?.mode).toBe('portrait-room-balanced');
    expect(phone.halfSpan).toBeGreaterThanOrEqual(5.35);
    expect(phone.padding).toBeLessThanOrEqual(1.05);
    expect(phone.minDistance).toBeGreaterThan(16);
    expect(phone.maxDistance).toBeGreaterThan(21);
    expect(phone.targetZ).toBeGreaterThan(0.6);
    expect(phone.targetY).toBeGreaterThan(0.9);
  });

  it('mantiene el preset vertical aunque el shell sea ligeramente apaisado', () => {
    const screenshotLikePhone = getWarRoomMobileFramingProfile({
      aspect: 1.18,
      coarsePointer: true,
      viewportWidth: 390,
    });

    expect(screenshotLikePhone?.version).toBe(WAR_ROOM_MOBILE_FRAMING_VERSION);
    expect(screenshotLikePhone?.mode).toBe('portrait-room-balanced');
    expect(screenshotLikePhone.halfSpan).toBe(5.4);
    expect(screenshotLikePhone.targetZ).toBe(0.65);
  });

  it('hace el landscape de teléfono más cenital, cercano y centrado en el tablero', () => {
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
    expect(landscape.cameraY / landscape.cameraZ).toBeGreaterThan(portrait.cameraY / portrait.cameraZ);
    expect(landscape.halfSpan).toBeLessThan(portrait.halfSpan * 0.86);
  });

  it('aplica el cambio solo a móvil táctil y no toca desktop, tablet ancho ni puntero fino', () => {
    expect(getWarRoomMobileFramingProfile({ aspect: 1.62, coarsePointer: false, viewportWidth: 851 })).toBeNull();
    expect(getWarRoomMobileFramingProfile({ aspect: 1.62, coarsePointer: true, viewportWidth: 1080 })).toBeNull();
    expect(getWarRoomMobileFramingProfile({ aspect: 1.06, coarsePointer: true, viewportWidth: 1080 })).toBeNull();
  });

  it('da al teléfono vertical algo más de aire que a una pantalla móvil grande', () => {
    const phone = getWarRoomMobileFramingProfile({ aspect: 1.16, coarsePointer: true, viewportWidth: 390 });
    const tabletPortrait = getWarRoomMobileFramingProfile({ aspect: 1.12, coarsePointer: true, viewportWidth: 720 });

    expect(phone.halfSpan).toBeGreaterThan(tabletPortrait.halfSpan);
    expect(phone.targetZ).toBeGreaterThan(tabletPortrait.targetZ);
    expect(phone.cameraZ).toBeGreaterThan(tabletPortrait.cameraZ);
    expect(phone.maxDistance).toBeGreaterThan(tabletPortrait.maxDistance);
  });
});
