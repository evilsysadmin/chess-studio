import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createChroniclesStoneSurfaceTexture } from './chroniclesStoneSurfaceTexture.js';

describe('Chronicles procedural stone surface texture', () => {
  it('builds a deterministic desktop stone texture without external assets', () => {
    const first = createChroniclesStoneSurfaceTexture({ seed: 19 });
    const second = createChroniclesStoneSurfaceTexture({ seed: 19 });

    expect(first).toBeInstanceOf(THREE.DataTexture);
    expect(first.image.width).toBe(96);
    expect(first.image.height).toBe(96);
    expect(first.wrapS).toBe(THREE.RepeatWrapping);
    expect(first.wrapT).toBe(THREE.RepeatWrapping);
    expect(Array.from(first.image.data.slice(0, 64))).toEqual(Array.from(second.image.data.slice(0, 64)));

    first.dispose();
    second.dispose();
  });

  it('uses a lighter mobile texture budget and visibly different wet variation', () => {
    const dry = createChroniclesStoneSurfaceTexture({ coarsePointer: true, seed: 7, wet: false });
    const wet = createChroniclesStoneSurfaceTexture({ coarsePointer: true, seed: 7, wet: true });

    expect(dry.image.width).toBe(48);
    expect(dry.image.height).toBe(48);
    expect(wet.image.width).toBe(48);
    expect(Array.from(dry.image.data.slice(0, 128))).not.toEqual(Array.from(wet.image.data.slice(0, 128)));
    expect(wet.repeat.x).toBeLessThan(dry.repeat.x);

    dry.dispose();
    wet.dispose();
  });
});
