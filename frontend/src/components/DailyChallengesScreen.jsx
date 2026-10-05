import { useMemo } from 'react';
import {
  DAILY_CHALLENGE_SLOTS,
  currentDailyStreak,
  dailyChallengeBrief,
  dailyChallengeDayKey,
  dailyChallengeProgress,
  dailyChallengeStats,
} from '../dailyChallenge.js';
import { dailyChallengeCalendarMonth } from '../dailyChallengeCalendar.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import './DailyChallengeCalendar.css';
import './DailyChallengesRoom.css';

const WEEKDAYS = Object.freeze(['L', 'M', 'X', 'J', 'V', 'S', 'D']);
const STATION_GLYPHS = Object.freeze(['♞', '♜', '♛']);

export default function DailyChallengesScreen({ onExit, onPlay }) {
  useEscapeToClose(onExit);
  const state = useMemo(() => currentDailyStreak(), []);
  const day = dailyChallengeDayKey();
  const progress = dailyChallengeProgress(state, day);
  const brief = dailyChallengeBrief(state, day);
  const totals = dailyChallengeStats(state);
  const calendar = useMemo(() => dailyChallengeCalendarMonth(state), [state]);

  return (
    <div className="tutorial-shell daily-room-screen">
      <button className="back-link daily-room-back" onClick={onExit}>← Volver al menú</button>

      <section className="daily-room" aria-labelledby="daily-room-title">
        <div className="daily-room__architecture" aria-hidden="true">
          <span className="daily-room__hearth" />
          <span className="daily-room__window" />
          <span className="daily-room__sconce daily-room__sconce--left" />
          <span className="daily-room__sconce daily-room__sconce--right" />
        </div>

        <header className="daily-room__header">
          <div className="daily-room__banner">
            <span className="eyebrow">ENTRENAMIENTO DIARIO</span>
            <h2 id="daily-room-title">Cámara de desafíos</h2>
            <p>Tres retos, cero burocracia. Con uno mantienes la racha; completar 3/3 da pleno diario.</p>
          </div>

          <div className={`daily-room__shrine \${progress.full ? 'is-full' : ''}`}>
            <div className="daily-room__braziers" aria-hidden="true">
              {[0, 1, 2].map((index) => (
                <span
                  key={index}
                  className={`daily-room__brazier \${index < progress.solvedCount ? 'is-lit' : ''}`}
                />
              ))}
            </div>
            <div className="daily-room__score" aria-label={`Progreso diario \${progress.solvedCount} de 3`}>
              <strong>{progress.solvedCount}/3</strong>
              <span>{totals.completedChallenges} completados · {totals.fullDays} plenos</span>
              <small>Racha {state.streak || 0} · mejor {state.bestStreak || 0}</small>
            </div>
            <div className={`daily-room__brief \${progress.full ? 'is-solved' : ''}`}>
              <b>{brief.headline}</b>
              <span>{brief.detail}</span>
            </div>
          </div>
        </header>

        <div className="daily-room__stations">
          {DAILY_CHALLENGE_SLOTS.map((slot, index) => {
            const result = progress.slots[slot.id];
            const solved = Boolean(result?.solved);
            return (
              <article
                key={slot.id}
                className={`daily-room__station daily-room__station--\${index + 1} \${solved ? 'is-solved' : ''}`}
              >
                <div className="daily-room__tabletop" aria-hidden="true">
                  <span className="daily-room__board-grid" />
                  <span className="daily-room__station-piece">{STATION_GLYPHS[index]}</span>
                </div>

                <div className="daily-room__station-face">
                  <div className="daily-room__station-top">
                    <span className="section-label">RETO {index + 1} · {slot.label.toUpperCase()}</span>
                    {solved && (
                      <span className="daily-room__status">
                        ✓ {result?.clean === true ? 'Limpio' : 'Hecho'}
                      </span>
                    )}
                  </div>
                  <h3>{slot.title}</h3>
                  <p>{slot.description}</p>
                  <button
                    type="button"
                    className={`daily-room__play \${solved ? 'is-secondary' : ''}`}
                    onClick={() => onPlay(slot.id)}
                  >
                    {solved ? 'Volver a ver →' : 'Jugar →'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        <div className="daily-room__drawers">
          <details className="friendly-disclosure daily-room__drawer daily-calendar-disclosure">
            <summary><span aria-hidden="true">▦</span> Ver calendario</summary>
            <div className="friendly-disclosure-body daily-calendar">
              <div className="daily-calendar__header">
                <strong>{calendar.monthLabel}</strong>
                <div className="daily-calendar__legend" aria-label="Leyenda del calendario">
                  <span className="is-partial">Hecho</span>
                  <span className="is-full">3/3</span>
                  <span className="is-clean">3/3 limpio</span>
                </div>
              </div>
              <div className="daily-calendar__weekdays" aria-hidden="true">
                {WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}
              </div>
              <div className="daily-calendar__grid" aria-label={`Calendario de desafíos · \${calendar.monthLabel}`}>
                {calendar.cells.map((cell) => (
                  <span
                    key={cell.day}
                    className={`daily-calendar__day is-\${cell.status}\${cell.inMonth ? ' is-month' : ''}\${cell.today ? ' is-today' : ''}`}
                    title={`\${cell.day} · \${cell.solvedCount}/3\${cell.status === 'clean' ? ' limpio' : ''}`}
                    aria-label={`\${cell.day}: \${cell.solvedCount} de 3\${cell.status === 'clean' ? ', pleno limpio' : cell.status === 'full' ? ', pleno' : ''}`}
                  >
                    {cell.dayOfMonth}
                  </span>
                ))}
              </div>
            </div>
          </details>

          <details className="friendly-disclosure daily-room__drawer">
            <summary><span aria-hidden="true">♨</span> Cómo funciona la racha</summary>
            <div className="friendly-disclosure-body">
              <p>Resolver <b>al menos uno</b> de los tres retos mantiene la racha diaria. El 3/3 es un pleno adicional; no te castigamos por tener vida fuera del tablero.</p>
              <p className="hint-text">La selección cambia cada día de forma determinista y usa el banco de posiciones validado de Chess Studio.</p>
            </div>
          </details>
        </div>
      </section>
    </div>
  );
}
