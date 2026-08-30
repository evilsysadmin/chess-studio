import { useEffect, useRef } from 'react';
import './MatthiasCoffeeSteam.css';

const WISP_MOTIONS = Object.freeze([
  Object.freeze({ duration: 3200, delay: 0, x: 3 }),
  Object.freeze({ duration: 3900, delay: -1300, x: -2 }),
  Object.freeze({ duration: 3500, delay: -2350, x: 2 }),
]);

export function matthiasCoffeeSteamSide(scene = '') {
  const key = String(scene || '').toLowerCase();
  if (!key || /beer-break/.test(key)) return null;
  if (/night-coffee/.test(key) || key === 'night') return 'right';
  if (/morning-coffee|breakfast-news/.test(key) || key === 'coffee') return 'left';
  return null;
}

export function matthiasCoffeeSteamTiming(index = 0) {
  return WISP_MOTIONS[index] || WISP_MOTIONS[0];
}

export default function MatthiasCoffeeSteam({ scene = '', reducedMotion = false }) {
  const rootRef = useRef(null);
  const side = matthiasCoffeeSteamSide(scene);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !side || reducedMotion) return undefined;

    const animations = [...root.querySelectorAll('[data-matthias-coffee-wisp]')].map((node, index) => {
      if (typeof node.animate !== 'function') return null;
      const motion = matthiasCoffeeSteamTiming(index);
      return node.animate([
        { offset: 0, opacity: 0, transform: 'translate3d(0,6px,0) scaleX(.78) rotate(-5deg)' },
        { offset: .2, opacity: .58, transform: `translate3d(${motion.x * .25}px,1px,0) scaleX(.9) rotate(-1deg)` },
        { offset: .52, opacity: .42, transform: `translate3d(${motion.x}px,-10px,0) scaleX(1.12) rotate(4deg)` },
        { offset: .8, opacity: .18, transform: `translate3d(${-motion.x * .55}px,-20px,0) scaleX(.94) rotate(-3deg)` },
        { offset: 1, opacity: 0, transform: `translate3d(${motion.x * .35}px,-28px,0) scaleX(1.18) rotate(5deg)` },
      ], {
        duration: motion.duration,
        delay: motion.delay,
        iterations: Infinity,
        easing: 'ease-in-out',
      });
    }).filter(Boolean);

    root.dataset.steamMotion = animations.length ? 'active' : 'unsupported';
    return () => animations.forEach((animation) => animation.cancel());
  }, [reducedMotion, side]);

  if (!side || reducedMotion) return null;

  return (
    <span
      ref={rootRef}
      className={`matthias-coffee-steam matthias-coffee-steam--${side}`}
      data-matthias-coffee-steam="true"
      data-steam-side={side}
      data-steam-motion="waiting"
      aria-hidden="true"
    >
      <span data-matthias-coffee-wisp="true" className="matthias-coffee-steam__wisp matthias-coffee-steam__wisp--1" />
      <span data-matthias-coffee-wisp="true" className="matthias-coffee-steam__wisp matthias-coffee-steam__wisp--2" />
      <span data-matthias-coffee-wisp="true" className="matthias-coffee-steam__wisp matthias-coffee-steam__wisp--3" />
    </span>
  );
}
