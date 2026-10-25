import { describe, expect, it, vi } from 'vitest';
import { createWarRoomRenderBatcher } from './WarRoomRenderBatcher.js';

function harness() {
  const frames = new Map();
  let nextId = 1;
  const draw = vi.fn();
  const cancelFrame = vi.fn((id) => frames.delete(id));
  const batcher = createWarRoomRenderBatcher({
    requestFrame: (callback) => {
      const id = nextId++;
      frames.set(id, callback);
      return id;
    },
    cancelFrame,
    draw,
  });
  return {
    batcher, draw, frames, cancelFrame,
    fire(id) { const callback = frames.get(id); frames.delete(id); callback?.(); },
  };
}

describe('War Room render batching', () => {
  it('coalesces camera, pieces, highlights and lighting into one frame', () => {
    const h = harness();
    h.batcher.request();
    h.batcher.request();
    h.batcher.request();
    h.batcher.request();
    expect(h.frames.size).toBe(1);
    expect(h.draw).not.toHaveBeenCalled();
    h.fire(1);
    expect(h.draw).toHaveBeenCalledTimes(1);
    h.batcher.request();
    h.fire(2);
    expect(h.draw).toHaveBeenCalledTimes(2);
  });

  it('preserves immediate paints for animation and Hans readiness', () => {
    const h = harness();
    h.batcher.request();
    const stale = h.frames.get(1);
    h.batcher.flush();
    expect(h.cancelFrame).toHaveBeenCalledWith(1);
    expect(h.draw).toHaveBeenCalledTimes(1);
    stale();
    expect(h.draw).toHaveBeenCalledTimes(1);
    h.batcher.flush();
    expect(h.draw).toHaveBeenCalledTimes(2);
    h.batcher.request();
    h.fire(2);
    expect(h.draw).toHaveBeenCalledTimes(3);
  });

  it('cancels queued work when WebGL unmounts', () => {
    const h = harness();
    h.batcher.request();
    const stale = h.frames.get(1);
    h.batcher.dispose();
    expect(h.frames.size).toBe(0);
    stale();
    h.batcher.request();
    h.batcher.flush();
    expect(h.draw).not.toHaveBeenCalled();
  });
});
