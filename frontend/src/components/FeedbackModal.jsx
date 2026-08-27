import { useState } from 'react';
import { submitFeedback } from '../feedback.js';
import { useEscapeToClose } from '../useEscapeToClose.js';

const CATEGORIES = [
  ['ux', 'Me he liado / UX'],
  ['bug', 'Algo se ha roto'],
  ['idea', 'Tengo una idea'],
  ['other', 'Otra cosa'],
];

export default function FeedbackModal({ onClose, context = 'Home' }) {
  useEscapeToClose(onClose);
  const [category, setCategory] = useState('ux');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const text = message.trim();
    if (text.length < 3 || sending) return;
    setSending(true);
    setError(null);
    try {
      await submitFeedback({ category, message: text, context });
      setSent(true);
    } catch (err) {
      setError(err?.message || 'No se pudo enviar el feedback.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="army-card feedback-modal" role="dialog" aria-modal="true" aria-labelledby="feedback-title" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="piece-info-close" onClick={onClose} aria-label="Cerrar">×</button>
        {sent ? (
          <div className="feedback-sent">
            <span className="section-label">Recibido</span>
            <h2 id="feedback-title">Feedback enviado. Gracias.</h2>
            <p className="hint-text">Los admins lo verán en su panel.</p>
            <button type="button" className="primary-btn" onClick={onClose}>Cerrar</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <span className="section-label">Feedback</span>
            <h2 id="feedback-title">Dinos qué mejorar</h2>
            <p className="hint-text">Dos campos y fuera. Llega directamente al panel de administración.</p>
            <label className="feedback-field">
              <span>Tipo</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                {CATEGORIES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
            <label className="feedback-field">
              <span>¿Qué pasó o qué cambiarías?</span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={2000}
                rows={4}
                autoFocus
                placeholder="Ej.: En Combat Chess no entendí por qué el rival tenía una pieza extra…"
              />
              <small>{message.length}/2000</small>
            </label>
            {error && <p className="error-text">{error}</p>}
            <div className="game-controls">
              <button type="button" className="secondary-btn" onClick={onClose}>Cancelar</button>
              <button type="submit" className="primary-btn" disabled={sending || message.trim().length < 3}>
                {sending ? 'Enviando…' : 'Enviar feedback'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
