import './ChroniclesEnemyRetaliationFx.css';

export default function ChroniclesEnemyRetaliationFx({ cue }) {
  if (!cue) return null;
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return null;

  return (
    <div className={`chronicles-retaliation-fx fx-${cue.enemyId}`} aria-hidden="true">
      <i className="chronicles-retaliation-primary" />
      <i className="chronicles-retaliation-secondary" />
      <i className="chronicles-retaliation-impact" />
    </div>
  );
}
