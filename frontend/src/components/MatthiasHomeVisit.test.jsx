import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../cpuIdentity.js', () => ({ CPU_IDENTITY: { name: 'Matthias' } }));
vi.mock('../matthiasVisuals.js', () => ({
  matthiasAmbientVisuals: () => [
    { key: 'reading', avatar: '/matthias-reading.webp', label: 'Leyendo estrategia' },
    { key: 'coffee', avatar: '/matthias-coffee.webp', label: 'Café de campaña' },
  ],
  matthiasTimeVisual: () => ({ key: 'time', avatar: '/matthias-time.webp', label: 'En observación' }),
}));
vi.mock('../userPreferences.js', () => ({
  reducedMotionStatus: ({ systemReduced } = {}) => ({
    effective: Boolean(systemReduced),
    source: systemReduced ? 'system' : 'none',
    preference: 'system',
    systemReduced: Boolean(systemReduced),
  }),
  setReducedMotion: () => false,
  USER_PREFERENCES_CHANGED_EVENT: 'chess-study-user-preferences-changed',
}));

import MatthiasHomeVisit, { matthiasCompactViewport, matthiasMotionReduced } from './MatthiasHomeVisit.jsx';

const MODEL = {
  variant: 'quiet',
  eyebrow: 'MATTHIAS · EN OBSERVACIÓN',
  text: 'Este texto no debe fingir conversación cuando está callado.',
  actionLabel: 'Ver Así juegas',
  moodCue: 'observant',
  moodLabel: 'Observador',
  sessionLabel: 'Sesión de prueba',
};

describe('MatthiasHomeVisit · residente de Home', () => {
  it('mantiene el arte canónico antiguo como base y monta articulaciones encima', () => {
    const html = renderToStaticMarkup(
      <MatthiasHomeVisit model={MODEL} speaking={false} onOpenInsights={() => {}} />,
    );

    expect(html).toContain('aria-label="Rincón de Matthias"');
    expect(html).toContain('data-viewport-resident="true"');
    expect(html).toContain('data-placement="viewport"');
    expect(html).toContain('data-motion-state="active"');
    expect(html).toContain('data-motion-source="none"');
    expect(html).toContain('data-ambient-scene="reading"');
    expect(html).toContain('data-matthias-layered-art="true"');
    expect(html).toContain('data-matthias-canonical-art="true"');
    expect(html).toContain('src="/matthias-reading.webp"');
    expect(html).toContain('data-matthias-art-part="head"');
    expect(html).toContain('data-matthias-art-part="eyes"');
    expect(html).toContain('data-matthias-art-part="left-arm"');
    expect(html).toContain('data-matthias-art-part="right-arm"');
    expect(html).toContain('data-matthias-art-part="prop"');
    expect(html).not.toContain('data-matthias-puppet');
    expect(html).toContain('Abrir Así juegas con Matthias');
    expect(html).toContain('Leyendo estrategia');
    expect(html).not.toContain('Mensaje de Matthias');
    expect(html).not.toContain(MODEL.text);
  });

  it('cuando tiene algo real que decir conserva el arte original y activa el gesto de habla', () => {
    const model = { ...MODEL, variant: 'comment', text: 'He encontrado una reincidencia real.', meta: '2 casos' };
    const html = renderToStaticMarkup(
      <MatthiasHomeVisit
        model={model}
        speaking
        onAction={() => {}}
        onDismiss={() => {}}
        onOpenInsights={() => {}}
      />,
    );

    expect(html).toContain('data-matthias-canonical-art="true"');
    expect(html).toContain('src="/matthias-time.webp"');
    expect(html).toContain('data-gesture="speak"');
    expect(html).toContain('data-matthias-art-part="head"');
    expect(html).toContain('data-matthias-art-part="eyes"');
    expect(html).not.toContain('data-matthias-puppet');
    expect(html).toContain('Mensaje de Matthias');
    expect(html).toContain('He encontrado una reincidencia real.');
    expect(html).toContain('2 casos');
    expect(html).toContain('Ver Así juegas');
    expect(html).toContain('Cerrar comentario de Matthias');
  });

  it('usa colocación inline en viewport compacto para no tapar contenido móvil', () => {
    expect(matthiasCompactViewport({ mediaMatches: true, innerWidth: 1440 })).toBe(true);
    expect(matthiasCompactViewport({ mediaMatches: false, innerWidth: 390 })).toBe(false);
  });

  it('reduce el movimiento si lo pide la app o el sistema en el contrato legacy', () => {
    expect(matthiasMotionReduced({ appReduced: false, mediaReduced: false })).toBe(false);
    expect(matthiasMotionReduced({ appReduced: true, mediaReduced: false })).toBe(true);
    expect(matthiasMotionReduced({ appReduced: false, mediaReduced: true })).toBe(true);
    expect(matthiasMotionReduced({ appReduced: true, mediaReduced: true })).toBe(true);
  });
});
