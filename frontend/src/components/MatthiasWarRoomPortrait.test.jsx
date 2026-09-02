import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import MatthiasWarRoomPortrait, { nextWarRoomGesture } from './MatthiasWarRoomPortrait.jsx';

describe('MatthiasWarRoomPortrait', () => {
  it('anima el retrato canónico sin pegarle prótesis faciales encima', () => {
    const html = renderToStaticMarkup(
      <MatthiasWarRoomPortrait avatar="/matthias.webp" speechKey="m1" speechText="Una observación." />,
    );

    expect(html).toContain('game-3d-matthias-presence');
    expect(html).toContain('game-3d-matthias-character');
    expect(html).toContain('game-3d-matthias-portrait');
    expect(html).toContain('game-3d-matthias-coffee');
    expect(html).toContain('data-matthias-face-overlay="none"');
    expect(html).toContain('data-matthias-motion-version="v2"');
    expect(html).not.toContain('game-3d-matthias-brows');
    expect(html).not.toContain('game-3d-matthias-eyelids');
    expect(html).not.toContain('game-3d-matthias-mouth');
    expect(html).toContain('data-matthias-warroom-gesture="idle"');
    expect(html).toContain('data-matthias-anger-level="0"');
    expect(html).toContain('data-matthias-reaction="none"');
  });

  it('hace legible una rabia alta sin sustituir el retrato suministrado', () => {
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

  it('reparte los microgestos entre café, acercamiento, mirada dura, cabeza y barrido de sala', () => {
    expect(nextWarRoomGesture(() => 0.04)).toBe('coffee');
    expect(nextWarRoomGesture(() => 0.12)).toBe('lean-in');
    expect(nextWarRoomGesture(() => 0.28)).toBe('glare');
    expect(nextWarRoomGesture(() => 0.46)).toBe('head-left');
    expect(nextWarRoomGesture(() => 0.62)).toBe('head-right');
    expect(nextWarRoomGesture(() => 0.78)).toBe('survey');
    expect(nextWarRoomGesture(() => 0.93)).toBe('glance');
  });
});
