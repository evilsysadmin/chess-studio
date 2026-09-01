import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import MatthiasWarRoomPortrait, { nextWarRoomGesture } from './MatthiasWarRoomPortrait.jsx';

describe('MatthiasWarRoomPortrait', () => {
  it('mantiene el retrato canónico y prepara boca y café como capas discretas', () => {
    const html = renderToStaticMarkup(
      <MatthiasWarRoomPortrait avatar="/matthias.webp" speechKey="m1" speechText="Una observación." />,
    );

    expect(html).toContain('game-3d-matthias-portrait');
    expect(html).toContain('game-3d-matthias-mouth');
    expect(html).toContain('game-3d-matthias-coffee');
    expect(html).toContain('data-matthias-warroom-gesture="idle"');
  });

  it('mantiene el café ocasional y prioriza la mirada la mayor parte del tiempo', () => {
    expect(nextWarRoomGesture(() => 0.1)).toBe('coffee');
    expect(nextWarRoomGesture(() => 0.8)).toBe('glance');
  });
});
