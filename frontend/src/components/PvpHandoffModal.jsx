import { useEffect, useMemo, useRef, useState } from 'react';
import './PvpHandoffModal.css';

function opponentName(match) {
  if (!match) return 'tu rival';
  return match.youAre === 'w' ? match.black : match.white;
}

function countdownFor(match) {
  const startsAt = Date.parse(match?.startsAt || '');
  if (!Number.isFinite(startsAt)) return null;
  return Math.max(0, Math.ceil((startsAt - Date.now()) / 1000));
}

export function pvpHandoffPhase(match, countdown = countdownFor(match)) {
  if (match?.status === 'cancelled') return 'cancelled';
  if (match?.status === 'active' && Number.isFinite(countdown)) return 'opening';
  return 'sealing';
}

export function pvpHandoffParticipants(match) {
  if (!match) {
    return {
      you: { username: 'Tú', rating: null, color: '' },
      rival: { username: 'tu rival', rating: null, color: '' },
    };
  }
  const youAreWhite = match.youAre === 'w';
  return {
    you: {
      username: youAreWhite ? match.white : match.black,
      rating: youAreWhite ? match.whiteRating : match.blackRating,
      color: youAreWhite ? 'Blancas' : 'Negras',
    },
    rival: {
      username: youAreWhite ? match.black : match.white,
      rating: youAreWhite ? match.blackRating : match.whiteRating,
      color: youAreWhite ? 'Negras' : 'Blancas',
    },
  };
}

export default function PvpHandoffModal({ match, error = '', onComplete, onAbort }) {
  const [countdown, setCountdown] = useState(() => countdownFor(match));
  const completedRef = useRef(false);
  const rival = useMemo(() => opponentName(match), [match]);
  const participants = useMemo(() => pvpHandoffParticipants(match), [match]);

  useEffect(() => {
    completedRef.current = false;
    setCountdown(countdownFor(match));
    if (!match?.startsAt || match.status !== 'active') return undefined;

    const tick = () => {
      const next = countdownFor(match);
      setCountdown(next);
      if (next === 0 && !completedRef.current) {
        completedRef.current = true;
        onComplete?.();
      }
    };
    tick();
    const timer = window.setInterval(tick, 100);
    return () => window.clearInterval(timer);
  }, [match?.id, match?.startsAt, match?.status, onComplete]);

  const synchronized = match?.status === 'active' && Number.isFinite(countdown);
  const cancelled = match?.status === 'cancelled';
  const timedOut = cancelled && match?.endReason === 'handoff_timeout';
  const phase = pvpHandoffPhase(match, countdown);
  const clockLabel = match?.clock?.id || 'reloj del duelo';

  return (
    <div className="pvp-handoff-backdrop" role="presentation">
      <section
        className={`pvp-handoff-modal is-${phase}`}
        role="dialog"
        aria-modal="true"
        aria-label="Entrando en 1 contra 1"
        data-handoff-phase={phase}
      >
        <div className="pvp-handoff-modal__portal" aria-hidden="true">
          <span className="pvp-handoff-modal__gate is-left" />
          <span className="pvp-handoff-modal__gate is-right" />
          <span className="pvp-handoff-modal__portcullis" />
          <span className="pvp-handoff-modal__seal">⚔</span>
        </div>

        <span className="pvp-handoff-modal__eyebrow">SALA DE DUELOS · PUERTA DE LA DUEL ROOM</span>

        <div
          className="pvp-handoff-modal__duelists"
          aria-label={`Duelo entre ${participants.you.username || 'tú'} y ${participants.rival.username || rival}`}
        >
          <span className="pvp-handoff-modal__duelist is-you">
            <small>TÚ · {participants.you.color}</small>
            <strong>{participants.you.username || 'Tú'}</strong>
            {participants.you.rating != null && Number.isFinite(Number(participants.you.rating)) && <em>{participants.you.rating} Elo</em>}
          </span>
          <span className="pvp-handoff-modal__versus" aria-hidden="true">VS</span>
          <span className="pvp-handoff-modal__duelist is-rival">
            <small>RIVAL · {participants.rival.color}</small>
            <strong>{participants.rival.username || rival}</strong>
            {participants.rival.rating != null && Number.isFinite(Number(participants.rival.rating)) && <em>{participants.rival.rating} Elo</em>}
          </span>
        </div>

        {cancelled ? (
          <>
            <span className="pvp-handoff-modal__phase">PORTÓN CERRADO</span>
            <h2>{timedOut ? 'El duelo no llegó a arrancar' : 'Entrada al duelo cancelada'}</h2>
            <p>{timedOut ? 'La sincronización no se completó dentro del margen de seguridad.' : 'Uno de los jugadores canceló antes de que empezara la partida.'}</p>
            <small>No hubo resultado ni cambio de Elo. Puedes volver a retar desde el lobby.</small>
            <button type="button" className="primary-btn pvp-handoff-modal__primary" onClick={onAbort}>Volver al lobby</button>
          </>
        ) : synchronized ? (
          <>
            <span className="pvp-handoff-modal__phase">PORTÓN ABRIENDO</span>
            <h2>Entrando en 1 vs 1 en <b>{Math.max(1, countdown)}</b>…</h2>
            <p>Tu progreso aquí no se perderá.</p>
            <small>Contra {rival} · {clockLabel} empezará al entrar.</small>
          </>
        ) : (
          <>
            <span className="pvp-handoff-modal__phase">SELLANDO EL DUELO</span>
            <h2>Sincronizando el duelo…</h2>
            <p>Tu progreso aquí no se perderá.</p>
            <small>El árbitro espera la confirmación de ambos jugadores. Si el enlace no se completa, se cancelará solo.</small>
          </>
        )}

        {!cancelled && (
          <div className="pvp-handoff-modal__ticks" aria-hidden="true">
            {[5, 4, 3, 2, 1].map((value) => (
              <i key={value} className={synchronized && countdown <= value ? 'is-lit' : ''}>{value}</i>
            ))}
          </div>
        )}

        {!cancelled && match?.status === 'starting' && (
          <button
            type="button"
            className="secondary-btn pvp-handoff-modal__cancel"
            onClick={() => void onAbort?.()}
          >
            Cancelar entrada
          </button>
        )}
        {error && <em className="pvp-handoff-modal__error" role="alert">{error}</em>}
      </section>
    </div>
  );
}
