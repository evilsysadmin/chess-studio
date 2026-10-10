import { describe, expect, it } from 'vitest';
import spriteManifest from '../assets/chronicles/sprites/sprites.json';
import { buildChroniclesEnemyVisual } from '../chroniclesEnemyVisualRegistry.js';
import {
  chroniclesHasSpriteBillboard,
  chroniclesSpriteFrameIndex,
} from './chroniclesSpriteBillboards.js';

describe('Chronicles 2.5D billboards', () => {
  it('ships sheets for the bone hound and Edda with the frames the runtime asks for', () => {
    expect(spriteManifest['bone-hound'].frames).toEqual(['idle-a', 'idle-b', 'menace', 'attack', 'hurt', 'dead']);
    expect(spriteManifest['rookwood-mourner'].frames).toEqual(['idle-a', 'idle-b', 'speak', 'grateful']);
    expect(chroniclesHasSpriteBillboard('bone-hound')).toBe(true);
    expect(chroniclesHasSpriteBillboard('crypt-spider')).toBe(false);
  });

  it('orders cues dead > hurt > attack > menace, and alternates idle frames over time', () => {
    const frames = spriteManifest['bone-hound'].frames;
    expect(chroniclesSpriteFrameIndex(frames, { dead: true, hurt: true })).toBe(5);
    expect(chroniclesSpriteFrameIndex(frames, { hurt: true, attacking: true, menace: true })).toBe(4);
    expect(chroniclesSpriteFrameIndex(frames, { attacking: true, menace: true })).toBe(3);
    expect(chroniclesSpriteFrameIndex(frames, { menace: true })).toBe(2);
    const edda = spriteManifest['rookwood-mourner'].frames;
    expect(chroniclesSpriteFrameIndex(edda, { grateful: true, speaking: true })).toBe(3);
    expect(chroniclesSpriteFrameIndex(edda, { speaking: true })).toBe(2);
    // Cues a sheet lacks fall back to idle.
    expect(chroniclesSpriteFrameIndex(edda, { menace: true, time: 0 })).toBe(0);
    expect(chroniclesSpriteFrameIndex(frames, { time: 0, idleFps: 2 })).toBe(0);
    expect(chroniclesSpriteFrameIndex(frames, { time: 0.6, idleFps: 2 })).toBe(1);
  });

  it('uses a billboard only when first-person asks and keeps 3D models as fallback', () => {
    const billboard = buildChroniclesEnemyVisual('bone-hound', { sprites: true });
    expect(billboard.model.userData.chroniclesBillboard?.visualType).toBe('bone-hound');
    expect(typeof billboard.model.userData.updateChroniclesSprite).toBe('function');
    expect(buildChroniclesEnemyVisual('bone-hound').model.userData.chroniclesBillboard).toBeUndefined();
    expect(buildChroniclesEnemyVisual('crypt-spider', { sprites: true }).model.userData.chroniclesBillboard).toBeUndefined();
  });
});
