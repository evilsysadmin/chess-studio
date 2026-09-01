import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import MatthiasWarRoomPortrait, { nextWarRoomGesture } from './MatthiasWarRoomPortrait.jsx';

describe('MatthiasWarRoomPortrait', () => {
  it('mantiene el retrato canónico y prepara boca, cejas y café como capas discretas', () => {
    const html = renderToStaticMarkup(
      <MatthiasWarRoomPortrait avatar="/matthias.webp" speechKey="m1" speechText="Una observación." />,
    );

    expect(html).toContain('game-3d-matthias-portrait');
    expect(html).toContain('game-3d-matthias-brows');
    expect(html).toContain('game-3d-matthias-mouth');
    expect(html).toContain('game-3d-matthias-coffee');
    expect(html).toContain('data-matthias-warroom-gesture="idle"');
    expect(html).toContain('data-matthias-anger-level="0"');
  });

  it('hace legible una rabia alta sin sustituir el retrato canónico', () => {
    const html = renderToStaticMarkup(
      <MatthiasWarRoomPortrait avatar="/matthias.webp" angerLevel={3} />,
    );

    expect(html).toContain('anger-level-3');
    expect(html).toContain('data-matthias-anger-level="3"');
    expect(html).toContain('src="/matthias.webp"');
  });

  it('limita el nivel visual de rabia al rango soportado', () => {
    const html = renderToStaticMarkup(
      <MatthiasWarRoomPortrait avatar="/matthias.webp" angerLevel={99} />,
    );

    expect(html).toContain('anger-level-4');
    expect(html).toContain('data-matthias-anger-level="4"');
  });

  it('mezcla café, órdenes y mirada sin convertirlo en un muñeco en bucle', () => {
    expect(nextWarRoomGesture(() => 0.1)).toBe('coffee');
    expect(nextWarRoomGesture(() => 0.3)).toBe('order');
    expect(nextWarRoomGesture(() => 0.8)).toBe('glance');
  });
});
