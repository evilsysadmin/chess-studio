import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import MatthiasThreeAvatar, {
  matthiasThreeMotionPhase,
  matthiasThreeMotionProfile,
  matthiasThreeMotionSample,
  matthiasThreeRenderProfile,
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

  it('reduce vértices y cadence en superficies compactas sin degradar desktop', () => {
    const compact = matthiasThreeRenderProfile({ coarsePointer: true, width: 50, height: 50 });
    const coarse = matthiasThreeRenderProfile({ coarsePointer: true, width: 180, height: 180 });
    const desktop = matthiasThreeRenderProfile({ coarsePointer: false, width: 320, height: 420 });

    expect(compact).toEqual({
      tier: 'compact',
      widthSegments: 14,
      heightSegments: 16,
      maxFps: 30,
      pixelRatioCap: 1,
    });
    expect(coarse.widthSegments * coarse.heightSegments).toBeLessThan(desktop.widthSegments * desktop.heightSegments);
    expect(coarse.maxFps).toBe(45);
    expect(desktop).toEqual({
      tier: 'full',
      widthSegments: 28,
      heightSegments: 32,
      maxFps: 60,
      pixelRatioCap: 1.5,
    });
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

  it('mantiene rígido el núcleo facial cuando juega al ajedrez sin apagar el gesto corporal', () => {
    const face = matthiasThreeMotionSample({ profile: 'think', x: 0, y: .31, time: 1.8, motionIntensity: 1.2 });
    const brow = matthiasThreeMotionSample({ profile: 'think', x: .08, y: .34, time: 1.8, motionIntensity: 1.2 });
    const arm = matthiasThreeMotionSample({ profile: 'think', x: .36, y: -.18, time: 1.8, motionIntensity: 1.2 });

    expect(Math.abs(face.dx)).toBeLessThan(.0001);
    expect(Math.abs(face.dy)).toBeLessThan(.0001);
    expect(Math.abs(face.dz)).toBeLessThan(.0001);
    expect(Math.abs(brow.dy)).toBeLessThan(.005);
    expect(arm.dy).toBeGreaterThan(.14);
    expect(arm.energy).toBeGreaterThan(.8);
  });

  it('añade expresión facial quirúrgica después de proteger el núcleo de ajedrez', () => {
    const center = matthiasThreeMotionSample({
      profile: 'think',
      x: 0,
      y: .31,
      time: 1.8,
      motionIntensity: 1.2,
      facialExpression: 'grumble-hot',
    });
    const neutralBrow = matthiasThreeMotionSample({
      profile: 'think',
      x: .105,
      y: .475,
      time: 1.8,
      motionIntensity: 1.2,
    });
    const glareBrow = matthiasThreeMotionSample({
      profile: 'think',
      x: .105,
      y: .475,
      time: 1.8,
      motionIntensity: 1.2,
      facialExpression: 'glare',
    });

    expect(Math.abs(center.dx)).toBeLessThan(.003);
    expect(Math.abs(center.dy)).toBeLessThan(.003);
    expect(glareBrow.dy).toBeLessThan(neutralBrow.dy - .002);
  });

  it('renders one canonical fallback plus a Three.js canvas instead of raster body-part layers', () => {
    const html = renderToStaticMarkup(
      <MatthiasThreeAvatar
        avatar="/assets/matthias-scenes/strategy-book.webp"
        scene="strategy-book"
        activity="Estudio matinal"
        motionIntensity={1.12}
        facialExpression="smirk"
        facialGesture="head-right"
      />,
    );

    expect(html).toContain('data-matthias-three-avatar="true"');
    expect(html).toContain('data-three-profile="read"');
    expect(html).toContain('data-three-motion-intensity="1.12"');
    expect(html).toContain('data-three-motion-phase=');
    expect(html).toContain('data-three-face-rig="face-v1"');
    expect(html).toContain('data-three-face-expression="smirk"');
    expect(html).toContain('data-three-face-gesture="head-right"');
    expect(html).toContain('data-three-visibility="visible"');
    expect(html).toContain('data-three-viewport="visible"');
    expect(html).toContain('<canvas');
    expect(html).toContain('data-matthias-canonical-art="true"');
    expect(html).toContain('data-three-reach="0"');
    expect(html).toContain('strategy-book.webp');
    expect(html).not.toContain('data-matthias-art-part');
    expect(html).not.toContain('data-matthias-layered-art');
  });

  it('mantiene el rig legacy fuera de superficies que no piden microexpresión explícita', () => {
    const html = renderToStaticMarkup(
      <MatthiasThreeAvatar avatar="/base.webp" scene="base" />,
    );
    expect(html).toContain('data-three-face-rig="legacy"');
    expect(html).toContain('data-three-face-expression="none"');
  });

  it('marks reduced motion before WebGL mounts so SSR and first paint respect accessibility', () => {
    const html = renderToStaticMarkup(
      <MatthiasThreeAvatar avatar="/base.webp" scene="base" reducedMotion />,
    );
    expect(html).toContain('data-three-motion="reduced"');
  });
});
