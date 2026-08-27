import { useEffect, useRef, useState } from 'react';
import { fetchMyFeedback, submitFeedback } from '../feedback.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { userFacingError } from '../userFacingError.js';
import { MAX_FEEDBACK_IMAGES, prepareFeedbackAttachments, validateFeedbackFiles } from '../feedbackAttachments.js';

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
  const [images, setImages] = useState([]);
  const [history, setHistory] = useState([]);
  const mountedRef = useRef(true);
  const submitInFlightRef = useRef(false);
  const submitAbortRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      submitAbortRef.current?.abort('Feedback cerrado');
      submitAbortRef.current = null;
      submitInFlightRef.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchMyFeedback({ signal: controller.signal })
      .then((payload) => { if (!controller.signal.aborted && mountedRef.current) setHistory(payload.feedback || []); })
      .catch(() => {});
    return () => controller.abort('Historial de feedback reemplazado');
  }, [sent]);

  async function handleSubmit(event) {
    event.preventDefault();
    const text = message.trim();
    if (text.length < 3 || submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    const controller = new AbortController();
    submitAbortRef.current?.abort('Nuevo envío de feedback');
    submitAbortRef.current = controller;
    setSending(true);
    setError(null);
    try {
      const attachments = await prepareFeedbackAttachments(images);
      if (controller.signal.aborted || !mountedRef.current) return;
      await submitFeedback({ category, message: text, context, attachments, signal: controller.signal });
      if (!controller.signal.aborted && mountedRef.current) setSent(true);
    } catch (err) {
      if (!controller.signal.aborted && mountedRef.current) setError(userFacingError(err, 'No se pudo enviar el feedback.'));
    } finally {
      if (submitAbortRef.current === controller) submitAbortRef.current = null;
      submitInFlightRef.current = false;
      if (mountedRef.current) setSending(false);
    }
  }

  function handleImages(event) {
    const selected = Array.from(event.target.files || []);
    const validation = validateFeedbackFiles(selected);
    if (validation) {
      setError(validation);
      event.target.value = '';
      return;
    }
    setError(null);
    setImages(selected);
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
            <p className="hint-text">Mensaje corto y, si ayuda, una captura. Llega directamente al panel de administración.</p>
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
            <label className="feedback-field feedback-image-field">
              <span>Capturas opcionales</span>
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.gif,image/png,image/jpeg,image/gif"
                multiple
                onChange={handleImages}
              />
              <small>PNG, JPG/JPEG o GIF · hasta {MAX_FEEDBACK_IMAGES} imágenes · 3 MiB cada una · 6 MiB total.</small>
              {images.length > 0 && (
                <div className="feedback-image-selection" aria-label="Imágenes seleccionadas">
                  {images.map((file, index) => (
                    <span key={`${file.name}-${file.size}-${index}`}><b>{file.name}</b><button type="button" onClick={() => setImages((current) => current.filter((_, i) => i !== index))} aria-label={`Quitar ${file.name}`}>×</button></span>
                  ))}
                </div>
              )}
            </label>
            {error && <p className="error-text">{error}</p>}
            {history.some((item) => item.admin_reply) && (
              <details className="feedback-thread-history">
                <summary>Respuestas de los admins</summary>
                <div className="feedback-thread-list">
                  {history.filter((item) => item.admin_reply).slice(0, 5).map((item) => (
                    <article key={item.id} className="feedback-thread-item">
                      <small>{item.status === 'resolved' ? 'Resuelto' : 'Respondido'} · {item.context || 'Feedback'}</small>
                      <p>{item.admin_reply}</p>
                    </article>
                  ))}
                </div>
              </details>
            )}
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
