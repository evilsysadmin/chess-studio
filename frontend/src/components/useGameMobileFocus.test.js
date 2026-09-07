import { afterEach, describe, expect, it, vi } from 'vitest';
import { FOCUS_BUBBLE_MS, scheduleFocusBubbleClear } from './useGameMobileFocus.js';

describe('Focus bubble lifetime', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears after the configured transient lifetime', () => {
    vi.useFakeTimers();
    const clearBubble = vi.fn();

    scheduleFocusBubbleClear(clearBubble, globalThis);

    vi.advanceTimersByTime(FOCUS_BUBBLE_MS - 1);
    expect(clearBubble).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(clearBubble).toHaveBeenCalledTimes(1);
  });
});
