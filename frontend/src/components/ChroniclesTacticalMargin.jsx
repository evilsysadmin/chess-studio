import './ChroniclesTacticalMargin.css';

const TARGET_GLYPHS = Object.freeze({
  'corrupted-pawn': '♟',
  'gate-jailer': '♜',
  'spectral-bishop': '♝',
  'scavenger-knight': '♞',
});

export function chroniclesRetaliationLabel(target) {
  if (!target?.willRetaliate) return 'SIN REPRESALIA';
  const damage = Math.max(0, Number(target.retaliation) || 0);
  return `REPRESALIA · ${damage} PV`;
}

export default function ChroniclesTacticalMargin({ target }) {
  if (!target) return null;
  const distanceLabel = target.distance === 1 ? '1 casilla' : `${target.distance} casillas`;

  return (
    <div className="chronicles-target-margin" aria-live="polite" data-chronicles-target={target.id}>
      <span className="chronicles-target-glyph" aria-hidden="true">{TARGET_GLYPHS[target.id] || '◆'}</span>
      <span className="chronicles-target-copy">
        <small>ANOTACIÓN TÁCTICA · {distanceLabel}</small>
        <strong>{target.name}</strong>
      </span>
      <span className="chronicles-target-hp"><small>VIDA</small><b>{target.hp}/{target.maxHp}</b></span>
      <em className={target.willRetaliate ? 'is-danger' : 'is-safe'}>
        {chroniclesRetaliationLabel(target)}
      </em>
    </div>
  );
}
