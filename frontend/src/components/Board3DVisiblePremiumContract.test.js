import { describe, expect, it } from 'vitest';
import { BOARD_THEME_3D, SKIN_3D } from './Board3DConfig.js';

function srgbLuma(hex) {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe('War Room visible premium contract', () => {
  it('keeps a deliberate value hierarchy from ivory to limestone to walnut', () => {
    const classic = BOARD_THEME_3D.classic;
    const studio = SKIN_3D.studio;

    const ivory = srgbLuma(studio.white);
    const lightSquare = srgbLuma(classic.light);
    const darkSquare = srgbLuma(classic.dark);
    const frame = srgbLuma(classic.frame);
    const ebony = srgbLuma(studio.black);

    expect(ivory).toBeGreaterThan(lightSquare);
    expect(lightSquare - darkSquare).toBeGreaterThan(85);
    expect(darkSquare - frame).toBeGreaterThan(20);
    expect(darkSquare - ebony).toBeGreaterThan(25);
  });

  it('keeps canonical black pieces as dielectric lacquer rather than dark metal', () => {
    const studio = SKIN_3D.studio;
    expect(studio.roughness).toBeGreaterThanOrEqual(0.38);
    expect(studio.roughness).toBeLessThanOrEqual(0.44);
    expect(studio.metalness).toBeLessThanOrEqual(0.1);
    expect(studio.blackAccent).not.toBe(studio.black);
  });
});