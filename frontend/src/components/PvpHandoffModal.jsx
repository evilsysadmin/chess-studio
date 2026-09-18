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

  const synchronized = match?.status === 'active' && Number.isFinite(countdown);

  return (
    <div className="pvp-handoff-backdrop" role="presentation">
      <section className="pvp-handoff-modal" role="dialog" aria-modal="true" aria-label="Entrando en 1 contra 1">
        <span className="pvp-handoff-modal__eyebrow">WAR ROOM · ENLACE ESTABLECIDO</span>
        <span className="pvp-handoff-modal__versus" aria-hidden="true">♟</span>
        {synchronized ? (
          <>
            <h2>Entrando en 1 vs 1 en <b>{Math.max(1, countdown)}</b>…</h2>
            <p>Tu progreso aquí no se perderá.</p>
            <small>Contra {rival} · el reloj 10+0 empezará al entrar.</small>
          </>
        ) : (
          <>
            <h2>Sincronizando el duelo…</h2>
            <p>Tu progreso aquí no se perderá.</p>
            <small>Esperando a que {rival} confirme presencia.</small>
          </>
        )}
        <div className="pvp-handoff-modal__ticks" aria-hidden="true">
          {[5,4,3,2,1].map((value) => <i key={value} className={synchronized && countdown <= value ? 'is-lit' : ''}>{value}</i>)}
        </div>
        {error && <em role="alert">{error}</em>}
      </section>
    </div>
  );
}
