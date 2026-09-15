import { describe, expect, it, vi } from 'vitest';
import {
  ORGANIC_WIND_TREMOLO_RATES,
  connectOrganicWindBreath,
  organicWindFinishSettings,
} from './ambientOrganicWindFinish.js';

function node() {
  return {
    outputs: [],
    gain: { value:0 },
    frequency: { value:0 },
    Q: { value:0 },
    connect(target) { this.outputs.push(target); },
    start(time) { this.started = time; },
    stop(time) { this.stopped = time; },
  };
}

describe('organic wind finish', () => {
  it('recognises only the authored acoustic-wind tremolo identities', () => {
    expect(ORGANIC_WIND_TREMOLO_RATES).toEqual([3.8, 4, 4.4, 5]);
    expect(organicWindFinishSettings({}, 4)).toBeNull();
    expect(organicWindFinishSettings({ organicWind:true }, 3.1)).toBeNull(); // Rhodes
    expect(organicWindFinishSettings({ organicWind:true }, 4.6)).toBeNull(); // warm vibes
    expect(organicWindFinishSettings({ organicWind:true }, 5.1)).toBeNull(); // strings

    expect(organicWindFinishSettings({ organicWind:true }, 4)?.name).toBe('clarinet');
    expect(organicWindFinishSettings({ organicWind:true }, 5)?.name).toBe('ney');
    expect(organicWindFinishSettings({ organicWind:true }, 4.4)?.name).toBe('muted-horn');
    expect(organicWindFinishSettings({ organicWind:true }, 3.8)?.name).toBe('cedar-flute');
  });

  it('keeps ney airier than clarinet and clamps authored breath scaling', () => {
    const clarinet = organicWindFinishSettings({ organicWind:true }, 4);
    const ney = organicWindFinishSettings({ organicWind:true }, 5);
    const boosted = organicWindFinishSettings({ organicWind:true, organicWindBreathScale:99 }, 5);
    expect(ney.breathMix).toBeGreaterThan(clarinet.breathMix);
    expect(ney.breathSeconds).toBeGreaterThan(clarinet.breathSeconds);
    expect(boosted.breathMix).toBeCloseTo(ney.breathMix * 1.25);
  });

  it('injects one finite filtered breath transient into the existing envelope', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.75);
    const nodes = { sources:[], filters:[], gains:[] };
    const ctx = {
      currentTime:2,
      sampleRate:10000,
      createBuffer: (_channels, size) => {
        const data = new Float32Array(size);
        return { getChannelData: () => data, data };
      },
      createBufferSource: () => { const next = node(); nodes.sources.push(next); return next; },
      createBiquadFilter: () => { const next = node(); nodes.filters.push(next); return next; },
      createGain: () => { const next = node(); nodes.gains.push(next); return next; },
    };
    const dry = node();
    const settings = organicWindFinishSettings({ organicWind:true }, 4);
    const result = connectOrganicWindBreath(ctx, dry, settings, { start:2, duration:1 });

    expect(result).not.toBeNull();
    expect(nodes.sources).toHaveLength(1);
    expect(nodes.filters[0].type).toBe('bandpass');
    expect(nodes.filters[0].frequency.value).toBe(settings.breathHz);
    expect(nodes.gains[0].gain.value).toBeCloseTo(settings.breathMix);
    expect(nodes.gains[0].outputs).toEqual([dry]);
    expect(nodes.sources[0].started).toBe(2);
    expect(nodes.sources[0].stopped).toBeCloseTo(2 + settings.breathSeconds + 0.01);
  });
});
