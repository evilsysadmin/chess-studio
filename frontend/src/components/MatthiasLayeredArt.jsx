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
 * The old WebP remains the visual truth. Localized copies of that exact bitmap
 * provide articulation. Motion has a deliberate minimum amplitude so a gesture
 * can be understood at Home/Insights scale instead of merely existing in DOM.
 */
const MOTIONS = Object.freeze({
  idle: Object.freeze({
    eyes: frames(
      { offset: 0, transform: 'translate3d(0,0,0) scaleY(1)' },
      { offset: .28, transform: 'translate3d(2.5px,.1px,0) scaleY(1)' },
      { offset: .5, transform: 'translate3d(2.2px,.35px,0) scaleY(.62)' },
      { offset: .67, transform: 'translate3d(2.2px,.1px,0) scaleY(1)' },
      { offset: 1, transform: 'translate3d(0,0,0) scaleY(1)' },
    ),
  }),
  'write-notes': Object.freeze({
    eyes: frames(
      { offset: 0, transform: 'translate3d(0,0,0)' },
      { offset: .25, transform: 'translate3d(-3px,1px,0)' },
      { offset: .76, transform: 'translate3d(-2.6px,.9px,0)' },
      { offset: 1, transform: 'translate3d(0,0,0)' },
    ),
    'right-arm': frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .18, transform: 'translate3d(-4.8px,-4.8px,0) rotate(-2deg)' },
      { offset: .34, transform: 'translate3d(-.8px,-5.6px,0) rotate(-.25deg)' },
      { offset: .5, transform: 'translate3d(-5.2px,-4.9px,0) rotate(-2.15deg)' },
      { offset: .66, transform: 'translate3d(-1.1px,-5.7px,0) rotate(-.4deg)' },
      { offset: .82, transform: 'translate3d(-4.5px,-4.6px,0) rotate(-1.8deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
  }),
  'audit-dossier': Object.freeze({
    eyes: frames(
      { offset: 0, transform: 'translate3d(0,0,0)' },
      { offset: .2, transform: 'translate3d(-3.2px,.55px,0)' },
      { offset: .48, transform: 'translate3d(.2px,.55px,0)' },
      { offset: .76, transform: 'translate3d(2.7px,.45px,0)' },
      { offset: 1, transform: 'translate3d(0,0,0)' },
    ),
    'right-arm': frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .34, transform: 'translate3d(-3.9px,-4.6px,0) rotate(-1.8deg)' },
      { offset: .68, transform: 'translate3d(-3.4px,-4.1px,0) rotate(-1.5deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    prop: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .38, transform: 'translate3d(-2.8px,-3.3px,0) rotate(-1deg)' },
      { offset: .7, transform: 'translate3d(-2.4px,-3px,0) rotate(-.85deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
  }),
  'read-dossier': Object.freeze({
    eyes: frames(
      { offset: 0, transform: 'translate3d(0,0,0)' },
      { offset: .2, transform: 'translate3d(-3.1px,.65px,0)' },
      { offset: .48, transform: 'translate3d(-.4px,.55px,0)' },
      { offset: .74, transform: 'translate3d(2.8px,.45px,0)' },
      { offset: 1, transform: 'translate3d(0,0,0)' },
    ),
    'right-arm': frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .4, transform: 'translate3d(-3.5px,-4.1px,0) rotate(-1.4deg)' },
      { offset: .74, transform: 'translate3d(-3px,-3.7px,0) rotate(-1.15deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    prop: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .42, transform: 'translate3d(-2.6px,-3px,0) rotate(-.85deg)' },
      { offset: .74, transform: 'translate3d(-2.2px,-2.7px,0) rotate(-.72deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
  }),
  'read-book': Object.freeze({
    // strategy-book.webp no tolera desplazar brazos sin que el recorte se vea
    // como un tic. La lectura se hace perceptible con los ojos; el parpadeo
    // visual se pinta por CSS sin comprimir ni despegar esta capa raster.
    eyes: frames(
      { offset: 0, transform: 'translate3d(0,0,0)' },
      { offset: .2, transform: 'translate3d(-2.3px,.28px,0)' },
      { offset: .43, transform: 'translate3d(-.25px,.25px,0)' },
      { offset: .58, transform: 'translate3d(-.15px,.18px,0)' },
      { offset: .78, transform: 'translate3d(2.1px,.2px,0)' },
      { offset: 1, transform: 'translate3d(0,0,0)' },
    ),
  }),
  'board-move': Object.freeze({
    // La escena de partida debe leerse como "pensando": mira el tablero y
    // sube claramente la mano derecha hacia la barbilla antes de devolverla.
    eyes: frames(
      { offset: 0, transform: 'translate3d(0,0,0)' },
      { offset: .2, transform: 'translate3d(3px,.9px,0)' },
      { offset: .56, transform: 'translate3d(2.6px,.75px,0)' },
      { offset: .78, transform: 'translate3d(-1.8px,.35px,0)' },
      { offset: 1, transform: 'translate3d(0,0,0)' },
    ),
    'right-arm': frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .26, transform: 'translate3d(-5.4px,-8.2px,0) rotate(-2.8deg)' },
      { offset: .58, transform: 'translate3d(-5.1px,-8.7px,0) rotate(-2.5deg)' },
      { offset: .78, transform: 'translate3d(-3.6px,-5.2px,0) rotate(-1.5deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
  }),
  sip: Object.freeze({
    // In the surviving morning-coffee render the mug is on screen-right.
    // Raise that hand and the mug toward the mouth; the previous left-arm
    // motion was physically moving the empty hand while the coffee stayed put.
    eyes: frames(
      { offset: 0, transform: 'translate3d(0,0,0)' },
      { offset: .34, transform: 'translate3d(2.2px,.35px,0)' },
      { offset: .74, transform: 'translate3d(2px,.3px,0)' },
      { offset: 1, transform: 'translate3d(0,0,0)' },
    ),
    head: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .4, transform: 'translate3d(1px,1.2px,0) rotate(.7deg)' },
      { offset: .76, transform: 'translate3d(.9px,1px,0) rotate(.6deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    'right-arm': frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .34, transform: 'translate3d(-5.5px,-8.1px,0) rotate(-2.4deg)' },
      { offset: .72, transform: 'translate3d(-5.1px,-7.7px,0) rotate(-2.15deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    prop: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .34, transform: 'translate3d(-5.9px,-8.8px,0) rotate(-2deg)' },
      { offset: .72, transform: 'translate3d(-5.5px,-8.3px,0) rotate(-1.8deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
  }),
  'sip-night': Object.freeze({
    'right-arm': frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .34, transform: 'translate3d(-5.6px,-7.6px,0) rotate(-2.5deg)' },
      { offset: .72, transform: 'translate3d(-5.1px,-7.1px,0) rotate(-2.2deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    prop: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .36, transform: 'translate3d(-6px,-8.4px,0) rotate(-2.1deg)' },
      { offset: .72, transform: 'translate3d(-5.6px,-7.9px,0) rotate(-1.8deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
  }),
  bite: Object.freeze({
    'left-arm': frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .38, transform: 'translate3d(1.7px,-5.5px,0) rotate(1.1deg)' },
      { offset: .72, transform: 'translate3d(1.5px,-5.1px,0) rotate(.95deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    'right-arm': frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .38, transform: 'translate3d(-1.7px,-5.5px,0) rotate(-1.1deg)' },
      { offset: .72, transform: 'translate3d(-1.5px,-5.1px,0) rotate(-.95deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    prop: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .4, transform: 'translate3d(0,-7.8px,0) rotate(0deg)' },
      { offset: .72, transform: 'translate3d(0,-7.1px,0) rotate(0deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
  }),
  doze: Object.freeze({
    head: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .44, transform: 'translate3d(1.8px,4.6px,0) rotate(2.1deg)' },
      { offset: .76, transform: 'translate3d(1.5px,4px,0) rotate(1.75deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    eyes: frames(
      { offset: 0, transform: 'translate3d(0,0,0) scaleY(1)' },
      { offset: .42, transform: 'translate3d(0,.8px,0) scaleY(.45)' },
      { offset: .76, transform: 'translate3d(0,.65px,0) scaleY(.6)' },
      { offset: 1, transform: 'translate3d(0,0,0) scaleY(1)' },
    ),
  }),
  speak: Object.freeze({
    head: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .36, transform: 'translate3d(-1.2px,-1.3px,0) rotate(-.8deg)' },
      { offset: .74, transform: 'translate3d(-1px,-1.1px,0) rotate(-.65deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    eyes: frames(
      { offset: 0, transform: 'translate3d(0,0,0)' },
      { offset: .32, transform: 'translate3d(-2.2px,0,0)' },
      { offset: .72, transform: 'translate3d(-2px,0,0)' },
      { offset: 1, transform: 'translate3d(0,0,0)' },
    ),
    'right-arm': frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .4, transform: 'translate3d(-2.7px,-4px,0) rotate(-1.7deg)' },
      { offset: .72, transform: 'translate3d(-2.4px,-3.6px,0) rotate(-1.45deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
  }),
});

const GESTURE_DURATIONS = Object.freeze({
  idle: 2200,
  'write-notes': 3600,
  'audit-dossier': 3800,
  'read-dossier': 3900,
  'read-book': 4300,
  'board-move': 3900,
  sip: 2600,
  'sip-night': 2900,
  bite: 3000,
  doze: 4000,
  speak: 2100,
});

const PART_DELAYS = Object.freeze({
  idle: Object.freeze({ eyes: 0 }),
  'write-notes': Object.freeze({ eyes: 0, 'right-arm': 260 }),
  'audit-dossier': Object.freeze({ eyes: 0, 'right-arm': 340, prop: 420 }),
  'read-dossier': Object.freeze({ eyes: 0, 'right-arm': 360, prop: 430 }),
  'read-book': Object.freeze({ eyes: 0 }),
  'board-move': Object.freeze({ eyes: 0, 'right-arm': 240 }),
  sip: Object.freeze({ eyes: 0, head: 100, 'right-arm': 220, prop: 220 }),
  'sip-night': Object.freeze({ 'right-arm': 60, prop: 120 }),
  bite: Object.freeze({ 'left-arm': 0, 'right-arm': 0, prop: 100 }),
  doze: Object.freeze({ head: 0, eyes: 180 }),
  speak: Object.freeze({ head: 0, eyes: 100, 'right-arm': 240 }),
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
    ? 400 + Math.round(Math.random() * 350)
    : 8_000 + Math.round(Math.random() * 5_000);
}

export function matthiasGestureTiming({ gesture = 'idle', part = 'eyes', speaking = false } = {}) {
  return {
    duration: speaking ? 2100 : (GESTURE_DURATIONS[gesture] || GESTURE_DURATIONS.idle),
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
      root.dataset.gestureProfile = 'deliberate';
      root.dataset.gestureCount = String((Number(root.dataset.gestureCount) || 0) + 1);

      Object.entries(motion).forEach(([part, keyframes]) => {
        const node = root.querySelector(`[data-matthias-art-part="${part}"]`);
        if (!node || typeof node.animate !== 'function') return;
        const timing = matthiasGestureTiming({ gesture, part, speaking });
        const animation = node.animate(keyframes, {
          ...timing,
          iterations: 1,
          easing: 'cubic-bezier(.4,0,.2,1)',
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
      timer = window.setTimeout(runGesture, 160);
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
      data-gesture-profile="deliberate"
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
