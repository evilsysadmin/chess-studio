import { useMemo } from 'react';
import {
  DAILY_CHALLENGE_SLOTS,
  currentDailyStreak,
  dailyChallengeBrief,
  dailyChallengeDayKey,
  dailyChallengeProgress,
  dailyChallengeStats,
} from '../dailyChallenge.js';
import { useEscapeToClose } from '../useEscapeToClose.js';

export default function DailyChallengesScreen({ onExit, onPlay }) {
  useEscapeToClose(onExit);
  const state = useMemo(() => currentDailyStreak(), []);
  const day = dailyChallengeDayKey();
  const progress = dailyChallengeProgress(state, day);
  const brief = dailyChallengeBrief(state, day);
  const totals = dailyChallengeStats(state);

  return (
    <div className="tutorial-shell daily-hub-screen">
      <button className="back-link" onClick={onExit}>← Volver al menú</button>
      <div className="daily-hub-heading">
        <div>
          <span className="eyebrow">HOY</span>
          <h2>Desafíos diarios</h2>
          <p className="hint-text">Tres retos, cero burocracia. Con uno mantienes la racha; completar 3/3 da pleno diario.</p>
        </div>
        <div className="daily-hub-score" aria-label={`Progreso diario ${progress.solvedCount} de 3`}>
          <strong>{progress.solvedCount}/3</strong>
          <span>{totals.completedChallenges} completados · {totals.fullDays} plenos</span>
          <small>Racha {state.streak || 0} · mejor {state.bestStreak || 0}</small>
        </div>
      </div>

      <div className={`daily-challenge-note ${progress.full ? 'is-solved' : ''}`}>
        <b>{brief.headline}</b><span>{brief.detail}</span>
      </div>

      <div className="daily-hub-grid">
        {DAILY_CHALLENGE_SLOTS.map((slot, index) => {
          const result = progress.slots[slot.id];
          const solved = Boolean(result?.solved);
          return (
            <article key={slot.id} className={`daily-hub-card ${solved ? 'is-solved' : ''}`}>
              <div className="daily-hub-card-top">
                <span className="section-label">RETO {index + 1} · {slot.label.toUpperCase()}</span>
                {solved && <span className="daily-hub-status">✓ {result?.clean === true ? 'Limpio' : 'Hecho'}</span>}
              </div>
              <h3>{slot.title}</h3>
              <p>{slot.description}</p>
              <button type="button" className={solved ? 'secondary-btn' : 'primary-btn'} onClick={() => onPlay(slot.id)}>
                {solved ? 'Volver a ver →' : 'Jugar →'}
              </button>
            </article>
          );
        })}
      </div>

      <details className="friendly-disclosure daily-hub-details">
        <summary>Cómo funciona la racha</summary>
        <div className="friendly-disclosure-body">
          <p>Resolver <b>al menos uno</b> de los tres retos mantiene la racha diaria. El 3/3 es un pleno adicional; no te castigamos por tener vida fuera del tablero.</p>
          <p className="hint-text">La selección cambia cada día de forma determinista y usa el banco de posiciones validado de Chess Studio.</p>
        </div>
      </details>
    </div>
  );
}
