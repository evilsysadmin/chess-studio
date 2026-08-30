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

function frames(...items) {
  return items;
}

/*
 * These are intentionally restrained. Every moving layer is a masked copy of
 * the canonical bitmap sitting over the same static bitmap, so large opposing
 * translations reveal the original body part underneath and read as a twitch.
 * Natural motion here means: one dominant direction, slow settle, tiny return.
 */
const MOTIONS = Object.freeze({
  glance: Object.freeze({
    eyes: frames(
      { offset: 0, transform: 'translate3d(0,0,0) scaleY(1)' },
      { offset: .34, transform: 'translate3d(2.2px,-.1px,0) scaleY(.97)' },
      { offset: .72, transform: 'translate3d(2px,-.1px,0) scaleY(.98)' },
      { offset: 1, transform: 'translate3d(0,0,0) scaleY(1)' },
    ),
    head: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .42, transform: 'translate3d(.6px,-.5px,0) rotate(.45deg)' },
      { offset: .76, transform: 'translate3d(.5px,-.4px,0) rotate(.38deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
  }),
  inspect: Object.freeze({
    eyes: frames(
      { offset: 0, transform: 'translate3d(0,0,0)' },
      { offset: .24, transform: 'translate3d(-2.2px,.2px,0)' },
      { offset: .72, transform: 'translate3d(-2px,.2px,0)' },
      { offset: 1, transform: 'translate3d(0,0,0)' },
    ),
    head: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .3, transform: 'translate3d(-.9px,-1px,0) rotate(-.65deg)' },
      { offset: .74, transform: 'translate3d(-.8px,-.9px,0) rotate(-.58deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    'right-arm': frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .28, transform: 'translate3d(-1.7px,-3.5px,0) rotate(-1.25deg)' },
      { offset: .44, transform: 'translate3d(-1.1px,-3.9px,0) rotate(-.8deg)' },
      { offset: .6, transform: 'translate3d(-1.9px,-3.7px,0) rotate(-1.35deg)' },
      { offset: .76, transform: 'translate3d(-1.3px,-3.5px,0) rotate(-.9deg)' },
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
  bite: Object.freeze({
    eyes: frames(
      { offset: 0, transform: 'translate3d(0,0,0) scaleY(1)' },
      { offset: .4, transform: 'translate3d(0,.3px,0) scaleY(.9)' },
      { offset: .72, transform: 'translate3d(0,.2px,0) scaleY(.94)' },
      { offset: 1, transform: 'translate3d(0,0,0) scaleY(1)' },
    ),
    head: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .42, transform: 'translate3d(0,1.1px,0) rotate(.3deg)' },
      { offset: .74, transform: 'translate3d(0,1px,0) rotate(.25deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    'left-arm': frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .36, transform: 'translate3d(1.5px,-3.2px,0) rotate(1.3deg)' },
      { offset: .72, transform: 'translate3d(1.4px,-3px,0) rotate(1.15deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    'right-arm': frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .36, transform: 'translate3d(-1.5px,-3.2px,0) rotate(-1.3deg)' },
      { offset: .72, transform: 'translate3d(-1.4px,-3px,0) rotate(-1.15deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    prop: frames(
      { offset: 0, transform: 'translate3d(0,0,0) scale(1)' },
      { offset: .38, transform: 'translate3d(0,-3.5px,0) scale(1.01)' },
      { offset: .72, transform: 'translate3d(0,-3.2px,0) scale(1.008)' },
      { offset: 1, transform: 'translate3d(0,0,0) scale(1)' },
    ),
  }),
  read: Object.freeze({
    eyes: frames(
      { offset: 0, transform: 'translate3d(0,0,0)' },
      { offset: .28, transform: 'translate3d(-2px,.3px,0)' },
      { offset: .58, transform: 'translate3d(-.5px,.25px,0)' },
      { offset: .78, transform: 'translate3d(1.4px,.2px,0)' },
      { offset: 1, transform: 'translate3d(0,0,0)' },
    ),
    head: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .36, transform: 'translate3d(-.7px,.8px,0) rotate(-.5deg)' },
      { offset: .78, transform: 'translate3d(-.5px,.6px,0) rotate(-.4deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    'right-arm': frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .42, transform: 'translate3d(-1.4px,-2.6px,0) rotate(-1deg)' },
      { offset: .76, transform: 'translate3d(-1.2px,-2.4px,0) rotate(-.85deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    prop: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .42, transform: 'translate3d(-1px,-1.5px,0) rotate(-.55deg)' },
      { offset: .76, transform: 'translate3d(-.9px,-1.4px,0) rotate(-.48deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
  }),
  doze: Object.freeze({
    head: frames(
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .48, transform: 'translate3d(.9px,2.4px,0) rotate(1.2deg)' },
      { offset: .8, transform: 'translate3d(.8px,2.1px,0) rotate(1deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    eyes: frames(
      { offset: 0, transform: 'translate3d(0,0,0) scaleY(1)' },
      { offset: .48, transform: 'translate3d(0,.4px,0) scaleY(.74)' },
      { offset: .8, transform: 'translate3d(0,.35px,0) scaleY(.8)' },
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
  glance: 1800,
  inspect: 2600,
  sip: 2300,
  bite: 2300,
  read: 2500,
  doze: 2800,
  speak: 1900,
});

const PART_DELAYS = Object.freeze({
  glance: Object.freeze({ eyes: 0, head: 160 }),
  inspect: Object.freeze({ eyes: 0, head: 140, 'right-arm': 320 }),
  sip: Object.freeze({ eyes: 0, head: 120, 'left-arm': 280, prop: 280 }),
  bite: Object.freeze({ eyes: 0, head: 120, 'left-arm': 260, 'right-arm': 260, prop: 300 }),
  read: Object.freeze({ eyes: 0, head: 180, 'right-arm': 480, prop: 480 }),
  doze: Object.freeze({ head: 0, eyes: 180 }),
  speak: Object.freeze({ head: 0, eyes: 120, 'right-arm': 300 }),
});

export function matthiasGestureName({ scene = '', speaking = false } = {}) {
  if (speaking) return 'speak';
  const family = matthiasSceneFamily(scene);
  if (family === 'coffee') return 'sip';
  if (family === 'lunch') return 'bite';
  if (family === 'reading') return 'read';
  if (family === 'ops') return 'inspect';
  if (family === 'sleep') return 'doze';
  return 'glance';
}

export function matthiasGestureParts({ scene = '', speaking = false } = {}) {
  return Object.keys(MOTIONS[matthiasGestureName({ scene, speaking })] || {});
}

export function matthiasGestureDelay({ first = false } = {}) {
  return first
    ? 1000 + Math.round(Math.random() * 700)
    : 8000 + Math.round(Math.random() * 5000);
}

export function matthiasGestureTiming({ gesture = 'glance', part = 'eyes', speaking = false } = {}) {
  return {
    duration: speaking ? 1900 : (GESTURE_DURATIONS[gesture] || GESTURE_DURATIONS.glance),
    delay: PART_DELAYS[gesture]?.[part] || 0,
  };
}

function safeFinished(animation) {
  return animation?.finished?.catch?.(() => undefined) || Promise.resolve();
}

export default function MatthiasLayeredArt({ avatar, scene = 'base', speaking = false, reducedMotion = false }) {
  const rootRef = useRef(null);
  const family = useMemo(() => matthiasSceneFamily(scene), [scene]);
  const gesture = useMemo(() => matthiasGestureName({ scene, speaking }), [scene, speaking]);

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
      const motion = MOTIONS[gesture] || MOTIONS.glance;
      const running = [];
      root.dataset.gestureState = 'acting';
      root.dataset.gesture = gesture;
      root.dataset.gestureProfile = 'natural';
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
      data-gesture={gesture}
      data-gesture-state={reducedMotion ? 'reduced' : 'waiting'}
      data-gesture-profile="natural"
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