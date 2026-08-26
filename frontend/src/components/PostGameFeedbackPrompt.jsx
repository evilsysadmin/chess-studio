import { useState } from 'react';
import { submitFeedback } from '../feedback.js';
import { completePostGameFeedback, snoozePostGameFeedback } from '../postGameFeedback.js';
import FeedbackModal from './FeedbackModal.jsx';

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

  async function rate(message) {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      await submitFeedback({ category: 'other', message, context: 'Post-partida' });
      completePostGameFeedback();
      setSent(true);
    } catch (err) {
      setError(err?.message || 'No se pudo enviar ahora.');
    } finally {
      setSending(false);
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
