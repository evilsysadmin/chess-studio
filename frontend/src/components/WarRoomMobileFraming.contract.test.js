import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  WAR_ROOM_MOBILE_FRAMING_VERSION,
  getWarRoomMobileFramingProfile,
} from './WarRoomMobileFraming.js';

const mobileCss = fs.readFileSync(new URL('./WarRoom3DMobileControls.css', import.meta.url), 'utf8');

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

  it('compacta el shell y las acciones móviles sin alterar reglas desktop', () => {
    expect(mobileCss).toContain('aspect-ratio: 1.07 / 1');
    expect(mobileCss).toContain('aspect-ratio: 1.06 / 1');
    expect(mobileCss).toContain('min-height: 34px !important');
    expect(mobileCss).toContain('min-height: 32px !important');
    expect(mobileCss).toContain('top: auto;');
    expect(mobileCss).toContain('bottom: .4rem;');
    expect(mobileCss).not.toContain('@media (min-width: 1081px)');
  });
});
