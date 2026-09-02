import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import MatthiasThreeAvatar, {
  matthiasThreeMotionPhase,
  matthiasThreeMotionProfile,
  matthiasThreeMotionSample,
} from './MatthiasThreeAvatar.jsx';

describe('MatthiasThreeAvatar', () => {
  it('maps Home activities to distinct Three.js motion profiles', () => {
    expect(matthiasThreeMotionProfile({ scene: 'morning-coffee', activity: 'Primer café' })).toBe('sip');
    expect(matthiasThreeMotionProfile({ scene: 'beer-break', activity: 'Cervezota reglamentaria' })).toBe('sip');
    expect(matthiasThreeMotionProfile({ scene: 'lunch-bocata', activity: 'Comida táctica' })).toBe('bite');
    expect(matthiasThreeMotionProfile({ scene: 'strategy-book', activity: 'Estudio matinal' })).toBe('read');
    expect(matthiasThreeMotionProfile({ scene: 'dossier', activity: 'Auditoría táctica' })).toBe('dossier');
    expect(matthiasThreeMotionProfile({ scene: 'afternoon-ops', activity: 'En plena operación' })).toBe('write');
    expect(matthiasThreeMotionProfile({ scene: 'chess-inception', activity: 'Partida nocturna' })).toBe('think');
    expect(matthiasThreeMotionProfile({ scene: 'late-sleep', activity: 'Sobando' })).toBe('sleep');
    expect(matthiasThreeMotionProfile({ speaking: true, scene: 'strategy-book' })).toBe('speak');
  });

  it('desincroniza escenas con una fase estable para no repetir el mismo gesto al entrar', () => {
    const coffeeA = matthiasThreeMotionPhase({ scene: 'morning-coffee', activity: 'Primer café' });
    const coffeeB = matthiasThreeMotionPhase({ scene: 'morning-coffee', activity: 'Primer café' });
    const dossier = matthiasThreeMotionPhase({ scene: 'dossier', activity: 'Auditoría táctica' });

    expect(coffeeA).toBe(coffeeB);
    expect(coffeeA).toBeGreaterThanOrEqual(0);
    expect(coffeeA).toBeLessThan(3.6);
    expect(dossier).not.toBe(coffeeA);
  });

  it('lleva bebida y comida hasta la cara en vez de levantarlas a medias', () => {
    const cup = matthiasThreeMotionSample({ profile: 'sip', x: .4, y: -.34, time: 1.7 });
    const food = matthiasThreeMotionSample({ profile: 'bite', x: 0, y: -.4, time: 1.8 });

    expect(cup.dy).toBeGreaterThan(.27);
    expect(Math.abs(cup.dx)).toBeGreaterThan(.05);
    expect(food.dy).toBeGreaterThan(.32);
    expect(food.dz).toBeGreaterThan(.02);
  });

  it('permite reforzar Home sin cambiar el perfil base de War Room', () => {
    const base = matthiasThreeMotionSample({ profile: 'write', x: .36, y: -.18, time: 1.35, motionIntensity: 1 });
    const home = matthiasThreeMotionSample({ profile: 'write', x: .36, y: -.18, time: 1.35, motionIntensity: 1.2 });

    expect(Math.abs(home.dx)).toBeGreaterThan(Math.abs(base.dx));
    expect(Math.abs(home.dy)).toBeGreaterThan(Math.abs(base.dy));
  });

  it('da intención diferenciada a notas, dossier, lectura, pensamiento, sueño y habla', () => {
    const writeA = matthiasThreeMotionSample({ profile: 'write', x: .36, y: -.18, time: 1.35 });
    const writeB = matthiasThreeMotionSample({ profile: 'write', x: .36, y: -.18, time: 1.47 });
    const dossier = matthiasThreeMotionSample({ profile: 'dossier', x: .4, y: -.34, time: 1.7 });
    const read = matthiasThreeMotionSample({ profile: 'read', x: 0, y: .3, time: 1.5 });
    const think = matthiasThreeMotionSample({ profile: 'think', x: .36, y: -.18, time: 1.8 });
    const sleep = matthiasThreeMotionSample({ profile: 'sleep', x: 0, y: .3, time: 2 });
    const speak = matthiasThreeMotionSample({ profile: 'speak', x: 0, y: .18, time: 1, speaking: true });

    expect(Math.abs(writeA.dx - writeB.dx)).toBeGreaterThan(.01);
    expect(dossier.dy).toBeGreaterThan(.06);
    expect(Math.abs(read.dx)).toBeGreaterThan(.001);
    expect(think.dy).toBeGreaterThan(.12);
    expect(sleep.dy).toBeLessThan(-.02);
    expect(speak.energy).toBeGreaterThan(.4);
  });

  it('renders one canonical fallback plus a Three.js canvas instead of raster body-part layers', () => {
    const html = renderToStaticMarkup(
      <MatthiasThreeAvatar
        avatar="/assets/matthias-scenes/strategy-book.webp"
        scene="strategy-book"
        activity="Estudio matinal"
        motionIntensity={1.12}
      />,
    );

    expect(html).toContain('data-matthias-three-avatar="true"');
    expect(html).toContain('data-three-profile="read"');
    expect(html).toContain('data-three-motion-intensity="1.12"');
    expect(html).toContain('data-three-motion-phase=');
    expect(html).toContain('data-three-visibility="visible"');
    expect(html).toContain('data-three-viewport="visible"');
    expect(html).toContain('<canvas');
    expect(html).toContain('data-matthias-canonical-art="true"');
    expect(html).toContain('data-three-reach="0"');
    expect(html).toContain('strategy-book.webp');
    expect(html).not.toContain('data-matthias-art-part');
    expect(html).not.toContain('data-matthias-layered-art');
  });

  it('marks reduced motion before WebGL mounts so SSR and first paint respect accessibility', () => {
    const html = renderToStaticMarkup(
      <MatthiasThreeAvatar avatar="/base.webp" scene="base" reducedMotion />,
    );
    expect(html).toContain('data-three-motion="reduced"');
  });
});
