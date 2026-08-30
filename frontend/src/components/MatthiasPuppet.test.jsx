import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import MatthiasPuppet, {
  matthiasPuppetGestureDelay,
  matthiasPuppetGestureKind,
  matthiasPuppetGesturePlan,
} from './MatthiasPuppet.jsx';

describe('MatthiasPuppet · rig articulado de Home', () => {
  it('renderiza un peón militar articulado, no un busto humanoide ni un bitmap plano', () => {
    const html = renderToStaticMarkup(<MatthiasPuppet scene="coffee" />);

    expect(html).toContain('data-matthias-puppet="true"');
    expect(html).toContain('data-puppet-form="military-pawn"');
    expect(html).toContain('matthias-puppet__pawn-silhouette');
    expect(html).toContain('data-puppet-part="uniform"');
    expect(html).toContain('data-puppet-part="cap"');
    expect(html).toContain('data-puppet-part="body"');
    expect(html).toContain('data-puppet-part="head"');
    expect(html).toContain('data-puppet-part="eyes"');
    expect(html).toContain('data-puppet-part="lids"');
    expect(html).toContain('data-puppet-part="brows"');
    expect(html).toContain('data-puppet-part="mouth"');
    expect(html).toContain('data-puppet-part="moustache"');
    expect(html).toContain('data-puppet-part="left-arm"');
    expect(html).toContain('data-puppet-part="action-arm"');
    expect(html).toContain('data-puppet-part="prop"');
    expect(html).toContain('data-prop="mug"');
    expect(html).not.toContain('<img');
  });

  it('elige un gesto humano por contexto sin perder la identidad de peón', () => {
    expect(matthiasPuppetGestureKind({ speaking: true, scene: 'base' })).toBe('attend');
    expect(matthiasPuppetGestureKind({ scene: 'morning-coffee' })).toBe('sip');
    expect(matthiasPuppetGestureKind({ scene: 'lunch-bocata' })).toBe('bite');
    expect(matthiasPuppetGestureKind({ scene: 'strategy-book' })).toBe('read');
    expect(matthiasPuppetGestureKind({ scene: 'late-sleep' })).toBe('doze');
    expect(matthiasPuppetGestureKind({ scene: 'afternoon-ops' })).toBe('inspect');
    expect(matthiasPuppetGestureKind({ scene: 'base' })).toBe('acknowledge');
  });

  it('hace un primer gesto pronto y después mantiene pausas largas', () => {
    expect(matthiasPuppetGestureDelay({ speaking: true, random: () => 1 })).toBe(120);
    expect(matthiasPuppetGestureDelay({ initial: true, random: () => 0 })).toBe(2200);
    expect(matthiasPuppetGestureDelay({ initial: true, random: () => 1 })).toBe(4000);
    expect(matthiasPuppetGestureDelay({ random: () => 0 })).toBe(8500);
    expect(matthiasPuppetGestureDelay({ random: () => 1 })).toBe(15500);
  });

  it('cada gesto mueve sólo las piezas necesarias y la cara sí está articulada', () => {
    const sip = matthiasPuppetGesturePlan('sip');
    expect(sip.head).toBeTruthy();
    expect(sip.actionArm).toBeTruthy();
    expect(sip.prop).toEqual(sip.actionArm);
    expect(sip.eyes).toBeTruthy();
    expect(sip.lids).toBeTruthy();
    expect(sip.duration).toBeLessThan(2000);

    const bite = matthiasPuppetGesturePlan('bite');
    expect(bite.actionArm).toBeTruthy();
    expect(bite.prop).toEqual(bite.actionArm);
    expect(bite.mouth).toBeTruthy();

    const read = matthiasPuppetGesturePlan('read');
    expect(read.head).toBeTruthy();
    expect(read.eyes).toBeTruthy();
    expect(read.lids).toBeTruthy();
    expect(read.prop).toBeTruthy();

    const doze = matthiasPuppetGesturePlan('doze');
    expect(doze.head).toBeTruthy();
    expect(doze.lids).toBeTruthy();
    expect(doze.brows).toBeTruthy();
    expect(doze.actionArm).toBeUndefined();

    const attend = matthiasPuppetGesturePlan('attend');
    expect(attend.head).toBeTruthy();
    expect(attend.eyes).toBeTruthy();
    expect(attend.brows).toBeTruthy();
    expect(attend.mouth).toBeTruthy();
    expect(attend.moustache).toBeTruthy();
  });
});
