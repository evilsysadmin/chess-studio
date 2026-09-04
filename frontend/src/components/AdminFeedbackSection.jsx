import React, { useEffect, useRef, useState } from 'react';
import { fetchAdminFeedbackAttachment } from '../feedback.js';
import { formatAdminTimestamp } from '../adminFormatting.js';

function FeedbackAttachmentPreview({ feedbackId, attachment }) {
  const [src, setSrc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const loadAbortRef = useRef(null);
  const objectUrlRef = useRef(null);

  useEffect(() => () => {
    loadAbortRef.current?.abort(new DOMException('Feedback preview unmounted', 'AbortError'));
    loadAbortRef.current = null;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }, []);

  async function load() {
    if (loading || src || loadAbortRef.current) return;
    const controller = new AbortController();
    loadAbortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const blob = await fetchAdminFeedbackAttachment(feedbackId, attachment.index, { signal: controller.signal });
      if (controller.signal.aborted || loadAbortRef.current !== controller) return;
      const objectUrl = URL.createObjectURL(blob);
      objectUrlRef.current = objectUrl;
      setSrc(objectUrl);
    } catch (err) {
      if (!controller.signal.aborted) setError(err?.message || 'No se pudo abrir la imagen.');
    } finally {
      if (loadAbortRef.current === controller) {
        loadAbortRef.current = null;
        setLoading(false);
      }
    }
  }

  return (
    <div className="admin-feedback-attachment">
      {src ? (
        <a href={src} target="_blank" rel="noreferrer" title="Abrir imagen a tamaño completo">
          <img src={src} alt={attachment.name || 'Captura adjunta al feedback'} />
        </a>
      ) : (
        <button type="button" className="secondary-btn" onClick={load} disabled={loading}>{loading ? 'Cargando…' : `Ver imagen · ${attachment.name || 'captura'}`}</button>
      )}
      {error && <small className="error-text">{error}</small>}
    </div>
  );
}

function FeedbackItem({ item, updating, reply, onReplyChange, onReply, onStatus, onDelete }) {
  return (
    <article className={`admin-feedback-card status-${item.status || 'new'}`}>
      <div className="admin-feedback-meta">
        <strong>{item.username}</strong>
        <span>{item.category === 'bug' ? 'Bug' : item.category === 'idea' ? 'Idea' : item.category === 'ux' ? 'UX' : 'Otro'}</span>
        <span>{item.context || 'Home'}</span>
        <time>{formatAdminTimestamp(item.created_at)}</time>
      </div>
      <p>{item.message}</p>
      {Array.isArray(item.attachments) && item.attachments.length > 0 && (
        <div className="admin-feedback-attachments" aria-label={`${item.attachments.length} imágenes adjuntas`}>
          {item.attachments.map((attachment) => <FeedbackAttachmentPreview key={`${item.id}-${attachment.index}`} feedbackId={item.id} attachment={attachment} />)}
        </div>
      )}
      {item.admin_reply && (
        <div className="admin-feedback-reply-sent"><strong>Respuesta enviada</strong><p>{item.admin_reply}</p></div>
      )}
      <div className="admin-feedback-reply">
        <textarea
          value={reply || ''}
          onChange={(event) => onReplyChange(item.id, event.target.value)}
          maxLength={1000}
          rows={2}
          placeholder="Responder al usuario · ej. RESUELTO: ya está corregido"
          aria-label={`Responder a ${item.username}`}
        />
        <div className="admin-feedback-reply-actions">
          <button type="button" className="secondary-btn" disabled={updating === item.id || !String(reply || '').trim()} onClick={() => onReply(item.id, false)}>Responder</button>
          <button type="button" className="primary-btn" disabled={updating === item.id || !String(reply || '').trim()} onClick={() => onReply(item.id, true)}>Responder + resolver</button>
        </div>
      </div>
      <div className="admin-feedback-actions">
        {item.status === 'new' && (
          <button type="button" className="secondary-btn" disabled={updating === item.id} onClick={() => onStatus(item.id, 'read')}>Marcar leído</button>
        )}
        {item.status !== 'resolved' ? (
          <button type="button" className="secondary-btn" disabled={updating === item.id} onClick={() => onStatus(item.id, 'resolved')}>Resolver</button>
        ) : (
          <button type="button" className="secondary-btn" disabled={updating === item.id} onClick={() => onStatus(item.id, 'read')}>Reabrir</button>
        )}
        <button type="button" className="secondary-btn admin-feedback-delete" disabled={updating === item.id} onClick={() => onDelete(item.id)}>Borrar feedback</button>
        <span className="admin-feedback-status">{item.status === 'resolved' ? 'Resuelto' : item.status === 'read' ? 'Leído' : 'Nuevo'}</span>
      </div>
    </article>
  );
}

export default function AdminFeedbackSection({
  feedback,
  error,
  updating,
  testCreating,
  replies,
  onReplyChange,
  onReply,
  onStatus,
  onDelete,
  onCreateTest,
}) {
  const activeFeedback = (feedback || []).filter((item) => item.status !== 'resolved');
  const resolvedFeedback = (feedback || []).filter((item) => item.status === 'resolved');
  const renderItem = (item) => (
    <FeedbackItem
      key={item.id}
      item={item}
      updating={updating}
      reply={replies[item.id]}
      onReplyChange={onReplyChange}
      onReply={onReply}
      onStatus={onStatus}
      onDelete={onDelete}
    />
  );

  return (
    <section className="admin-feedback-section" aria-label="Feedback de usuarios">
      <div className="admin-feedback-heading">
        <div>
          <span className="section-label">Feedback</span>
          <h3>Lo que están diciendo los usuarios</h3>
        </div>
        <div className="admin-feedback-heading-actions">
          <button type="button" className="secondary-btn" disabled={testCreating} onClick={onCreateTest}>
            {testCreating ? 'Creando…' : 'Crear feedback de prueba'}
          </button>
          <span className="admin-feedback-badge">{(feedback || []).filter((item) => item.status === 'new').length} nuevos</span>
        </div>
      </div>
      {error && <p className="error-text">{error}</p>}
      {!error && feedback === null && <p className="hint-text">Cargando feedback…</p>}
      {!error && feedback && feedback.length === 0 && <p className="hint-text">No hay feedback todavía. Sospechoso silencio administrativo.</p>}
      {!error && feedback && feedback.length > 0 && (
        <>
          {activeFeedback.length > 0 ? (
            <div className="admin-feedback-list" aria-label="Feedback pendiente">{activeFeedback.map(renderItem)}</div>
          ) : (
            <p className="hint-text">No queda feedback pendiente. Milagro administrativo.</p>
          )}
          {resolvedFeedback.length > 0 && (
            <details className="admin-feedback-resolved">
              <summary>Resueltos ({resolvedFeedback.length})</summary>
              <div className="admin-feedback-list admin-feedback-list-resolved">{resolvedFeedback.map(renderItem)}</div>
            </details>
          )}
        </>
      )}
    </section>
  );
}
