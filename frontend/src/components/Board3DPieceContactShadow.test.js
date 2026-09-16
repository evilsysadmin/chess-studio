import { describe, expect, it } from 'vitest';
import { buildPiece, disposeObject } from './Board3DPieces.js';

function contactShadows(piece) {
  const shadows = [];
  piece.traverse((child) => {
    if (child?.userData?.contactShadow) shadows.push(child);
  });
  return shadows;
}

describe('War Room piece grounding', () => {
  it('keeps the approved two-pass contact shadow on desktop pieces and above the board skin', () => {
    const piece = buildPiece('p', 'w', 'studio', false);
    try {
      const shadows = contactShadows(piece);
      expect(shadows).toHaveLength(2);
      expect(shadows.every((shadow) => shadow.userData.contactShadowTier === 'full-dual-pass')).toBe(true);
      expect(shadows.every((shadow) => shadow.geometry.parameters.segments === 28)).toBe(true);
      expect(shadows.every((shadow) => shadow.position.y > 0)).toBe(true);
      expect(shadows[0].position.y).toBeGreaterThan(shadows[1].position.y);
    } finally {
      disposeObject(piece);
    }
  });

  it('grounds coarse-pointer pieces with one low-cost pass instead of dropping contact entirely', () => {
    for (const color of ['w', 'b']) {
      const piece = buildPiece('p', color, 'studio', true);
      try {
        const shadows = contactShadows(piece);
        expect(shadows).toHaveLength(1);
        expect(shadows[0].userData.contactShadowTier).toBe('lite-single-pass');
        expect(shadows[0].userData.contactShadowSide).toBe(color);
        expect(shadows[0].geometry.parameters.segments).toBe(16);
        expect(shadows[0].position.y).toBeGreaterThan(0);
        expect(shadows[0].material.depthWrite).toBe(false);
        expect(shadows[0].material.toneMapped).toBe(false);
      } finally {
        disposeObject(piece);
      }
    }
  });
});
