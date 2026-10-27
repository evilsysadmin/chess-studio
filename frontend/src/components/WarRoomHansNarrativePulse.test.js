import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWarRoomHansNarrativePulse,
  WAR_ROOM_HANS_NARRATIVE_POLL_MS,
} from './WarRoomHansNarrativePulse.js';

function harness(onTick = vi.fn(() => true)) {
  let hidden = false;
  const pulse = createWarRoomHansNarrativePulse({
    onTick,
    now: () => vi.getMockedSystemTime()?.getTime() ?? 0,
    setTimer: (callback, ms) => setTimeout(callback, ms),
    clearTimer: (id) => clearTimeout(id),
    isHidden: () => hidden,
  });
  return {
    pulse, onTick,
    setHidden(next) { hidden = next; pulse.onVisibilityChange(); },
  };
}

describe('War Room Hans dialogue cadence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-27T00:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('limits dialogue orchestration to about 12.5 ticks/sec, not display refresh', () => {
    const { pulse, onTick } = harness();
    pulse.start();
    pulse.start();
    vi.advanceTimersByTime(1000);
    expect(onTick).toHaveBeenCalledTimes(13);
    expect(onTick.mock.calls[0][0]).toBe(Date.parse('2026-10-27T00:00:00Z'));
    expect(onTick.mock.calls[1][0] - onTick.mock.calls[0][0]).toBe(WAR_ROOM_HANS_NARRATIVE_POLL_MS);
    pulse.dispose();
    vi.advanceTimersByTime(2000);
    expect(onTick).toHaveBeenCalledTimes(13);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does no work while hidden and immediately resumes when visible again', () => {
    const { pulse, onTick, setHidden } = harness();
    pulse.start();
    vi.advanceTimersByTime(100);
    expect(onTick).toHaveBeenCalledTimes(2);
    setHidden(true);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(onTick).toHaveBeenCalledTimes(2);
    setHidden(false);
    vi.advanceTimersByTime(0);
    expect(onTick).toHaveBeenCalledTimes(3);
    pulse.dispose();
  });

  it('stops permanently when narrative completes, including repeated wake attempts', () => {
    const onTick = vi.fn(() => false);
    const { pulse, setHidden } = harness(onTick);
    pulse.start();
    vi.advanceTimersByTime(0);
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    setHidden(true);
    setHidden(false);
    vi.advanceTimersByTime(200);
    expect(onTick).toHaveBeenCalledTimes(1);
    pulse.dispose();
    pulse.dispose();
  });

  it('does not schedule at all while initially hidden', () => {
    let hidden = true;
    const onTick = vi.fn();
    const pulse = createWarRoomHansNarrativePulse({
      onTick,
      now: () => vi.getMockedSystemTime()?.getTime() ?? 0,
      setTimer: (callback, ms) => setTimeout(callback, ms),
      clearTimer: (id) => clearTimeout(id),
      isHidden: () => hidden,
    });
    pulse.start();
    expect(vi.getTimerCount()).toBe(0);
    hidden = false;
    pulse.onVisibilityChange();
    vi.advanceTimersByTime(0);
    expect(onTick).toHaveBeenCalledTimes(1);
    pulse.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});
