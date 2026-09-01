import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  captureWarRoomPointer,
  dispatchWarRoomAtomicTap,
  installWarRoomPointerCapture,
} from './warRoomPointerCapture.js';

let cleanup = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

class FakePointerEvent {
  constructor(type, init) {
    this.type = type;
    Object.assign(this, init);
  }
}

function fakeCanvas({ inspect = false } = {}) {
  const setPointerCapture = vi.fn();
  const dispatchEvent = vi.fn();
  const shell = { dataset: { board3dInspect: inspect ? 'true' : 'false' } };
  const canvas = {
    dataset: {},
    isConnected: true,
    ownerDocument: { defaultView: { PointerEvent: FakePointerEvent } },
    setPointerCapture,
    dispatchEvent,
    closest(selector) {
      if (selector === '.board3d-main-canvas') return this;
      if (selector === '.board3d-main-shell') return shell;
      return null;
    },
  };
  return { canvas, setPointerCapture, dispatchEvent };
}

function touchEvent(canvas, overrides = {}) {
  return {
    pointerType: 'touch',
    pointerId: 17,
    isPrimary: true,
    clientX: 121,
    clientY: 307,
    screenX: 221,
    screenY: 407,
    target: canvas,
    ...overrides,
  };
}

describe('War Room pointer capture', () => {
  it('captura touch/pen y convierte pointerdown en un tap atómico', () => {
    const { canvas, setPointerCapture, dispatchEvent } = fakeCanvas();
    const event = touchEvent(canvas);

    expect(captureWarRoomPointer(event, { schedule: (callback) => callback() })).toBe(true);
    expect(setPointerCapture).toHaveBeenCalledWith(17);
    expect(canvas.dataset.warRoomTouchStage).toBe('pointerdown');
    expect(canvas.dataset.warRoomAtomicTap).toBe('dispatched');
    expect(dispatchEvent).toHaveBeenCalledTimes(1);

    const syntheticUp = dispatchEvent.mock.calls[0][0];
    expect(syntheticUp.type).toBe('pointerup');
    expect(syntheticUp.pointerType).toBe('touch');
    expect(syntheticUp.pointerId).toBe(17);
    expect(syntheticUp.clientX).toBe(121);
    expect(syntheticUp.clientY).toBe(307);
  });

  it('puede despachar el tap atómico de forma aislada', () => {
    const { canvas, dispatchEvent } = fakeCanvas();
    expect(dispatchWarRoomAtomicTap(touchEvent(canvas), canvas)).toBe(true);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it('no altera mouse ni modo inspección', () => {
    const mouse = fakeCanvas();
    expect(captureWarRoomPointer(touchEvent(mouse.canvas, { pointerType: 'mouse', pointerId: 2 }))).toBe(false);
    expect(mouse.setPointerCapture).not.toHaveBeenCalled();

    const inspect = fakeCanvas({ inspect: true });
    expect(captureWarRoomPointer(touchEvent(inspect.canvas, { pointerId: 3 }))).toBe(false);
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
