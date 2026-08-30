import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import MatthiasPuppet, {
  matthiasPuppetGestureDelay,
  matthiasPuppetGestureKind,
  matthiasPuppetGesturePlan,
} from './MatthiasPuppet.jsx';

describe('MatthiasPuppet · rig articulado de Home', () => {
  it('renderiza piezas independientes en lugar de un bitmap plano', () => {
    const html = renderToStaticMarkup(<MatthiasPuppet scene="coffee" />);

    expect(html).toContain('data-matthias-puppet="true"');
    expect(html).toContain('data-puppet-part="body"');
    expect(html).toContain('data-puppet-part="head"');
    expect(html).toContain('data-puppet-part="eyes"');
    expect(html).toContain('data-puppet-part="brows"');
    expect(html).toContain('data-puppet-part="left-arm"');
    expect(html).toContain('data-puppet-part="action-arm"');
    expect(html).toContain('data-puppet-part="prop"');
    expect(html).toContain('data-prop="mug"');
    expect(html).not.toContain('<img');
  });

  it('elige un gesto humano por contexto', () => {
    expect(matthiasPuppetGestureKind({ speaking: true, scene: 'base' })).toBe('attend');
    expect(matthiasPuppetGestureKind({ scene: 'morning-coffee' })).toBe('sip');
    expect(matthiasPuppetGestureKind({ scene: 'lunch-bocata' })).toBe('bite');
    expect(matthiasPuppetGestureKind({ scene: 'strategy-book' })).toBe('read');
    expect(matthiasPuppetGestureKind({ scene: 'late-sleep' })).toBe('doze');
    expect(matthiasPuppetGestureKind({ scene: 'afternoon-ops' })).toBe('inspect');
    expect(matthiasPuppetGestureKind({ scene: 'base' })).toBe('acknowledge');
  });

  it('mantiene pausas largas entre gestos ambientales y atiende rápido al hablar', () => {
    expect(matthiasPuppetGestureDelay({ speaking: true, random: () => 1 })).toBe(120);
    expect(matthiasPuppetGestureDelay({ random: () => 0 })).toBe(8500);
    expect(matthiasPuppetGestureDelay({ random: () => 1 })).toBe(15500);
  });

  it('cada gesto mueve sólo las piezas necesarias y nunca es un loop', () => {
    const sip = matthiasPuppetGesturePlan('sip');
    expect(sip.head).toBeTruthy();
    expect(sip.actionArm).toBeTruthy();
    expect(sip.eyes).toBeTruthy();
    expect(sip.duration).toBeLessThan(2000);

    const read = matthiasPuppetGesturePlan('read');
    expect(read.head).toBeTruthy();
    expect(read.eyes).toBeTruthy();
    expect(read.prop).toBeTruthy();

    const doze = matthiasPuppetGesturePlan('doze');
    expect(doze.head).toBeTruthy();
    expect(doze.brows).toBeTruthy();
    expect(doze.actionArm).toBeUndefined();
  });
});
