import { useMemo } from 'react';
import './HomeMatthias3D.css';

function cue(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function homeMatthiasMotionProfile({ scene = '', activity = '', speaking = false } = {}) {
  if (speaking) return 'speak';
  const sceneKey = cue(scene);
  const activityKey = cue(activity);
  if (/sleep|sobando/.test(sceneKey) || /sobando|cabeceando|dormido/.test(activityKey)) return 'sleep';
  if (/coffee|beer-break|night|breakfast/.test(sceneKey) || /cafe|cerve|desayuno/.test(activityKey)) return 'sip';
  if (/lunch|bocata|dinner/.test(sceneKey) || /comida|cena|repostando/.test(activityKey)) return 'bite';
  if (/inception/.test(sceneKey) || /partida|ajedrez dentro|emboscada/.test(activityKey)) return 'think';
  if (/ops/.test(sceneKey) || /operacion|notas/.test(activityKey)) return 'write';
  if (/dossier/.test(sceneKey) || /auditoria|expedient|heridas/.test(activityKey)) return 'dossier';
  if (/strategy|weekly|reading/.test(sceneKey) || /lectura|estudio|manual|estrategia|prensa/.test(activityKey)) return 'read';
  return 'idle';
}

export function homeMatthiasMotionPhase({ scene = '', activity = '' } = {}) {
  const key = `${cue(scene)}|${cue(activity)}`;
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 3600) / 1000;
}

/**
 * Home uses the approved 3D scene renders as indivisible sprites. Never slice
 * or reproject these pixels in WebGL: that path corrupted on real GPUs.
 * Whole-sprite motion preserves Matthias' face, uniform and scene props exactly.
 */
export default function HomeMatthias3D({
  fallbackAvatar,
  scene = 'base',
  activity = '',
  speaking = false,
  reducedMotion = false,
}) {
  const profile = useMemo(
    () => homeMatthiasMotionProfile({ scene, activity, speaking }),
    [activity, scene, speaking],
  );
  const phase = useMemo(() => homeMatthiasMotionPhase({ scene, activity }), [activity, scene]);

  if (!fallbackAvatar) return null;

  return (
    <span
      className="home-matthias-3d is-ready"
      data-home-matthias-3d="ready"
      data-matthias-identity="canonical-scene-render"
      data-matthias-render-source="bundled-scene-art"
      data-home-matthias-profile={profile}
      data-motion={reducedMotion ? 'still-canonical-sprite' : 'canonical-sprite-routines'}
      aria-hidden="true"
    >
      <img
        src={fallbackAvatar}
        alt=""
        draggable="false"
        data-matthias-identity="canonical-scene-render"
        style={reducedMotion ? undefined : { animationDelay: `${-phase}s` }}
      />
    </span>
  );
}
