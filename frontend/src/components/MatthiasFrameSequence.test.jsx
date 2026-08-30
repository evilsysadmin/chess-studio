import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import MatthiasFrameSequence, {
  matthiasFrameSequenceConfig,
  matthiasFrameSequenceDelay,
} from './MatthiasFrameSequence.jsx';

describe('MatthiasFrameSequence', () => {
  it('define acciones antropomórficas completas para café y comida', () => {
    const coffee = matthiasFrameSequenceConfig('coffee');
    const lunch = matthiasFrameSequenceConfig('lunch');

    expect(coffee.action).toBe('drink');
    expect(coffee.poses).toHaveLength(3);
    expect(coffee.frames).toEqual([0, 1, 2, 2, 1, 0]);
    expect(coffee.holds[2]).toBeGreaterThanOrEqual(1400);

    expect(lunch.action).toBe('eat');
    expect(lunch.poses).toHaveLength(4);
    expect(lunch.frames).toEqual([0, 1, 2, 3, 2, 1, 0]);
    expect(lunch.holds[3]).toBeGreaterThanOrEqual(1400);
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

  it('en movimiento mantiene el arte antiguo como fallback bajo dos imágenes de pose', () => {
    const html = renderToStaticMarkup(
      <MatthiasFrameSequence family="lunch" fallbackAvatar="/old-lunch.webp" reducedMotion={false} />,
    );

    expect(html).toContain('data-sequence-action="eat"');
    expect(html).toContain('data-frame-layer="0"');
    expect(html).toContain('data-frame-layer="1"');
    expect(html).toContain('data-frame-pose="0"');
    expect(html).toContain('src="/old-lunch.webp"');
    expect(html).toContain('data-matthias-canonical-art="true"');
    expect(html).not.toContain('data-sprite-src=');
    expect(html).not.toContain('background-position');
    expect(html).not.toContain('data-matthias-art-part');
    expect(html).not.toContain('<svg');
  });
});
