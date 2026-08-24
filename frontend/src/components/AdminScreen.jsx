import React, { useEffect, useState } from 'react';
import { APP_RELEASE } from '../release.js';
import { deleteAdminUser, fetchAdminUsers, fetchAdminUserInsights } from '../admin.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { computeInsights, generateRoast, generateCoaching } from '../insights.js';
import { ACHIEVEMENTS } from '../achievements.js';
import { getToken, getUsername } from '../auth.js';
import { formatLongMove } from '../notation.js';
import { buildWorstMoveAutopsy } from '../adminWorstMove.js';
import Board from './Board.jsx';
import GlossaryTerm from './GlossaryTerm.jsx';
import ObservabilityPanel from './ObservabilityPanel.jsx';
import AdminObservabilitySummary from './AdminObservabilitySummary.jsx';
import { ADMIN_USER_FILTERS, adminClientReleaseState, filterAdminUsers, formatAdminDate, formatAdminTimestamp, sortAdminUsers } from '../adminFormatting.js';
import { fetchAdminFeedback, updateAdminFeedbackStatus } from '../feedback.js';

const OUTCOME_LABEL = { win: 'V', draw: 'T', loss: 'D' };
const ADMIN_REFRESH_MS = 120000;

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
  const status = user?.presence || 'never';
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
  return (
    <span className={`admin-presence admin-presence-${status}`} title={exact}>
      <span className="admin-presence-dot" aria-hidden="true" />
      <span className="admin-presence-copy">
        <span>{label}</span>
        {status === 'online' && user?.currentActivity && <small>{user.currentActivity}</small>}
        {user?.foreground === true && <small className="admin-foreground-state is-foreground">● Primer plano</small>}
        {status === 'online' && user?.foreground === false && <small className="admin-foreground-state">○ Segundo plano</small>}
        {!compact && user?.lastActivity && <small>{formatAdminTimestamp(user.lastActivity)}</small>}
      </span>
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
  const [activityFilter, setActivityFilter] = useState('all');
  const [adminView, setAdminView] = useState('overview');

  useEffect(() => {
    let mounted = true;
    async function refreshAdminData(silent = false) {
      const [usersResult, feedbackResult] = await Promise.allSettled([fetchAdminUsers(), fetchAdminFeedback()]);
      if (!mounted) return;
      if (usersResult.status === 'fulfilled') {
        setUsers(usersResult.value);
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
    }
    refreshAdminData();
    const timer = window.setInterval(() => refreshAdminData(true), ADMIN_REFRESH_MS);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  async function handleFeedbackStatus(feedbackId, status) {
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

  async function handleDeleteUser(targetUsername) {
    const confirmed = window.confirm(
      `Eliminar definitivamente la cuenta “${targetUsername}”?\n\nSe borrarán también su perfil y sus partidas activas. Esta acción no se puede deshacer.`,
    );
    if (!confirmed) return;

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

  const currentAdmin = getUsername();
  const otherUsers = (users || []).filter((user) => user.username !== currentAdmin);
  const foregroundCount = otherUsers.filter((user) => user.foreground === true).length;
  const onlineCount = otherUsers.filter((user) => user.presence === 'online').length;
  const idleCount = otherUsers.filter((user) => user.presence === 'idle').length;
  const filteredUsers = filterAdminUsers(users || [], activityFilter);
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
        <div className="admin-feedback-actions">
          {item.status === 'new' && (
            <button type="button" className="secondary-btn" disabled={feedbackUpdating === item.id} onClick={() => handleFeedbackStatus(item.id, 'read')}>Marcar leído</button>
          )}
          {item.status !== 'resolved' ? (
            <button type="button" className="secondary-btn" disabled={feedbackUpdating === item.id} onClick={() => handleFeedbackStatus(item.id, 'resolved')}>Resolver</button>
          ) : (
            <button type="button" className="secondary-btn" disabled={feedbackUpdating === item.id} onClick={() => handleFeedbackStatus(item.id, 'read')}>Reabrir</button>
          )}
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
      <button className="back-link" onClick={onExit}>← Volver al menú</button>
      <div className="menu-section">
        <span className="section-label">Admin</span>
        <h2>Usuarios registrados</h2>
        <p className="hint-text">Pulsa el nombre de un usuario para abrir o cerrar su expediente ajedrecístico.</p>
        <p className="hint-text admin-build-id">Release: <code>{APP_RELEASE}</code> · Build: <code>{BUILD_SHA === 'local' ? 'local' : BUILD_SHA.slice(0, 8)}</code></p>
        {users && (
          <section className="admin-presence-summary" aria-label="Presencia de usuarios">
            <div>
              <strong>{foregroundCount}</strong>
              <span>en primer plano</span>
            </div>
            <div>
              <strong>{onlineCount}</strong>
              <span>en línea</span>
            </div>
            <div>
              <strong>{idleCount}</strong>
              <span>inactivos</span>
            </div>
            <small>Otros usuarios · muestreo aprox. cada 2 min · el estado caduca automáticamente</small>
          </section>
        )}
        <AdminObservabilitySummary
          token={getToken()}
          users={users || []}
          currentAdmin={currentAdmin}
          onOpen={() => setAdminView('observability')}
        />

        <section className="admin-feedback-section" aria-label="Feedback de usuarios">
          <div className="admin-feedback-heading">
            <div>
              <span className="section-label">Feedback</span>
              <h3>Lo que están diciendo los usuarios</h3>
            </div>
            <span className="admin-feedback-badge">{(feedback || []).filter((item) => item.status === 'new').length} nuevos</span>
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
                          <td colSpan="8">
                            <div className="admin-detail-grid">
                              <div><span>Registrado</span><strong>{formatAdminTimestamp(u.createdAt)}</strong></div>
                              <div><span>Presencia</span><strong><Presence user={u} /></strong></div>
                              <div><span>Última pantalla conocida</span><strong>{u.currentActivity || '—'}</strong></div>
                              <div><span>Versión del cliente</span><strong>{releaseState.label}{u.clientRelease ? ` · ${u.clientRelease}` : ''}</strong></div>
                              <div><span>Ventana</span><strong>{u.foreground === true ? 'Primer plano' : u.foreground === false ? 'Segundo plano / no visible' : 'Sin dato'}</strong></div>
                              <div><span>Última actividad exacta</span><strong>{formatAdminTimestamp(u.lastActivity)}</strong></div>
                              <div><span>Porcentaje de victoria</span><strong>{u.winPct == null ? '—' : `${u.winPct}%`}</strong></div>
                              <div><span>Rating / partidas <GlossaryTerm term="ELO">ELO</GlossaryTerm></span><strong>{u.rating ?? '—'} / {u.ratingGames ?? '—'}</strong></div>
                              <div><span>Pico de rating</span><strong>{u.ratingPeak ?? '—'}</strong></div>
                              <div><span>Racha máx. victorias</span><strong>{u.longestWinStreak ?? 0}</strong></div>
                              <div><span>Victoria más difícil</span><strong>{u.bestDifficultyWin == null ? '—' : `CPU ${u.bestDifficultyWin}`}</strong></div>
                              <div><span>Partidas normales</span><strong>{u.gamesPlayed ?? 0}</strong></div>
                              <div><span>Batallas Combat Chess</span><strong>{u.combatBattles ?? 0}</strong></div>
                              <div><span>Capturas humanas</span><strong>{u.humanCaptures ?? 0}</strong></div>
                              <div><span>Damas capturadas</span><strong>{u.queensCaptured ?? 0}</strong></div>
                              <div><span>Damas perdidas</span><strong>{u.queensLost ?? 0}</strong></div>
                              <div><span>Blancas / negras</span><strong>{u.whiteGames ?? 0} / {u.blackGames ?? 0}</strong></div>
                              <div><span>Puntos / victorias torneo</span><strong>{u.tournamentPoints ?? '—'} / {u.tournamentWins ?? '—'}</strong></div>
                              <div><span>Partidas analizadas</span><strong>{u.analyzedGames ?? 0}</strong></div>
                              <div><span>Puzzles resueltos</span><strong>{u.puzzlesSolved ?? 0}</strong></div>
                              <div><span>Mejor racha puzzles</span><strong>{u.puzzleBestStreak ?? 0}</strong></div>
                              <div><span>Puzzles de sus cagadas</span><strong>{u.personalPuzzles ?? 0}</strong></div>
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
                              <div><span>Contratos</span><strong>{u.contractsCompleted ?? 0}/{u.contractsOffered ?? 0}</strong></div>
                              <div><span>Temporada actual</span><strong>{u.currentSeason ? `#${u.currentSeason.number} · ${u.currentSeason.games}/${u.currentSeason.target}` : '—'}</strong></div>
                              <div><span>Pecado más repetido</span><strong>{u.mostCommonSin ? `${u.mostCommonSin.label} ×${u.mostCommonSin.count}` : '—'}</strong></div>
                              <div><span>Logros</span><strong>{u.achievements ?? 0}</strong></div>
                              <div><span>Forma reciente</span><strong>{(u.recentForm || []).map((r) => OUTCOME_LABEL[r]).join(' · ') || '—'}</strong></div>
                              <div className="admin-detail-wide admin-worst-detail"><span>Peor jugada registrada</span><WorstMoveAutopsy move={u.worstMove} data={insightsByUser[u.username]} /></div>
                              <div className="admin-detail-wide"><span>Actividad reciente</span><strong className="admin-activity-list">{(u.recentActivity || []).length ? (u.recentActivity || []).map((a, i) => <em key={`${a.date}-${i}`}><i className={`admin-activity-type activity-${String(a.type || 'other').replace(/[^a-z0-9_-]/gi, '-')}`}>{a.modeLabel || a.type || 'Actividad'}</i><span>{a.date ? formatAdminTimestamp(a.date, '') : ''} · {a.text}{a.detail ? ` · ${a.detail}` : ''}</span></em>) : '—'}</strong></div>
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
