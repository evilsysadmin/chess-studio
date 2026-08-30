import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import MatthiasLayeredArt, {
  matthiasGestureDelay,
  matthiasGestureName,
  matthiasGestureParts,
  matthiasGestureTiming,
  matthiasSceneFamily,
} from './MatthiasLayeredArt.jsx';

describe('MatthiasLayeredArt', () => {
  it('clasifica escenas físicas sin inventar arte nuevo', () => {
    expect(matthiasSceneFamily('time-morning-coffee')).toBe('coffee');
    expect(matthiasSceneFamily('time-lunch-bocata')).toBe('lunch');
    expect(matthiasSceneFamily('dossier')).toBe('reading');
    expect(matthiasSceneFamily('afternoon-ops')).toBe('ops');
    expect(matthiasSceneFamily('late-sleep')).toBe('sleep');
  });

  it('asigna gestos coherentes por escena y mantiene piezas independientes', () => {
    expect(matthiasGestureName({ scene: 'time-lunch-bocata' })).toBe('bite');
    expect(matthiasGestureParts({ scene: 'time-lunch-bocata' })).toEqual(
      expect.arrayContaining(['head', 'eyes', 'left-arm', 'right-arm', 'prop']),
    );
    expect(matthiasGestureName({ scene: 'dossier' })).toBe('read');
    expect(matthiasGestureParts({ scene: 'dossier' })).toEqual(
      expect.arrayContaining(['head', 'eyes', 'right-arm', 'prop']),
    );
    expect(matthiasGestureName({ scene: 'afternoon-ops' })).toBe('inspect');
    expect(matthiasGestureParts({ scene: 'afternoon-ops' })).toEqual(
      expect.arrayContaining(['head', 'eyes', 'right-arm']),
    );
    expect(matthiasGestureName({ scene: 'late-sleep' })).toBe('doze');
    expect(matthiasGestureParts({ scene: 'late-sleep' })).toEqual(
      expect.arrayContaining(['head', 'eyes']),
    );
    expect(matthiasGestureName({ speaking: true, scene: 'dossier' })).toBe('speak');
  });

  it('hace pronto el primer gesto y luego deja respirar al personaje', () => {
    for (let i = 0; i < 20; i += 1) {
      expect(matthiasGestureDelay({ first: true })).toBeGreaterThanOrEqual(550);
      expect(matthiasGestureDelay({ first: true })).toBeLessThanOrEqual(950);
      expect(matthiasGestureDelay({ first: false })).toBeGreaterThanOrEqual(12_000);
      expect(matthiasGestureDelay({ first: false })).toBeLessThanOrEqual(18_000);
    }
  });

  it('escalona mirada, cabeza y brazo en Tomando notas con tiempo para leer el gesto', () => {
    const eyes = matthiasGestureTiming({ gesture: 'inspect', part: 'eyes' });
    const head = matthiasGestureTiming({ gesture: 'inspect', part: 'head' });
    const arm = matthiasGestureTiming({ gesture: 'inspect', part: 'right-arm' });

    expect(eyes.duration).toBeGreaterThanOrEqual(3500);
    expect(head.delay).toBeGreaterThan(eyes.delay);
    expect(arm.delay).toBeGreaterThan(head.delay);
    expect(arm.delay).toBeGreaterThanOrEqual(400);
  });

  it('da más recorrido a lectura y sueño que el antiguo microgesto', () => {
    expect(matthiasGestureTiming({ gesture: 'read', part: 'right-arm' }).duration).toBeGreaterThanOrEqual(3400);
    expect(matthiasGestureTiming({ gesture: 'doze', part: 'head' }).duration).toBeGreaterThanOrEqual(3700);
  });

  it('renderiza el webp canónico como base y no contiene SVG redibujado', () => {
    const html = renderToStaticMarkup(
      <MatthiasLayeredArt avatar="/assets/dossier.webp" scene="dossier" reducedMotion={false} />,
    );

    expect(html).toContain('data-matthias-layered-art="true"');
    expect(html).toContain('data-rig-family="reading"');
    expect(html).toContain('data-matthias-canonical-art="true"');
    expect(html).toContain('src="/assets/dossier.webp"');
    expect(html).toContain('data-matthias-art-part="head"');
    expect(html).toContain('data-matthias-art-part="eyes"');
    expect(html).toContain('data-matthias-art-part="left-arm"');
    expect(html).toContain('data-matthias-art-part="right-arm"');
    expect(html).toContain('data-matthias-art-part="prop"');
    expect(html).toContain('data-gesture-profile="deliberate"');
    expect(html).toContain('data-gesture-count="0"');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('moustache');
  });

  it('marca reduced-motion desde el primer render', () => {
    const html = renderToStaticMarkup(
      <MatthiasLayeredArt avatar="/assets/base.webp" scene="base" reducedMotion />,
    );
    expect(html).toContain('data-gesture-state="reduced"');
  });
});