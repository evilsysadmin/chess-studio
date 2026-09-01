import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dispatchWarRoomFocusedRetry,
  installWarRoomPointerCapture,
} from './warRoomPointerCapture.js';

let cleanup = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

class FakeKeyboardEvent {
  constructor(type, init = {}) {
    this.type = type;
    Object.assign(this, init);
  }
}

function fakeBoard() {
  const host = { dispatchEvent: vi.fn(() => true) };
  const shell = {
    dataset: {
      board3dInspect: 'false',
      board3dSelected: '',
      board3dFocused: 'e1',
      board3dLegalTargetCount: '0',
    },
    querySelector: vi.fn((selector) => selector === '.board3d-main-host' ? host : null),
  };
  const canvas = {
    dataset: {},
    closest(selector) {
      if (selector === '.board3d-main-canvas') return this;
      if (selector === '.board3d-main-shell') return shell;
      return null;
    },
  };
  return { canvas, shell, host };
}

function pointerDown(canvas) {
  return {
    pointerType: 'touch',
    pointerId: 9,
    isTrusted: true,
    timeStamp: 100,
    target: canvas,
    clientX: 120,
    clientY: 300,
  };
}

function touchStart(canvas) {
  return {
    timeStamp: 110,
    target: canvas,
    touches: [{ identifier: 1, clientX: 120, clientY: 300 }],
    changedTouches: [{ identifier: 1, clientX: 120, clientY: 300 }],
    cancelable: true,
    preventDefault: vi.fn(),
  };
}

function fakeRoot() {
  const handlers = new Map();
  const rafQueue = [];
  const root = {
    defaultView: {
      location: { hostname: 'example.test', search: '' },
      matchMedia: vi.fn(() => ({ matches: true })),
      KeyboardEvent: FakeKeyboardEvent,
      requestAnimationFrame: vi.fn((callback) => {
        rafQueue.push(callback);
        return rafQueue.length;
      }),
    },
    addEventListener: vi.fn((type, handler) => handlers.set(type, handler)),
    removeEventListener: vi.fn(),
  };
  return { root, handlers, rafQueue };
}

function flushRafQueue(queue, max = 20) {
  let count = 0;
  while (queue.length && count < max) {
    const callback = queue.shift();
    callback(performance.now());
    count += 1;
  }
}

describe('War Room deferred React touch recovery', () => {
  it('retries the focused square through the React keyboard path', () => {
    const { canvas, shell, host } = fakeBoard();
    shell.dataset.board3dFocused = 'h2';
    const { root } = fakeRoot();

    expect(dispatchWarRoomFocusedRetry(canvas, { root })).toBe(true);
    expect(host.dispatchEvent).toHaveBeenCalledTimes(1);
    expect(host.dispatchEvent.mock.calls[0][0]).toMatchObject({ type: 'keydown', key: 'Enter' });
    expect(canvas.dataset.warRoomTouchRecovery).toBe('enter-retry');
  });

  it('recovers a first touch whose native canvas path focused but did not select', () => {
    const { canvas, shell, host } = fakeBoard();
    const { root, handlers, rafQueue } = fakeRoot();
    cleanup = installWarRoomPointerCapture(root);

    handlers.get('pointerdown')(pointerDown(canvas));
    canvas.dataset.warRoomLastSquare = 'h2';
    shell.dataset.board3dFocused = 'h2';
    handlers.get('touchstart')(touchStart(canvas));
    flushRafQueue(rafQueue);

    expect(canvas.dataset.warRoomSelectedAtPointerDown).toBe('');
    expect(canvas.dataset.warRoomTouchRecovery).toBe('enter-retry');
    expect(host.dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it('does not retry when React selection became visible before the recovery check', () => {
    const { canvas, shell, host } = fakeBoard();
    const { root, handlers, rafQueue } = fakeRoot();
    cleanup = installWarRoomPointerCapture(root);

    handlers.get('pointerdown')(pointerDown(canvas));
    canvas.dataset.warRoomLastSquare = 'h2';
    shell.dataset.board3dFocused = 'h2';
    handlers.get('touchstart')(touchStart(canvas));
    shell.dataset.board3dSelected = 'h2';
    flushRafQueue(rafQueue);

    expect(canvas.dataset.warRoomTouchRecovery).toBe('selected');
    expect(host.dispatchEvent).not.toHaveBeenCalled();
  });
});
