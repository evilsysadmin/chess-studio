import { describe, expect, it } from 'vitest';
import { fitMatthiasBubble } from './useMatthiasBubbleFit.js';

describe('fitMatthiasBubble', () => {
  const base = { bubbleWidth: 300, bubbleHeight: 120, hostWidth: 374 };

  it('no mueve un bocadillo que ya cabe', () => {
    expect(fitMatthiasBubble({ ...base, anchorX: 187, anchorY: 300, minTop: 70 })).toEqual({ shiftX: 0, shiftY: 0 });
  });

  it('mete dentro un bocadillo anclado a un rey pegado al borde derecho', () => {
    const { shiftX } = fitMatthiasBubble({ ...base, anchorX: 340, anchorY: 300, minTop: 70 });
    expect(340 + shiftX + 150).toBeLessThanOrEqual(374 - 8);
    expect(shiftX).toBeLessThan(0);
  });

  it('lo baja para librar el HUD, pero nunca por debajo del borde del tablero', () => {
    expect(fitMatthiasBubble({ ...base, anchorX: 187, anchorY: 150, minTop: 70 }).shiftY).toBe(40);
    expect(fitMatthiasBubble({ ...base, anchorX: 187, anchorY: 150, minTop: 70, maxBottom: 165 }).shiftY).toBe(15);
    expect(fitMatthiasBubble({ ...base, anchorX: 187, anchorY: 150, minTop: 70, maxBottom: 140 }).shiftY).toBe(0);
  });

  it('centra en el host si el bocadillo es más ancho que el hueco', () => {
    const { shiftX } = fitMatthiasBubble({ ...base, bubbleWidth: 400, anchorX: 300, anchorY: 300 });
    expect(300 + shiftX).toBe(187);
  });
});
