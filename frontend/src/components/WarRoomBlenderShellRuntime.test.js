import { describe, expect, it } from 'vitest';
import {
  configureWarRoomBlenderLoader,
  createWarRoomBlenderVariantShell,
  scheduleWarRoomAfterFirstPaint,
  warRoomBlenderPracticalLightProfile,
} from './WarRoomBlenderShellRuntime.js';

describe('War Room shared Blender runtime', () => {
  it('builds thin variant manifests from one shared shell factory', () => {
    expect(() => createWarRoomBlenderVariantShell()).toThrow(/requires id, model URL, root name and finish/i);
    const variant = createWarRoomBlenderVariantShell({
      variant: 'v9',
      runtimeModelUrl: 'https://assets.example.test/v9.glb',
      rootName: 'war-room-v9-shell',
      runtimeFinish: 'test-finish-v1',
    });

    expect(variant.modelUrl({ buildSha: 'abc 123' }))
      .toBe('https://assets.example.test/v9.glb?build=abc%20123');
    expect(Object.isFrozen(variant)).toBe(true);
    expect(typeof variant.install).toBe('function');
  });

  it('registers the bundled Meshopt decoder on the shared GLTF loader', () => {
    let decoder = null;
    const loader = {
      setMeshoptDecoder(value) {
        decoder = value;
        return this;
      },
    };

    expect(configureWarRoomBlenderLoader(loader)).toBe(loader);
    expect(decoder).toBeTruthy();
    expect(decoder.ready).toBeTruthy();
  });

  it('defers expensive shell refinement until after a paint and an idle turn', () => {
    let frame = null;
    let idle = null;
    let refinements = 0;
    const cancelled = [];
    const release = scheduleWarRoomAfterFirstPaint(
      () => { refinements += 1; },
      {
        requestFrame: (callback) => {
          frame = callback;
          return 11;
        },
        cancelFrame: (id) => cancelled.push(['frame', id]),
        requestIdle: (callback) => {
          idle = callback;
          return 22;
        },
        cancelIdle: (id) => cancelled.push(['idle', id]),
        setTimer: () => {
          throw new Error('timer fallback should not be used');
        },
      },
    );

    expect(refinements).toBe(0);
    frame();
    expect(refinements).toBe(0);
    idle();
    expect(refinements).toBe(1);
    release();
    expect(cancelled).toEqual([['frame', 11], ['idle', 22]]);
  });

  it('can cancel deferred shell refinement before the first paint completes', () => {
    let frame = null;
    let refinements = 0;
    const release = scheduleWarRoomAfterFirstPaint(
      () => { refinements += 1; },
      {
        requestFrame: (callback) => {
          frame = callback;
          return 7;
        },
        cancelFrame: () => {},
        requestIdle: () => {
          throw new Error('cancelled frame must not schedule idle work');
        },
      },
    );

    release();
    frame();
    expect(refinements).toBe(0);
  });

  it('keeps authored practicals cinematic and cheaper on coarse pointers', () => {
    const desktop = warRoomBlenderPracticalLightProfile();
    const coarse = warRoomBlenderPracticalLightProfile({ coarsePointer: true });
    expect(desktop.fire.color).toBe(0xff8a38);
    expect(desktop.rightFire.color).toBe(0xff7f30);
    expect(desktop.chandelier.color).toBe(0xffb457);
    expect(desktop.moon.color).toBe(0x7ba6ff);
    expect(desktop.fire.intensity).toBeGreaterThan(coarse.fire.intensity);
    expect(desktop.rightFire.intensity).toBeGreaterThan(coarse.rightFire.intensity);
    expect(desktop.chandelier.intensity).toBeGreaterThan(coarse.chandelier.intensity);
    expect(coarse.chandelier.intensity).toBe(0);
    expect(desktop.moon.intensity).toBeGreaterThan(coarse.moon.intensity);
    expect(desktop.rightFire.distance).toBeLessThan(desktop.fire.distance);
    expect(desktop.fire.distance).toBeLessThan(desktop.moon.distance);
    expect(desktop.fire.intensity).toBe(2.30);
    expect(desktop.fire.distance).toBe(10.8);
    expect(desktop.rightFire.intensity).toBe(1.68);
    expect(desktop.rightFire.distance).toBe(9.2);
    expect(desktop.chandelier.intensity).toBe(0.92);
    expect(desktop.chandelier.distance).toBe(7.8);
    expect(desktop.moon.intensity).toBe(3.42);
    expect(desktop.moon.distance).toBe(15.2);
  });
});
