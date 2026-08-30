import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../cpuIdentity.js', () => ({ CPU_IDENTITY: { name: 'Matthias' } }));
vi.mock('../matthiasVisuals.js', () => ({
  matthiasAmbientVisuals: (hour) => hour === 12
    ? [{ key: 'time-lunch-bocata', avatar: '/lunch.webp', label: 'Repostando' }]
    : [{ key: 'time-morning-coffee', avatar: '/coffee.webp', label: 'Café de campaña' }],
  matthiasTimeVisual: () => ({ key: 'base', avatar: '/base.webp', label: 'En observación' }),
}));
vi.mock('../userPreferences.js', () => ({
  reducedMotionStatus: () => ({
    effective: false,
    source: 'none',
    preference: 'system',
    systemReduced: false,
  }),
  setReducedMotion: () => false,
  USER_PREFERENCES_CHANGED_EVENT: 'chess-study-user-preferences-changed',
}));

import MatthiasHomeVisit from './MatthiasHomeVisit.jsx';

const MODEL = {
  variant: 'quiet',
  eyebrow: 'MATTHIAS',
  text: '',
  actionLabel: 'Ver Así juegas',
  moodCue: 'observant',
};

afterEach(() => vi.restoreAllMocks());

describe('MatthiasHomeVisit · escenas físicas reconocibles', () => {
  it('expone una escena de comida mediante una key estable que la animación puede reconocer', () => {
    vi.spyOn(Date.prototype, 'getHours').mockReturnValue(12);
    const html = renderToStaticMarkup(<MatthiasHomeVisit model={MODEL} speaking={false} />);
    expect(html).toContain('data-ambient-scene="time-lunch-bocata"');
    expect(html).toContain('Repostando');
  });

  it('expone una escena de bebida mediante una key estable que la animación puede reconocer', () => {
    vi.spyOn(Date.prototype, 'getHours').mockReturnValue(8);
    const html = renderToStaticMarkup(<MatthiasHomeVisit model={MODEL} speaking={false} />);
    expect(html).toContain('data-ambient-scene="time-morning-coffee"');
    expect(html).toContain('Café de campaña');
  });
});
