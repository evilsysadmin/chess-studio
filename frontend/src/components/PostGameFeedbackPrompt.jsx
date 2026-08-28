import { useEffect, useRef, useState } from 'react';
import { submitFeedback } from '../feedback.js';
import { completePostGameFeedback, snoozePostGameFeedback } from '../postGameFeedback.js';
import FeedbackModal from './FeedbackModal.jsx';
import { userFacingError } from '../userFacingError.js';

const QUICK_RATINGS = [
  ['love', '👍 Sí', 'Pulso post-partida: me gusta Chess Studio.'],
  ['mixed', '😐 Más o menos', 'Pulso post-partida: Chess Studio me deja a medias.'],
  ['no', '👎 No mucho', 'Pulso post-partida: Chess Studio no me está convenciendo.'],
];

export default function PostGameFeedbackPrompt({ onDone }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const sendInFlightRef = useRef(false);
  const sendAbortRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
    sendAbortRef.current?.abort('Post-game feedback closed');
    sendAbortRef.current = null;
    sendInFlightRef.current = false;
  }, []);

  async function rate(message) {
    if (sendInFlightRef.current) return;
    sendInFlightRef.current = true;
    const controller = new AbortController();
    sendAbortRef.current?.abort('Nuevo feedback post-partida');
    sendAbortRef.current = controller;
    setSending(true);
    setError(null);
    try {
      await submitFeedback({ category: 'general', message, context: 'Post-partida', signal: controller.signal });
      if (controller.signal.aborted || !mountedRef.current) return;
      completePostGameFeedback();
      setSent(true);
    } catch (err) {
      if (!controller.signal.aborted && mountedRef.current) setError(userFacingError(err, 'No se pudo enviar ahora.'));
    } finally {
      if (sendAbortRef.current === controller) sendAbortRef.current = null;
      sendInFlightRef.current = false;
      if (mountedRef.current) setSending(false);
    }
  }

  function dismiss() {
    snoozePostGameFeedback();
    onDone?.();
  }

  function openDetail() {
    snoozePostGameFeedback();
    setShowDetail(true);
  }

  if (showDetail) {
    return <FeedbackModal context="Post-partida" onClose={() => { setShowDetail(false); onDone?.(); }} />;
  }

  return (
    <section className="post-game-feedback" aria-label="Feedback opcional sobre Chess Studio">
      {sent ? (
        <>
          <strong>Gracias. Pulso recibido.</strong>
          <span>Prometemos no perseguirte con encuestas después de cada peón.</span>
          <button type="button" className="secondary-btn" onClick={() => onDone?.()}>Cerrar</button>
        </>
      ) : (
        <>
          <div>
            <span className="section-label">UNA PREGUNTA Y FUERA</span>
            <strong>¿Te está gustando Chess Studio?</strong>
            <small>Es opcional y sólo aparece de vez en cuando.</small>
          </div>
          <div className="post-game-feedback-ratings">
            {QUICK_RATINGS.map(([id, label, message]) => (
              <button type="button" className="secondary-btn" key={id} disabled={sending} onClick={() => rate(message)}>{label}</button>
            ))}
          </div>
          <div className="post-game-feedback-actions">
            <button type="button" className="secondary-btn" disabled={sending} onClick={openDetail}>Contar más</button>
            <button type="button" className="secondary-btn" disabled={sending} onClick={dismiss}>Ahora no</button>
          </div>
          {error && <small className="error-text">{error} Puedes reintentar o usar “Contar más”.</small>}
        </>
      )}
    </section>
  );
}
