import { describe, expect, it } from 'vitest';
import {
  HOME_BLENDER_FRAME_TELEMETRY_INTERVAL_MS,
  homeBlenderFrameTelemetryDue,
  homeBlenderNeedsOnDemandFrame,
} from './HomeBlenderScene3D.jsx';

describe('Home Blender bounded frame diagnostics', () => {
  it('does not publish DOM attributes on every animation frame', () => {
    expect(HOME_BLENDER_FRAME_TELEMETRY_INTERVAL_MS).toBe(1000);
    expect(homeBlenderFrameTelemetryDue(16.7, 0)).toBe(false);
    expect(homeBlenderFrameTelemetryDue(999.9, 0)).toBe(false);
    expect(homeBlenderFrameTelemetryDue(1000, 0)).toBe(true);
    expect(homeBlenderFrameTelemetryDue(1017, 1000)).toBe(false);
    expect(homeBlenderFrameTelemetryDue(2001, 1000)).toBe(true);
  });

  it('drops paused or invalid clock samples rather than publishing spurious values', () => {
    expect(homeBlenderFrameTelemetryDue(1000, NaN)).toBe(false);
    expect(homeBlenderFrameTelemetryDue(Infinity, 0)).toBe(false);
    expect(homeBlenderFrameTelemetryDue(100, 1000)).toBe(false);
    expect(homeBlenderFrameTelemetryDue(1000, 1000)).toBe(false);
  });
});

describe('Home Blender on-demand versus ambient frame arbitration', () => {
  it('keeps the one-off render path available on reduced-motion and software renderers', () => {
    // No animation loop is scheduled under reduced motion / SwiftShader.
    expect(homeBlenderNeedsOnDemandFrame({ visible: true })).toBe(true);
    expect(homeBlenderNeedsOnDemandFrame()).toBe(true);
    expect(homeBlenderNeedsOnDemandFrame({
      visible: true, ambientFrameQueued: false, ambientWakeQueued: false,
    })).toBe(true);
  });

  it('does not schedule duplicate room draws while an animation frame or wake is pending', () => {
    expect(homeBlenderNeedsOnDemandFrame({
      visible: true, ambientFrameQueued: true,
    })).toBe(false);
    expect(homeBlenderNeedsOnDemandFrame({
      visible: true, ambientWakeQueued: true,
    })).toBe(false);
    expect(homeBlenderNeedsOnDemandFrame({
      visible: true, ambientFrameQueued: true, ambientWakeQueued: true,
    })).toBe(false);
  });

  it('coalesces competing on-demand requests and refuses offscreen frames', () => {
    expect(homeBlenderNeedsOnDemandFrame({
      visible: true, onDemandQueued: true,
    })).toBe(false);
    expect(homeBlenderNeedsOnDemandFrame({
      visible: false,
    })).toBe(false);
    expect(homeBlenderNeedsOnDemandFrame({
      visible: false, ambientFrameQueued: true,
    })).toBe(false);
  });

  it('rechecks eligibility at execution time when an ambient loop starts after a request', () => {
    const queuedBeforeResume = {
      visible: true, onDemandQueued: false, ambientFrameQueued: false,
    };
    expect(homeBlenderNeedsOnDemandFrame(queuedBeforeResume)).toBe(true);
    // The pending on-demand RAF will skip its render once the live loop owns
    // an animation callback; the ambient callback renders the latest scene.
    expect(homeBlenderNeedsOnDemandFrame({
      ...queuedBeforeResume, ambientFrameQueued: true,
    })).toBe(false);
    // When animation is stopped, the fallback on-demand path works again.
    expect(homeBlenderNeedsOnDemandFrame(queuedBeforeResume)).toBe(true);
  });
});
