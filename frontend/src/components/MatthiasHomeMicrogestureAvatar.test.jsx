import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import MatthiasHomeMicrogestureAvatar, {
  MATTHIAS_HOME_FACE_WARP_LIMIT,
  MATTHIAS_HOME_MICROGESTURE_VERSION,
  matthiasHomeActivityProfile,
  matthiasHomeFacialCue,
  matthiasHomeFacialMotionSample,
} from './MatthiasHomeMicrogestureAvatar.jsx';
import { MATTHIAS_HOME_STATES } from './matthiasHomePresenceStateMachine.js';

describe('MatthiasHomeMicrogestureAvatar', () => {
  it('mapea la FSM de Home a expresiones faciales coherentes con Matthias', () => {
    expect(matthiasHomeFacialCue({ presenceState: MATTHIAS_HOME_STATES.GLANCE_LEFT })).toEqual({
      expression: 'alert',
      gesture: 'head-left',
    });
    expect(matthiasHomeFacialCue({ presenceState: MATTHIAS_HOME_STATES.GLANCE_RIGHT })).toEqual({
      expression: 'alert',
      gesture: 'head-right',
    });
    expect(matthiasHomeFacialCue({ presenceState: MATTHIAS_HOME_STATES.SURVEY })).toEqual({
      expression: 'focus',
      gesture: 'survey',
    });
    expect(matthiasHomeFacialCue({ presenceState: MATTHIAS_HOME_STATES.SKEPTICAL })).toEqual({
      expression: 'smirk',
      gesture: 'idle',
    });
    expect(matthiasHomeFacialCue({ profile: 'sip' })).toEqual({
      expression: 'coffee',
      gesture: 'idle',
    });
    expect(matthiasHomeFacialCue({ speaking: true })).toEqual({
      expression: 'alert',
      gesture: 'idle',
    });
  });

  it('separa movimiento de actividad: desayuno conserva gesto de sorbo pero usa composición de desayuno', () => {
    expect(matthiasHomeActivityProfile({
      scene: 'time-breakfast-news',
      activity: 'Desayuno y prensa',
    })).toBe('breakfast');
    expect(matthiasHomeActivityProfile({
      scene: 'time-late-sleep',
      activity: 'Siesta táctica',
    })).toBe('sleep');
    expect(matthiasHomeActivityProfile({
      scene: 'time-strategy-book',
      activity: 'Estudio matinal',
    })).toBe('read');
  });

  it('mantiene el helper facial legacy dentro del contrato anti-melt', () => {
    const samples = [];
    for (const state of [
      MATTHIAS_HOME_STATES.IDLE,
      MATTHIAS_HOME_STATES.GLANCE_LEFT,
      MATTHIAS_HOME_STATES.GLANCE_RIGHT,
      MATTHIAS_HOME_STATES.SURVEY,
      MATTHIAS_HOME_STATES.LEAN_IN,
      MATTHIAS_HOME_STATES.NOD,
      MATTHIAS_HOME_STATES.SKEPTICAL,
      MATTHIAS_HOME_STATES.ATTEND,
    ]) {
      for (const [x, y] of [[-.105, .475], [.105, .475], [-.105, .395], [.105, .395], [0, .095]]) {
        samples.push(matthiasHomeFacialMotionSample({
          profile: 'think',
          presenceState: state,
          x,
          y,
          imageAspect: 1,
          time: 1.7,
          speaking: state === MATTHIAS_HOME_STATES.ATTEND,
          motionIntensity: 1.12,
        }));
      }
    }

    for (const sample of samples) {
      expect(Math.abs(sample.dx)).toBeLessThanOrEqual(MATTHIAS_HOME_FACE_WARP_LIMIT);
      expect(Math.abs(sample.dy)).toBeLessThanOrEqual(MATTHIAS_HOME_FACE_WARP_LIMIT);
      expect(Math.abs(sample.dz)).toBeLessThanOrEqual(MATTHIAS_HOME_FACE_WARP_LIMIT);
    }
  });

  it('publica el contrato premium 3D, el activity rig y conserva el original sólo como fallback', () => {
    const html = renderToStaticMarkup(
      <MatthiasHomeMicrogestureAvatar
        avatar="/assets/matthias-scenes/strategy-book.webp"
        scene="strategy-book"
        activity="Leyendo estrategia"
        motionIntensity={1.12}
      />,
    );

    expect(MATTHIAS_HOME_MICROGESTURE_VERSION).toBe('home-face-v3-premium');
    expect(html).toContain('data-home-microgesture-version="home-face-v3-premium"');
    expect(html).toContain('data-three-model="matthias-home-premium-3d-v1"');
    expect(html).toContain('data-three-fidelity="approved-original-premium-v1"');
    expect(html).toContain('data-three-deformation="rigid-geometry+facial-rig"');
    expect(html).toContain('data-three-render-mode="canonical-premium-pawn-3d"');
    expect(html).toContain('data-three-render-contract="canonical-pawn-3d-v1"');
    expect(html).toContain('data-three-approved-reference="approved-original-matthias-premium-v1"');
    expect(html).toContain('data-three-full-3d="true"');
    expect(html).toContain('data-three-face-rig="premium-pawn-face-v1"');
    expect(html).toContain('data-three-articulated-face-rig="premium-pawn-face-v1"');
    expect(html).toContain('data-three-activity-rig="activity-props-v2"');
    expect(html).toContain('data-three-activity-profile="read"');
    expect(html).toContain('data-three-activity-prop="book"');
    expect(html).toContain('data-three-face-warp-limit="0.019"');
    expect(html).toContain('data-three-face-warp="0.0000"');
    expect(html).toContain('<canvas');
    expect(html).toContain('data-matthias-canonical-art="true"');
    expect(html).toContain('src="/assets/matthias-scenes/strategy-book.webp"');
  });

  it('desayuno y sueño publican el mismo contrato semántico que debe conservar el 3D tras el fallback', () => {
    const breakfast = renderToStaticMarkup(
      <MatthiasHomeMicrogestureAvatar
        avatar="/assets/matthias-scenes/morning-coffee.webp"
        scene="time-breakfast-news"
        activity="Desayuno y prensa"
      />,
    );
    expect(breakfast).toContain('data-three-profile="sip"');
    expect(breakfast).toContain('data-three-activity-profile="breakfast"');
    expect(breakfast).toContain('data-three-activity-prop="breakfast"');
    expect(breakfast).toContain('src="/assets/matthias-scenes/morning-coffee.webp"');

    const sleep = renderToStaticMarkup(
      <MatthiasHomeMicrogestureAvatar
        avatar="/assets/matthias-scenes/late-sleep.webp"
        scene="time-late-sleep"
        activity="Siesta táctica"
      />,
    );
    expect(sleep).toContain('data-three-profile="sleep"');
    expect(sleep).toContain('data-three-activity-profile="sleep"');
    expect(sleep).toContain('data-three-activity-prop="blanket"');
    expect(sleep).toContain('src="/assets/matthias-scenes/late-sleep.webp"');
  });

  it('hablar domina la cara pero conserva la actividad física que Matthias ya hacía', () => {
    const html = renderToStaticMarkup(
      <MatthiasHomeMicrogestureAvatar
        avatar="/assets/matthias-scenes/strategy-book.webp"
        scene="strategy-book"
        activity="Leyendo estrategia"
        speaking
      />,
    );

    expect(html).toContain('data-three-profile="speak"');
    expect(html).toContain('data-three-activity-profile="read"');
    expect(html).toContain('data-three-activity-prop="book"');
    expect(html).toContain('data-three-face-expression="alert"');
  });

  it('reduced-motion conserva el fallback y publica movimiento reducido desde primer paint', () => {
    const html = renderToStaticMarkup(
      <MatthiasHomeMicrogestureAvatar avatar="/base.webp" scene="base" reducedMotion />,
    );
    expect(html).toContain('data-three-motion="reduced"');
    expect(html).toContain('data-three-full-3d="true"');
    expect(html).toContain('data-three-activity-rig="activity-props-v2"');
    expect(html).toContain('data-matthias-canonical-art="true"');
    expect(html).toContain('src="/base.webp"');
  });
});
