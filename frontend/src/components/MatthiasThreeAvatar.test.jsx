import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import MatthiasThreeAvatar, { matthiasThreeMotionProfile } from './MatthiasThreeAvatar.jsx';

describe('MatthiasThreeAvatar', () => {
  it('maps Home activities to distinct Three.js motion profiles', () => {
    expect(matthiasThreeMotionProfile({ scene: 'morning-coffee', activity: 'Primer café' })).toBe('sip');
    expect(matthiasThreeMotionProfile({ scene: 'beer-break', activity: 'Cervezota reglamentaria' })).toBe('sip');
    expect(matthiasThreeMotionProfile({ scene: 'lunch-bocata', activity: 'Comida táctica' })).toBe('bite');
    expect(matthiasThreeMotionProfile({ scene: 'strategy-book', activity: 'Estudio matinal' })).toBe('read');
    expect(matthiasThreeMotionProfile({ scene: 'dossier', activity: 'Auditoría táctica' })).toBe('dossier');
    expect(matthiasThreeMotionProfile({ scene: 'afternoon-ops', activity: 'En plena operación' })).toBe('write');
    expect(matthiasThreeMotionProfile({ scene: 'chess-inception', activity: 'Partida nocturna' })).toBe('think');
    expect(matthiasThreeMotionProfile({ scene: 'late-sleep', activity: 'Sobando' })).toBe('sleep');
    expect(matthiasThreeMotionProfile({ speaking: true, scene: 'strategy-book' })).toBe('speak');
  });

  it('renders one canonical fallback plus a Three.js canvas instead of raster body-part layers', () => {
    const html = renderToStaticMarkup(
      <MatthiasThreeAvatar
        avatar="/assets/matthias-scenes/strategy-book.webp"
        scene="strategy-book"
        activity="Estudio matinal"
      />,
    );

    expect(html).toContain('data-matthias-three-avatar="true"');
    expect(html).toContain('data-three-profile="read"');
    expect(html).toContain('<canvas');
    expect(html).toContain('data-matthias-canonical-art="true"');
    expect(html).toContain('strategy-book.webp');
    expect(html).not.toContain('data-matthias-art-part');
    expect(html).not.toContain('data-matthias-layered-art');
  });

  it('marks reduced motion before WebGL mounts so SSR and first paint respect accessibility', () => {
    const html = renderToStaticMarkup(
      <MatthiasThreeAvatar avatar="/base.webp" scene="base" reducedMotion />,
    );
    expect(html).toContain('data-three-motion="reduced"');
  });
});
