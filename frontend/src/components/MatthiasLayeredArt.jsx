import { useEffect, useMemo, useRef } from 'react';
import './MatthiasLayeredArt.css';

const PARTS = Object.freeze(['head', 'eyes', 'left-arm', 'right-arm', 'prop']);

export function matthiasSceneFamily(scene = '') {
  const key = String(scene || '').toLowerCase();
  if (/coffee|breakfast|night|beer-break/.test(key)) return 'coffee';
  if (/lunch|bocata/.test(key)) return 'lunch';
  if (/reading|strategy|dossier|weekly/.test(key)) return 'reading';
  if (/ops|inception/.test(key)) return 'ops';
  if (/sleep/.test(key)) return 'sleep';
  return 'base';
}

function cue(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function frames(...items) {
  return items;
}

/*
 * El WebP antiguo sigue siendo la verdad visual. Las copias localizadas del
 * mismo bitmap permiten articularlo sin redibujar a Matthias. v2 prioriza que
 * el gesto se lea a simple vista en Home/Insights: más recorrido, mejor ritmo
 * y una cabeza que participa, pero sin convertir el retrato en goma ni volver
 * a la vieja regresión de ojos/brazos flotantes.
 */
const MOTIONS = Object.freeze({
  idle: Object.freeze({
    head: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .24, transform: 'translate3d(-1.5px,-1px,0) rotate(-1.2deg)' },
      { offset: .56, transform: 'translate3d(.8px,-.5px,0) rotate(.65deg)' },
      { offset: .82, transform: 'translate3d(1.25px,.2px,0) rotate(.95deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    eyes: frames(
      { offset: 0, transform: 'translate3d(0,0,0) scaleY(1)' },
      { offset: .2, transform: 'translate3d(3.4px,.1px,0) scaleY(1)' },
      { offset: .42, transform: 'translate3d(3.1px,.45px,0) scaleY(.42)' },
      { offset: .55, transform: 'translate3d(3px,.1px,0) scaleY(1)' },
      { offset: .78, transform: 'translate3d(-2.7px,.05px,0) scaleY(1)' },
      { offset: 1, transform: 'translate3d(0,0,0) scaleY(1)' },
    ),
  }),
  'write-notes': Object.freeze({
    head: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .28, transform: 'translate3d(-1.2px,1px,0) rotate(-.9deg)' },
      { offset: .72, transform: 'translate3d(-.8px,.7px,0) rotate(-.6deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    eyes: frames(
      { offset: 0, transform: 'translate3d(0,0,0)' },
      { offset: .18, transform: 'translate3d(-3.8px,1.15px,0)' },
      { offset: .66, transform: 'translate3d(-3.2px,1px,0)' },
      { offset: .82, transform: 'translate3d(1.8px,.25px,0)' },
      { offset: 1, transform: 'translate3d(0,0,0)' },
    ),
    'right-arm': frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .14, transform: 'translate3d(-6.7px,-6.2px,0) rotate(-3deg)' },
      { offset: .29, transform: 'translate3d(-.8px,-7.1px,0) rotate(-.35deg)' },
      { offset: .44, transform: 'translate3d(-7px,-6.3px,0) rotate(-3.15deg)' },
      { offset: .6, transform: 'translate3d(-1px,-7.2px,0) rotate(-.45deg)' },
      { offset: .76, transform: 'translate3d(-6.4px,-5.9px,0) rotate(-2.75deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
  }),
  'audit-dossier': Object.freeze({
    head: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .22, transform: 'translate3d(-1.4px,.7px,0) rotate(-1.05deg)' },
      { offset: .52, transform: 'translate3d(.6px,.5px,0) rotate(.45deg)' },
      { offset: .78, transform: 'translate3d(1.25px,.2px,0) rotate(.9deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    eyes: frames(
      { offset: 0, transform: 'translate3d(0,0,0)' },
      { offset: .16, transform: 'translate3d(-4.1px,.75px,0)' },
      { offset: .43, transform: 'translate3d(.4px,.7px,0)' },
      { offset: .7, transform: 'translate3d(3.7px,.6px,0)' },
      { offset: .86, transform: 'translate3d(-1.6px,.25px,0)' },
      { offset: 1, transform: 'translate3d(0,0,0)' },
    ),
    'right-arm': frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .28, transform: 'translate3d(-5.8px,-6.5px,0) rotate(-2.8deg)' },
      { offset: .6, transform: 'translate3d(-5.2px,-5.8px,0) rotate(-2.45deg)' },
      { offset: .78, transform: 'translate3d(-2px,-2.5px,0) rotate(-.9deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    prop: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .3, transform: 'translate3d(-4.2px,-4.8px,0) rotate(-1.6deg)' },
      { offset: .62, transform: 'translate3d(-3.7px,-4.3px,0) rotate(-1.35deg)' },
      { offset: .8, transform: 'translate3d(-1.2px,-1.4px,0) rotate(-.45deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
  }),
  'read-dossier': Object.freeze({
    head: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .3, transform: 'translate3d(-1.1px,.8px,0) rotate(-.8deg)' },
      { offset: .72, transform: 'translate3d(.8px,.5px,0) rotate(.55deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    eyes: frames(
      { offset: 0, transform: 'translate3d(0,0,0)' },
      { offset: .16, transform: 'translate3d(-3.9px,.8px,0)' },
      { offset: .42, transform: 'translate3d(-.4px,.7px,0)' },
      { offset: .69, transform: 'translate3d(3.6px,.55px,0)' },
      { offset: .84, transform: 'translate3d(1.1px,.25px,0)' },
      { offset: 1, transform: 'translate3d(0,0,0)' },
    ),
    'right-arm': frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .34, transform: 'translate3d(-5.2px,-5.8px,0) rotate(-2.35deg)' },
      { offset: .66, transform: 'translate3d(-4.7px,-5.3px,0) rotate(-2deg)' },
      { offset: .82, transform: 'translate3d(-1.5px,-1.8px,0) rotate(-.6deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    prop: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .36, transform: 'translate3d(-3.9px,-4.2px,0) rotate(-1.35deg)' },
      { offset: .68, transform: 'translate3d(-3.4px,-3.8px,0) rotate(-1.1deg)' },
      { offset: .84, transform: 'translate3d(-1px,-1.1px,0) rotate(-.35deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
  }),
  'read-book': Object.freeze({
    // strategy-book.webp no tolera desplazar brazos sin que el recorte se vea
    // como un tic. La lectura se hace perceptible con los ojos; el parpadeo
    // visual se pinta por CSS sin comprimir ni despegar esta capa raster.
    eyes: frames(
      { offset: 0, transform: 'translate3d(0,0,0)' },
      { offset: .16, transform: 'translate3d(-3px,.35px,0)' },
      { offset: .4, transform: 'translate3d(-.3px,.3px,0)' },
      { offset: .57, transform: 'translate3d(-.2px,.22px,0)' },
      { offset: .76, transform: 'translate3d(2.8px,.28px,0)' },
      { offset: .88, transform: 'translate3d(-1.3px,.18px,0)' },
      { offset: 1, transform: 'translate3d(0,0,0)' },
    ),
  }),
  'board-move': Object.freeze({
    // En partida debe leerse como pensamiento real: primero mira el tablero,
    // luego lleva claramente la mano a la barbilla y remata con una inspección.
    head: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .22, transform: 'translate3d(1.2px,1.15px,0) rotate(.9deg)' },
      { offset: .56, transform: 'translate3d(.8px,.9px,0) rotate(.65deg)' },
      { offset: .78, transform: 'translate3d(-1.2px,.2px,0) rotate(-.8deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    eyes: frames(
      { offset: 0, transform: 'translate3d(0,0,0)' },
      { offset: .16, transform: 'translate3d(4px,1.1px,0)' },
      { offset: .52, transform: 'translate3d(3.5px,.95px,0)' },
      { offset: .75, transform: 'translate3d(-2.8px,.45px,0)' },
      { offset: .9, transform: 'translate3d(1.6px,.2px,0)' },
      { offset: 1, transform: 'translate3d(0,0,0)' },
    ),
    'right-arm': frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .22, transform: 'translate3d(-7px,-10.8px,0) rotate(-4deg)' },
      { offset: .55, transform: 'translate3d(-6.7px,-11.4px,0) rotate(-3.7deg)' },
      { offset: .76, transform: 'translate3d(-4.4px,-7px,0) rotate(-2deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
  }),
  sip: Object.freeze({
    // En el render de café la taza está a screen-right. Mano y taza suben
    // juntas; la cabeza acompaña el sorbo para que se lea a primera vista.
    eyes: frames(
      { offset: 0, transform: 'translate3d(0,0,0)' },
      { offset: .3, transform: 'translate3d(2.9px,.45px,0)' },
      { offset: .7, transform: 'translate3d(2.6px,.4px,0)' },
      { offset: .84, transform: 'translate3d(-1.6px,.15px,0)' },
      { offset: 1, transform: 'translate3d(0,0,0)' },
    ),
    head: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .34, transform: 'translate3d(1.6px,1.8px,0) rotate(1.15deg)' },
      { offset: .7, transform: 'translate3d(1.4px,1.55px,0) rotate(1deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    'right-arm': frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .3, transform: 'translate3d(-7.4px,-10.5px,0) rotate(-3.4deg)' },
      { offset: .68, transform: 'translate3d(-7px,-10px,0) rotate(-3deg)' },
      { offset: .82, transform: 'translate3d(-3px,-4px,0) rotate(-1.2deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    prop: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .3, transform: 'translate3d(-8px,-11.3px,0) rotate(-2.8deg)' },
      { offset: .68, transform: 'translate3d(-7.6px,-10.8px,0) rotate(-2.45deg)' },
      { offset: .82, transform: 'translate3d(-3.2px,-4.3px,0) rotate(-1deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
  }),
  'sip-night': Object.freeze({
    head: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .36, transform: 'translate3d(1.4px,1.5px,0) rotate(1deg)' },
      { offset: .72, transform: 'translate3d(1.2px,1.3px,0) rotate(.85deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    'right-arm': frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .3, transform: 'translate3d(-7.5px,-9.7px,0) rotate(-3.4deg)' },
      { offset: .68, transform: 'translate3d(-7px,-9.2px,0) rotate(-3deg)' },
      { offset: .82, transform: 'translate3d(-3px,-3.8px,0) rotate(-1.2deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    prop: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .32, transform: 'translate3d(-8.1px,-10.7px,0) rotate(-2.9deg)' },
      { offset: .68, transform: 'translate3d(-7.7px,-10.1px,0) rotate(-2.5deg)' },
      { offset: .82, transform: 'translate3d(-3.1px,-4.1px,0) rotate(-1deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
  }),
  bite: Object.freeze({
    head: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .36, transform: 'translate3d(0,1.8px,0) rotate(.35deg)' },
      { offset: .7, transform: 'translate3d(0,1.45px,0) rotate(.25deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    'left-arm': frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .34, transform: 'translate3d(2.5px,-7.1px,0) rotate(1.7deg)' },
      { offset: .68, transform: 'translate3d(2.2px,-6.6px,0) rotate(1.5deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    'right-arm': frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .34, transform: 'translate3d(-2.5px,-7.1px,0) rotate(-1.7deg)' },
      { offset: .68, transform: 'translate3d(-2.2px,-6.6px,0) rotate(-1.5deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    prop: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .36, transform: 'translate3d(0,-9.8px,0) rotate(0deg)' },
      { offset: .68, transform: 'translate3d(0,-9px,0) rotate(0deg)' },
      { offset: .82, transform: 'translate3d(0,-3.6px,0) rotate(0deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
  }),
  doze: Object.freeze({
    head: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .34, transform: 'translate3d(2.3px,6.2px,0) rotate(3deg)' },
      { offset: .68, transform: 'translate3d(1.9px,5.4px,0) rotate(2.5deg)' },
      { offset: .82, transform: 'translate3d(-.5px,1.6px,0) rotate(-.5deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    eyes: frames(
      { offset: 0, transform: 'translate3d(0,0,0) scaleY(1)' },
      { offset: .3, transform: 'translate3d(0,1px,0) scaleY(.28)' },
      { offset: .67, transform: 'translate3d(0,.9px,0) scaleY(.38)' },
      { offset: .82, transform: 'translate3d(0,.3px,0) scaleY(.78)' },
      { offset: 1, transform: 'translate3d(0,0,0) scaleY(1)' },
    ),
  }),
  speak: Object.freeze({
    head: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .18, transform: 'translate3d(-2px,-1.8px,0) rotate(-1.6deg)' },
      { offset: .42, transform: 'translate3d(1.25px,-.9px,0) rotate(.9deg)' },
      { offset: .68, transform: 'translate3d(-1.5px,-1.45px,0) rotate(-1.15deg)' },
      { offset: .84, transform: 'translate3d(.8px,-.5px,0) rotate(.55deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    eyes: frames(
      { offset: 0, transform: 'translate3d(0,0,0)' },
      { offset: .2, transform: 'translate3d(-3.2px,0,0)' },
      { offset: .46, transform: 'translate3d(2.4px,.15px,0)' },
      { offset: .72, transform: 'translate3d(-2.7px,.05px,0)' },
      { offset: 1, transform: 'translate3d(0,0,0)' },
    ),
    'left-arm': frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .34, transform: 'translate3d(2.1px,-2.6px,0) rotate(1.15deg)' },
      { offset: .7, transform: 'translate3d(1.6px,-2px,0) rotate(.8deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    'right-arm': frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .28, transform: 'translate3d(-4.8px,-6.4px,0) rotate(-3deg)' },
      { offset: .58, transform: 'translate3d(-2px,-3.2px,0) rotate(-1.1deg)' },
      { offset: .78, transform: 'translate3d(-4.3px,-5.4px,0) rotate(-2.5deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
  }),
});

const GESTURE_DURATIONS = Object.freeze({
  idle: 2600,
  'write-notes': 3300,
  'audit-dossier': 3500,
  'read-dossier': 3600,
  'read-book': 4000,
  'board-move': 3500,
  sip: 2500,
  'sip-night': 2700,
  bite: 2800,
  doze: 3600,
  speak: 1900,
});

const PART_DELAYS = Object.freeze({
  idle: Object.freeze({ head: 0, eyes: 80 }),
  'write-notes': Object.freeze({ head: 0, eyes: 80, 'right-arm': 180 }),
  'audit-dossier': Object.freeze({ head: 0, eyes: 80, 'right-arm': 220, prop: 280 }),
  'read-dossier': Object.freeze({ head: 0, eyes: 70, 'right-arm': 240, prop: 300 }),
  'read-book': Object.freeze({ eyes: 0 }),
  'board-move': Object.freeze({ head: 0, eyes: 70, 'right-arm': 170 }),
  sip: Object.freeze({ eyes: 0, head: 70, 'right-arm': 160, prop: 160 }),
  'sip-night': Object.freeze({ head: 0, 'right-arm': 90, prop: 150 }),
  bite: Object.freeze({ head: 0, 'left-arm': 100, 'right-arm': 100, prop: 160 }),
  doze: Object.freeze({ head: 0, eyes: 120 }),
  speak: Object.freeze({ head: 0, eyes: 70, 'left-arm': 100, 'right-arm': 150 }),
});

export function matthiasGestureName({ scene = '', activity = '', speaking = false } = {}) {
  if (speaking) return 'speak';

  const sceneKey = cue(scene);
  const activityKey = cue(activity);

  if (/night-coffee|beer-break/.test(sceneKey) || sceneKey === 'night') return 'sip-night';

  const family = matthiasSceneFamily(scene);
  if (family === 'coffee') return 'sip';
  if (family === 'lunch') return 'bite';
  if (family === 'sleep') return 'doze';

  if (/auditoria/.test(activityKey)) return 'audit-dossier';
  if (/expedient/.test(activityKey) || /dossier/.test(sceneKey)) return 'read-dossier';

  if (/partida|ajedrez dentro/.test(activityKey) || /inception/.test(sceneKey)) return 'board-move';
  if (/notas|operacion/.test(activityKey) || /ops/.test(sceneKey)) return 'write-notes';

  if (family === 'reading') return 'read-book';
  if (family === 'ops') return 'write-notes';
  return 'idle';
}

export function matthiasGestureParts({ scene = '', activity = '', speaking = false } = {}) {
  return Object.keys(MOTIONS[matthiasGestureName({ scene, activity, speaking })] || {});
}

export function matthiasGestureDelay({ first = false } = {}) {
  return first
    ? 280 + Math.round(Math.random() * 320)
    : 4_500 + Math.round(Math.random() * 3_000);
}

export function matthiasGestureTiming({ gesture = 'idle', part = 'eyes', speaking = false } = {}) {
  return {
    duration: speaking ? 1900 : (GESTURE_DURATIONS[gesture] || GESTURE_DURATIONS.idle),
    delay: PART_DELAYS[gesture]?.[part] || 0,
  };
}

function safeFinished(animation) {
  return animation?.finished?.catch?.(() => undefined) || Promise.resolve();
}

export default function MatthiasLayeredArt({
  avatar,
  scene = 'base',
  activity = '',
  speaking = false,
  reducedMotion = false,
}) {
  const rootRef = useRef(null);
  const family = useMemo(() => matthiasSceneFamily(scene), [scene]);
  const gesture = useMemo(
    () => matthiasGestureName({ scene, activity, speaking }),
    [activity, scene, speaking],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const stop = () => {
      root.querySelectorAll('[data-matthias-art-part]').forEach((node) => {
        node.getAnimations?.().forEach((animation) => animation.cancel());
      });
      root.dataset.gestureState = reducedMotion ? 'reduced' : 'rest';
    };

    stop();
    if (reducedMotion) return undefined;

    let disposed = false;
    let timer = null;

    const schedule = (first = false) => {
      if (disposed) return;
      root.dataset.gestureState = first ? 'waiting' : 'rest';
      timer = window.setTimeout(runGesture, matthiasGestureDelay({ first }));
    };

    const runGesture = async () => {
      if (disposed) return;
      const motion = MOTIONS[gesture] || MOTIONS.idle;
      const running = [];
      root.dataset.gestureState = 'acting';
      root.dataset.gesture = gesture;
      root.dataset.gestureProfile = 'expressive-v2';
      root.dataset.gestureCount = String((Number(root.dataset.gestureCount) || 0) + 1);

      Object.entries(motion).forEach(([part, keyframes]) => {
        const node = root.querySelector(`[data-matthias-art-part="${part}"]`);
        if (!node || typeof node.animate !== 'function') return;
        const timing = matthiasGestureTiming({ gesture, part, speaking });
        const animation = node.animate(keyframes, {
          ...timing,
          iterations: 1,
          easing: 'cubic-bezier(.35,0,.18,1)',
          fill: 'none',
        });
        running.push(safeFinished(animation));
      });

      await Promise.all(running);
      if (disposed) return;
      root.dataset.gestureState = 'rest';
      if (!speaking) schedule(false);
    };

    if (speaking) {
      timer = window.setTimeout(runGesture, 110);
    } else {
      schedule(true);
    }

    return () => {
      disposed = true;
      if (timer) window.clearTimeout(timer);
      stop();
    };
  }, [gesture, reducedMotion, speaking]);

  return (
    <span
      ref={rootRef}
      className="matthias-art-rig"
      data-matthias-layered-art="true"
      data-rig-family={family}
      data-rig-scene={scene || 'base'}
      data-rig-activity={activity || ''}
      data-gesture={gesture}
      data-gesture-state={reducedMotion ? 'reduced' : 'waiting'}
      data-gesture-profile="expressive-v2"
      data-gesture-count="0"
    >
      <img
        className="matthias-art-rig__base"
        src={avatar}
        alt=""
        draggable="false"
        data-matthias-canonical-art="true"
      />
      {PARTS.map((part) => (
        <img
          key={part}
          className={`matthias-art-rig__part matthias-art-rig__part--${part}`}
          src={avatar}
          alt=""
          draggable="false"
          aria-hidden="true"
          data-matthias-art-part={part}
          style={{ objectFit: 'cover', objectPosition: '50% 44%', animation: 'none' }}
        />
      ))}
    </span>
  );
}
