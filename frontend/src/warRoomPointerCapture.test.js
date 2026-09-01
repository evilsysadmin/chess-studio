import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  captureWarRoomPointer,
  dispatchWarRoomTouchFallback,
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
  const shell = {
    dataset: {
      board3dInspect: inspect ? 'true' : 'false',
      board3dSelected: '',
      board3dFocused: 'e1',
      board3dLegalTargetCount: '0',
    },
    appendChild: vi.fn(),
  };
  const canvas = {
    dataset: {},
    ownerDocument: { defaultView: { PointerEvent: FakePointerEvent } },
    setPointerCapture,
    dispatchEvent,
    closest(selector) {
      if (selector === '.board3d-main-canvas') return this;
      if (selector === '.board3d-main-shell') return shell;
      return null;
    },
  };
  return { canvas, shell, setPointerCapture, dispatchEvent };
}

function touchEvent(canvas, overrides = {}) {
  return {
    pointerType: 'touch',
    pointerId: 17,
    isTrusted: true,
    timeStamp: 100,
    target: canvas,
    ...overrides,
  };
}

function nativeTouchStart(canvas, overrides = {}) {
  const touch = {
    identifier: 4,
    clientX: 121,
    clientY: 307,
    screenX: 221,
    screenY: 407,
    force: 0.7,
  };
  return {
    timeStamp: 110,
    target: canvas,
    touches: [touch],
    changedTouches: [touch],
    cancelable: true,
    preventDefault: vi.fn(),
    ...overrides,
  };
}

describe('War Room real-device touch bridge', () => {
  it('observa pointerdown sin capturarlo globalmente antes de Board3D', () => {
    const { canvas, setPointerCapture } = fakeCanvas();
    expect(captureWarRoomPointer(touchEvent(canvas))).toBe(true);
    expect(setPointerCapture).not.toHaveBeenCalled();
    expect(canvas.dataset.warRoomObservedPointerType).toBe('touch');
    expect(canvas.dataset.warRoomTouchStage).toBe('observed-down');
  });

  it('sintetiza pointerdown touch desde touchstart cuando hace falta', () => {
    const { canvas, dispatchEvent } = fakeCanvas();
    const event = nativeTouchStart(canvas);

    expect(dispatchWarRoomTouchFallback(event, canvas)).toBe(true);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    const syntheticDown = dispatchEvent.mock.calls[0][0];
    expect(syntheticDown.type).toBe('pointerdown');
    expect(syntheticDown.pointerType).toBe('touch');
    expect(syntheticDown.pointerId).toBe(1004);
    expect(syntheticDown.clientX).toBe(121);
    expect(syntheticDown.clientY).toBe(307);
    expect(canvas.dataset.warRoomTouchFallback).toBe('dispatched');
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('no altera mouse ni modo inspección', () => {
    const mouse = fakeCanvas();
    expect(captureWarRoomPointer(touchEvent(mouse.canvas, { pointerType: 'mouse', pointerId: 2 }))).toBe(false);
    expect(mouse.setPointerCapture).not.toHaveBeenCalled();

    const inspect = fakeCanvas({ inspect: true });
    expect(captureWarRoomPointer(touchEvent(inspect.canvas, { pointerId: 3 }))).toBe(false);
    expect(dispatchWarRoomTouchFallback(nativeTouchStart(inspect.canvas), inspect.canvas)).toBe(false);
  });

  it('instala observador pointer + fallback touchstart y permite cleanup', () => {
    const listeners = new Map();
    const root = {
      defaultView: {
        location: { hostname: 'example.test', search: '' },
        matchMedia: vi.fn(() => ({ matches: true })),
      },
      addEventListener: vi.fn((type, handler) => listeners.set(type, handler)),
      removeEventListener: vi.fn((type) => listeners.delete(type)),
    };
    cleanup = installWarRoomPointerCapture(root);
    expect(root.addEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function), true);
    expect(root.addEventListener).toHaveBeenCalledWith(
      'touchstart',
      expect.any(Function),
      { capture: true, passive: false },
    );
    cleanup();
    cleanup = null;
    expect(root.removeEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function), true);
    expect(root.removeEventListener).toHaveBeenCalledWith('touchstart', expect.any(Function), true);
  });

  it('no duplica fallback si Android ya entregó pointerdown touch', () => {
    const { canvas, dispatchEvent } = fakeCanvas();
    const handlers = new Map();
    const root = {
      defaultView: {
        location: { hostname: 'example.test', search: '' },
        matchMedia: vi.fn(() => ({ matches: true })),
      },
      addEventListener: vi.fn((type, handler) => handlers.set(type, handler)),
      removeEventListener: vi.fn(),
    };
    cleanup = installWarRoomPointerCapture(root);

    handlers.get('pointerdown')(touchEvent(canvas, { timeStamp: 100 }));
    handlers.get('touchstart')(nativeTouchStart(canvas, { timeStamp: 110 }));

    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});
