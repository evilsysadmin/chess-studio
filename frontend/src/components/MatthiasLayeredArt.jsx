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
 * provide articulation. Gestures are selected by the actual Home activity so
 * one shared render does not pretend to read, write and play in the same way.
 */
const MOTIONS = Object.freeze({
  idle: Object.freeze({
    eyes: frames(
      { offset: 0, transform: 'translate3d(0,0,0) scaleY(1)' },
      { offset: .3, transform: 'translate3d(1.8px,0,0) scaleY(1)' },
      { offset: .52, transform: 'translate3d(1.6px,.2px,0) scaleY(.72)' },
      { offset: .68, transform: 'translate3d(1.6px,0,0) scaleY(1)' },
      { offset: 1, transform: 'translate3d(0,0,0) scaleY(1)' },
    ),
  }),
  'write-notes': Object.freeze({
    eyes: frames(
      { offset: 0, transform: 'translate3d(0,0,0)' },
      { offset: .28, transform: 'translate3d(-2.4px,.8px,0)' },
      { offset: .76, transform: 'translate3d(-2.1px,.7px,0)' },
      { offset: 1, transform: 'translate3d(0,0,0)' },
    ),
    'right-arm': frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .22, transform: 'translate3d(-2.8px,-3.4px,0) rotate(-1.2deg)' },
      { offset: .38, transform: 'translate3d(-.7px,-3.9px,0) rotate(-.25deg)' },
      { offset: .54, transform: 'translate3d(-3.2px,-3.5px,0) rotate(-1.35deg)' },
      { offset: .7, transform: 'translate3d(-1px,-4px,0) rotate(-.4deg)' },
      { offset: .84, transform: 'translate3d(-2.6px,-3.3px,0) rotate(-1.05deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
  }),
  'audit-dossier': Object.freeze({
    eyes: frames(
      { offset: 0, transform: 'translate3d(0,0,0)' },
      { offset: .22, transform: 'translate3d(-2.7px,.45px,0)' },
      { offset: .5, transform: 'translate3d(.2px,.45px,0)' },
      { offset: .76, transform: 'translate3d(2px,.35px,0)' },
      { offset: 1, transform: 'translate3d(0,0,0)' },
    ),
    'right-arm': frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .35, transform: 'translate3d(-2.1px,-3.1px,0) rotate(-1deg)' },
      { offset: .68, transform: 'translate3d(-1.8px,-2.7px,0) rotate(-.8deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    prop: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .38, transform: 'translate3d(-1.7px,-2px,0) rotate(-.6deg)' },
      { offset: .7, transform: 'translate3d(-1.5px,-1.8px,0) rotate(-.5deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
  }),
  'read-dossier': Object.freeze({
    eyes: frames(
      { offset: 0, transform: 'translate3d(0,0,0)' },
      { offset: .2, transform: 'translate3d(-2.6px,.5px,0)' },
      { offset: .48, transform: 'translate3d(-.4px,.45px,0)' },
      { offset: .74, transform: 'translate3d(2.1px,.35px,0)' },
      { offset: 1, transform: 'translate3d(0,0,0)' },
    ),
    'right-arm': frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .4, transform: 'translate3d(-1.8px,-2.5px,0) rotate(-.8deg)' },
      { offset: .74, transform: 'translate3d(-1.5px,-2.2px,0) rotate(-.65deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    prop: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .42, transform: 'translate3d(-1.4px,-1.7px,0) rotate(-.45deg)' },
      { offset: .74, transform: 'translate3d(-1.2px,-1.55px,0) rotate(-.38deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
  }),
  'read-book': Object.freeze({
    // strategy-book.webp no tolera desplazar brazos sin que el recorte se vea
    // como un tic. La lectura usa sólo una barrida ocular lenta y mínima.
    eyes: frames(
      { offset: 0, transform: 'translate3d(0,0,0)' },
      { offset: .24, transform: 'translate3d(-1.15px,.18px,0)' },
      { offset: .5, transform: 'translate3d(-.15px,.16px,0)' },
      { offset: .76, transform: 'translate3d(1px,.12px,0)' },
      { offset: 1, transform: 'translate3d(0,0,0)' },
    ),
  }),
  'board-move': Object.freeze({
    eyes: frames(
      { offset: 0, transform: 'translate3d(0,0,0)' },
      { offset: .3, transform: 'translate3d(2.2px,.7px,0)' },
      { offset: .72, transform: 'translate3d(2px,.6px,0)' },
      { offset: 1, transform: 'translate3d(0,0,0)' },
    ),
    'right-arm': frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .34, transform: 'translate3d(-3.6px,-4.2px,0) rotate(-1.6deg)' },
      { offset: .56, transform: 'translate3d(-1.4px,-5px,0) rotate(-.5deg)' },
      { offset: .76, transform: 'translate3d(-3px,-3.8px,0) rotate(-1.25deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
  }),
  sip: Object.freeze({
    eyes: frames(
      { offset: 0, transform: 'translate3d(0,0,0)' },
      { offset: .34, transform: 'translate3d(-1.5px,.3px,0) scaleY(.96)' },
      { offset: .74, transform: 'translate3d(-1.4px,.3px,0) scaleY(.97)' },
      { offset: 1, transform: 'translate3d(0,0,0)' },
    ),
    head: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .4, transform: 'translate3d(-.7px,1px,0) rotate(-.55deg)' },
      { offset: .76, transform: 'translate3d(-.6px,.9px,0) rotate(-.48deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    'left-arm': frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .34, transform: 'translate3d(1.6px,-3.8px,0) rotate(1.7deg)' },
      { offset: .72, transform: 'translate3d(1.5px,-3.6px,0) rotate(1.55deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    prop: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .34, transform: 'translate3d(1.8px,-4.1px,0) rotate(1.35deg)' },
      { offset: .72, transform: 'translate3d(1.7px,-3.9px,0) rotate(1.2deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
  }),
  'sip-night': Object.freeze({
    'right-arm': frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .34, transform: 'translate3d(-4.7px,-6.5px,0) rotate(-2.1deg)' },
      { offset: .72, transform: 'translate3d(-4.3px,-6.1px,0) rotate(-1.85deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    prop: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .36, transform: 'translate3d(-5.1px,-7.2px,0) rotate(-1.8deg)' },
      { offset: .72, transform: 'translate3d(-4.7px,-6.7px,0) rotate(-1.55deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
  }),
  bite: Object.freeze({
    'left-arm': frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .38, transform: 'translate3d(1.2px,-4.8px,0) rotate(.8deg)' },
      { offset: .72, transform: 'translate3d(1.1px,-4.4px,0) rotate(.7deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    'right-arm': frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .38, transform: 'translate3d(-1.2px,-4.8px,0) rotate(-.8deg)' },
      { offset: .72, transform: 'translate3d(-1.1px,-4.4px,0) rotate(-.7deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    prop: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .4, transform: 'translate3d(0,-6.8px,0) rotate(0deg)' },
      { offset: .72, transform: 'translate3d(0,-6.2px,0) rotate(0deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
  }),
  doze: Object.freeze({
    head: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .44, transform: 'translate3d(1.5px,3.9px,0) rotate(1.8deg)' },
      { offset: .76, transform: 'translate3d(1.25px,3.35px,0) rotate(1.5deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    eyes: frames(
      { offset: 0, transform: 'translate3d(0,0,0) scaleY(1)' },
      { offset: .42, transform: 'translate3d(0,.7px,0) scaleY(.52)' },
      { offset: .76, transform: 'translate3d(0,.55px,0) scaleY(.64)' },
      { offset: 1, transform: 'translate3d(0,0,0) scaleY(1)' },
    ),
  }),
  speak: Object.freeze({
    head: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .36, transform: 'translate3d(-.8px,-.9px,0) rotate(-.55deg)' },
      { offset: .74, transform: 'translate3d(-.6px,-.7px,0) rotate(-.42deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    eyes: frames(
      { offset: 0, transform: 'translate3d(0,0,0)' },
      { offset: .32, transform: 'translate3d(-1.7px,0,0)' },
      { offset: .72, transform: 'translate3d(-1.5px,0,0)' },
      { offset: 1, transform: 'translate3d(0,0,0)' },
    ),
    'right-arm': frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .4, transform: 'translate3d(-1.6px,-2.8px,0) rotate(-1.1deg)' },
      { offset: .72, transform: 'translate3d(-1.4px,-2.5px,0) rotate(-.95deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
  }),
});

const GESTURE_DURATIONS = Object.freeze({
  idle: 2000,
  'write-notes': 3300,
  'audit-dossier': 3400,
  'read-dossier': 3500,
  'read-book': 4600,
  'board-move': 3200,
  sip: 2300,
  'sip-night': 2600,
  bite: 2800,
  doze: 3800,
  speak: 1900,
});

const PART_DELAYS = Object.freeze({
  idle: Object.freeze({ eyes: 0 }),
  'write-notes': Object.freeze({ eyes: 0, 'right-arm': 300 }),
  'audit-dossier': Object.freeze({ eyes: 0, 'right-arm': 420, prop: 500 }),
  'read-dossier': Object.freeze({ eyes: 0, 'right-arm': 480, prop: 520 }),
  'read-book': Object.freeze({ eyes: 0 }),
  'board-move': Object.freeze({ eyes: 0, 'right-arm': 360 }),
  sip: Object.freeze({ eyes: 0, head: 120, 'left-arm': 280, prop: 280 }),
  'sip-night': Object.freeze({ 'right-arm': 80, prop: 160 }),
  bite: Object.freeze({ 'left-arm': 0, 'right-arm': 0, prop: 120 }),
  doze: Object.freeze({ head: 0, eyes: 220 }),
  speak: Object.freeze({ head: 0, eyes: 120, 'right-arm': 300 }),
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
    ? 550 + Math.round(Math.random() * 400)
    : 12_000 + Math.round(Math.random() * 6_000);
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
      timer = window.setTimeout(runGesture, 180);
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
      style={{ '--matthias-rig-image': `url(${avatar})` }}
    >
      <img
        className="matthias-art-rig__base"
        src={avatar}
        alt=""
        draggable="false"
        data-matthias-canonical-art="true"
      />
      {PARTS.map((part) => (
        <span
          key={part}
          className={`matthias-art-rig__part matthias-art-rig__part--${part}`}
          data-matthias-art-part={part}
        />
      ))}
    </span>
  );
}