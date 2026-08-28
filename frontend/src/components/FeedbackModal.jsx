import { useEffect, useRef, useState } from 'react';
import { fetchMyFeedback, submitFeedback } from '../feedback.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { userFacingError } from '../userFacingError.js';
import { MAX_FEEDBACK_IMAGES, prepareFeedbackAttachments, validateFeedbackFiles } from '../feedbackAttachments.js';

const CATEGORIES = [
  ['general', 'General'],
  ['ux', 'Me he liado / UX'],
  ['bug', 'Algo se ha roto'],
  ['idea', 'Tengo una idea'],
  ['other', 'Otra cosa'],
];

function formatBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

export default function FeedbackModal({ onClose, context = 'Home' }) {
  useEscapeToClose(onClose);
  const [category, setCategory] = useState('general');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const [images, setImages] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [history, setHistory] = useState([]);
  const mountedRef = useRef(true);
  const submitInFlightRef = useRef(false);
  const submitAbortRef = useRef(null);
  const fileInputRef = useRef(null);

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
    const next = images.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPreviews(next);
    return () => next.forEach((item) => URL.revokeObjectURL(item.url));
  }, [images]);

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

  function acceptImages(selected) {
    const validation = validateFeedbackFiles(selected);
    if (validation) {
      setError(validation);
      return false;
    }
    setError(null);
    setImages(selected);
    return true;
  }

  function handleImages(event) {
    const selected = Array.from(event.target.files || []);
    acceptImages(selected);
    event.target.value = '';
  }

  function handleDrop(event) {
    event.preventDefault();
    const selected = Array.from(event.dataTransfer?.files || []);
    if (selected.length) acceptImages(selected);
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="army-card feedback-modal" role="dialog" aria-modal="true" aria-labelledby="feedback-title" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="piece-info-close" onClick={onClose} aria-label="Cerrar">×</button>
        {sent ? (
          <div className="feedback-sent">
            <span className="section-label">Recibido</span>
            <h2 id="feedback-title">Feedback enviado. Gracias.</h2>
            <p className="hint-text">Los admins lo verán en su panel. Si te responden, la contestación aparecerá aquí.</p>
            <button type="button" className="primary-btn" onClick={onClose}>Cerrar</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <header className="feedback-modal-heading">
              <span className="section-label">Feedback</span>
              <h2 id="feedback-title">Dinos qué mejorar</h2>
              <p className="hint-text">Cuéntanos lo importante. Si es un bug, una captura suele ahorrar bastante arqueología.</p>
            </header>
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
                placeholder="Ej.: En Combat Chess la CPU se quedó pensando y no pude continuar…"
              />
              <small>{message.length}/2000</small>
            </label>
            <div className="feedback-field feedback-image-field">
              <span>Capturas opcionales</span>
              <input
                ref={fileInputRef}
                className="feedback-native-file-input"
                type="file"
                accept=".png,.jpg,.jpeg,.gif,image/png,image/jpeg,image/gif"
                multiple
                onChange={handleImages}
                tabIndex={-1}
                aria-hidden="true"
              />
              <div
                className="feedback-dropzone"
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop}
              >
                <button type="button" className="secondary-btn feedback-attach-button" onClick={() => fileInputRef.current?.click()}>
                  Adjuntar capturas
                </button>
                <span>o arrástralas aquí</span>
                <small>PNG, JPG/JPEG o GIF · hasta {MAX_FEEDBACK_IMAGES} · 3 MiB cada una · 6 MiB total</small>
              </div>
              {previews.length > 0 && (
                <div className="feedback-image-preview-grid" aria-label="Imágenes seleccionadas">
                  {previews.map(({ file, url }, index) => (
                    <figure key={`${file.name}-${file.size}-${index}`} className="feedback-image-preview">
                      <img src={url} alt="" />
                      <figcaption><b>{file.name}</b><small>{formatBytes(file.size)}</small></figcaption>
                      <button type="button" onClick={() => setImages((current) => current.filter((_, i) => i !== index))} aria-label={`Quitar ${file.name}`}>×</button>
                    </figure>
                  ))}
                </div>
              )}
            </div>
            {error && <p className="error-text" role="alert">{error}</p>}
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
            <footer className="feedback-modal-actions">
              <button type="button" className="secondary-btn" onClick={onClose}>Cancelar</button>
              <button type="submit" className="primary-btn" disabled={sending || message.trim().length < 3}>
                {sending ? 'Enviando…' : 'Enviar feedback'}
              </button>
            </footer>
          </form>
        )}
      </section>
    </div>
  );
}
