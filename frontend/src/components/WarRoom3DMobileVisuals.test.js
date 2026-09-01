import { describe, expect, it } from 'vitest';
import { warRoomDecorProfile } from './WarRoom3DMobileVisuals.js';

describe('War Room mobile decor profile', () => {
  it('recupera luz de pared en coarse pointer sin tocar exposición global', () => {
    const desktop = warRoomDecorProfile(false);
    const mobile = warRoomDecorProfile(true);

    expect(mobile.crest).toBeGreaterThan(7);
    expect(mobile.moon).toBeGreaterThan(desktop.moon);
    expect(mobile.palette).toBeGreaterThan(desktop.palette);
    expect(mobile.wallSconce).toBeGreaterThan(3.5);
  });

  it('levanta los tonos oscuros del decorado móvil', () => {
    const desktop = warRoomDecorProfile(false);
    const mobile = warRoomDecorProfile(true);

    expect(mobile.curtainLight).not.toBe(desktop.curtainLight);
    expect(mobile.curtainDark).not.toBe(desktop.curtainDark);
    expect(mobile.banner).not.toBe(desktop.banner);
  });
});
