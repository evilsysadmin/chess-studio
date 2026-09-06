import { describe, expect, it } from 'vitest';
import { createBoard3DRaycastPicker } from './Board3DRaycastPicker.js';

function objectWithSquare(square, parent = null) {
  return { userData: square ? { square } : {}, parent };
}

function fakeRaycaster(responses = []) {
  const calls = [];
  let index = 0;
  return {
    calls,
    intersectObjects(targets, recursive, result) {
      calls.push({ targets, recursive, result });
      result.push(...(responses[index] || []));
      index += 1;
      return result;
    },
  };
}

describe('Board3D allocation-free raycast picker', () => {
  it('prefers a live piece hit and skips the 64-square fallback', () => {
    const pieceRoot = objectWithSquare('e4');
    const raycaster = fakeRaycaster([[{ object: pieceRoot }]]);
    const pieceGroup = { children: [pieceRoot] };
    const squares = new Map([['e4', objectWithSquare('e4')]]);
    const pick = createBoard3DRaycastPicker({ raycaster, pieceGroup, squareMeshes: squares });

    expect(pick()).toBe('e4');
    expect(raycaster.calls).toHaveLength(1);
    expect(raycaster.calls[0].targets).toBe(pieceGroup.children);
    expect(raycaster.calls[0].recursive).toBe(true);
  });

  it('falls back to stable square roots when no piece resolves a square', () => {
    const decorativeGhost = objectWithSquare(null);
    const square = objectWithSquare('c6');
    const squareMeshes = new Map([['c6', square]]);
    const raycaster = fakeRaycaster([
      [{ object: decorativeGhost }],
      [{ object: square }],
    ]);
    const pick = createBoard3DRaycastPicker({
      raycaster,
      pieceGroup: { children: [decorativeGhost] },
      squareMeshes,
    });

    expect(pick()).toBe('c6');
    expect(raycaster.calls).toHaveLength(2);
    expect(raycaster.calls[1].targets).toEqual([square]);
    expect(raycaster.calls[1].recursive).toBe(false);
  });

  it('walks up a mesh parent chain exactly like the previous picker', () => {
    const pieceRoot = objectWithSquare('g7');
    const childMesh = objectWithSquare(null, pieceRoot);
    const raycaster = fakeRaycaster([[{ object: childMesh }]]);
    const pick = createBoard3DRaycastPicker({
      raycaster,
      pieceGroup: { children: [pieceRoot] },
      squareMeshes: new Map(),
    });

    expect(pick()).toBe('g7');
  });

  it('reuses one intersection buffer across piece and square passes and later picks', () => {
    const square = objectWithSquare('a1');
    const raycaster = fakeRaycaster([
      [], [{ object: square }],
      [], [{ object: square }],
    ]);
    const pick = createBoard3DRaycastPicker({
      raycaster,
      pieceGroup: { children: [] },
      squareMeshes: new Map([['a1', square]]),
    });

    expect(pick()).toBe('a1');
    expect(pick()).toBe('a1');
    const buffers = raycaster.calls.map((call) => call.result);
    expect(new Set(buffers).size).toBe(1);
  });
});
