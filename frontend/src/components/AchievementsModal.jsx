import { useState } from 'react';
import {
  ACHIEVEMENTS,
  MAX_ACHIEVEMENT_FAVORITES,
  achievementProgress,
  achievementRecord,
  featuredAchievements,
  loadAchievementFavorites,
  loadAchievementLedger,
  loadUnlocked,
  toggleAchievementFavorite,
} from '../achievements.js';
import { dailyChallengeStats, loadDailyChallenge } from '../dailyChallenge.js';
import { useEscapeToClose } from '../useEscapeToClose.js';

function formattedRecordDate(record) {
  const raw = record?.provenance?.occurredAt || record?.recordedAt;
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function achievementEvidenceLine(record) {
  if (!record) return null;
  if (record.legacy) return 'Registro legado · el origen exacto no se reconstruye.';
  const provenance = record.provenance || {};
  const bits = [record.source === 'noteworthy-game-event' ? 'Incidente de partida acreditado' : 'Hito medido'];
  const date = formattedRecordDate(record);
  if (date) bits.push(date);
  if (Number.isFinite(Number(provenance.difficulty))) bits.push(`CPU ${Math.round(Number(provenance.difficulty))}`);
  if (provenance.color === 'w') bits.push('blancas');
  if (provenance.color === 'b') bits.push('negras');
  if (provenance.gameId) bits.push('partida vinculada');
  if (provenance.battleId) bits.push('batalla vinculada');
  return bits.join(' · ');
}

function AchievementRow({ achievement, done, progress = null, record = null, favorite = false, onToggleFavorite = null }) {
  const evidence = done ? achievementEvidenceLine(record) : null;
  return (
    <div className={`army-row achievement-record-row ${done ? '' : 'army-row-dead'}`}>
      <span className={`army-aura ${done ? 'tier-gold' : 'tier-dead'}`}>{done ? (achievement.kind === 'shame' ? '☠' : '✓') : '?'}</span>
      <div className="army-row-info">
        <span className="achievement-record-heading">
          <span className="army-row-name">{achievement.name}{achievement.kind === 'shame' ? ' · Trofeo de vergüenza' : ''}</span>
          {done && onToggleFavorite && (
            <button
              type="button"
              className={`achievement-favorite-toggle${favorite ? ' is-favorite' : ''}`}
              aria-label={favorite ? `Quitar ${achievement.name} de favoritos` : `Fijar ${achievement.name} como favorito`}
              aria-pressed={favorite}
              title={favorite ? 'Quitar de tus tres favoritos' : 'Fijar entre tus tres favoritos'}
              onClick={() => onToggleFavorite(achievement.id)}
            >
              {favorite ? '★' : '☆'}
            </button>
          )}
        </span>
        <span className="army-row-stats">{achievement.description}</span>
        {evidence && <small className={`achievement-evidence${record?.legacy ? ' is-legacy' : ''}`}>{evidence}</small>}
        {!done && progress && (
          <span className="achievement-progress" aria-label={`Progreso ${progress.current} de ${progress.goal}`}>
            <span style={{ width: `${progress.percent}%` }} />
            <small>{progress.current}/{progress.goal}</small>
          </span>
        )}
      </div>
    </div>
  );
}

export default function AchievementsModal({ onClose }) {
  useEscapeToClose(onClose);
  const unlocked = loadUnlocked();
  const ledger = loadAchievementLedger();
  const unlockedCount = ACHIEVEMENTS.filter((achievement) => unlocked.has(achievement.id)).length;
  const [favoriteIds, setFavoriteIds] = useState(() => loadAchievementFavorites());
  const [favoriteNotice, setFavoriteNotice] = useState('');
  const featured = featuredAchievements(unlocked, 6, favoriteIds);
  const dailyState = loadDailyChallenge();
  const dailyStats = dailyChallengeStats(dailyState);

  const handleToggleFavorite = (achievementId) => {
    const result = toggleAchievementFavorite(achievementId);
    setFavoriteIds(result.favorites);
    setFavoriteNotice(result.limitReached ? `Máximo ${MAX_ACHIEVEMENT_FAVORITES}. Quita uno antes de fijar otro.` : '');
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="army-card achievements-modal" role="dialog" aria-modal="true" aria-label="Distintivos y logros" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 540 }}>
        <button className="piece-info-close" onClick={onClose} aria-label="Cerrar">×</button>
        <span className="section-label">EXPEDIENTE DE HAZAÑAS</span>
        <h3>Distintivos</h3>
        <p className="hint-text">
          {unlockedCount} desbloqueados. Los nuevos guardan sólo evidencia real; los antiguos permanecen como legado sin inventar su historia.
        </p>

        <div className="achievement-daily-summary" aria-label="Progreso de desafíos diarios">
          <div><strong>{dailyStats.completedChallenges}</strong><span>retos completados</span></div>
          <div><strong>{dailyStats.fullDays}</strong><span>plenos diarios</span></div>
          <div><strong>{dailyStats.bestStreak}</strong><span>mejor racha</span></div>
        </div>

        <div className="achievement-showcase-note">
          <strong>Tu vitrina · {favoriteIds.length}/{MAX_ACHIEVEMENT_FAVORITES}</strong>
          <span>Fija hasta tres distintivos. Más adelante serán los candidatos naturales para la Sala de Trofeos.</span>
          {favoriteNotice && <small role="status">{favoriteNotice}</small>}
        </div>

        {featured.length > 0 ? (
          <div className="army-list achievements-featured">
            {featured.map((achievement) => (
              <AchievementRow
                key={achievement.id}
                achievement={achievement}
                done
                record={achievementRecord(achievement.id, ledger)}
                favorite={favoriteIds.includes(achievement.id)}
                onToggleFavorite={handleToggleFavorite}
              />
            ))}
          </div>
        ) : (
          <p className="hint-text achievements-empty">Todavía no hay distintivos destacados. Juega; el expediente hará el resto.</p>
        )}

        <details className="friendly-disclosure achievements-catalog">
          <summary>Ver catálogo completo · {unlockedCount}/{ACHIEVEMENTS.length}</summary>
          <div className="friendly-disclosure-body army-list">
            {ACHIEVEMENTS.map((achievement) => (
              <AchievementRow
                key={achievement.id}
                achievement={achievement}
                done={unlocked.has(achievement.id)}
                progress={achievementProgress(achievement.id, dailyState)}
                record={achievementRecord(achievement.id, ledger)}
                favorite={favoriteIds.includes(achievement.id)}
                onToggleFavorite={handleToggleFavorite}
              />
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}
