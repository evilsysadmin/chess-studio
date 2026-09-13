import './ChroniclesTacticalMargin.css';

const TARGET_GLYPHS = Object.freeze({
  'corrupted-pawn': '♟',
  'gate-jailer': '♜',
  'spectral-bishop': '♝',
  'scavenger-knight': '♞',
});

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
        {target.willRetaliate ? 'devuelve el golpe' : 'fuera de represalia'}
      </em>
    </div>
  );
}
