import React, { useEffect, useRef, useState } from 'react';
import { APP_RELEASE } from '../release.js';
import { deleteAdminUser, fetchAdminMatthiasMemory, fetchAdminMatthiasStatus, fetchAdminUsers, fetchAdminUserInsights, previewAdminMatthiasPersonality, reanalyzeAdminUser, resetAdminMatthiasMemory } from '../admin.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { computeInsights, generateRoast, generateCoaching } from '../insights.js';
import { ACHIEVEMENTS } from '../achievements.js';
import { getToken, getUsername } from '../auth.js';
import { CPU_IDENTITY } from '../cpuIdentity.js';
import { formatLongMove } from '../notation.js';
import { buildWorstMoveAutopsy } from '../adminWorstMove.js';
import Board from './Board.jsx';
import GlossaryTerm from './GlossaryTerm.jsx';
import ObservabilityPanel from './ObservabilityPanel.jsx';
import AdminObservabilitySummary from './AdminObservabilitySummary.jsx';
import { ADMIN_USER_FILTERS, adminActivityTypeLabel, adminClientReleaseState, adminPresenceDisplayStatus, filterAdminUsers, formatAdminDate, formatAdminRefreshAge, formatAdminTimestamp, sortAdminUsers, summarizeAdminClientReleases, summarizeAdminPresence } from '../adminFormatting.js';
import { deleteAdminFeedback, fetchAdminFeedback, fetchAdminFeedbackAttachment, replyAdminFeedback, submitFeedback, updateAdminFeedbackStatus } from '../feedback.js';
import { buildPlayerPortraitFacts } from '../aiPlayerPortrait.js';
import { ADMIN_REFRESH_MS, shouldRefreshAdminPresence } from '../presenceCadence.js';

const OUTCOME_LABEL = { win: 'V', draw: 'T', loss: 'D' };
const MATTHIAS_MOOD_LABELS = Object.freeze({ observant: 'Observador', impressed: 'Impresionado', skeptical: 'Escéptico', satisfied: 'Satisfecho' });

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

function formatPresenceAge(seconds) {
  if (!Number.isFinite(seconds)) return null;
  if (seconds < 60) return 'ahora';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

function Presence({ user, compact = false }) {
  // Presencia (frescura de sesión) y visibilidad de ventana son señales
  // distintas. Segundo plano sigue siendo online mientras el heartbeat esté vivo.
  const status = adminPresenceDisplayStatus(user);
  const label = status === 'online'
    ? 'En línea'
    : status === 'recent'
      ? `Reciente · ${formatPresenceAge(user.presenceAgeSeconds) || ''}`.replace(/ · $/, '')
      : status === 'idle'
        ? `Inactivo · ${formatPresenceAge(user.presenceAgeSeconds) || ''}`.replace(/ · $/, '')
      : status === 'offline'
        ? (formatPresenceAge(user.presenceAgeSeconds) || 'Offline')
        : 'Sin actividad';
  const exact = user?.lastActivity ? formatAdminTimestamp(user.lastActivity) : 'Sin actividad registrada';
  const windowStateIsMeaningful = ['online', 'idle', 'recent'].includes(status);
  return (
    <span className={`admin-presence admin-presence-${status}`} title={exact}>
      <span className="admin-presence-dot" aria-hidden="true" />
      <span className="admin-presence-copy">
        <span>{label}</span>
        {status === 'online' && user?.currentActivity && <small>{user.currentActivity}</small>}
        {windowStateIsMeaningful && user?.foreground === true && <small className="admin-foreground-state is-foreground">● Primer plano</small>}
        {windowStateIsMeaningful && user?.foreground === false && <small className="admin-foreground-state">○ Segundo plano</small>}
        {!compact && user?.lastActivity && <small>{formatAdminTimestamp(user.lastActivity)}</small>}
      </span>
    </span>
  );
}

function countryFlag(code) {
  const normalized = String(code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return '🌐';
  return String.fromCodePoint(...[...normalized].map((char) => 127397 + char.charCodeAt(0)));
}

function countryName(code, status) {
  const normalized = String(code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) {
    if (status === 'private') return 'Red privada';
    if (status === 'missing') return 'Sin IP registrada';
    if (status === 'invalid') return 'IP no válida';
    return 'País no disponible';
  }
  try { return new Intl.DisplayNames(['es'], { type: 'region' }).of(normalized) || normalized; } catch { return normalized; }
}

function maskedIp(value) {
  const ip = String(value || '');
  if (!ip) return 'Sin IP';
  if (ip.includes(':')) return `${ip.split(':').slice(0, 3).join(':')}::…`;
  const parts = ip.split('.');
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.x.x` : 'IP registrada';
}

function NetworkIdentity({ user, compact = false }) {
  const [revealed, setRevealed] = useState(false);
  const ip = user?.lastClientIp || null;
  const country = user?.lastClientCountry || null;
  const location = countryName(country, user?.networkLocationStatus);
  return (
    <span className="admin-network" title={`${location}${ip ? ' · última IP observada' : ''}`}>
      <span className="admin-network-flag" aria-hidden="true">{countryFlag(country)}</span>
      <span className="admin-network-copy"><b>{location}</b>{!compact && <small>{revealed ? ip : maskedIp(ip)}</small>}</span>
      {ip && <button type="button" onClick={() => setRevealed((value) => !value)} aria-label={revealed ? 'Ocultar IP completa' : 'Mostrar IP completa'}>{revealed ? 'Ocultar' : compact ? maskedIp(ip) : 'Revelar IP'}</button>}
    </span>
  );
}

function WorstMove({ move, compact = false }) {
  if (!move) return <span className="admin-muted">—</span>;
  if (compact) return <strong className="admin-worst-malus">−{move.loss} <GlossaryTerm term="cp">cp</GlossaryTerm></strong>;
  return (
    <span>
      <strong>{move.played || '—'}</strong>
      {move.suggested ? <> · mejor: {move.suggested}</> : null}
      {Number.isFinite(move.loss) ? <> · pérdida {move.loss} <GlossaryTerm term="cp">cp</GlossaryTerm></> : null}
    </span>
  );
}

function WorstMoveAutopsy({ move, data }) {
  if (!move) return <span className="admin-muted">Sin analizar todavía</span>;
  const autopsy = data?.autopsy;
  if (!autopsy) return <WorstMove move={move} />;
  const orientation = autopsy.record?.humanColor === 'b' ? 'black' : 'white';
  const playedLong = formatLongMove({ piece: move.playedPiece, from: move.playedFrom, to: move.playedTo }) || move.played || '—';
  const bestLong = formatLongMove({ piece: move.suggestedPiece, from: move.suggestedFrom, to: move.suggestedTo }) || move.suggested || '—';
  return (
    <div className="admin-autopsy">
      <div className="admin-autopsy-summary">
        <span className="admin-autopsy-verdict">{autopsy.incident}</span>
        <strong>−{move.loss} <GlossaryTerm term="cp">cp</GlossaryTerm></strong>
        <small>Jugada {move.moveNumber || Math.floor(autopsy.index / 2) + 1} · {autopsy.mode}{autopsy.record?.date ? ` · ${formatAdminDate(autopsy.record.date)}` : ''}</small>
      </div>
      <div className="admin-autopsy-moves">
        <span><b>Jugó:</b> {autopsy.playedPiece} {autopsy.playedFrom || '?'} → {autopsy.playedTo || '?'} · {playedLong}</span>
        <span><b>Motor:</b> {autopsy.suggestedPiece} {move.suggestedFrom || '?'} → {move.suggestedTo || '?'} · {bestLong}</span>
      </div>
      {autopsy.fenBefore && autopsy.fenAfter && (
        <details className="admin-autopsy-positions">
          <summary>Ver posiciones</summary>
          <div className="admin-autopsy-boards">
            <figure><figcaption>Antes</figcaption><Board fen={autopsy.fenBefore} orientation={orientation} /></figure>
            <figure><figcaption>Después del error</figcaption><Board fen={autopsy.fenAfter} orientation={orientation} lastMove={{ from: autopsy.playedFrom, to: autopsy.playedTo }} /></figure>
            {autopsy.bestFen && <figure><figcaption>Alternativa correcta</figcaption><Board fen={autopsy.bestFen} orientation={orientation} hintMove={{ from: move.suggestedFrom, to: move.suggestedTo }} /></figure>}
          </div>
        </details>
      )}
    </div>
  );
}

function buildAdminInsights(payload) {
  if (!payload) return null;
  const insights = computeInsights(
    payload.gameHistory || [],
    payload.combatHistory || [],
    payload.ratingHistory || [],
  );
  const rivalry = payload.rivalry || {};
  const rawExtras = payload.extras || {};
  const extras = {
    achievementsUnlocked: Number(rawExtras.achievementsUnlocked || 0),
    achievementsTotal: ACHIEVEMENTS.length,
    puzzlesSolved: Number(rawExtras.puzzlesSolved || 0),
    personalPuzzles: Number(rawExtras.personalPuzzles || 0),
    rivalryRecord: rivalry.record,
    incidents: rivalry.incidents,
  };
  const worst = rawExtras.worstMove
    ? { moveReport: {
      played: rawExtras.worstMove.played,
      suggested: rawExtras.worstMove.suggested,
      loss: rawExtras.worstMove.loss,
    } }
    : null;
  return {
    insights,
    roast: generateRoast(insights, worst, extras),
    coaching: generateCoaching(insights, rivalry, extras),
    autopsy: buildWorstMoveAutopsy(payload, rawExtras.worstMove),
    portraitFacts: buildPlayerPortraitFacts(insights, rivalry, extras, worst),
  };
}

const BUILD_SHA = import.meta.env.VITE_BUILD_SHA || 'local';

export default function AdminScreen({ onExit }) {
  useEscapeToClose(onExit);
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [insightsByUser, setInsightsByUser] = useState({});
  const [insightsLoading, setInsightsLoading] = useState({});
  const [insightsErrors, setInsightsErrors] = useState({});
  const [deletingUser, setDeletingUser] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [feedbackError, setFeedbackError] = useState(null);
  const [feedbackUpdating, setFeedbackUpdating] = useState(null);
  const [feedbackTestCreating, setFeedbackTestCreating] = useState(false);
  const [feedbackDeleteCandidate, setFeedbackDeleteCandidate] = useState(null);
  const [feedbackReplies, setFeedbackReplies] = useState({});
  const [activityFilter, setActivityFilter] = useState('all');
  const [adminView, setAdminView] = useState('overview');
  const [aiPortraitByUser, setAiPortraitByUser] = useState({});
  const [aiPortraitLoading, setAiPortraitLoading] = useState({});
  const [aiPortraitError, setAiPortraitError] = useState({});
  const adminDataEpochRef = useRef(0);
  const adminRefreshInFlightRef = useRef(null);
  const [lastAdminRefreshAt, setLastAdminRefreshAt] = useState(null);
  const [adminNow, setAdminNow] = useState(() => Date.now());
  const [matthiasStatus, setMatthiasStatus] = useState(null);
  const [matthiasStatusError, setMatthiasStatusError] = useState(null);
  const [matthiasResettingUser, setMatthiasResettingUser] = useState(null);
  const [matthiasResetError, setMatthiasResetError] = useState(null);
  const [matthiasMemoryByUser, setMatthiasMemoryByUser] = useState({});
  const [matthiasMemoryLoading, setMatthiasMemoryLoading] = useState({});
  const [matthiasPreviewPreset, setMatthiasPreviewPreset] = useState('veteran');
  const [matthiasPreview, setMatthiasPreview] = useState(null);
  const [matthiasPreviewLoading, setMatthiasPreviewLoading] = useState(false);
  const [matthiasPreviewError, setMatthiasPreviewError] = useState(null);

  useEffect(() => {
    let mounted = true;
    async function refreshAdminData(silent = false) {
      if (adminRefreshInFlightRef.current) return adminRefreshInFlightRef.current.pending;
      const epoch = adminDataEpochRef.current;
      const requestToken = Symbol('admin-refresh');
      const pending = Promise.allSettled([fetchAdminUsers(), fetchAdminFeedback(), fetchAdminMatthiasStatus()]);
      adminRefreshInFlightRef.current = { requestToken, pending };
      try {
        const [usersResult, feedbackResult, matthiasResult] = await pending;
        if (!mounted || adminDataEpochRef.current !== epoch || adminRefreshInFlightRef.current?.requestToken !== requestToken) return;
        if (usersResult.status === 'fulfilled') {
          setUsers(usersResult.value);
          setLastAdminRefreshAt(Date.now());
          setAdminNow(Date.now());
          setError(null);
        } else if (!silent) {
          setError(usersResult.reason?.message || 'No se pudieron cargar los usuarios.');
        }
        if (feedbackResult.status === 'fulfilled') {
          setFeedback(feedbackResult.value.feedback || []);
          setFeedbackError(null);
        } else if (!silent) {
          setFeedbackError(feedbackResult.reason?.message || 'No se pudo cargar el feedback.');
        }
        if (matthiasResult.status === 'fulfilled') {
          setMatthiasStatus(matthiasResult.value || null);
          setMatthiasStatusError(null);
        } else if (!silent) {
          setMatthiasStatusError(matthiasResult.reason?.message || 'No se pudo cargar el estado de Matthias.');
        }
      } finally {
        if (adminRefreshInFlightRef.current?.requestToken === requestToken) adminRefreshInFlightRef.current = null;
      }
    }
    refreshAdminData();
    const refreshIfVisible = () => {
      if (shouldRefreshAdminPresence(document.visibilityState)) refreshAdminData(true);
    };
    const handleVisibility = () => {
      if (shouldRefreshAdminPresence(document.visibilityState)) refreshAdminData(true);
    };
    const timer = window.setInterval(refreshIfVisible, ADMIN_REFRESH_MS);
    const ageTimer = window.setInterval(() => {
      if (shouldRefreshAdminPresence(document.visibilityState)) setAdminNow(Date.now());
    }, 5000);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      window.clearInterval(ageTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  async function handleFeedbackStatus(feedbackId, status) {
    adminDataEpochRef.current += 1;
    setFeedbackUpdating(feedbackId);
    setFeedbackError(null);
    try {
      const result = await updateAdminFeedbackStatus(feedbackId, status);
      setFeedback((current) => (current || []).map((item) => item.id === feedbackId ? result.feedback : item));
    } catch (e) {
      setFeedbackError(e?.message || 'No se pudo actualizar el feedback.');
    } finally {
      setFeedbackUpdating(null);
    }
  }

  async function handleFeedbackReply(feedbackId, resolve = false) {
    const message = String(feedbackReplies[feedbackId] || '').trim();
    if (!message || feedbackUpdating) return;
    adminDataEpochRef.current += 1;
    setFeedbackUpdating(feedbackId);
    setFeedbackError(null);
    try {
      const result = await replyAdminFeedback(feedbackId, message, resolve);
      setFeedback((current) => (current || []).map((item) => item.id === feedbackId ? result.feedback : item));
      setFeedbackReplies((current) => ({ ...current, [feedbackId]: '' }));
    } catch (e) {
      setFeedbackError(e?.message || 'No se pudo responder al feedback.');
    } finally {
      setFeedbackUpdating(null);
    }
  }

  async function handleCreateTestFeedback() {
    if (feedbackTestCreating) return;
    setFeedbackTestCreating(true);
    setFeedbackError(null);
    try {
      const result = await submitFeedback({
        category: 'general',
        message: 'Feedback de prueba generado desde Admin.',
        context: 'Admin · prueba',
      });
      if (result?.feedback) setFeedback((current) => [result.feedback, ...(current || [])]);
    } catch (e) {
      setFeedbackError(e?.message || 'No se pudo crear el feedback de prueba.');
    } finally {
      setFeedbackTestCreating(false);
    }
  }

  function handleFeedbackDelete(feedbackId) {
    if (feedbackUpdating) return;
    setFeedbackDeleteCandidate(feedbackId);
  }

  async function confirmFeedbackDelete() {
    const feedbackId = feedbackDeleteCandidate;
    if (!feedbackId || feedbackUpdating) return;
    setFeedbackDeleteCandidate(null);
    adminDataEpochRef.current += 1;
    setFeedbackUpdating(feedbackId);
    setFeedbackError(null);
    try {
      await deleteAdminFeedback(feedbackId);
      setFeedback((current) => (current || []).filter((item) => item.id !== feedbackId));
      setFeedbackReplies((current) => {
        const next = { ...current };
        delete next[feedbackId];
        return next;
      });
    } catch (e) {
      setFeedbackError(e?.message || 'No se pudo borrar el feedback.');
    } finally {
      setFeedbackUpdating(null);
    }
  }

  async function handleDeleteUser(targetUsername) {
    const confirmed = window.confirm(
      `Eliminar definitivamente la cuenta “${targetUsername}”?\n\nSe borrarán también su perfil y sus partidas activas. Esta acción no se puede deshacer.`,
    );
    if (!confirmed) return;

    adminDataEpochRef.current += 1;
    setDeletingUser(targetUsername);
    setDeleteError(null);
    try {
      await deleteAdminUser(targetUsername);
      setUsers((current) => (current || []).filter((user) => user.username !== targetUsername));
      setExpanded((current) => (current === targetUsername ? null : current));
      setInsightsByUser((current) => {
        const next = { ...current };
        delete next[targetUsername];
        return next;
      });
    } catch (e) {
      setDeleteError(e.message || 'No se pudo eliminar la cuenta.');
    } finally {
      setDeletingUser(null);
    }
  }

  useEffect(() => {
    if (!expanded || insightsByUser[expanded] || insightsLoading[expanded] || insightsErrors[expanded]) return;
    setInsightsLoading((prev) => ({ ...prev, [expanded]: true }));
    setInsightsErrors((prev) => ({ ...prev, [expanded]: null }));
    fetchAdminUserInsights(expanded)
      .then((payload) => {
        setInsightsByUser((prev) => ({ ...prev, [expanded]: buildAdminInsights(payload) }));
      })
      .catch((e) => {
        setInsightsErrors((prev) => ({ ...prev, [expanded]: e.message }));
      })
      .finally(() => {
        setInsightsLoading((prev) => ({ ...prev, [expanded]: false }));
      });
  }, [expanded, insightsByUser, insightsLoading, insightsErrors]);

  useEffect(() => {
    if (!expanded || matthiasMemoryByUser[expanded] || matthiasMemoryLoading[expanded]) return;
    setMatthiasMemoryLoading((prev) => ({ ...prev, [expanded]: true }));
    fetchAdminMatthiasMemory(expanded)
      .then((payload) => setMatthiasMemoryByUser((prev) => ({ ...prev, [expanded]: payload?.memory || null })))
      .catch(() => setMatthiasMemoryByUser((prev) => ({ ...prev, [expanded]: null })))
      .finally(() => setMatthiasMemoryLoading((prev) => ({ ...prev, [expanded]: false })));
  }, [expanded, matthiasMemoryByUser, matthiasMemoryLoading]);

  async function handleResetMatthiasMemory(username) {
    if (matthiasResettingUser) return;
    const confirmed = window.confirm(
      `¿Borrar sólo la memoria de Matthias para “${username}”?\n\nNo se borrarán partidas, rating, puzzles ni progreso. Matthias olvidará sus consultas y consejos previos para ese usuario.`,
    );
    if (!confirmed) return;
    setMatthiasResettingUser(username);
    setMatthiasResetError(null);
    try {
      await resetAdminMatthiasMemory(username);
      const status = await fetchAdminMatthiasStatus();
      setMatthiasStatus(status || null);
      setMatthiasStatusError(null);
      setMatthiasMemoryByUser((current) => ({ ...current, [username]: null }));
    } catch (error) {
      setMatthiasResetError(error?.message || 'No se pudo borrar la memoria de Matthias.');
    } finally {
      setMatthiasResettingUser(null);
    }
  }

  async function handlePreviewMatthias() {
    if (matthiasPreviewLoading) return;
    setMatthiasPreviewLoading(true);
    setMatthiasPreviewError(null);
    try {
      const result = await previewAdminMatthiasPersonality(matthiasPreviewPreset);
      setMatthiasPreview(result || null);
    } catch (error) {
      setMatthiasPreviewError(error?.message || 'No se pudo probar la personalidad de Matthias.');
    } finally {
      setMatthiasPreviewLoading(false);
    }
  }

  async function handleReanalyzePlayer(username) {
    const dossier = insightsByUser[username];
    const facts = dossier?.portraitFacts;
    if (!facts) {
      setAiPortraitError((prev) => ({ ...prev, [username]: 'No hay datos suficientes para reanalizar todavía.' }));
      return;
    }
    setAiPortraitLoading((prev) => ({ ...prev, [username]: true }));
    setAiPortraitError((prev) => ({ ...prev, [username]: null }));
    try {
      const result = await reanalyzeAdminUser(username, facts);
      const text = typeof result?.text === 'string' ? result.text.trim() : '';
      if (!text) throw new Error('Workers AI no devolvió una lectura utilizable.');
      setAiPortraitByUser((prev) => ({ ...prev, [username]: { text, provider: result?.provider || 'local' } }));
    } catch (error) {
      setAiPortraitError((prev) => ({ ...prev, [username]: error?.message || 'No se pudo reanalizar al jugador.' }));
    } finally {
      setAiPortraitLoading((prev) => ({ ...prev, [username]: false }));
    }
  }

  const currentAdmin = getUsername();
  const presenceCounts = summarizeAdminPresence(users || [], currentAdmin);
  const foregroundCount = presenceCounts.foreground;
  const onlineCount = presenceCounts.online;
  const idleCount = presenceCounts.idle;
  const filteredUsers = filterAdminUsers(users || [], activityFilter);
  const releaseSummary = summarizeAdminClientReleases(users || [], currentAdmin, APP_RELEASE);
  const activeFeedback = (feedback || []).filter((item) => item.status !== 'resolved');
  const resolvedFeedback = (feedback || []).filter((item) => item.status === 'resolved');

  function renderFeedbackItem(item) {
    return (
      <article key={item.id} className={`admin-feedback-card status-${item.status || 'new'}`}>
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
            value={feedbackReplies[item.id] || ''}
            onChange={(event) => setFeedbackReplies((current) => ({ ...current, [item.id]: event.target.value }))}
            maxLength={1000}
            rows={2}
            placeholder="Responder al usuario · ej. RESUELTO: ya está corregido"
            aria-label={`Responder a ${item.username}`}
          />
          <div className="admin-feedback-reply-actions">
            <button type="button" className="secondary-btn" disabled={feedbackUpdating === item.id || !(feedbackReplies[item.id] || '').trim()} onClick={() => handleFeedbackReply(item.id, false)}>Responder</button>
            <button type="button" className="primary-btn" disabled={feedbackUpdating === item.id || !(feedbackReplies[item.id] || '').trim()} onClick={() => handleFeedbackReply(item.id, true)}>Responder + resolver</button>
          </div>
        </div>
        <div className="admin-feedback-actions">
          {item.status === 'new' && (
            <button type="button" className="secondary-btn" disabled={feedbackUpdating === item.id} onClick={() => handleFeedbackStatus(item.id, 'read')}>Marcar leído</button>
          )}
          {item.status !== 'resolved' ? (
            <button type="button" className="secondary-btn" disabled={feedbackUpdating === item.id} onClick={() => handleFeedbackStatus(item.id, 'resolved')}>Resolver</button>
          ) : (
            <button type="button" className="secondary-btn" disabled={feedbackUpdating === item.id} onClick={() => handleFeedbackStatus(item.id, 'read')}>Reabrir</button>
          )}
          <button type="button" className="secondary-btn admin-feedback-delete" disabled={feedbackUpdating === item.id} onClick={() => handleFeedbackDelete(item.id)}>Borrar feedback</button>
          <span className="admin-feedback-status">{item.status === 'resolved' ? 'Resuelto' : item.status === 'read' ? 'Leído' : 'Nuevo'}</span>
        </div>
      </article>
    );
  }

  if (adminView === 'observability') {
    return (
      <div className="menu admin-screen admin-observability-view">
        <button className="back-link" onClick={() => setAdminView('overview')}>← Volver al panel admin</button>
        <div className="menu-section">
          <div className="admin-subview-heading">
            <div><span className="section-label">Admin</span><h2>Observabilidad</h2></div>
            <button type="button" className="secondary-btn" onClick={onExit}>Salir al menú</button>
          </div>
          <p className="hint-text">Dashboards operativos, histórico temporal, Workers AI y diagnóstico SRE.</p>
          <ObservabilityPanel token={getToken()} users={users || []} currentAdmin={currentAdmin} />
        </div>
      </div>
    );
  }

  return (
    <div className="menu admin-screen">
      {feedbackDeleteCandidate && (
        <div className="modal-backdrop admin-confirm-backdrop" role="presentation" onMouseDown={() => setFeedbackDeleteCandidate(null)}>
          <section className="army-card admin-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-delete-title" onMouseDown={(event) => event.stopPropagation()}>
            <span className="section-label">Feedback · acción irreversible</span>
            <h2 id="feedback-delete-title">¿Borrar este feedback?</h2>
            <p>Útil para limpiar mensajes de prueba. Esta acción no se puede deshacer.</p>
            <div className="admin-confirm-actions">
              <button type="button" className="secondary-btn" onClick={() => setFeedbackDeleteCandidate(null)}>Cancelar</button>
              <button type="button" className="primary-btn danger-btn" onClick={() => void confirmFeedbackDelete()}>Borrar definitivamente</button>
            </div>
          </section>
        </div>
      )}
      <button className="back-link" onClick={onExit}>← Volver al menú</button>
      <div className="menu-section">
        <span className="section-label">Admin</span>
        <h2>Administración</h2>
        <p className="hint-text">Salud y feedback primero; usuarios y actividad quedan debajo.</p>
        <p className="hint-text admin-build-id">Release: <code>{APP_RELEASE}</code> · Build: <code>{BUILD_SHA === 'local' ? 'local' : BUILD_SHA.slice(0, 8)}</code></p>
        <AdminObservabilitySummary
          token={getToken()}
          users={users || []}
          currentAdmin={currentAdmin}
          onOpen={() => setAdminView('observability')}
        />

        <section className="admin-matthias-status" aria-label="Estado de Matthias">
          <div className="admin-matthias-status-heading">
            <img src={CPU_IDENTITY.avatar} alt="" aria-hidden="true" />
            <div><span className="section-label">Matthias · memoria persistente</span><h3>Estado del entrenador residente</h3></div>
          </div>
          {matthiasStatusError && <p className="error-text">{matthiasStatusError}</p>}
          {!matthiasStatusError && !matthiasStatus && <p className="hint-text">Leyendo la memoria de Matthias…</p>}
          {matthiasStatus && (
            <>
              <div className="admin-matthias-status-grid">
                <div><strong>{matthiasStatus.consultations ?? 0}</strong><span>consultas útiles recordadas</span></div>
                <div><strong>{matthiasStatus.usersWithMemory ?? 0}</strong><span>jugadores con memoria</span></div>
                <div><strong>{matthiasStatus.aiToday?.calls ?? 0}{matthiasStatus.aiToday?.boundedWindow ? '+' : ''}</strong><span>llamadas hoy</span></div>
                <div><strong>{matthiasStatus.storage === 'mongo' ? 'MongoDB' : 'Memoria local'}</strong><span>almacenamiento activo</span></div>
                <div><strong>{matthiasStatus.aiToday?.cloudflarePercent == null ? '—' : `${matthiasStatus.aiToday.cloudflarePercent}%`}</strong><span>Workers AI hoy</span></div>
                <div><strong>{matthiasStatus.aiToday?.fallbackPercent == null ? '—' : `${matthiasStatus.aiToday.fallbackPercent}%`}</strong><span>fallback local hoy</span></div>
                <div><strong>{matthiasStatus.aiToday?.p50Ms == null ? '—' : `${Math.round(matthiasStatus.aiToday.p50Ms)} ms`}</strong><span>latencia p50 Workers</span></div>
                <div><strong>{matthiasStatus.aiToday?.timeouts ?? 0}</strong><span>timeouts hoy</span></div>
                <div><strong>{matthiasStatus.milestonesRemembered ?? 0}</strong><span>hitos persistentes</span></div>
                <div><strong>{matthiasStatus.activeChallenges ?? 0}</strong><span>retos personales activos</span></div>
                <div><strong>{matthiasStatus.emblematicPositions ?? 0}</strong><span>posiciones emblemáticas</span></div>
                <div><strong>{matthiasStatus.topActiveGoal?.label || '—'}</strong><span>obsesión activa más común</span></div>
              </div>
              <div className="admin-matthias-advice">
                <span className="section-label">Consejo dominante · agregado y anónimo</span>
                {matthiasStatus.dominantAdvice?.label ? (
                  <>
                    <p>{matthiasStatus.dominantAdvice.label}</p>
                    <small>{matthiasStatus.dominantAdvice.consultations ?? 0} consultas · {matthiasStatus.dominantAdvice.usersAffected ?? 0} jugador{matthiasStatus.dominantAdvice.usersAffected === 1 ? '' : 'es'} afectado{matthiasStatus.dominantAdvice.usersAffected === 1 ? '' : 's'}</small>
                  </>
                ) : <p className="hint-text">Todavía no hay señal suficiente para un consejo dominante.</p>}
              </div>
              <div className="admin-matthias-preview">
                <div><span className="section-label">Banco de personalidad · datos sintéticos</span><p>Prueba cómo habla Matthias sin tocar memoria, estadísticas ni cuota de ningún jugador.</p></div>
                <div className="admin-matthias-preview-controls">
                  <select value={matthiasPreviewPreset} onChange={(event) => { setMatthiasPreviewPreset(event.target.value); setMatthiasPreview(null); }} aria-label="Perfil sintético de Matthias">
                    <option value="newcomer">Recluta nuevo</option>
                    <option value="veteran">Veterano respetado</option>
                    <option value="repeat_offender">Reincidente táctico</option>
                    <option value="improving">Jugador mejorando</option>
                  </select>
                  <button type="button" className="secondary-btn" disabled={matthiasPreviewLoading} onClick={() => void handlePreviewMatthias()}>{matthiasPreviewLoading ? 'Interrogando…' : 'Probar a Matthias'}</button>
                </div>
                {matthiasPreview?.text && <div className="admin-matthias-preview-answer"><img src={CPU_IDENTITY.avatar} alt="" aria-hidden="true" /><p>{matthiasPreview.text}</p><small>{matthiasPreview.provider === 'cloudflare' ? 'Workers AI' : 'Fallback local'} · sandbox sintético</small></div>}
                {matthiasPreviewError && <p className="error-text">{matthiasPreviewError}</p>}
              </div>
              <small className="admin-matthias-privacy">Memoria schema v{matthiasStatus.memorySchemaVersion ?? '—'} · hasta {matthiasStatus.recentAdviceCap ?? '—'} consejos, {matthiasStatus.activeGoalCap ?? '—'} objetivos, {matthiasStatus.milestoneCap ?? '—'} hitos, {matthiasStatus.openingMemoryCap ?? '—'} aperturas y {matthiasStatus.emblematicPositionCap ?? '—'} posiciones emblemáticas por jugador. El panel agrega temas: no expone conversaciones privadas ni convierte consejos del LLM en hechos del jugador.</small>
            </>
          )}
        </section>

        {/* La voz del usuario es señal operativa: vive arriba, junto a salud y observabilidad, no enterrada tras la tabla. */}
        <section className="admin-feedback-section" aria-label="Feedback de usuarios">
          <div className="admin-feedback-heading">
            <div>
              <span className="section-label">Feedback</span>
              <h3>Lo que están diciendo los usuarios</h3>
            </div>
            <div className="admin-feedback-heading-actions">
              <button type="button" className="secondary-btn" disabled={feedbackTestCreating} onClick={handleCreateTestFeedback}>
                {feedbackTestCreating ? 'Creando…' : 'Crear feedback de prueba'}
              </button>
              <span className="admin-feedback-badge">{(feedback || []).filter((item) => item.status === 'new').length} nuevos</span>
            </div>
          </div>
          {feedbackError && <p className="error-text">{feedbackError}</p>}
          {!feedbackError && feedback === null && <p className="hint-text">Cargando feedback…</p>}
          {!feedbackError && feedback && feedback.length === 0 && <p className="hint-text">No hay feedback todavía. Sospechoso silencio administrativo.</p>}
          {!feedbackError && feedback && feedback.length > 0 && (
            <>
              {activeFeedback.length > 0 ? (
                <div className="admin-feedback-list" aria-label="Feedback pendiente">
                  {activeFeedback.map(renderFeedbackItem)}
                </div>
              ) : (
                <p className="hint-text">No queda feedback pendiente. Milagro administrativo.</p>
              )}
              {resolvedFeedback.length > 0 && (
                <details className="admin-feedback-resolved">
                  <summary>Resueltos ({resolvedFeedback.length})</summary>
                  <div className="admin-feedback-list admin-feedback-list-resolved">
                    {resolvedFeedback.map(renderFeedbackItem)}
                  </div>
                </details>
              )}
            </>
          )}
        </section>
        {users && (
          <section className="admin-presence-block" aria-label="Presencia de usuarios">
            <div className="admin-presence-block-heading"><div><span className="section-label">Presencia</span><h3>Ahora mismo</h3></div><small>Vista admin · refresco 30 s con foco · actualizado {formatAdminRefreshAge(lastAdminRefreshAt, adminNow)}</small></div>
            <div className="admin-presence-summary">
              <div><strong>{foregroundCount}</strong><span>en primer plano</span></div>
              <div><strong>{onlineCount}</strong><span>en línea</span></div>
              <div><strong>{idleCount}</strong><span>inactivos</span></div>
              <small>Otros usuarios · muestreo aprox. cada 2 min · el estado caduca automáticamente</small>
            </div>
            <details className="friendly-disclosure admin-release-summary"><summary>Estado de versiones de clientes</summary><div className="friendly-disclosure-body admin-release-summary-grid">{['current','outdated','newer','different','unknown'].map((id)=>{const label={current:'Actual',outdated:'Antigua',newer:'Más nueva',different:'Distinta',unknown:'Sin dato'}[id];return <span key={id}><b>{releaseSummary[id]||0}</b>{label}</span>;})}</div></details>
          </section>
        )}

        <div className="admin-users-heading">
          <span className="section-label">Usuarios</span>
          <h2>Usuarios registrados</h2>
          <p className="hint-text">Pulsa el nombre de un usuario para abrir o cerrar su expediente ajedrecístico.</p>
        </div>

        {users && users.length > 0 && (
          <div className="admin-activity-filters" role="group" aria-label="Filtrar usuarios por actividad">
            {ADMIN_USER_FILTERS.map((filter) => {
              const count = filterAdminUsers(users, filter.id).length;
              return (
                <button
                  key={filter.id}
                  type="button"
                  className={`admin-filter-chip${activityFilter === filter.id ? ' is-active' : ''}`}
                  onClick={() => setActivityFilter(filter.id)}
                  aria-pressed={activityFilter === filter.id}
                >
                  {filter.label}<span>{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {error && <p className="error-text">{error}</p>}
        {deleteError && <p className="error-text">{deleteError}</p>}
        {!error && !users && <p className="hint-text">Cargando…</p>}
        {!error && users && users.length === 0 && (
          <p className="hint-text">Todavía no hay ningún usuario registrado.</p>
        )}

        {!error && users && users.length > 0 && filteredUsers.length === 0 && (
          <p className="hint-text">No hay usuarios que coincidan con este filtro.</p>
        )}

        {!error && users && filteredUsers.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Actividad</th>
                  <th>Red</th>
                  <th>Rating</th>
                  <th>Partidas</th>
                  <th>V/T/D</th>
                  <th>Peor</th>
                  <th>Versión</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sortAdminUsers(filteredUsers).map((u) => {
                  const isOpen = expanded === u.username;
                  const isSelf = getUsername() === u.username;
                  const detailId = `admin-user-details-${String(u.username).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
                  const releaseState = adminClientReleaseState(u.clientRelease, APP_RELEASE);
                  return (
                    <React.Fragment key={u.username}>
                      <tr>
                        <td className="admin-user-cell" data-label="Usuario">
                          <button
                            type="button"
                            className={`admin-user-link${isOpen ? ' is-open' : ''}`}
                            onClick={() => setExpanded(isOpen ? null : u.username)}
                            aria-expanded={isOpen}
                            aria-controls={detailId}
                            title={`${isOpen ? 'Cerrar' : 'Abrir'} expediente de ${u.username}`}
                          >
                            <span>{u.username}</span>
                            <span className="admin-user-link-chevron" aria-hidden="true">{isOpen ? '▾' : '›'}</span>
                          </button>
                        </td>
                        <td data-label="Actividad"><Presence user={u} compact /></td>
                        <td data-label="Red"><NetworkIdentity user={u} compact /></td>
                        <td data-label="Rating">{u.rating ?? '—'}</td>
                        <td data-label="Partidas">{u.totalGames ?? u.gamesPlayed ?? '—'}</td>
                        <td data-label="V/T/D">{u.totalGames ? `${u.wins}/${u.draws}/${u.losses}` : '—'}</td>
                        <td className="admin-worst-cell" data-label="Peor"><WorstMove move={u.worstMove} compact /></td>
                        <td data-label="Versión"><span className={`admin-client-release is-${releaseState.id}`} title={u.clientRelease ? `Última release reportada: ${u.clientRelease}` : 'Todavía no ha reportado versión'}><b>{releaseState.label}</b>{u.clientRelease ? <small>{u.clientRelease}</small> : null}</span></td>
                        <td className="admin-actions-cell" data-label="Acciones">
                          <div className="admin-user-actions">
                            <button
                              className="admin-delete-button"
                              disabled={isSelf || deletingUser === u.username}
                              onClick={() => handleDeleteUser(u.username)}
                              title={isSelf ? 'No puedes borrar desde aquí la cuenta con la que estás administrando' : `Eliminar definitivamente la cuenta ${u.username}`}
                            >
                              {isSelf ? 'Tu cuenta' : deletingUser === u.username ? 'Eliminando…' : 'Eliminar'}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="admin-detail-row" id={detailId}>
                          <td colSpan="9">
                            <div className="admin-detail-grid">
                              <div><span>Registrado</span><strong>{formatAdminTimestamp(u.createdAt)}</strong></div>
                              <div><span>Presencia</span><strong><Presence user={u} /></strong></div>
                              <div><span>Última pantalla conocida</span><strong>{u.currentActivity || '—'}</strong></div>
                              <div><span>Versión del cliente</span><strong>{releaseState.label}{u.clientRelease ? ` · ${u.clientRelease}` : ''}</strong></div>
                              <div><span>Ventana</span><strong>{u.foreground === true ? 'Primer plano' : u.foreground === false ? 'Segundo plano / no visible' : 'Sin dato'}</strong></div>
                              <div><span>Última actividad exacta</span><strong>{formatAdminTimestamp(u.lastActivity)}</strong></div>
                              <div><span>Última red observada</span><strong><NetworkIdentity user={u} /></strong></div>
                              <div><span>Porcentaje de victoria</span><strong>{u.winPct == null ? '—' : `${u.winPct}%`}</strong></div>
                              <div><span>Rating / partidas <GlossaryTerm term="ELO">ELO</GlossaryTerm></span><strong>{u.rating ?? '—'} / {u.ratingGames ?? '—'}</strong></div>
                              <div><span>Pico de rating</span><strong>{u.ratingPeak ?? '—'}</strong></div>
                              <div><span>Racha máx. victorias</span><strong>{u.longestWinStreak ?? 0}</strong></div>
                              <div><span>Victoria más difícil</span><strong>{u.bestDifficultyWin == null ? '—' : `CPU ${u.bestDifficultyWin}`}</strong></div>
                              <div><span>Partidas normales</span><strong>{u.gamesPlayed ?? 0}</strong></div>
                              <div><span>Embudo de partidas</span><strong>{u.funnelStarted ?? 0} iniciadas · {u.funnelFinished ?? 0} terminadas</strong></div>
                              <div><span>Finalización</span><strong>{u.funnelCompletionPct == null ? '—' : `${u.funnelCompletionPct}%`}{u.funnelCancelled ? ` · ${u.funnelCancelled} abandonadas` : ''}</strong></div>
                              <div><span>Dificultad adaptativa</span><strong>{u.adaptiveStarted ?? 0} iniciadas · {u.adaptiveFinished ?? 0} terminadas</strong></div>
                              <div><span>Batallas Combat Chess</span><strong>{u.combatBattles ?? 0}</strong></div>
                              <div><span>Capturas humanas</span><strong>{u.humanCaptures ?? 0}</strong></div>
                              <div><span>Damas capturadas</span><strong>{u.queensCaptured ?? 0}</strong></div>
                              <div><span>Damas perdidas</span><strong>{u.queensLost ?? 0}</strong></div>
                              <div><span>Blancas / negras</span><strong>{u.whiteGames ?? 0} / {u.blackGames ?? 0}</strong></div>
                              <div><span>Puntos / victorias torneo</span><strong>{u.tournamentPoints ?? '—'} / {u.tournamentWins ?? '—'}</strong></div>
                              <div><span>Partidas analizadas</span><strong>{u.analyzedGames ?? 0}</strong></div>
                              <div><span>Puzzles resueltos</span><strong>{u.puzzlesSolved ?? 0}</strong></div>
                              <div><span>Mejor racha puzzles</span><strong>{u.puzzleBestStreak ?? 0}</strong></div>
                              <div><span>Puzzles de errores propios</span><strong>{u.personalPuzzles ?? 0}</strong></div>
                              <div><span>Racha diaria máx.</span><strong>{u.dailyBestStreak ?? 0}</strong></div>
                              <div><span>Partidas con rivalidad</span><strong>{u.rivalryGames ?? 0}</strong></div>
                              <div><span>Series CPU</span><strong>{u.seriesWon ?? 0} ganadas / {u.seriesLost ?? 0} perdidas</strong></div>
                              <div><span>Puzzle Rush récord</span><strong>{u.puzzleRushBest ?? 0}</strong></div>
                              <div><span>Racha survival récord</span><strong>{u.streakRunBest ?? 0}</strong></div>
                              <div><span>Boss Run</span><strong>fase {u.bossBestStage ?? 0}/6</strong></div>
                              <div><span>Mejor Copa personal</span><strong>{u.cupBestScore ?? 0}/8 pts</strong></div>
                              <div><span>Sudden Death ganados</span><strong>{u.suddenDeathWins ?? 0}</strong></div>
                              <div><span><GlossaryTerm term="Accuracy">Accuracy</GlossaryTerm> media</span><strong>{u.avgAccuracy == null ? '—' : `${u.avgAccuracy}%`}</strong></div>
                              <div><span>Autopsias V14</span><strong>{u.analysisArchiveGames ?? 0}</strong></div>
                              <div><span>Apuros de tiempo</span><strong>{u.pressureIncidentPct == null ? '—' : `${u.pressureIncidents}/${u.pressureMoves} · ${u.pressureIncidentPct}%`}</strong></div>
                              <div><span>Ventajas no convertidas</span><strong>{u.missedConversions ?? 0}</strong></div>
                              <div><span>Defensas desesperadas</span><strong>{u.desperateSaves ?? 0}</strong></div>
                              <div><span>Material donado</span><strong>{u.materialDonated ?? 0} pts</strong></div>
                              <div><span>Retos</span><strong>{u.contractsCompleted ?? 0}/{u.contractsOffered ?? 0}</strong></div>
                              <div><span>Temporada actual</span><strong>{u.currentSeason ? `#${u.currentSeason.number} · ${u.currentSeason.games}/${u.currentSeason.target}` : '—'}</strong></div>
                              <div><span>Pecado más repetido</span><strong>{u.mostCommonSin ? `${u.mostCommonSin.label} ×${u.mostCommonSin.count}` : '—'}</strong></div>
                              <div><span>Logros</span><strong>{u.achievements ?? 0}</strong></div>
                              <div><span>Forma reciente</span><strong>{(u.recentForm || []).map((r) => OUTCOME_LABEL[r]).join(' · ') || '—'}</strong></div>
                              <div className="admin-detail-wide admin-worst-detail"><span>Peor jugada registrada</span><WorstMoveAutopsy move={u.worstMove} data={insightsByUser[u.username]} /></div>
                              <div className="admin-detail-wide"><span>Actividad reciente</span><strong className="admin-activity-list">{(u.recentActivity || []).length ? (u.recentActivity || []).map((a, i) => <em key={`${a.date}-${i}`}><i className={`admin-activity-type activity-${String(a.type || 'other').replace(/[^a-z0-9_-]/gi, '-')}`}>{adminActivityTypeLabel(a)}</i><span>{a.date ? formatAdminTimestamp(a.date, '') : ''} · {a.text}{a.detail ? ` · ${a.detail}` : ''}</span></em>) : '—'}</strong></div>
                            </div>

                            <section className="admin-insights-panel">
                              <div className="admin-insights-heading">
                                <div>
                                  <span className="section-label">Expediente técnico y moral</span>
                                  <h3>Así juega {u.username}</h3>
                                </div>
                                <span className="admin-insights-badge">mismo análisis que ve el jugador</span>
                              </div>

                              {insightsLoading[u.username] && <p className="hint-text">Leyendo el historial y preparando el informe…</p>}
                              {insightsErrors[u.username] && (
                                <div className="admin-insights-error">
                                  <p className="error-text">{insightsErrors[u.username]}</p>
                                  <button
                                    className="secondary-button"
                                    onClick={() => setInsightsErrors((prev) => ({ ...prev, [u.username]: null }))}
                                  >
                                    Reintentar informe
                                  </button>
                                </div>
                              )}

                              {insightsByUser[u.username] && insightsByUser[u.username].insights.totalGames === 0 && (
                                <p className="hint-text">Todavía no tiene partidas suficientes para levantar acta. Sospechosamente limpio.</p>
                              )}

                              {insightsByUser[u.username]?.insights.totalGames > 0 && (
                                <>
                                  <details className="admin-matthias-memory-inspector" open={false}>
                                    <summary>Inspector de memoria de Matthias</summary>
                                    {matthiasMemoryLoading[u.username] ? <p className="hint-text">Abriendo el expediente…</p> : (() => {
                                      const memory = matthiasMemoryByUser[u.username];
                                      if (!memory) return <p className="hint-text">Matthias todavía no tiene memoria estructurada de este jugador.</p>;
                                      return <div className="admin-matthias-memory-body">
                                        <div className="admin-insights-facts">
                                          <div><span>Relación</span><strong>{memory.relationship?.label || 'Recién llegado'}</strong></div>
                                          <div><span>Respeto</span><strong>{memory.respect?.label || 'Recluta bajo observación'} · {memory.respect?.score ?? 0}/100</strong></div>
                                          <div><span>Consultas</span><strong>{memory.consultations ?? 0}</strong></div>
                                          <div><span>Estado narrativo</span><strong>{MATTHIAS_MOOD_LABELS[memory.mood] || 'Observador'}</strong></div>
                                          <div><span>Rivalidad</span><strong>{memory.rivalry?.games ? `${memory.rivalry.wins}-${memory.rivalry.losses}-${memory.rivalry.draws}` : 'Sin historial suficiente'}</strong></div>
                                          <div><span>Schema</span><strong>v{memory.schemaVersion ?? '—'}</strong></div>
                                        </div>
                                        {memory.currentObsession?.label && <p><b>Obsesión actual:</b> {memory.currentObsession.label}</p>}
                                        {memory.activeChallenge?.label && <p><b>Reto personal:</b> {memory.activeChallenge.label} · setbacks {memory.activeChallenge.setbacks ?? 0}</p>}
                                        {memory.openDebt?.status && <p><b>Consejo pendiente:</b> {memory.openDebt.status === 'struggling' ? 'sigue fallando' : memory.openDebt.status === 'waiting' ? 'aún sin muestra' : 'veredicto mixto'}.</p>}
                                        {memory.activeGoals?.length > 0 && <div><h4>Objetivos activos</h4><ul>{memory.activeGoals.map((goal) => <li key={goal.id}><b>{goal.label}</b> · {goal.current_games ?? 0} partidas observadas</li>)}</ul></div>}
                                        {memory.nemesisOpening?.name && <p><b>Apertura-némesis:</b> {memory.nemesisOpening.name} · {Math.round(memory.nemesisOpening.win_pct || 0)}% en {memory.nemesisOpening.games || 0} partidas.</p>}
                                        {memory.recentMilestones?.length > 0 && <div><h4>Hitos recordados</h4><ul>{memory.recentMilestones.map((item) => <li key={item.fingerprint}>{item.polarity === 'shame' ? '☠' : '✦'} {item.label}</li>)}</ul></div>}
                                        {memory.emblematicPositions?.length > 0 && <div><h4>Posiciones emblemáticas</h4><ul>{memory.emblematicPositions.slice(-4).map((item) => <li key={item.fingerprint}>{item.label}{item.opening ? ` · ${item.opening}` : ''}</li>)}</ul></div>}
                                        {memory.mainAdvice?.text && <div className="ai-task-card"><small>ÚLTIMO CONSEJO RECORDADO</small><p>{memory.mainAdvice.text}</p></div>}
                                      </div>;
                                    })()}
                                  </details>

                                  <div className="admin-insights-ai-actions">
                                    <button type="button" className="secondary-btn" disabled={aiPortraitLoading[u.username]} onClick={() => void handleReanalyzePlayer(u.username)}>{aiPortraitLoading[u.username] ? 'Reanalizando…' : '↻ Reanalizar jugador'}</button>
                                    <button type="button" className="secondary-btn danger-btn" disabled={matthiasResettingUser === u.username} onClick={() => void handleResetMatthiasMemory(u.username)}>{matthiasResettingUser === u.username ? 'Borrando memoria…' : 'Olvidar sólo en Matthias'}</button>
                                    <small>Admin puede consultar/reanalizar sin cooldown. El reset borra sólo la memoria de Matthias, no el progreso del jugador.</small>
                                  </div>
                                  {aiPortraitError[u.username] && <p className="error-text">{aiPortraitError[u.username]}</p>}
                                  {matthiasResetError && expanded === u.username && <p className="error-text">{matthiasResetError}</p>}
                                  {aiPortraitByUser[u.username] && <div className="ai-task-card admin-player-ai-portrait"><small>CPU // {aiPortraitByUser[u.username].provider === 'cloudflare' ? 'WORKERS AI' : 'FALLBACK LOCAL'}</small><p>{aiPortraitByUser[u.username].text}</p></div>}

                                  <div className="admin-insights-facts">
                                    <div><span>Partidas</span><strong>{insightsByUser[u.username].insights.totalGames}</strong></div>
                                    <div><span>Victorias</span><strong>{insightsByUser[u.username].insights.overall?.winPct ?? 0}%</strong></div>
                                    <div><span>Apertura habitual</span><strong>{insightsByUser[u.username].insights.favoriteOpening?.name || 'Sin patrón claro'}</strong></div>
                                    <div><span>Racha máxima</span><strong>{insightsByUser[u.username].insights.longestWinStreak}</strong></div>
                                  </div>

                                  {insightsByUser[u.username].roast.length > 0 && (
                                    <div className="admin-roast-box">
                                      <h4>Cómo lo ve la CPU, sin filtro</h4>
                                      <ul className="roast-list">
                                        {insightsByUser[u.username].roast.slice(0, 6).map((line, i) => <li key={i}>{line}</li>)}
                                      </ul>
                                    </div>
                                  )}

                                  {insightsByUser[u.username].coaching.length > 0 && (
                                    <div>
                                      <h4>Qué debería entrenar</h4>
                                      <div className="coaching-grid admin-coaching-grid">
                                        {insightsByUser[u.username].coaching.map((item, i) => (
                                          <article className={`coaching-card priority-${item.priority}`} key={`${item.title}-${i}`}>
                                            <div className="coaching-card-top">
                                              <span className="coaching-priority">{item.priorityLabel}</span>
                                              <b>{item.title}</b>
                                            </div>
                                            <p>{item.diagnosis}</p>
                                            <div className="coaching-action"><strong>Haz esto:</strong> {item.action}</div>
                                          </article>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </>
                              )}
                            </section>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}


      </div>
    </div>
  );
}
