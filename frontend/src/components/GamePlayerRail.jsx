import { CPU_IDENTITY } from '../cpuIdentity.js';
import { formatClock } from '../clock.js';
import { getUsername } from '../auth.js';

export default function GamePlayerRail({
  game,
  humanColor,
  rivalryRecord,
  clocks,
  color,
  seconds,
  cpu = false,
}) {
  const isLow = seconds !== null && seconds <= 10;
  const isTicking = clocks.tickingColor === color;
  const active = game.turn === color && !game.isGameOver && !clocks.flagFallen && !clocks.forcedOutcome;
  const railTurnLabel = game.isGameOver || clocks.flagFallen || clocks.forcedOutcome
    ? 'FINAL'
    : cpu
      ? (active ? 'TURNO CPU' : 'ESPERANDO')
      : (game.turn === humanColor ? 'TU TURNO' : 'TURNO CPU');

  return (
    <div className={`game-player-rail ${cpu ? 'is-cpu' : 'is-human'} ${active ? 'is-active' : ''}`} aria-label={`${cpu ? `${CPU_IDENTITY.name}, CPU` : 'Jugador'} ${railTurnLabel.toLowerCase()}`}>
      <span className={`game-player-avatar${cpu ? ' has-portrait' : ''}`} aria-hidden="true">{cpu ? <img src={CPU_IDENTITY.avatar} alt="" /> : '♙'}</span>
      <span className="game-player-identity">
        <strong>{cpu ? CPU_IDENTITY.name : (getUsername() || 'Tú')}</strong>
        <small>{cpu
          ? `${CPU_IDENTITY.role} · nivel ${game.difficulty}${Number(rivalryRecord.games || 0) > 0 ? ` · duelo ${Number(rivalryRecord.wins || 0)}V ${Number(rivalryRecord.draws || 0)}T ${Number(rivalryRecord.losses || 0)}D` : ''}`
          : (color === 'w' ? 'Blancas' : 'Negras')}
        </small>
      </span>
      {clocks.hasClock ? (
        <span className={`clock-chip ${isTicking ? 'ticking' : ''} ${isLow ? 'low' : ''}`} title={railTurnLabel}>{formatClock(seconds ?? 0)}</span>
      ) : (
        <span className="game-player-turn">{railTurnLabel}</span>
      )}
    </div>
  );
}
