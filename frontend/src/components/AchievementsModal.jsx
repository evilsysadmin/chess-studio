import { useState } from 'react';
import { ACHIEVEMENTS, achievementProgress, collectionEntries, featuredAchievements, loadSelectedDistinction, loadUnlocked, selectDistinction, selectedDistinction } from '../achievements.js';
import { dailyChallengeStats, loadDailyChallenge } from '../dailyChallenge.js';
import { useEscapeToClose } from '../useEscapeToClose.js';

function AchievementRow({ achievement, done, progress = null, selected = false, onSelect = null }) {
  const collection = achievement.collection || 'Archivo';
  const rarity = achievement.rarity || 'común';
  return (
    <div className={`army-row achievement-row ${done ? '' : 'army-row-dead'} ${selected ? 'is-selected' : ''}`}>
      <span className={`army-aura ${done ? 'tier-gold' : 'tier-dead'}`}>{done ? (achievement.kind === 'shame' ? '☠' : '✓') : '?'}</span>
      <div className="army-row-info">
        <span className="achievement-row-meta"><i>{collection}</i><i className={`rarity-${rarity}`}>{rarity}</i></span>
        <span className="army-row-name">{achievement.name}{achievement.kind === 'shame' ? ' · Incidente archivado' : ''}</span>
        <span className="army-row-stats">{achievement.description}</span>
        {!done && progress && (
          <span className="achievement-progress" aria-label={`Progreso ${progress.current} de ${progress.goal}`}>
            <span style={{ width: `${progress.percent}%` }} />
            <small>{progress.current}/{progress.goal}</small>
          </span>
        )}
      </div>
      {done && onSelect && <button type="button" className={selected ? 'secondary-btn achievement-equipped' : 'secondary-btn'} onClick={() => onSelect(achievement.id)}>{selected ? 'En vitrina' : 'Exhibir'}</button>}
    </div>
  );
}

export default function AchievementsModal({ onClose, onSelected = null }) {
  useEscapeToClose(onClose);
  const unlocked = loadUnlocked();
  const entries = collectionEntries(unlocked);
  const [selectedId, setSelectedId] = useState(() => loadSelectedDistinction());
  const unlockedCount = ACHIEVEMENTS.filter((a) => unlocked.has(a.id)).length;
  const featured = featuredAchievements(unlocked, 6);
  const active = selectedDistinction(unlocked);
  const dailyState = loadDailyChallenge();
  const dailyStats = dailyChallengeStats(dailyState);

  function equipDistinction(id) {
    const next = selectDistinction(id, unlocked);
    setSelectedId(next);
    onSelected?.(next);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="army-card achievements-modal" role="dialog" aria-modal="true" aria-label="Distintivos y logros" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <button className="piece-info-close" onClick={onClose} aria-label="Cerrar">×</button>
        <span className="section-label">ARCHIVO PERSONAL</span>
        <h3>Colección de distinciones</h3>
        <p className="hint-text">{unlockedCount}/{ACHIEVEMENTS.length} piezas de expediente. Se ganan jugando: no hay tienda, azar ni atajos.</p>

        <section className="distinction-showcase" aria-label="Distintivo elegido para tu vitrina">
          <span className="distinction-showcase-mark" aria-hidden="true">{active?.kind === 'shame' ? '☠' : active ? '✦' : '◇'}</span>
          <div>
            <small>EN VITRINA</small>
            <strong>{active?.name || 'Sin distintivo elegido'}</strong>
            <span>{active ? `${active.collection} · ${active.rarity}` : 'Elige una distinción desbloqueada para que forme parte de tu expediente.'}</span>
          </div>
        </section>

        <div className="achievement-daily-summary" aria-label="Progreso de desafíos diarios">
          <div><strong>{dailyStats.completedChallenges}</strong><span>retos completados</span></div>
          <div><strong>{dailyStats.fullDays}</strong><span>plenos diarios</span></div>
          <div><strong>{dailyStats.bestStreak}</strong><span>mejor racha</span></div>
        </div>

        {featured.length > 0 ? (
          <div className="army-list achievements-featured">
            {featured.map((achievement) => <AchievementRow key={achievement.id} achievement={entries.find((item) => item.id === achievement.id) || achievement} done selected={selectedId === achievement.id} onSelect={equipDistinction} />)}
          </div>
        ) : (
          <p className="hint-text achievements-empty">Todavía no hay distintivos destacados. Juega; el expediente hará el resto.</p>
        )}

        <details className="friendly-disclosure achievements-catalog">
          <summary>Explorar archivo completo · {unlockedCount}/{ACHIEVEMENTS.length}</summary>
          <div className="friendly-disclosure-body army-list">
            {entries.map((achievement) => (
              <AchievementRow key={achievement.id} achievement={achievement} done={achievement.unlocked} progress={achievementProgress(achievement.id, dailyState)} selected={selectedId === achievement.id} onSelect={equipDistinction} />
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}
