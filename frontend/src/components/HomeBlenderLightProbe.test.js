import { describe, expect, it } from 'vitest';
import {
  homeBlenderLightProbeMode,
  homeBlenderLightProbeLocksFullLod,
  applyHomeBlenderLightProbe,
} from './HomeBlenderLightProbe.js';

describe('opt-in Home GPU auxiliary-light isolation', () => {
  it('requires both explicit profiling flags; ordinary Home never changes', () => {
    for (const query of ['', '?homeLightProbe=aux-off', '?homeGpuProfile=1',
      '?homeGpuProfile=0&homeLightProbe=aux-off', '?homeGpuProfile=1&homeLightProbe=garbage']) {
      expect(homeBlenderLightProbeMode(query)).toBe('normal');
    }
    expect(homeBlenderLightProbeMode('?homeGpuProfile=1&homeLightProbe=aux-off')).toBe('aux-off');
    expect(homeBlenderLightProbeMode('homeGpuProfile=1&homeLightProbe=aux-off')).toBe('aux-off');
  });

  it('leaves every light unchanged in normal mode', () => {
    const entries = [{ light: { visible: true, castShadow: false } }, { light: { visible: true, castShadow: true } }];
    expect(applyHomeBlenderLightProbe(entries, 'normal')).toBe(0);
    expect(entries.map((entry) => entry.light.visible)).toEqual([true, true]);
  });

  it('hides only auxiliary non-shadow lights; never changes intensity or shadow key', () => {
    const lights = [
      { visible: true, castShadow: false, intensity: 7 },
      { visible: true, castShadow: false, intensity: 30 },
      { visible: true, castShadow: true, intensity: 8 },
    ];
    expect(applyHomeBlenderLightProbe(lights.map((light) => ({ light })), 'aux-off')).toBe(2);
    expect(lights.map((light) => [light.visible, light.intensity])).toEqual([
      [false, 7], [false, 30], [true, 8],
    ]);
    expect(applyHomeBlenderLightProbe([], 'aux-off')).toBe(0);
  });
});
