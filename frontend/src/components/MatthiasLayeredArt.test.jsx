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

  it('mantiene café y cena en sus miembros correctos', () => {
    expect(matthiasGestureName({ scene: 'time-lunch-bocata' })).toBe('bite');
    expect(matthiasGestureParts({ scene: 'time-lunch-bocata' })).toEqual(['left-arm', 'right-arm', 'prop']);
    expect(matthiasGestureParts({ scene: 'time-lunch-bocata' })).not.toEqual(
      expect.arrayContaining(['head', 'eyes']),
    );

    expect(matthiasGestureName({ scene: 'time-night-coffee' })).toBe('sip-night');
    expect(matthiasGestureParts({ scene: 'time-night-coffee' })).toEqual(['right-arm', 'prop']);
    expect(matthiasGestureName({ scene: 'time-beer-break' })).toBe('sip-night');
    expect(matthiasGestureParts({ scene: 'time-beer-break' })).not.toContain('left-arm');

    expect(matthiasGestureName({ scene: 'time-morning-coffee' })).toBe('sip');
    expect(matthiasGestureParts({ scene: 'time-morning-coffee' })).toEqual(
      expect.arrayContaining(['left-arm', 'prop']),
    );
  });

  it('elige un gesto distinto según la acción real aunque comparta el mismo render', () => {
    expect(matthiasGestureName({ scene: 'time-dossier', activity: 'Revisión de expedientes' })).toBe('read-dossier');
    expect(matthiasGestureParts({ scene: 'time-dossier', activity: 'Revisión de expedientes' })).toEqual(
      ['eyes', 'right-arm', 'prop'],
    );

    expect(matthiasGestureName({ scene: 'time-dossier', activity: 'Auditoría táctica' })).toBe('audit-dossier');
    expect(matthiasGestureParts({ scene: 'time-dossier', activity: 'Auditoría táctica' })).toEqual(
      ['eyes', 'right-arm', 'prop'],
    );

    expect(matthiasGestureName({ scene: 'time-afternoon-ops', activity: 'En plena operación' })).toBe('write-notes');
    expect(matthiasGestureParts({ scene: 'time-afternoon-ops', activity: 'En plena operación' })).toEqual(
      ['eyes', 'right-arm'],
    );

    expect(matthiasGestureName({ scene: 'time-chess-inception', activity: 'Partida privada' })).toBe('board-move');
    expect(matthiasGestureParts({ scene: 'time-chess-inception', activity: 'Partida privada' })).toEqual(
      ['eyes', 'right-arm'],
    );

    expect(matthiasGestureName({ scene: 'strategy-book', activity: 'Leyendo estrategia' })).toBe('read-book');
    expect(matthiasGestureParts({ scene: 'strategy-book', activity: 'Leyendo estrategia' })).toEqual(
      ['eyes', 'right-arm'],
    );
  });

  it('deja la cabeza quieta en lectura, auditoría, notas y partida', () => {
    for (const input of [
      { scene: 'time-dossier', activity: 'Revisión de expedientes' },
      { scene: 'time-dossier', activity: 'Auditoría táctica' },
      { scene: 'time-afternoon-ops', activity: 'En plena operación' },
      { scene: 'time-chess-inception', activity: 'Partida privada' },
      { scene: 'strategy-book', activity: 'Leyendo estrategia' },
    ]) {
      expect(matthiasGestureParts(input)).not.toContain('head');
    }
  });

  it('usa idle como microgesto de ojos, no como balanceo del cráneo', () => {
    expect(matthiasGestureName({ scene: 'base', activity: 'Vigilando el desastre' })).toBe('idle');
    expect(matthiasGestureParts({ scene: 'base', activity: 'Vigilando el desastre' })).toEqual(['eyes']);
  });

  it('hace pronto el primer gesto y luego deja respirar al personaje', () => {
    for (let i = 0; i < 20; i += 1) {
      expect(matthiasGestureDelay({ first: true })).toBeGreaterThanOrEqual(550);
      expect(matthiasGestureDelay({ first: true })).toBeLessThanOrEqual(950);
      expect(matthiasGestureDelay({ first: false })).toBeGreaterThanOrEqual(12_000);
      expect(matthiasGestureDelay({ first: false })).toBeLessThanOrEqual(18_000);
    }
  });

  it('da tiempo suficiente para leer escritura, expediente y movimientos de tablero', () => {
    expect(matthiasGestureTiming({ gesture: 'write-notes', part: 'right-arm' }).duration).toBeGreaterThanOrEqual(3200);
    expect(matthiasGestureTiming({ gesture: 'read-dossier', part: 'right-arm' }).duration).toBeGreaterThanOrEqual(3400);
    expect(matthiasGestureTiming({ gesture: 'audit-dossier', part: 'prop' }).delay).toBeGreaterThan(0);
    expect(matthiasGestureTiming({ gesture: 'board-move', part: 'right-arm' }).duration).toBeGreaterThanOrEqual(3100);
  });

  it('da recorrido claro al bocata y al café nocturno sin tocar partes incorrectas', () => {
    expect(matthiasGestureTiming({ gesture: 'bite', part: 'prop' }).duration).toBeGreaterThanOrEqual(2700);
    expect(matthiasGestureTiming({ gesture: 'sip-night', part: 'right-arm' }).duration).toBeGreaterThanOrEqual(2500);
    expect(matthiasGestureTiming({ gesture: 'sip-night', part: 'prop' }).delay).toBeGreaterThan(0);
  });

  it('mantiene el sueño como gesto deliberado de cabeza y ojos', () => {
    expect(matthiasGestureName({ scene: 'late-sleep' })).toBe('doze');
    expect(matthiasGestureParts({ scene: 'late-sleep' })).toEqual(
      expect.arrayContaining(['head', 'eyes']),
    );
    expect(matthiasGestureTiming({ gesture: 'doze', part: 'head' }).duration).toBeGreaterThanOrEqual(3700);
  });

  it('renderiza el webp canónico como base y expone la actividad que eligió el gesto', () => {
    const html = renderToStaticMarkup(
      <MatthiasLayeredArt
        avatar="/assets/dossier.webp"
        scene="time-dossier"
        activity="Auditoría táctica"
        reducedMotion={false}
      />,
    );

    expect(html).toContain('data-matthias-layered-art="true"');
    expect(html).toContain('data-rig-family="reading"');
    expect(html).toContain('data-rig-activity="Auditoría táctica"');
    expect(html).toContain('data-gesture="audit-dossier"');
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

  it('el habla sigue teniendo prioridad sobre la actividad', () => {
    expect(matthiasGestureName({ speaking: true, scene: 'time-dossier', activity: 'Auditoría táctica' })).toBe('speak');
  });

  it('marca reduced-motion desde el primer render', () => {
    const html = renderToStaticMarkup(
      <MatthiasLayeredArt avatar="/assets/base.webp" scene="base" reducedMotion />,
    );
    expect(html).toContain('data-gesture-state="reduced"');
  });
});