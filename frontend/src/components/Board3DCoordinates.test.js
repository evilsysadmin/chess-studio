import { describe, expect, it, vi } from 'vitest';

vi.mock('./Board3DScene.js', () => ({
  makeTextSprite(text, color) {
    const position = {
      x: 0, y: 0, z: 0,
      set(x, y, z) { this.x = x; this.y = y; this.z = z; },
    };
    return { text, color, position };
  },
}));

import { installBoard3DCoordinates } from './Board3DCoordinates.js';

function build(whiteSide) {
  const children = [];
  installBoard3DCoordinates({ add(sprite) { children.push(sprite); } }, whiteSide);
  return children;
}

describe('extracted Board3D coordinate labels', () => {
  it('preserves all 16 authored positions and orientation for the white player', () => {
    const sprites = build(true);
    expect(sprites).toHaveLength(16);
    expect(sprites.map(({ text }) => text).join('')).toBe('ABCDEFGH12345678');
    expect(sprites.every(({ color }) => color === '#d4aa54')).toBe(true);
    for (let i = 0; i < 8; i += 1) {
      expect(sprites[i].position).toMatchObject({ x: i - 3.5, y: 0.16, z: 4.68 });
      expect(sprites[8 + i].position).toMatchObject({ x: -4.68, y: 0.16, z: 3.5 - i });
    }
  });

  it('mirrors both ranks and files for the black player without shifting coordinates', () => {
    const sprites = build(false);
    expect(sprites).toHaveLength(16);
    expect(sprites.map(({ text }) => text).join('')).toBe('HGFEDCBA87654321');
    for (let i = 0; i < 8; i += 1) {
      expect(sprites[i].position).toMatchObject({ x: i - 3.5, y: 0.16, z: -4.68 });
      expect(sprites[8 + i].position).toMatchObject({ x: 4.68, y: 0.16, z: -3.5 + i });
    }
  });
});
