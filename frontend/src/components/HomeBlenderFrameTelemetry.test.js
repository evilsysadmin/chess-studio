import { describe, expect, it } from 'vitest';
import {
  HOME_BLENDER_FRAME_TELEMETRY_INTERVAL_MS,
  homeBlenderFrameTelemetryDue,
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
