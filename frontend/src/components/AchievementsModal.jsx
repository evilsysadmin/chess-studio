import { ACHIEVEMENTS, achievementProgress, featuredAchievements, loadUnlocked } from '../achievements.js';
import { dailyChallengeStats, loadDailyChallenge } from '../dailyChallenge.js';
import { useEscapeToClose } from '../useEscapeToClose.js';

function AchievementRow({ achievement, done, progress = null }) {
  return (
    <div className={`army-row ${done ? '' : 'army-row-dead'}`}>
      <span className={`army-aura ${done ? 'tier-gold' : 'tier-dead'}`}>{done ? (achievement.kind === 'shame' ? '☠' : '✓') : '?'}</span>
      <div className="army-row-info">
        <span className="army-row-name">{achievement.name}{achievement.kind === 'shame' ? ' · Trofeo de vergüenza' : ''}</span>
        <span className="army-row-stats">{achievement.description}</span>
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
  const unlockedCount = ACHIEVEMENTS.filter((a) => unlocked.has(a.id)).length;
  const featured = featuredAchievements(unlocked, 6);
  const dailyState = loadDailyChallenge();
  const dailyStats = dailyChallengeStats(dailyState);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="army-card achievements-modal" role="dialog" aria-modal="true" aria-label="Distintivos y logros" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <button className="piece-info-close" onClick={onClose} aria-label="Cerrar">×</button>
        <span className="section-label">EXPEDIENTE PERSONAL</span>
        <h3>Distintivos</h3>
        <p className="hint-text">{unlockedCount} desbloqueados. Aquí sólo salen los que ya te has ganado; el catálogo completo queda debajo.</p>

        <div className="achievement-daily-summary" aria-label="Progreso de desafíos diarios">
          <div><strong>{dailyStats.completedChallenges}</strong><span>retos completados</span></div>
          <div><strong>{dailyStats.fullDays}</strong><span>plenos diarios</span></div>
          <div><strong>{dailyStats.bestStreak}</strong><span>mejor racha</span></div>
        </div>

        {featured.length > 0 ? (
          <div className="army-list achievements-featured">
            {featured.map((achievement) => <AchievementRow key={achievement.id} achievement={achievement} done />)}
          </div>
        ) : (
          <p className="hint-text achievements-empty">Todavía no hay distintivos destacados. Juega; el expediente hará el resto.</p>
        )}

        <details className="friendly-disclosure achievements-catalog">
          <summary>Ver catálogo completo · {unlockedCount}/{ACHIEVEMENTS.length}</summary>
          <div className="friendly-disclosure-body army-list">
            {ACHIEVEMENTS.map((achievement) => (
              <AchievementRow key={achievement.id} achievement={achievement} done={unlocked.has(achievement.id)} progress={achievementProgress(achievement.id, dailyState)} />
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}
