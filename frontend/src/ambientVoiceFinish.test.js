import { describe, expect, it } from 'vitest';
import { connectFinishedAmbientVoice, scheduleAmbientFilterSweep } from './ambientVoiceFinish.js';

function audioParam(initial = 0) {
  return {
    value: initial,
    events: [],
    setValueAtTime(value, time) { this.value = value; this.events.push({ type:'set', value, time }); },
    linearRampToValueAtTime(value, time) { this.value = value; this.events.push({ type:'linear', value, time }); },
  };
}

function node() {
  return {
    outputs: [], gain: audioParam(0), frequency: audioParam(0), Q: { value:0 }, delayTime: { value: 0 }, pan: { value: 0 },
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
    expect(nodes.gains[1].gain.events).toEqual([
      { type:'set', value:0.004, time:4 },
      { type:'linear', value:0.09, time:4.24 },
    ]);
    expect(nodes.panners[0].pan.value).toBe(0.18);
    expect(modulation.outputs).toEqual([nodes.panners[0], nodes.delays[0]]);
    expect(nodes.delays[0].outputs).toEqual([nodes.filters[0]]);
    expect(nodes.filters[0].frequency.value).toBe(1920);
    expect(nodes.filters[0].outputs[0].gain.value).toBe(0.26);
    expect(nodes.filters[0].outputs[0].outputs).toEqual([nodes.panners[0]]);
    expect(nodes.panners[0].outputs).toEqual([output]);
  });

  it('keeps tremolo almost absent on short notes and lets long notes bloom', () => {
    const render = (duration) => {
      const gains = [];
      const oscillators = [];
      const ctx = {
        currentTime: 2,
        createGain: () => { const next = node(); gains.push(next); return next; },
        createOscillator: () => { const next = node(); oscillators.push(next); return next; },
      };
      connectFinishedAmbientVoice(ctx, node(), node(), {}, { start:2, duration, tremolo:5 });
      return gains[1].gain.events;
    };

    const short = render(0.18);
    const long = render(1.2);
    expect(short[0]).toEqual({ type:'set', value:0.004, time:2 });
    expect(short[1].type).toBe('linear');
    expect(short[1].value).toBeLessThan(0.02);
    expect(long[1].value).toBeCloseTo(0.09);
    expect(long[1].value).toBeGreaterThan(short[1].value * 4);
  });

  it('adds finite breath/body/edge paths and blooms reed tremolo after the attack', () => {
    const nodes = { gains: [], oscillators: [], filters: [], sources: [] };
    const ctx = {
      currentTime:1,
      sampleRate:10000,
      createGain: () => { const next = node(); nodes.gains.push(next); return next; },
      createOscillator: () => { const next = node(); nodes.oscillators.push(next); return next; },
      createBiquadFilter: () => { const next = node(); nodes.filters.push(next); return next; },
      createBuffer: (_channels, size) => ({ getChannelData: () => new Float32Array(size) }),
      createBufferSource: () => { const next = node(); nodes.sources.push(next); return next; },
    };
    const envelope = node();
    const output = node();
    connectFinishedAmbientVoice(ctx, envelope, output, { finish:{ organicWind:true } }, {
      start:1, duration:1, tremolo:4,
    });

    expect(nodes.sources).toHaveLength(1);
    expect(nodes.sources[0].started).toBe(1);
    expect(nodes.sources[0].stopped).toBeLessThan(1.25);
    expect(nodes.filters.map((filter) => filter.type)).toEqual(['bandpass', 'peaking', 'highshelf']);
    expect(nodes.filters[1].frequency.value).toBe(760);
    expect(nodes.filters[2].frequency.value).toBe(1180);
    expect(nodes.filters[2].gain.value).toBe(-3.2);
    // breath mix, tremolo modulation, tremolo depth
    expect(nodes.gains).toHaveLength(3);
    expect(nodes.gains[2].gain.events).toEqual([
      { type:'set', value:0.008, time:1 },
      { type:'linear', value:0.052, time:1.22 },
    ]);
    expect(nodes.oscillators).toHaveLength(1);
    expect(nodes.oscillators[0].stopped).toBeCloseTo(2.05);
    expect(envelope.outputs).toEqual([nodes.filters[1]]);
    expect(nodes.filters[1].outputs).toEqual([nodes.filters[2]]);
    expect(nodes.filters[2].outputs).toEqual([nodes.gains[1]]);
    expect(nodes.gains[1].outputs).toEqual([output]);
  });

  it('falls back to dry mono playback when optional Web Audio nodes are unavailable', () => {
    const dry = node();
    const output = node();
    connectFinishedAmbientVoice({ currentTime: 0 }, dry, output, { space: 0.2, pan: -0.1 });
    expect(dry.outputs).toEqual([output]);
  });

  it('uses the authored texture to narrow tape rooms and deepen water reflections', () => {
    const nodes = { gains: [], filters: [], panners: [], delays: [] };
    const ctx = {
      currentTime: 0,
      createGain: () => { const next = node(); nodes.gains.push(next); return next; },
      createBiquadFilter: () => { const next = node(); nodes.filters.push(next); return next; },
      createStereoPanner: () => { const next = node(); nodes.panners.push(next); return next; },
      createDelay: () => { const next = node(); nodes.delays.push(next); return next; },
    };
    connectFinishedAmbientVoice(ctx, node(), node(), {
      pan: 0.12,
      warmth: 0.9,
      space: 0.2,
      delayMs: 250,
      finish: { stereoWidth: 0.75, reflectionScale: 1.2 },
    });
    expect(nodes.panners[0].pan.value).toBeCloseTo(0.09);
    expect(nodes.filters[0].outputs[0].gain.value).toBeCloseTo(0.24);
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
