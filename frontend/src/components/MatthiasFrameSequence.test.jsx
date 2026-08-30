import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import MatthiasFrameSequence, {
  matthiasFramePosition,
  matthiasFrameSequenceConfig,
  matthiasFrameSequenceDelay,
} from './MatthiasFrameSequence.jsx';

describe('MatthiasFrameSequence', () => {
  it('define acciones antropomórficas completas para café y comida', () => {
    const coffee = matthiasFrameSequenceConfig('coffee');
    const lunch = matthiasFrameSequenceConfig('lunch');

    expect(coffee.action).toBe('drink');
    expect(coffee.frames).toEqual([0, 1, 2, 3, 4, 5, 0]);
    expect(coffee.holds[3]).toBeGreaterThanOrEqual(1200);
    expect(lunch.action).toBe('eat');
    expect(lunch.frames).toEqual([0, 1, 2, 3, 4, 5, 0]);
    expect(lunch.holds[4]).toBeGreaterThanOrEqual(1100);
  });

  it('mapea correctamente la cuadrícula 3x2 del sprite', () => {
    expect(matthiasFramePosition(0)).toBe('0% 0%');
    expect(matthiasFramePosition(1)).toBe('50% 0%');
    expect(matthiasFramePosition(2)).toBe('100% 0%');
    expect(matthiasFramePosition(3)).toBe('0% 100%');
    expect(matthiasFramePosition(4)).toBe('50% 100%');
    expect(matthiasFramePosition(5)).toBe('100% 100%');
  });

  it('deja pausas largas entre acciones completas', () => {
    for (let i = 0; i < 20; i += 1) {
      expect(matthiasFrameSequenceDelay({ first: true })).toBeGreaterThanOrEqual(1400);
      expect(matthiasFrameSequenceDelay({ first: true })).toBeLessThanOrEqual(2300);
      expect(matthiasFrameSequenceDelay({ first: false })).toBeGreaterThanOrEqual(10_000);
      expect(matthiasFrameSequenceDelay({ first: false })).toBeLessThanOrEqual(16_000);
    }
  });

  it('en reduced-motion conserva el arte estático antiguo', () => {
    const html = renderToStaticMarkup(
      <MatthiasFrameSequence family="coffee" fallbackAvatar="/old-coffee.webp" reducedMotion />,
    );

    expect(html).toContain('data-matthias-frame-sequence="true"');
    expect(html).toContain('data-sequence-action="drink"');
    expect(html).toContain('data-sequence-state="reduced"');
    expect(html).toContain('src="/old-coffee.webp"');
    expect(html).toContain('data-matthias-canonical-art="true"');
  });

  it('en movimiento usa dos capas de sprite y no el rig de máscaras', () => {
    const html = renderToStaticMarkup(
      <MatthiasFrameSequence family="lunch" fallbackAvatar="/old-lunch.webp" reducedMotion={false} />,
    );

    expect(html).toContain('data-sequence-action="eat"');
    expect(html).toContain('data-frame-layer="0"');
    expect(html).toContain('data-frame-layer="1"');
    expect(html).not.toContain('data-matthias-art-part');
    expect(html).not.toContain('<svg');
  });
});
