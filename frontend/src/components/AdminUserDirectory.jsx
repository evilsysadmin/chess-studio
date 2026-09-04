import React, { useState } from 'react';
import { APP_RELEASE } from '../release.js';
import { formatLongMove } from '../notation.js';
import {
  ADMIN_USER_FILTERS,
  adminActivityTypeLabel,
  adminClientReleaseState,
  adminPresenceDisplayStatus,
  filterAdminUsers,
  formatAdminDate,
  formatAdminRefreshAge,
  formatAdminTimestamp,
  sortAdminUsers,
  summarizeAdminClientReleases,
  summarizeAdminPresence,
} from '../adminFormatting.js';
import Board from './Board.jsx';
import GlossaryTerm from './GlossaryTerm.jsx';
import { MATTHIAS_MOOD_LABELS } from './AdminMatthiasStatusSection.jsx';

const OUTCOME_LABEL = { win: 'V', draw: 'T', loss: 'D' };

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

function MatthiasMemoryInspector({ memory, loading }) {
  if (loading) return <p className="hint-text">Abriendo el expediente…</p>;
  if (!memory) return <p className="hint-text">Matthias todavía no tiene memoria estructurada de este jugador.</p>;
  return (
    <div className="admin-matthias-memory-body">
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
    </div>
  );
}

function UserInsights({
  user,
  dossier,
  loading,
  error,
  memory,
  memoryLoading,
  aiPortrait,
  aiLoading,
  aiError,
  matthiasResetting,
  matthiasResetError,
  onRetry,
  onReanalyze,
  onResetMatthiasMemory,
}) {
  return (
    <section className="admin-insights-panel">
      <div className="admin-insights-heading">
        <div><span className="section-label">Expediente técnico y moral</span><h3>Así juega {user.username}</h3></div>
        <span className="admin-insights-badge">mismo análisis que ve el jugador</span>
      </div>
      {loading && <p className="hint-text">Leyendo el historial y preparando el informe…</p>}
      {error && (
        <div className="admin-insights-error">
          <p className="error-text">{error}</p>
          <button className="secondary-button" onClick={onRetry}>Reintentar informe</button>
        </div>
      )}
      {dossier && dossier.insights.totalGames === 0 && <p className="hint-text">Todavía no tiene partidas suficientes para levantar acta. Sospechosamente limpio.</p>}
      {dossier?.insights.totalGames > 0 && (
        <>
          <details className="admin-matthias-memory-inspector" open={false}>
            <summary>Inspector de memoria de Matthias</summary>
            <MatthiasMemoryInspector memory={memory} loading={memoryLoading} />
          </details>
          <div className="admin-insights-ai-actions">
            <button type="button" className="secondary-btn" disabled={aiLoading} onClick={onReanalyze}>{aiLoading ? 'Reanalizando…' : '↻ Reanalizar jugador'}</button>
            <button type="button" className="secondary-btn danger-btn" disabled={matthiasResetting} onClick={onResetMatthiasMemory}>{matthiasResetting ? 'Borrando memoria…' : 'Olvidar sólo en Matthias'}</button>
            <small>Admin puede consultar/reanalizar sin cooldown. El reset borra sólo la memoria de Matthias, no el progreso del jugador.</small>
          </div>
          {aiError && <p className="error-text">{aiError}</p>}
          {matthiasResetError && <p className="error-text">{matthiasResetError}</p>}
          {aiPortrait && <div className="ai-task-card admin-player-ai-portrait"><small>CPU // {aiPortrait.provider === 'cloudflare' ? 'WORKERS AI' : 'FALLBACK LOCAL'}</small><p>{aiPortrait.text}</p></div>}
          <div className="admin-insights-facts">
            <div><span>Partidas</span><strong>{dossier.insights.totalGames}</strong></div>
            <div><span>Victorias</span><strong>{dossier.insights.overall?.winPct ?? 0}%</strong></div>
            <div><span>Apertura habitual</span><strong>{dossier.insights.favoriteOpening?.name || 'Sin patrón claro'}</strong></div>
            <div><span>Racha máxima</span><strong>{dossier.insights.longestWinStreak}</strong></div>
          </div>
          {dossier.roast.length > 0 && (
            <div className="admin-roast-box"><h4>Cómo lo ve la CPU, sin filtro</h4><ul className="roast-list">{dossier.roast.slice(0, 6).map((line, i) => <li key={i}>{line}</li>)}</ul></div>
          )}
          {dossier.coaching.length > 0 && (
            <div>
              <h4>Qué debería entrenar</h4>
              <div className="coaching-grid admin-coaching-grid">
                {dossier.coaching.map((item, i) => (
                  <article className={`coaching-card priority-${item.priority}`} key={`${item.title}-${i}`}>
                    <div className="coaching-card-top"><span className="coaching-priority">{item.priorityLabel}</span><b>{item.title}</b></div>
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
  );
}

export default function AdminUserDirectory({
  users,
  error,
  deleteError,
  deletingUser,
  currentAdmin,
  activityFilter,
  onActivityFilterChange,
  lastAdminRefreshAt,
  adminNow,
  expanded,
  onExpandedChange,
  onDeleteUser,
  insightsByUser,
  insightsLoading,
  insightsErrors,
  onRetryInsights,
  matthiasMemoryByUser,
  matthiasMemoryLoading,
  aiPortraitByUser,
  aiPortraitLoading,
  aiPortraitError,
  onReanalyzePlayer,
  matthiasResettingUser,
  matthiasResetError,
  onResetMatthiasMemory,
}) {
  const presenceCounts = summarizeAdminPresence(users || [], currentAdmin);
  const filteredUsers = filterAdminUsers(users || [], activityFilter);
  const releaseSummary = summarizeAdminClientReleases(users || [], currentAdmin, APP_RELEASE);

  return (
    <>
      {users && (
        <section className="admin-presence-block" aria-label="Presencia de usuarios">
          <div className="admin-presence-block-heading"><div><span className="section-label">Presencia</span><h3>Ahora mismo</h3></div><small>Vista admin · refresco 30 s con foco · actualizado {formatAdminRefreshAge(lastAdminRefreshAt, adminNow)}</small></div>
          <div className="admin-presence-summary">
            <div><strong>{presenceCounts.foreground}</strong><span>en primer plano</span></div>
            <div><strong>{presenceCounts.online}</strong><span>en línea</span></div>
            <div><strong>{presenceCounts.idle}</strong><span>inactivos</span></div>
            <small>Otros usuarios · muestreo aprox. cada 2 min · el estado caduca automáticamente</small>
          </div>
          <details className="friendly-disclosure admin-release-summary"><summary>Estado de versiones de clientes</summary><div className="friendly-disclosure-body admin-release-summary-grid">{['current', 'outdated', 'newer', 'different', 'unknown'].map((id) => { const label = { current: 'Actual', outdated: 'Antigua', newer: 'Más nueva', different: 'Distinta', unknown: 'Sin dato' }[id]; return <span key={id}><b>{releaseSummary[id] || 0}</b>{label}</span>; })}</div></details>
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
              <button key={filter.id} type="button" className={`admin-filter-chip${activityFilter === filter.id ? ' is-active' : ''}`} onClick={() => onActivityFilterChange(filter.id)} aria-pressed={activityFilter === filter.id}>
                {filter.label}<span>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {error && <p className="error-text">{error}</p>}
      {deleteError && <p className="error-text">{deleteError}</p>}
      {!error && !users && <p className="hint-text">Cargando…</p>}
      {!error && users && users.length === 0 && <p className="hint-text">Todavía no hay ningún usuario registrado.</p>}
      {!error && users && users.length > 0 && filteredUsers.length === 0 && <p className="hint-text">No hay usuarios que coincidan con este filtro.</p>}

      {!error && users && filteredUsers.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-users-table">
            <thead><tr><th>Usuario</th><th>Actividad</th><th>Red</th><th>Rating</th><th>Partidas</th><th>V/T/D</th><th>Peor</th><th>Versión</th><th>Acciones</th></tr></thead>
            <tbody>
              {sortAdminUsers(filteredUsers).map((u) => {
                const isOpen = expanded === u.username;
                const isSelf = currentAdmin === u.username;
                const detailId = `admin-user-details-${String(u.username).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
                const releaseState = adminClientReleaseState(u.clientRelease, APP_RELEASE);
                return (
                  <React.Fragment key={u.username}>
                    <tr>
                      <td className="admin-user-cell" data-label="Usuario">
                        <button type="button" className={`admin-user-link${isOpen ? ' is-open' : ''}`} onClick={() => onExpandedChange(isOpen ? null : u.username)} aria-expanded={isOpen} aria-controls={detailId} title={`${isOpen ? 'Cerrar' : 'Abrir'} expediente de ${u.username}`}>
                          <span>{u.username}</span><span className="admin-user-link-chevron" aria-hidden="true">{isOpen ? '▾' : '›'}</span>
                        </button>
                      </td>
                      <td data-label="Actividad"><Presence user={u} compact /></td>
                      <td data-label="Red"><NetworkIdentity user={u} compact /></td>
                      <td data-label="Rating">{u.rating ?? '—'}</td>
                      <td data-label="Partidas">{u.totalGames ?? u.gamesPlayed ?? '—'}</td>
                      <td data-label="V/T/D">{u.totalGames ? `${u.wins}/${u.draws}/${u.losses}` : '—'}</td>
                      <td className="admin-worst-cell" data-label="Peor"><WorstMove move={u.worstMove} compact /></td>
                      <td data-label="Versión"><span className={`admin-client-release is-${releaseState.id}`} title={u.clientRelease ? `Última release reportada: ${u.clientRelease}` : 'Todavía no ha reportado versión'}><b>{releaseState.label}</b>{u.clientRelease ? <small>{u.clientRelease}</small> : null}</span></td>
                      <td className="admin-actions-cell" data-label="Acciones"><div className="admin-user-actions"><button className="admin-delete-button" disabled={isSelf || deletingUser === u.username} onClick={() => onDeleteUser(u.username)} title={isSelf ? 'No puedes borrar desde aquí la cuenta con la que estás administrando' : `Eliminar definitivamente la cuenta ${u.username}`}>{isSelf ? 'Tu cuenta' : deletingUser === u.username ? 'Eliminando…' : 'Eliminar'}</button></div></td>
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
                          <UserInsights
                            user={u}
                            dossier={insightsByUser[u.username]}
                            loading={insightsLoading[u.username]}
                            error={insightsErrors[u.username]}
                            memory={matthiasMemoryByUser[u.username]}
                            memoryLoading={matthiasMemoryLoading[u.username]}
                            aiPortrait={aiPortraitByUser[u.username]}
                            aiLoading={aiPortraitLoading[u.username]}
                            aiError={aiPortraitError[u.username]}
                            matthiasResetting={matthiasResettingUser === u.username}
                            matthiasResetError={matthiasResetError && expanded === u.username ? matthiasResetError : null}
                            onRetry={() => onRetryInsights(u.username)}
                            onReanalyze={() => onReanalyzePlayer(u.username)}
                            onResetMatthiasMemory={() => onResetMatthiasMemory(u.username)}
                          />
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
    </>
  );
}
