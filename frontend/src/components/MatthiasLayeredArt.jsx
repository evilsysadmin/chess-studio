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

const MOTIONS = Object.freeze({
  glance: Object.freeze({
    eyes: frames(
      { transform: 'translate3d(0,0,0) scaleY(1)' },
      { transform: 'translate3d(3.8px,-.3px,0) scaleY(.94)' },
      { transform: 'translate3d(-2.8px,.2px,0) scaleY(.98)' },
      { transform: 'translate3d(0,0,0) scaleY(1)' },
    ),
    head: frames(
      { transform: 'translate3d(0,0,0) rotate(0deg)' },
      { transform: 'translate3d(1.5px,-1.2px,0) rotate(1deg)' },
      { transform: 'translate3d(-.7px,-.4px,0) rotate(-.35deg)' },
      { transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
  }),
  inspect: Object.freeze({
    head: frames(
      { transform: 'translate3d(0,0,0) rotate(0deg)' },
      { transform: 'translate3d(-2.6px,-2.8px,0) rotate(-1.7deg)' },
      { transform: 'translate3d(1.4px,-1.4px,0) rotate(.8deg)' },
      { transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    eyes: frames(
      { transform: 'translate3d(0,0,0)' },
      { transform: 'translate3d(-3.8px,.2px,0)' },
      { transform: 'translate3d(2.8px,-.1px,0)' },
      { transform: 'translate3d(-1.4px,.1px,0)' },
      { transform: 'translate3d(0,0,0)' },
    ),
    'right-arm': frames(
      { transform: 'translate3d(0,0,0) rotate(0deg)' },
      { transform: 'translate3d(-3.8px,-6.5px,0) rotate(-3.7deg)' },
      { transform: 'translate3d(2.3px,-5.2px,0) rotate(2.4deg)' },
      { transform: 'translate3d(-2.7px,-4.6px,0) rotate(-2.6deg)' },
      { transform: 'translate3d(1.2px,-2.2px,0) rotate(1.1deg)' },
      { transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    prop: frames(
      { transform: 'translate3d(0,0,0) rotate(0deg)' },
      { transform: 'translate3d(-2.4px,-3.2px,0) rotate(-1.6deg)' },
      { transform: 'translate3d(1.4px,-2.2px,0) rotate(.9deg)' },
      { transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
  }),
  sip: Object.freeze({
    head: frames(
      { transform: 'translate3d(0,0,0) rotate(0deg)' },
      { transform: 'translate3d(-1.6px,2.2px,0) rotate(-1.2deg)' },
      { transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    eyes: frames(
      { transform: 'translate3d(0,0,0)' },
      { transform: 'translate3d(-3px,.8px,0) scaleY(.92)' },
      { transform: 'translate3d(0,0,0)' },
    ),
    'left-arm': frames(
      { transform: 'translate3d(0,0,0) rotate(0deg)' },
      { transform: 'translate3d(3.2px,-7.2px,0) rotate(4.2deg)' },
      { transform: 'translate3d(1.6px,-5.8px,0) rotate(2.8deg)' },
      { transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    prop: frames(
      { transform: 'translate3d(0,0,0) rotate(0deg)' },
      { transform: 'translate3d(4px,-8px,0) rotate(3.2deg)' },
      { transform: 'translate3d(2px,-6px,0) rotate(2deg)' },
      { transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
  }),
  bite: Object.freeze({
    head: frames(
      { transform: 'translate3d(0,0,0) rotate(0deg)' },
      { transform: 'translate3d(0,2.6px,0) rotate(.7deg)' },
      { transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    eyes: frames(
      { transform: 'translate3d(0,0,0) scaleY(1)' },
      { transform: 'translate3d(0,.7px,0) scaleY(.82)' },
      { transform: 'translate3d(0,0,0) scaleY(1)' },
    ),
    'left-arm': frames(
      { transform: 'translate3d(0,0,0) rotate(0deg)' },
      { transform: 'translate3d(3.6px,-5.8px,0) rotate(3.2deg)' },
      { transform: 'translate3d(1.7px,-3.8px,0) rotate(1.6deg)' },
      { transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    'right-arm': frames(
      { transform: 'translate3d(0,0,0) rotate(0deg)' },
      { transform: 'translate3d(-3.6px,-5.8px,0) rotate(-3.2deg)' },
      { transform: 'translate3d(-1.7px,-3.8px,0) rotate(-1.6deg)' },
      { transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    prop: frames(
      { transform: 'translate3d(0,0,0) scale(1)' },
      { transform: 'translate3d(0,-7.2px,0) scale(1.024)' },
      { transform: 'translate3d(0,-4px,0) scale(1.014)' },
      { transform: 'translate3d(0,0,0) scale(1)' },
    ),
  }),
  read: Object.freeze({
    eyes: frames(
      { transform: 'translate3d(0,0,0)' },
      { transform: 'translate3d(-3.6px,.7px,0)' },
      { transform: 'translate3d(3px,.3px,0)' },
      { transform: 'translate3d(-1.6px,.5px,0)' },
      { transform: 'translate3d(0,0,0)' },
    ),
    head: frames(
      { transform: 'translate3d(0,0,0) rotate(0deg)' },
      { transform: 'translate3d(-1.7px,1.8px,0) rotate(-1.2deg)' },
      { transform: 'translate3d(1.2px,.9px,0) rotate(.7deg)' },
      { transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    'right-arm': frames(
      { transform: 'translate3d(0,0,0) rotate(0deg)' },
      { transform: 'translate3d(-3.2px,-4.8px,0) rotate(-2.7deg)' },
      { transform: 'translate3d(1.3px,-2.6px,0) rotate(1.2deg)' },
      { transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    prop: frames(
      { transform: 'translate3d(0,0,0) rotate(0deg)' },
      { transform: 'translate3d(-2.8px,-3.2px,0) rotate(-1.8deg)' },
      { transform: 'translate3d(1.8px,-1.4px,0) rotate(.9deg)' },
      { transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
  }),
  doze: Object.freeze({
    head: frames(
      { transform: 'translate3d(0,0,0) rotate(0deg)' },
      { transform: 'translate3d(2.2px,4.4px,0) rotate(2.4deg)' },
      { transform: 'translate3d(1px,2.4px,0) rotate(1.1deg)' },
      { transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    eyes: frames(
      { transform: 'translate3d(0,0,0) scaleY(1)' },
      { transform: 'translate3d(0,1px,0) scaleY(.62)' },
      { transform: 'translate3d(0,.4px,0) scaleY(.82)' },
      { transform: 'translate3d(0,0,0) scaleY(1)' },
    ),
  }),
  speak: Object.freeze({
    head: frames(
      { transform: 'translate3d(0,0,0) rotate(0deg)' },
      { transform: 'translate3d(-2.2px,-2.8px,0) rotate(-1.4deg)' },
      { transform: 'translate3d(1.8px,-1.5px,0) rotate(.9deg)' },
      { transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
    eyes: frames(
      { transform: 'translate3d(0,0,0)' },
      { transform: 'translate3d(-3.4px,0,0)' },
      { transform: 'translate3d(2.4px,0,0)' },
      { transform: 'translate3d(0,0,0)' },
    ),
    'right-arm': frames(
      { transform: 'translate3d(0,0,0) rotate(0deg)' },
      { transform: 'translate3d(-3.5px,-5.2px,0) rotate(-3deg)' },
      { transform: 'translate3d(1.5px,-2.8px,0) rotate(1.4deg)' },
      { transform: 'translate3d(0,0,0) rotate(0deg)' },
    ),
  }),
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
    ? 450 + Math.round(Math.random() * 450)
    : 4200 + Math.round(Math.random() * 2800);
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
      root.dataset.gestureCount = String((Number(root.dataset.gestureCount) || 0) + 1);

      Object.entries(motion).forEach(([part, keyframes], index) => {
        const node = root.querySelector(`[data-matthias-art-part="${part}"]`);
        if (!node || typeof node.animate !== 'function') return;
        const baseDuration = gesture === 'inspect' ? 1750 : gesture === 'read' ? 1550 : 1400;
        const animation = node.animate(keyframes, {
          duration: speaking ? 920 : baseDuration + (index * 90),
          iterations: 1,
          easing: 'cubic-bezier(.2,.75,.2,1)',
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
      timer = window.setTimeout(runGesture, 120);
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
