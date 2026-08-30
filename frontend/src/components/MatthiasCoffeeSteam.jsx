import './MatthiasCoffeeSteam.css';

export function matthiasCoffeeSteamSide(scene = '') {
  const key = String(scene || '').toLowerCase();
  if (!key || /beer-break/.test(key)) return null;
  if (/night-coffee/.test(key) || key === 'night') return 'right';
  if (/morning-coffee|breakfast-news/.test(key) || key === 'coffee') return 'left';
  return null;
}

export default function MatthiasCoffeeSteam({ scene = '', reducedMotion = false }) {
  const side = matthiasCoffeeSteamSide(scene);
  if (!side || reducedMotion) return null;

  return (
    <span
      className={`matthias-coffee-steam matthias-coffee-steam--${side}`}
      data-matthias-coffee-steam="true"
      data-steam-side={side}
      aria-hidden="true"
    >
      <span data-matthias-coffee-wisp="true" className="matthias-coffee-steam__wisp matthias-coffee-steam__wisp--1" />
      <span data-matthias-coffee-wisp="true" className="matthias-coffee-steam__wisp matthias-coffee-steam__wisp--2" />
      <span data-matthias-coffee-wisp="true" className="matthias-coffee-steam__wisp matthias-coffee-steam__wisp--3" />
    </span>
  );
}
