import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import MatthiasWarRoomPortrait, {
  nextWarRoomGesture,
  shouldUseWarRoomAngryArt,
  WAR_ROOM_COMPACT_MOTION_INTENSITY,
  warRoomCompactViewport,
} from './MatthiasWarRoomPortrait.jsx';

describe('MatthiasWarRoomPortrait', () => {
  it('usa Three.js para dar vida al retrato canónico con rig facial real y sin prótesis raster', () => {
    const html = renderToStaticMarkup(
      <MatthiasWarRoomPortrait avatar="/matthias.webp" speechKey="m1" speechText="Una observación." />,
    );

    expect(html).toContain('game-3d-matthias-presence');
    expect(html).toContain('game-3d-matthias-character');
    expect(html).toContain('game-3d-matthias-portrait');
    expect(html).toContain('game-3d-matthias-coffee');
    expect(html).toContain('data-matthias-face-overlay="none"');
    expect(html).toContain('data-matthias-face-rig="three-mesh-face-v1"');
    expect(html).toContain('data-matthias-avatar-mode="stern-closed-mouth"');
    expect(html).toContain('data-matthias-motion-version="v4-android"');
    expect(html).toContain('data-matthias-compact-motion="false"');
    expect(html).toContain('data-matthias-three-avatar="true"');
    expect(html).toContain('data-three-scene="war-room-command"');
    expect(html).toContain('data-three-motion-intensity="1.00"');
    expect(html).toContain('data-three-face-rig="face-v1"');
    expect(html).toContain('data-three-face-expression="stern"');
    expect(html).toContain('data-three-face-gesture="war-idle"');
    expect(html).toContain('<canvas');
    expect(html).toContain('data-matthias-canonical-art="true"');
    expect(html).toContain('src="/matthias.webp"');
    expect(html).not.toContain('data-matthias-art-part');
    expect(html).not.toContain('matthias-war-room-rig__part');
    expect(html).not.toContain('game-3d-matthias-brows');
    expect(html).not.toContain('game-3d-matthias-eyelids');
    expect(html).not.toContain('game-3d-matthias-mouth');
    expect(html).toContain('data-matthias-warroom-gesture="idle"');
    expect(html).toContain('data-matthias-anger-level="0"');
    expect(html).toContain('data-matthias-reaction="none"');
  });

  it('sube la intensidad Three.js sólo en el retrato compacto de Android', () => {
    expect(WAR_ROOM_COMPACT_MOTION_INTENSITY).toBeGreaterThan(1);
    expect(warRoomCompactViewport({ mediaMatches: true, innerWidth: 1440 })).toBe(true);
    expect(warRoomCompactViewport({ mediaMatches: false, innerWidth: 390 })).toBe(false);
    expect(warRoomCompactViewport({ mediaMatches: false, innerWidth: 1440 })).toBe(false);
  });

  it('reserva el Matthias de boca abierta para un gruñido con rabia de verdad', () => {
    expect(shouldUseWarRoomAngryArt({ reaction: 'disapprove', angerLevel: 2, angryAvatar: '/angry.webp' })).toBe(false);
    expect(shouldUseWarRoomAngryArt({ reaction: 'smirk', angerLevel: 4, angryAvatar: '/angry.webp' })).toBe(false);
    expect(shouldUseWarRoomAngryArt({ reaction: 'disapprove', angerLevel: 3, angryAvatar: '/angry.webp' })).toBe(true);
    expect(shouldUseWarRoomAngryArt({ reaction: 'disapprove', angerLevel: 4, angryAvatar: '/angry.webp' })).toBe(true);
    expect(shouldUseWarRoomAngryArt({ reaction: 'disapprove', angerLevel: 4 })).toBe(false);
  });

  it('hace legible una rabia alta sin sustituir el retrato mientras no haya reacción fuerte', () => {
    const html = renderToStaticMarkup(
      <MatthiasWarRoomPortrait avatar="/matthias.webp" angryAvatar="/angry.webp" angerLevel={3} />,
    );

    expect(html).toContain('anger-level-3');
    expect(html).toContain('data-matthias-anger-level="3"');
    expect(html).toContain('data-matthias-avatar-mode="stern-closed-mouth"');
    expect(html).toContain('src="/matthias.webp"');
    expect(html).not.toContain('src="/angry.webp"');
    expect(html).toContain('data-three-profile="idle"');
    expect(html).toContain('data-three-face-expression="simmer"');
  });

  it('limita el nivel visual de rabia al rango soportado', () => {
    const html = renderToStaticMarkup(
      <MatthiasWarRoomPortrait avatar="/matthias.webp" angerLevel={99} />,
    );

    expect(html).toContain('anger-level-4');
    expect(html).toContain('data-matthias-anger-level="4"');
  });

  it('prioriza microgestos pequeños y deja los gestos grandes menos frecuentes', () => {
    expect(nextWarRoomGesture(() => 0.02)).toBe('coffee');
    expect(nextWarRoomGesture(() => 0.10)).toBe('glance');
    expect(nextWarRoomGesture(() => 0.38)).toBe('head-left');
    expect(nextWarRoomGesture(() => 0.48)).toBe('head-right');
    expect(nextWarRoomGesture(() => 0.60)).toBe('survey');
    expect(nextWarRoomGesture(() => 0.75)).toBe('lean-in');
    expect(nextWarRoomGesture(() => 0.92)).toBe('glare');
  });
});
