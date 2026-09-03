import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import MatthiasHomePresenceAvatar, {
  matthiasHomeMotionPhase,
  matthiasHomeMotionProfile,
  matthiasHomeRigidPoseSample,
} from './MatthiasHomePresenceAvatar.jsx';
import { MATTHIAS_HOME_STATES } from './matthiasHomePresenceStateMachine.js';

describe('MatthiasHomePresenceAvatar', () => {
  it('mantiene los perfiles horarios existentes sin reutilizar el deformador legacy', () => {
    expect(matthiasHomeMotionProfile({ scene: 'morning-coffee', activity: 'Café de campaña' })).toBe('sip');
    expect(matthiasHomeMotionProfile({ scene: 'lunch-bocata', activity: 'Repostando' })).toBe('bite');
    expect(matthiasHomeMotionProfile({ scene: 'afternoon-ops', activity: 'Tomando notas' })).toBe('write');
    expect(matthiasHomeMotionProfile({ scene: 'dossier', activity: 'Revisando expediente' })).toBe('dossier');
    expect(matthiasHomeMotionProfile({ scene: 'strategy-book', activity: 'Leyendo estrategia' })).toBe('read');
    expect(matthiasHomeMotionProfile({ scene: 'chess-inception', activity: 'Partida privada' })).toBe('think');
    expect(matthiasHomeMotionProfile({ scene: 'late-sleep', activity: 'Cabeceando' })).toBe('sleep');
    expect(matthiasHomeMotionProfile({ speaking: true })).toBe('speak');
  });

  it('desincroniza escenas de forma estable', () => {
    const first = matthiasHomeMotionPhase({ scene: 'strategy-book', activity: 'Leyendo estrategia' });
    const second = matthiasHomeMotionPhase({ scene: 'strategy-book', activity: 'Leyendo estrategia' });
    const coffee = matthiasHomeMotionPhase({ scene: 'morning-coffee', activity: 'Café' });
    expect(first).toBe(second);
    expect(first).not.toBe(coffee);
  });

  it('anima café y comida con pose rígida suficiente sin morph facial', () => {
    const sip = matthiasHomeRigidPoseSample({ profile: 'sip', time: 1.7, motionIntensity: 1.12 });
    const bite = matthiasHomeRigidPoseSample({ profile: 'bite', time: 1.8, motionIntensity: 1.12 });

    expect(sip.reach).toBeGreaterThan(.25);
    expect(bite.reach).toBeGreaterThan(.3);
    expect(Math.abs(sip.rx)).toBeLessThan(.03);
    expect(Math.abs(bite.rx)).toBeLessThan(.03);
    expect(sip.scale).toBeGreaterThan(.99);
    expect(sip.scale).toBeLessThan(1.02);
  });

  it('da microgestos antropomórficos acotados sin escalar ejes por separado', () => {
    const left = matthiasHomeRigidPoseSample({
      profile: 'idle',
      presenceState: MATTHIAS_HOME_STATES.GLANCE_LEFT,
      time: 1,
      stateElapsed: .44,
      motionIntensity: 1.12,
    });
    const lean = matthiasHomeRigidPoseSample({
      profile: 'idle',
      presenceState: MATTHIAS_HOME_STATES.LEAN_IN,
      time: 1,
      stateElapsed: .56,
      motionIntensity: 1.12,
    });
    const skeptical = matthiasHomeRigidPoseSample({
      profile: 'idle',
      presenceState: MATTHIAS_HOME_STATES.SKEPTICAL,
      time: 1,
      stateElapsed: .63,
      motionIntensity: 1.12,
    });

    expect(left.ry).toBeLessThan(-.01);
    expect(lean.scale).toBeGreaterThan(1.005);
    expect(lean.scale).toBeLessThan(1.02);
    expect(Math.abs(skeptical.rz)).toBeGreaterThan(.004);
    expect(Math.abs(skeptical.rz)).toBeLessThan(.02);
  });

  it('hablar adopta postura de atención sin hacer lip-sync por deformación', () => {
    const speak = matthiasHomeRigidPoseSample({
      profile: 'speak',
      presenceState: MATTHIAS_HOME_STATES.ATTEND,
      time: 2,
      stateElapsed: .5,
      speaking: true,
      motionIntensity: 1.12,
    });
    expect(speak.energy).toBeGreaterThan(.45);
    expect(speak.rx).toBeLessThan(0);
    expect(speak.scale).toBeGreaterThan(1);
    expect(speak.scale).toBeLessThan(1.02);
  });

  it('publica explícitamente el contrato anti-melt de Home', () => {
    const html = renderToStaticMarkup(
      <MatthiasHomePresenceAvatar
        avatar="/assets/matthias-scenes/strategy-book.webp"
        scene="strategy-book"
        activity="Leyendo estrategia"
        motionIntensity={1.12}
      />,
    );

    expect(html).toContain('data-matthias-three-avatar="true"');
    expect(html).toContain('data-home-presence-version="home-presence-v1"');
    expect(html).toContain('data-home-presence-state="idle"');
    expect(html).toContain('data-three-deformation="rigid-only"');
    expect(html).toContain('data-three-face-rig="home-rigid-v1"');
    expect(html).toContain('data-three-face-expression="canonical"');
    expect(html).toContain('data-three-face-warp="0.000"');
    expect(html).toContain('data-three-segments="1x1"');
    expect(html).toContain('<canvas');
    expect(html).toContain('data-matthias-canonical-art="true"');
    expect(html).not.toContain('data-matthias-art-part');
  });

  it('respeta reduced-motion desde el primer paint', () => {
    const html = renderToStaticMarkup(
      <MatthiasHomePresenceAvatar avatar="/base.webp" scene="base" reducedMotion />,
    );
    expect(html).toContain('data-three-motion="reduced"');
  });
});
