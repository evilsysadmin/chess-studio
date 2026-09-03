import { describe, expect, it } from 'vitest';
import {
  WAR_ROOM_MOBILE_FRAMING_VERSION,
  getWarRoomMobileFramingProfile,
} from './WarRoomMobileFraming.js';

describe('War Room mobile portrait framing', () => {
  it('acerca el tablero sólo en coarse portrait de teléfono', () => {
    const phone = getWarRoomMobileFramingProfile({
      aspect: 1.06,
      coarsePointer: true,
      viewportWidth: 390,
    });

    expect(phone?.version).toBe(WAR_ROOM_MOBILE_FRAMING_VERSION);
    expect(phone.halfSpan).toBeLessThan(5.1);
    expect(phone.padding).toBeLessThan(1.06);
    expect(phone.maxDistance).toBeLessThan(19);
    expect(phone.targetZ).toBeGreaterThan(0.4);
    expect(phone.cameraY).toBeLessThan(7.2);
  });

  it('no toca desktop, tablet landscape ni punteros finos', () => {
    expect(getWarRoomMobileFramingProfile({ aspect: 1.06, coarsePointer: false, viewportWidth: 390 })).toBeNull();
    expect(getWarRoomMobileFramingProfile({ aspect: 1.45, coarsePointer: true, viewportWidth: 390 })).toBeNull();
    expect(getWarRoomMobileFramingProfile({ aspect: 1.06, coarsePointer: true, viewportWidth: 1080 })).toBeNull();
  });

  it('hace el teléfono ligeramente más cerrado que una pantalla móvil grande', () => {
    const phone = getWarRoomMobileFramingProfile({ aspect: 1.06, coarsePointer: true, viewportWidth: 390 });
    const tabletPortrait = getWarRoomMobileFramingProfile({ aspect: 1.08, coarsePointer: true, viewportWidth: 720 });

    expect(phone.halfSpan).toBeLessThan(tabletPortrait.halfSpan);
    expect(phone.padding).toBeLessThan(tabletPortrait.padding);
    expect(phone.maxDistance).toBeLessThan(tabletPortrait.maxDistance);
    expect(phone.targetZ).toBeGreaterThan(tabletPortrait.targetZ);
  });
});
