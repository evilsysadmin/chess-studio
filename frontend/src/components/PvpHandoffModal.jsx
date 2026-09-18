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

export function pvpHandoffPhase(match, countdown) {
  if (match?.status === 'active' && Number.isFinite(countdown)) return 'countdown';
  if (match?.status === 'starting' && match?.youReady === false) return 'confirming';
  if (match?.status === 'starting' && match?.youReady === true && match?.opponentReady === false) return 'waiting';
  if (match?.status === 'starting' && match?.youReady === true && match?.opponentReady === true) return 'ready';
  return 'syncing';
}

export default function PvpHandoffModal({ match, error = '', onComplete }) {
  const [countdown, setCountdown] = useState(() => countdownFor(match));
  const completedRef = useRef(false);
  const rival = useMemo(() => opponentName(match), [match]);

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

  const phase = pvpHandoffPhase(match, countdown);
  const synchronized = phase === 'countdown';
  const readinessKnown = typeof match?.youReady === 'boolean' && typeof match?.opponentReady === 'boolean';

  return (
    <div className="pvp-handoff-backdrop" role="presentation">
      <section className="pvp-handoff-modal" role="dialog" aria-modal="true" aria-label="Entrando en 1 contra 1">
        <span className="pvp-handoff-modal__eyebrow">
          {synchronized ? 'WAR ROOM · ENLACE ESTABLECIDO' : phase === 'waiting' ? 'WAR ROOM · TÚ ESTÁS LISTO' : phase === 'confirming' ? 'WAR ROOM · RETO ACEPTADO' : 'WAR ROOM · SINCRONIZANDO'}
        </span>
        <span className="pvp-handoff-modal__versus" aria-hidden="true">♟</span>
        <div className="pvp-handoff-modal__status" aria-live="polite">
          {synchronized ? (
            <>
              <h2>Entrando en 1 vs 1 en <b>{Math.max(1, countdown)}</b>…</h2>
              <p>Ambos jugadores están listos.</p>
              <small>Contra {rival} · el reloj 10+0 empezará al entrar.</small>
            </>
          ) : phase === 'waiting' ? (
            <>
              <h2>Esperando a {rival}…</h2>
              <p>Tu puesto está confirmado. El duelo aún no ha empezado.</p>
              <small>El reloj 10+0 permanece detenido hasta que ambos estéis listos.</small>
            </>
          ) : phase === 'confirming' ? (
            <>
              <h2>Confirmando tu entrada…</h2>
              <p>El servidor está registrando tu presencia en el duelo.</p>
              <small>Contra {rival} · todavía no corre ningún reloj.</small>
            </>
          ) : (
            <>
              <h2>Sincronizando el duelo…</h2>
              <p>Tu progreso aquí no se perderá.</p>
              <small>Esperando confirmación autoritativa de la War Room.</small>
            </>
          )}
        </div>
        {synchronized ? (
          <div className="pvp-handoff-modal__ticks" aria-hidden="true">
            {[5,4,3,2,1].map((value) => <i key={value} className={countdown <= value ? 'is-lit' : ''}>{value}</i>)}
          </div>
        ) : readinessKnown ? (
          <div className="pvp-handoff-modal__readiness" aria-label={`Estado de entrada: tú ${match.youReady ? 'listo' : 'pendiente'}, rival ${match.opponentReady ? 'listo' : 'pendiente'}`}>
            <span className={match.youReady ? 'is-ready' : ''}>TÚ {match.youReady ? '✓' : '…'}</span>
            <i aria-hidden="true" />
            <span className={match.opponentReady ? 'is-ready' : ''}>RIVAL {match.opponentReady ? '✓' : '…'}</span>
          </div>
        ) : null}
        {error && <em role="alert">{error}</em>}
      </section>
    </div>
  );
}
