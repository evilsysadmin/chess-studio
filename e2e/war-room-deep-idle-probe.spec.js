import { expect, test } from '@playwright/test';
import {
  assessWarRoomDeepIdleCapture,
  WAR_ROOM_DEEP_IDLE_WAIT_MS,
} from './war-room-deep-idle-probe.mjs';

const completed = (startedAtMs, calls = 480) => ({
  startedAtMs, endedAtMs: startedAtMs + 8, calls,
});

test.describe('War Room opt-in deep-idle GPU benchmark evidence', () => {
  test('counts completed WebGL submissions rather than browser RAF callbacks', () => {
    const status = assessWarRoomDeepIdleCapture({
      capture: { overflow: false, samples: [completed(10_000), completed(29_900)] },
      startedAtMs: 0, endedAtMs: 34_000, visibility: 'visible', visibilityBefore: 'visible', visibilityTransitions: 0,
    });
    expect(status.status).toBe('ready');
    expect(status.totalRenderSubmissions).toBe(2);
    expect(status.tailRenderSubmissions).toBe(0);
    expect(status.tailDrawCalls).toBe(0);
    expect(status.deepSleepObserved).toBe(true);
    expect(WAR_ROOM_DEEP_IDLE_WAIT_MS).toBeGreaterThan(30_000);
  });

  test('does not hide a late ambient frame after the deep-sleep deadline', () => {
    const status = assessWarRoomDeepIdleCapture({
      capture: { overflow: false, samples: [completed(29_900), completed(32_000, 485)] },
      startedAtMs: 0, endedAtMs: 34_000, visibility: 'visible', visibilityBefore: 'visible', visibilityTransitions: 0,
    });
    expect(status.status).toBe('ready');
    expect(status.tailRenderSubmissions).toBe(1);
    expect(status.tailDrawCalls).toBe(485);
    expect(status.deepSleepObserved).toBe(false);
  });

  test('counts a slow render overlapping the observation-tail boundary', () => {
    const status = assessWarRoomDeepIdleCapture({
      capture: { overflow: false, samples: [{ startedAtMs: 31_498, endedAtMs: 31_510, calls: 400 }] },
      startedAtMs: 0, endedAtMs: 34_000, visibility: 'visible', visibilityBefore: 'visible', visibilityTransitions: 0,
    });
    expect(status.status).toBe('ready');
    expect(status.tailRenderSubmissions).toBe(1);
    expect(status.deepSleepObserved).toBe(false);
  });

  test('rejects an idle sample when tab hides and returns before the final measurement', () => {
    const status = assessWarRoomDeepIdleCapture({
      capture: { overflow: false, samples: [] },
      startedAtMs: 0, endedAtMs: 34_000,
      visibility: 'visible', visibilityBefore: 'visible', visibilityTransitions: 2,
    });
    expect(status.status).toBe('visibility-interrupted');
    expect(assessWarRoomDeepIdleCapture({
      capture: { overflow: false, samples: [] },
      startedAtMs: 0, endedAtMs: 34_000,
      visibility: 'visible', visibilityBefore: 'visible',
    }).status).toBe('missing-visibility-history');
  });

  test('fails closed on hidden tab, short measurement and journal loss', () => {
    const sample = { overflow: false, samples: [] };
    expect(assessWarRoomDeepIdleCapture({
      capture: sample, startedAtMs: 0, endedAtMs: 34_000,
      visibility: 'hidden', visibilityBefore: 'visible', visibilityTransitions: 0,
    }).status).toBe('not-foreground');
    expect(assessWarRoomDeepIdleCapture({
      capture: sample, startedAtMs: 0, endedAtMs: 30_000,
      visibility: 'visible', visibilityBefore: 'visible', visibilityTransitions: 0,
    }).status).toBe('insufficient-duration');
    expect(assessWarRoomDeepIdleCapture({
      capture: null, startedAtMs: 0, endedAtMs: 34_000,
      visibility: 'visible', visibilityBefore: 'visible', visibilityTransitions: 0,
    }).status).toBe('missing-journal');
    expect(assessWarRoomDeepIdleCapture({
      capture: { ...sample, overflow: true }, startedAtMs: 0, endedAtMs: 34_000,
      visibility: 'visible', visibilityBefore: 'visible', visibilityTransitions: 0,
    }).status).toBe('journal-overflow');
    expect(assessWarRoomDeepIdleCapture({
      capture: { overflow: false, samples: [{ startedAtMs: 20_000, endedAtMs: 20_001, calls: -1 }] },
      startedAtMs: 0, endedAtMs: 34_000, visibility: 'visible', visibilityBefore: 'visible', visibilityTransitions: 0,
    }).status).toBe('invalid-render-sample');
  });
});
