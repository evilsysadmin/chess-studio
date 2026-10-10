import { describe, expect, it } from 'vitest';
import spriteManifest from '../assets/chronicles/sprites/sprites.json';
import { buildChroniclesEnemyVisual } from '../chroniclesEnemyVisualRegistry.js';
import {
  chroniclesHasSpriteBillboard,
  chroniclesSpriteFrameIndex,
} from './chroniclesSpriteBillboards.js';

describe('Chronicles 2.5D billboards', () => {
  it('ships sheets for the bone hound and Edda with the frames the runtime asks for', () => {
    expect(spriteManifest['bone-hound'].frames).toEqual(['idle-a', 'idle-b', 'menace', 'hurt']);
    expect(spriteManifest['rookwood-mourner'].frames).toEqual(['idle-a', 'idle-b', 'speak']);
    expect(chroniclesHasSpriteBillboard('bone-hound')).toBe(true);
    expect(chroniclesHasSpriteBillboard('crypt-spider')).toBe(false);
  });

  it('picks hurt over menace over idle, and alternates idle frames over time', () => {
    const frames = spriteManifest['bone-hound'].frames;
    expect(chroniclesSpriteFrameIndex(frames, { hurt: true, menace: true })).toBe(3);
    expect(chroniclesSpriteFrameIndex(frames, { menace: true })).toBe(2);
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
