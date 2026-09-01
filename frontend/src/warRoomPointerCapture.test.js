import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureWarRoomPointer, installWarRoomPointerCapture } from './warRoomPointerCapture.js';

let cleanup = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

function fakeCanvas({ inspect = false } = {}) {
  const setPointerCapture = vi.fn();
  const shell = { dataset: { board3dInspect: inspect ? 'true' : 'false' } };
  const canvas = {
    setPointerCapture,
    closest(selector) {
      if (selector === '.board3d-main-canvas') return this;
      if (selector === '.board3d-main-shell') return shell;
      return null;
    },
  };
  return { canvas, setPointerCapture };
}

describe('War Room pointer capture', () => {
  it('captura touch/pen durante juego normal y no depende de media queries', () => {
    const { canvas, setPointerCapture } = fakeCanvas();
    expect(captureWarRoomPointer({ pointerType: 'touch', pointerId: 17, target: canvas })).toBe(true);
    expect(setPointerCapture).toHaveBeenCalledWith(17);
  });

  it('no altera mouse ni modo inspección', () => {
    const mouse = fakeCanvas();
    expect(captureWarRoomPointer({ pointerType: 'mouse', pointerId: 2, target: mouse.canvas })).toBe(false);
    expect(mouse.setPointerCapture).not.toHaveBeenCalled();

    const inspect = fakeCanvas({ inspect: true });
    expect(captureWarRoomPointer({ pointerType: 'touch', pointerId: 3, target: inspect.canvas })).toBe(false);
    expect(inspect.setPointerCapture).not.toHaveBeenCalled();
  });

  it('instala un único listener global y permite cleanup', () => {
    const listeners = new Map();
    const root = {
      addEventListener: vi.fn((type, handler) => listeners.set(type, handler)),
      removeEventListener: vi.fn((type) => listeners.delete(type)),
    };
    cleanup = installWarRoomPointerCapture(root);
    expect(root.addEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function), true);
    cleanup();
    cleanup = null;
    expect(root.removeEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function), true);
  });
});
