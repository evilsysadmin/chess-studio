import { ACHIEVEMENTS, loadUnlocked } from '../achievements.js';
import { useEscapeToClose } from '../useEscapeToClose.js';

export default function AchievementsModal({ onClose }) {
  useEscapeToClose(onClose);
  const unlocked = loadUnlocked();
  const unlockedCount = ACHIEVEMENTS.filter((a) => unlocked.has(a.id)).length;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="army-card" role="dialog" aria-modal="true" aria-label="Logros y expediente" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <button className="piece-info-close" onClick={onClose} aria-label="Cerrar">×</button>
        <h3>Logros y expediente</h3>
        <p className="hint-text" style={{ marginBottom: '1rem' }}>
          {unlockedCount} de {ACHIEVEMENTS.length} desbloqueados.
        </p>

        <div className="army-list">
          {ACHIEVEMENTS.map((a) => {
            const done = unlocked.has(a.id);
            return (
              <div className={`army-row ${done ? '' : 'army-row-dead'}`} key={a.id}>
                <span className={`army-aura ${done ? 'tier-gold' : 'tier-dead'}`}>{done ? (a.kind === 'shame' ? '☠' : '✓') : '?'}</span>
                <div className="army-row-info">
                  <span className="army-row-name">{a.name}{a.kind === 'shame' ? ' · Trofeo de vergüenza' : ''}</span>
                  <span className="army-row-stats">{a.description}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
