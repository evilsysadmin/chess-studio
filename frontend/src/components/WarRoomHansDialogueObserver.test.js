import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  observeWarRoomHansDialogue,
  WAR_ROOM_HANS_DIALOGUE_ATTRIBUTES,
} from './WarRoomHansDialogueObserver.js';

class TestMutationObserver {
  static instances = [];
  constructor(callback) {
    this.callback = callback;
    this.disconnected = false;
    TestMutationObserver.instances.push(this);
  }
  observe(node, options) { this.node = node; this.options = options; (this.observed ||= []).push({ node, options }); }
  disconnect() { this.disconnected = true; }
  notify() { this.callback(); }
}

function hostFixture() {
  let canvas = { dataset: { warRoomHansMopDialogue: '' } };
  return {
    host: { querySelector: vi.fn(() => canvas) },
    setCanvas: (value) => { canvas = value; },
  };
}

describe('War Room Hans dialogue canvas observation', () => {
  beforeEach(() => { vi.useFakeTimers(); TestMutationObserver.instances = []; });
  afterEach(() => vi.useRealTimers());

  it('reads once immediately and then only on canvas mutations, not on animation frames', () => {
    const f = hostFixture();
    const changes = vi.fn();
    const stop = observeWarRoomHansDialogue({
      host: f.host,
      onChange: changes,
      Observer: TestMutationObserver,
    });
    const observer = TestMutationObserver.instances[0];
    expect(changes).toHaveBeenCalledTimes(1);
    expect(observer.node).toBe(f.host);
    expect(observer.options).toMatchObject({ childList: true, subtree: true, attributes: true });
    expect(observer.options.attributeFilter).toEqual(WAR_ROOM_HANS_DIALOGUE_ATTRIBUTES);
    vi.advanceTimersByTime(3000);
    expect(changes).toHaveBeenCalledTimes(1);

    const nextCanvas = { dataset: { warRoomHansServiceDialogue: 'hans', warRoomHansNdcX: '0.2' } };
    f.setCanvas(nextCanvas);
    observer.notify();
    expect(changes).toHaveBeenLastCalledWith(nextCanvas);
    expect(changes).toHaveBeenCalledTimes(2);
    stop();
    expect(observer.disconnected).toBe(true);
    observer.notify();
    expect(changes).toHaveBeenCalledTimes(2);
  });

  it('observes Focus and Zen class changes without an animation loop', () => {
    const f = hostFixture();
    const layout = { className: 'game-layout-3d' };
    const row = { className: 'board-live-row' };
    f.host.closest = vi.fn((selector) => selector === '.game-layout-3d' ? layout : row);
    const changes = vi.fn();
    const stop = observeWarRoomHansDialogue({
      host: f.host, onChange: changes, Observer: TestMutationObserver,
      watchUiClasses: true,
    });
    const observer = TestMutationObserver.instances[0];
    expect(observer.observed).toHaveLength(3);
    expect(observer.observed.slice(1)).toEqual([
      { node: layout, options: { attributes: true, attributeFilter: ['class'] } },
      { node: row, options: { attributes: true, attributeFilter: ['class'] } },
    ]);
    observer.notify();
    expect(changes).toHaveBeenCalledTimes(2);
    stop();
    expect(observer.disconnected).toBe(true);
  });

  it('does not leak polling after disposal on browsers without MutationObserver', () => {
    const f = hostFixture();
    const changes = vi.fn();
    const stop = observeWarRoomHansDialogue({ host: f.host, onChange: changes, Observer: null });
    expect(changes).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1500);
    expect(changes).toHaveBeenCalledTimes(4);
    stop();
    vi.advanceTimersByTime(5000);
    expect(changes).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('handles an absent canvas and an absent host safely', () => {
    const f = hostFixture();
    f.setCanvas(null);
    const changes = vi.fn();
    const stop = observeWarRoomHansDialogue({
      host: f.host, onChange: changes, Observer: TestMutationObserver,
    });
    expect(changes).toHaveBeenCalledWith(null);
    f.setCanvas({ dataset: { warRoomHansMopDialogue: 'hans' } });
    TestMutationObserver.instances.at(-1).notify();
    expect(changes).toHaveBeenLastCalledWith(f.host.querySelector());
    stop();
    expect(() => observeWarRoomHansDialogue({ host: null, onChange: changes })()).not.toThrow();
  });
});
