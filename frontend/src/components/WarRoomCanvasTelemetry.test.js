import { describe, expect, it, vi } from 'vitest';
import { writeWarRoomCanvasTelemetry } from './WarRoom3DMotion.js';

describe('War Room render telemetry DOM budget', () => {
  it('writes each canvas diagnostic only when its string value actually changes', () => {
    const values = {};
    const writes = vi.fn();
    const canvas = {
      dataset: new Proxy(values, {
        set(target, key, value) {
          writes(key, value);
          target[key] = String(value);
          return true;
        },
      }),
    };

    expect(writeWarRoomCanvasTelemetry(canvas, 'warRoomLightHemisphere', '0.62')).toBe(true);
    expect(writeWarRoomCanvasTelemetry(canvas, 'warRoomLightHemisphere', '0.62')).toBe(false);
    expect(writeWarRoomCanvasTelemetry(canvas, 'warRoomLightHemisphere', 0.62)).toBe(false);
    expect(writeWarRoomCanvasTelemetry(canvas, 'warRoomLightHemisphere', '1.35')).toBe(true);
    expect(writeWarRoomCanvasTelemetry(canvas, 'warRoomMaterialGrade', 'dynamic-groups-v1')).toBe(true);
    expect(writes.mock.calls).toEqual([
      ['warRoomLightHemisphere', '0.62'],
      ['warRoomLightHemisphere', '1.35'],
      ['warRoomMaterialGrade', 'dynamic-groups-v1'],
    ]);
    expect(values).toEqual({ warRoomLightHemisphere: '1.35', warRoomMaterialGrade: 'dynamic-groups-v1' });

    // Other code may replace a diagnostic value; the next render must restore
    // the renderer's correct value rather than trusting a private stale cache.
    canvas.dataset.warRoomMaterialGrade = 'external';
    expect(writeWarRoomCanvasTelemetry(canvas, 'warRoomMaterialGrade', 'dynamic-groups-v1')).toBe(true);
    expect(writes).toHaveBeenCalledTimes(5);
    expect(writeWarRoomCanvasTelemetry({ dataset: {} }, 'warRoomMaterialGrade', 'dynamic-groups-v1')).toBe(true);
  });

  it('does not create telemetry for absent canvases or missing datasets', () => {
    expect(writeWarRoomCanvasTelemetry(null, 'a', 1)).toBe(false);
    expect(writeWarRoomCanvasTelemetry({}, 'a', 1)).toBe(false);
  });
});
