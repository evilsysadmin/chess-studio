import { describe, expect, it } from 'vitest';
import { connectFinishedAmbientVoice, scheduleAmbientFilterSweep } from './ambientVoiceFinish.js';

function node() {
  return {
    outputs: [], gain: { value: 0 }, frequency: { value: 0 }, delayTime: { value: 0 }, pan: { value: 0 },
    connect(target) { this.outputs.push(target); },
    start(time) { this.started = time; },
    stop(time) { this.stopped = time; },
  };
}

describe('finite ambient voice finish', () => {
  it('modulates the finished voice, damps its single reflection and keeps the original envelope intact', () => {
    const nodes = { gains: [], oscillators: [], filters: [], panners: [], delays: [] };
    const ctx = {
      currentTime: 4,
      createGain: () => { const next = node(); nodes.gains.push(next); return next; },
      createOscillator: () => { const next = node(); nodes.oscillators.push(next); return next; },
      createBiquadFilter: () => { const next = node(); nodes.filters.push(next); return next; },
      createStereoPanner: () => { const next = node(); nodes.panners.push(next); return next; },
      createDelay: () => { const next = node(); nodes.delays.push(next); return next; },
    };
    const envelope = node();
    const output = node();
    connectFinishedAmbientVoice(ctx, envelope, output, { pan: 0.4, warmth: 0.8, space: 0.26, delayMs: 310 }, {
      start: 4, duration: 1.2, tremolo: 5,
    });

    const modulation = envelope.outputs[0];
    expect(envelope.outputs).toEqual([modulation]);
    expect(nodes.oscillators).toHaveLength(1);
    expect(nodes.oscillators[0].outputs[0].outputs).toEqual([modulation.gain]);
    expect(nodes.oscillators[0].stopped).toBeCloseTo(5.25);
    expect(modulation.gain.value).toBe(1);
    expect(nodes.panners[0].pan.value).toBe(0.18);
    expect(modulation.outputs).toEqual([nodes.panners[0], nodes.delays[0]]);
    expect(nodes.delays[0].outputs).toEqual([nodes.filters[0]]);
    expect(nodes.filters[0].frequency.value).toBe(1920);
    expect(nodes.filters[0].outputs[0].gain.value).toBe(0.26);
    expect(nodes.filters[0].outputs[0].outputs).toEqual([nodes.panners[0]]);
    expect(nodes.panners[0].outputs).toEqual([output]);
  });

  it('falls back to dry mono playback when optional Web Audio nodes are unavailable', () => {
    const dry = node();
    const output = node();
    connectFinishedAmbientVoice({ currentTime: 0 }, dry, output, { space: 0.2, pan: -0.1 });
    expect(dry.outputs).toEqual([output]);
  });

  it('keeps the filter motion ordered even on very short notes', () => {
    const events = [];
    const frequency = {
      setValueAtTime: (value, time) => events.push({ value, time }),
      exponentialRampToValueAtTime: (value, time) => events.push({ value, time }),
    };
    scheduleAmbientFilterSweep(frequency, 1900, 10, 0.4, 0.12);
    expect(events.map((event) => event.time)).toEqual([10, 10.0456, 10.108]);
    expect(events[1].value).toBe(1900);
    expect(events[2].value).toBeLessThan(events[1].value);
  });
});
