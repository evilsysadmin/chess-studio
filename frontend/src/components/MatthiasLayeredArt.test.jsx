import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import MatthiasLayeredArt, {
  matthiasGestureDelay,
  matthiasGestureName,
  matthiasGestureParts,
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
      expect.arrayContaining(['head', 'eyes', 'right-arm', 'prop']),
    );
    expect(matthiasGestureName({ speaking: true, scene: 'dossier' })).toBe('speak');
  });

  it('dispara el primer gesto pronto y mantiene pausas humanas entre gestos', () => {
    for (let i = 0; i < 20; i += 1) {
      expect(matthiasGestureDelay({ first: true })).toBeGreaterThanOrEqual(450);
      expect(matthiasGestureDelay({ first: true })).toBeLessThanOrEqual(900);
      expect(matthiasGestureDelay({ first: false })).toBeGreaterThanOrEqual(4200);
      expect(matthiasGestureDelay({ first: false })).toBeLessThanOrEqual(7000);
    }
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
