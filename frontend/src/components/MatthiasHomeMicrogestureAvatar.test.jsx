import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import MatthiasHomeMicrogestureAvatar, {
  MATTHIAS_HOME_FACE_WARP_LIMIT,
  MATTHIAS_HOME_MICROGESTURE_VERSION,
  matthiasHomeFacialCue,
  matthiasHomeFacialMotionSample,
} from './MatthiasHomeMicrogestureAvatar.jsx';
import { MATTHIAS_HOME_STATES } from './matthiasHomePresenceStateMachine.js';

describe('MatthiasHomeMicrogestureAvatar', () => {
  it('mapea la FSM de Home a expresiones faciales antropomórficas reales', () => {
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

  it('mueve cejas/ojos de verdad sin arrastrar el núcleo de la cara', () => {
    const brow = matthiasHomeFacialMotionSample({
      profile: 'read',
      presenceState: MATTHIAS_HOME_STATES.SURVEY,
      x: .105,
      y: .475,
      imageAspect: 1,
      time: 1.2,
      motionIntensity: 1.12,
    });
    const eye = matthiasHomeFacialMotionSample({
      presenceState: MATTHIAS_HOME_STATES.GLANCE_LEFT,
      x: .105,
      y: .395,
      imageAspect: 1,
      time: 1.2,
      motionIntensity: 1.12,
    });
    const nose = matthiasHomeFacialMotionSample({
      profile: 'read',
      presenceState: MATTHIAS_HOME_STATES.SURVEY,
      x: 0,
      y: .305,
      imageAspect: 1,
      time: 1.2,
      motionIntensity: 1.12,
    });

    expect(Math.abs(brow.dx) + Math.abs(brow.dy)).toBeGreaterThan(.001);
    expect(Math.abs(eye.dx) + Math.abs(eye.dy)).toBeGreaterThan(.001);
    expect(Math.abs(nose.dx) + Math.abs(nose.dy)).toBeLessThan(.0015);
  });

  it('mantiene todos los deltas faciales dentro del contrato anti-melt', () => {
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
      for (const [x, y] of [[-.105, .475], [.105, .475], [-.105, .395], [.105, .395], [-.105, .175], [.105, .175], [0, .095]]) {
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

  it('publica un contrato que exige microgesto facial acotado, no cara inmóvil', () => {
    const html = renderToStaticMarkup(
      <MatthiasHomeMicrogestureAvatar
        avatar="/assets/matthias-scenes/strategy-book.webp"
        scene="strategy-book"
        activity="Leyendo estrategia"
        motionIntensity={1.12}
      />,
    );

    expect(MATTHIAS_HOME_MICROGESTURE_VERSION).toBe('home-face-v2');
    expect(html).toContain('data-home-microgesture-version="home-face-v2"');
    expect(html).toContain('data-three-deformation="rigid-body+bounded-face"');
    expect(html).toContain('data-three-face-rig="face-v1"');
    expect(html).toContain('data-three-face-expression="focus"');
    expect(html).toContain('data-three-face-gesture="survey"');
    expect(html).toContain('data-three-face-warp-limit="0.019"');
    expect(html).toContain('data-three-face-warp="0.0000"');
    expect(html).toContain('<canvas');
    expect(html).toContain('data-matthias-canonical-art="true"');
  });

  it('reduced-motion conserva el arte canónico y desactiva movimiento desde el primer paint', () => {
    const html = renderToStaticMarkup(
      <MatthiasHomeMicrogestureAvatar avatar="/base.webp" scene="base" reducedMotion />,
    );
    expect(html).toContain('data-three-motion="reduced"');
    expect(html).toContain('data-matthias-canonical-art="true"');
  });
});
