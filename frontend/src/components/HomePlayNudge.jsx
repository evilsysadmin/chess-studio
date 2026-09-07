import { useEffect, useState } from 'react';
import {
  HOME_PLAY_NUDGE_IDLE_MS,
  canShowHomePlayNudge,
  markHomePlayNudgeShown,
} from '../homePlayNudge.js';

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
const POINTER_MOVE_REARM_MS = 1000;

export default function HomePlayNudge({ enabled = true, hasSavedGame = false, onPlay, onContinue }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Si aparece un modal/logout mientras el aviso está visible, lo damos por
    // consumido y no lo resucitamos al cerrar la capa superior.
    if (!enabled && visible) setVisible(false);
  }, [enabled, visible]);

  useEffect(() => {
    if (!enabled || visible || typeof window === 'undefined' || typeof document === 'undefined') return undefined;
    if (!canShowHomePlayNudge()) return undefined;

    let timeoutId = null;
    let pointerMoveRearmId = null;
    let pointerMoveListening = false;
    let lastArmAt = 0;

    const clearTimer = () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      timeoutId = null;
    };

    const showAfterIdle = () => {
      clearTimer();
      if (document.hidden || !canShowHomePlayNudge()) return;
      lastArmAt = Date.now();
      timeoutId = window.setTimeout(() => {
        if (document.hidden || !canShowHomePlayNudge()) return;
        markHomePlayNudgeShown();
        setVisible(true);
      }, HOME_PLAY_NUDGE_IDLE_MS);
    };

    const handleActivity = () => {
      // Eventos discretos pueden llegar en ráfagas (scroll/touch/keydown).
      // Rearmar una vez por segundo conserva la medición de inactividad sin
      // convertir cada ráfaga en clearTimeout + setTimeout.
      if (Date.now() - lastArmAt < POINTER_MOVE_REARM_MS) return;
      showAfterIdle();
    };

    const disarmPointerMove = () => {
      if (!pointerMoveListening) return;
      window.removeEventListener('pointermove', handlePointerMove);
      pointerMoveListening = false;
    };

    const armPointerMove = () => {
      if (pointerMoveListening || document.hidden) return;
      pointerMoveListening = true;
      // One native callback per arm. Continuous mouse movement therefore cannot
      // hammer JS hundreds of times per second while Home waits for inactivity.
      window.addEventListener('pointermove', handlePointerMove, { passive: true, once: true });
    };

    function handlePointerMove() {
      // `once` already removed the browser listener; mirror that state locally.
      pointerMoveListening = false;
      showAfterIdle();
      if (pointerMoveRearmId !== null) window.clearTimeout(pointerMoveRearmId);
      pointerMoveRearmId = window.setTimeout(() => {
        pointerMoveRearmId = null;
        armPointerMove();
      }, POINTER_MOVE_REARM_MS);
    }

    const clearPointerMoveRearm = () => {
      if (pointerMoveRearmId !== null) window.clearTimeout(pointerMoveRearmId);
      pointerMoveRearmId = null;
    };

    const handleVisibility = () => {
      if (document.hidden) {
        clearTimer();
        clearPointerMoveRearm();
        disarmPointerMove();
        return;
      }
      showAfterIdle();
      armPointerMove();
    };

    showAfterIdle();
    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, handleActivity, { passive: true });
    }
    armPointerMove();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearTimer();
      clearPointerMoveRearm();
      disarmPointerMove();
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, handleActivity);
      }
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [enabled, visible]);

  if (!enabled || !visible) return null;

  const continueSavedGame = hasSavedGame && typeof onContinue === 'function';
  const handlePrimary = () => {
    setVisible(false);
    if (continueSavedGame) onContinue();
    else onPlay?.();
  };

  return (
    <aside className="home-play-nudge" role="status" aria-live="polite" aria-label="Sugerencia para jugar">
      <button
        type="button"
        className="home-play-nudge-close"
        onClick={() => setVisible(false)}
        aria-label="Cerrar sugerencia"
      >
        ×
      </button>
      <div className="home-play-nudge-copy">
        <span className="home-play-nudge-kicker">¿Echamos una?</span>
        <strong>{continueSavedGame ? 'Tu partida sigue esperando.' : 'Llevas un rato en el menú.'}</strong>
        <p>
          {continueSavedGame
            ? 'Puedes retomarla exactamente donde la dejaste.'
            : 'Una rápida y volvemos a poner piezas en peligro.'}
        </p>
      </div>
      <button type="button" className="primary-btn home-play-nudge-cta" onClick={handlePrimary}>
        {continueSavedGame ? 'Continuar partida' : 'Jugar una rápida'}
      </button>
    </aside>
  );
}
