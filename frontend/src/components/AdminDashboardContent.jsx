import React, { useEffect, useState } from 'react';
import { APP_RELEASE } from '../release.js';
import {
  deleteAdminUser,
  fetchAdminMatthiasMemory,
  fetchAdminMatthiasStatus,
  fetchAdminUserInsights,
  previewAdminMatthiasPersonality,
  reanalyzeAdminUser,
  resetAdminMatthiasMemory,
} from '../admin.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { getToken, getUsername } from '../auth.js';
import { buildAdminInsights } from '../adminDashboardInsights.js';
import { createAsyncCommitGuard } from '../asyncLifecycle.js';
import AdminFeedbackSection from './AdminFeedbackSection.jsx';
import AdminMatthiasStatusSection from './AdminMatthiasStatusSection.jsx';
import AdminMatchmakingSettingsSection from './AdminMatchmakingSettingsSection.jsx';
import AdminObservabilitySummary from './AdminObservabilitySummary.jsx';
import AdminUserDirectory from './AdminUserDirectory.jsx';
import ObservabilityPanel from './ObservabilityPanel.jsx';
import useAdminDashboardData from './useAdminDashboardData.js';
import useAdminFeedbackController from './useAdminFeedbackController.js';

const BUILD_SHA = import.meta.env.VITE_BUILD_SHA || 'local';

export default function AdminScreen({ onExit }) {
  useEscapeToClose(onExit);
  const {
    users,
    setUsers,
    error,
    feedback,
    setFeedback,
    feedbackError,
    setFeedbackError,
    lastAdminRefreshAt,
    adminNow,
    matthiasStatus,
    setMatthiasStatus,
    matthiasStatusError,
    setMatthiasStatusError,
    invalidateAdminData,
  } = useAdminDashboardData();
  const {
    feedbackUpdating,
    feedbackTestCreating,
    feedbackDeleteCandidate,
    feedbackReplies,
    dismissFeedbackDelete,
    setFeedbackReply,
    requestFeedbackDelete,
    handleFeedbackReply,
    handleFeedbackStatus,
    handleCreateTestFeedback,
    confirmFeedbackDelete,
  } = useAdminFeedbackController({ setFeedback, setFeedbackError, invalidateAdminData });
  const [expanded, setExpanded] = useState(null);
  const [insightsByUser, setInsightsByUser] = useState({});
  const [insightsLoading, setInsightsLoading] = useState({});
  const [insightsErrors, setInsightsErrors] = useState({});
  const [deletingUser, setDeletingUser] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [activityFilter, setActivityFilter] = useState('all');
  const [adminView, setAdminView] = useState('overview');
  const [aiPortraitByUser, setAiPortraitByUser] = useState({});
  const [aiPortraitLoading, setAiPortraitLoading] = useState({});
  const [aiPortraitError, setAiPortraitError] = useState({});
  const [matthiasResettingUser, setMatthiasResettingUser] = useState(null);
  const [matthiasResetError, setMatthiasResetError] = useState(null);
  const [matthiasMemoryByUser, setMatthiasMemoryByUser] = useState({});
  const [matthiasMemoryLoading, setMatthiasMemoryLoading] = useState({});
  const [matthiasPreviewPreset, setMatthiasPreviewPreset] = useState('veteran');
  const [matthiasPreview, setMatthiasPreview] = useState(null);
  const [matthiasPreviewLoading, setMatthiasPreviewLoading] = useState(false);
  const [matthiasPreviewError, setMatthiasPreviewError] = useState(null);

  async function handleDeleteUser(targetUsername) {
    const confirmed = window.confirm(
      `Eliminar definitivamente la cuenta “${targetUsername}”?\n\nSe borrarán también su perfil y sus partidas activas. Esta acción no se puede deshacer.`,
    );
    if (!confirmed) return;

    invalidateAdminData();
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
    } catch (error) {
      setDeleteError(error.message || 'No se pudo eliminar la cuenta.');
    } finally {
      setDeletingUser(null);
    }
  }

  useEffect(() => {
    if (!expanded || insightsByUser[expanded] || insightsLoading[expanded] || insightsErrors[expanded]) return undefined;
    const guard = createAsyncCommitGuard();
    setInsightsLoading((prev) => ({ ...prev, [expanded]: true }));
    setInsightsErrors((prev) => ({ ...prev, [expanded]: null }));
    fetchAdminUserInsights(expanded)
      .then((payload) => guard.commit(() => setInsightsByUser((prev) => ({ ...prev, [expanded]: buildAdminInsights(payload) }))))
      .catch((error) => guard.commit(() => setInsightsErrors((prev) => ({ ...prev, [expanded]: error.message }))))
      .finally(() => guard.commit(() => setInsightsLoading((prev) => ({ ...prev, [expanded]: false }))));
    return () => guard.dispose();
  }, [expanded, insightsByUser, insightsLoading, insightsErrors]);

  useEffect(() => {
    if (!expanded || matthiasMemoryByUser[expanded] || matthiasMemoryLoading[expanded]) return undefined;
    const guard = createAsyncCommitGuard();
    setMatthiasMemoryLoading((prev) => ({ ...prev, [expanded]: true }));
    fetchAdminMatthiasMemory(expanded)
      .then((payload) => guard.commit(() => setMatthiasMemoryByUser((prev) => ({ ...prev, [expanded]: payload?.memory || null }))))
      .catch(() => guard.commit(() => setMatthiasMemoryByUser((prev) => ({ ...prev, [expanded]: null }))))
      .finally(() => guard.commit(() => setMatthiasMemoryLoading((prev) => ({ ...prev, [expanded]: false }))));
    return () => guard.dispose();
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
        <div className="modal-backdrop admin-confirm-backdrop" role="presentation" onMouseDown={dismissFeedbackDelete}>
          <section className="army-card admin-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-delete-title" onMouseDown={(event) => event.stopPropagation()}>
            <span className="section-label">Feedback · acción irreversible</span>
            <h2 id="feedback-delete-title">¿Borrar este feedback?</h2>
            <p>Útil para limpiar mensajes de prueba. Esta acción no se puede deshacer.</p>
            <div className="admin-confirm-actions">
              <button type="button" className="secondary-btn" onClick={dismissFeedbackDelete}>Cancelar</button>
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

        <AdminMatchmakingSettingsSection />

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
          onReplyChange={setFeedbackReply}
          onReply={(feedbackId, resolve) => void handleFeedbackReply(feedbackId, resolve)}
          onStatus={(feedbackId, status) => void handleFeedbackStatus(feedbackId, status)}
          onDelete={requestFeedbackDelete}
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
