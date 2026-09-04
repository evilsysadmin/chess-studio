import React, { useEffect, useRef, useState } from 'react';
import { APP_RELEASE } from '../release.js';
import {
  deleteAdminUser,
  fetchAdminMatthiasMemory,
  fetchAdminMatthiasStatus,
  fetchAdminUsers,
  fetchAdminUserInsights,
  previewAdminMatthiasPersonality,
  reanalyzeAdminUser,
  resetAdminMatthiasMemory,
} from '../admin.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { getToken, getUsername } from '../auth.js';
import {
  deleteAdminFeedback,
  fetchAdminFeedback,
  replyAdminFeedback,
  submitFeedback,
  updateAdminFeedbackStatus,
} from '../feedback.js';
import { ADMIN_REFRESH_MS, shouldRefreshAdminPresence } from '../presenceCadence.js';
import { buildAdminInsights } from '../adminDashboardInsights.js';
import AdminFeedbackSection from './AdminFeedbackSection.jsx';
import AdminMatthiasStatusSection from './AdminMatthiasStatusSection.jsx';
import AdminObservabilitySummary from './AdminObservabilitySummary.jsx';
import AdminUserDirectory from './AdminUserDirectory.jsx';
import ObservabilityPanel from './ObservabilityPanel.jsx';

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
      .then((payload) => setInsightsByUser((prev) => ({ ...prev, [expanded]: buildAdminInsights(payload) })))
      .catch((e) => setInsightsErrors((prev) => ({ ...prev, [expanded]: e.message })))
      .finally(() => setInsightsLoading((prev) => ({ ...prev, [expanded]: false })));
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
    } catch (resetError) {
      setMatthiasResetError(resetError?.message || 'No se pudo borrar la memoria de Matthias.');
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
    } catch (previewError) {
      setMatthiasPreviewError(previewError?.message || 'No se pudo probar la personalidad de Matthias.');
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
    } catch (reanalyzeError) {
      setAiPortraitError((prev) => ({ ...prev, [username]: reanalyzeError?.message || 'No se pudo reanalizar al jugador.' }));
    } finally {
      setAiPortraitLoading((prev) => ({ ...prev, [username]: false }));
    }
  }

  const currentAdmin = getUsername();

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
        <AdminObservabilitySummary token={getToken()} users={users || []} currentAdmin={currentAdmin} onOpen={() => setAdminView('observability')} />

        <AdminMatthiasStatusSection
          status={matthiasStatus}
          error={matthiasStatusError}
          previewPreset={matthiasPreviewPreset}
          preview={matthiasPreview}
          previewLoading={matthiasPreviewLoading}
          previewError={matthiasPreviewError}
          onPreviewPresetChange={(preset) => { setMatthiasPreviewPreset(preset); setMatthiasPreview(null); }}
          onPreview={() => void handlePreviewMatthias()}
        />

        <AdminFeedbackSection
          feedback={feedback}
          error={feedbackError}
          updating={feedbackUpdating}
          testCreating={feedbackTestCreating}
          replies={feedbackReplies}
          onReplyChange={(feedbackId, value) => setFeedbackReplies((current) => ({ ...current, [feedbackId]: value }))}
          onReply={(feedbackId, resolve) => void handleFeedbackReply(feedbackId, resolve)}
          onStatus={(feedbackId, status) => void handleFeedbackStatus(feedbackId, status)}
          onDelete={(feedbackId) => { if (!feedbackUpdating) setFeedbackDeleteCandidate(feedbackId); }}
          onCreateTest={() => void handleCreateTestFeedback()}
        />

        <AdminUserDirectory
          users={users}
          error={error}
          deleteError={deleteError}
          deletingUser={deletingUser}
          currentAdmin={currentAdmin}
          activityFilter={activityFilter}
          onActivityFilterChange={setActivityFilter}
          lastAdminRefreshAt={lastAdminRefreshAt}
          adminNow={adminNow}
          expanded={expanded}
          onExpandedChange={setExpanded}
          onDeleteUser={(username) => void handleDeleteUser(username)}
          insightsByUser={insightsByUser}
          insightsLoading={insightsLoading}
          insightsErrors={insightsErrors}
          onRetryInsights={(username) => setInsightsErrors((prev) => ({ ...prev, [username]: null }))}
          matthiasMemoryByUser={matthiasMemoryByUser}
          matthiasMemoryLoading={matthiasMemoryLoading}
          aiPortraitByUser={aiPortraitByUser}
          aiPortraitLoading={aiPortraitLoading}
          aiPortraitError={aiPortraitError}
          onReanalyzePlayer={(username) => void handleReanalyzePlayer(username)}
          matthiasResettingUser={matthiasResettingUser}
          matthiasResetError={matthiasResetError}
          onResetMatthiasMemory={(username) => void handleResetMatthiasMemory(username)}
        />
      </div>
    </div>
  );
}
