import React, { useEffect, useState } from 'react';
import { fetchAdminUsers, fetchAdminUserInsights } from '../admin.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { computeInsights, generateRoast, generateCoaching } from '../insights.js';
import { ACHIEVEMENTS } from '../achievements.js';

const OUTCOME_LABEL = { win: 'V', draw: 'T', loss: 'D' };

function WorstMove({ move }) {
  if (!move) return <span className="admin-muted">Sin analizar todavía</span>;
  return (
    <span>
      <strong>{move.played || '—'}</strong>
      {move.suggested ? <> · mejor: {move.suggested}</> : null}
      {Number.isFinite(move.loss) ? <> · pérdida {move.loss} cp</> : null}
    </span>
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
  };
}

export default function AdminScreen({ onExit }) {
  useEscapeToClose(onExit);
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [insightsByUser, setInsightsByUser] = useState({});
  const [insightsLoading, setInsightsLoading] = useState({});
  const [insightsErrors, setInsightsErrors] = useState({});

  useEffect(() => {
    fetchAdminUsers()
      .then(setUsers)
      .catch((e) => setError(e.message));
  }, []);

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

  return (
    <div className="menu admin-screen">
      <button className="back-link" onClick={onExit}>← Volver al menú</button>
      <div className="menu-section">
        <span className="section-label">Admin</span>
        <h2>Usuarios registrados</h2>
        <p className="hint-text">Resumen general arriba; “Ver detalles” abre el expediente ajedrecístico.</p>

        {error && <p className="error-text">{error}</p>}
        {!error && !users && <p className="hint-text">Cargando…</p>}
        {!error && users && users.length === 0 && (
          <p className="hint-text">Todavía no hay ningún usuario registrado.</p>
        )}

        {!error && users && users.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Registrado</th>
                  <th>Rating</th>
                  <th>Partidas</th>
                  <th>V/T/D</th>
                  <th>% victoria</th>
                  <th>Peor jugada</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isOpen = expanded === u.username;
                  return (
                    <React.Fragment key={u.username}>
                      <tr>
                        <td>{u.username}</td>
                        <td>{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}</td>
                        <td>{u.rating ?? '—'}{u.ratingPeak && u.ratingPeak !== u.rating ? ` (máx. ${u.ratingPeak})` : ''}</td>
                        <td>{u.totalGames ?? u.gamesPlayed ?? '—'}</td>
                        <td>{u.totalGames ? `${u.wins}/${u.draws}/${u.losses}` : '—'}</td>
                        <td>{u.winPct == null ? '—' : `${u.winPct}%`}</td>
                        <td className="admin-worst-cell"><WorstMove move={u.worstMove} /></td>
                        <td>
                          <button className="admin-peek-button" onClick={() => setExpanded(isOpen ? null : u.username)}>
                            {isOpen ? 'Cerrar' : 'Ver detalles'}
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="admin-detail-row">
                          <td colSpan="8">
                            <div className="admin-detail-grid">
                              <div><span>Rating / partidas ELO</span><strong>{u.rating ?? '—'} / {u.ratingGames ?? '—'}</strong></div>
                              <div><span>Pico de rating</span><strong>{u.ratingPeak ?? '—'}</strong></div>
                              <div><span>Racha máx. victorias</span><strong>{u.longestWinStreak ?? 0}</strong></div>
                              <div><span>Victoria más difícil</span><strong>{u.bestDifficultyWin == null ? '—' : `CPU ${u.bestDifficultyWin}`}</strong></div>
                              <div><span>Partidas normales</span><strong>{u.gamesPlayed ?? 0}</strong></div>
                              <div><span>Batallas combate</span><strong>{u.combatBattles ?? 0}</strong></div>
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
                              <div><span>Accuracy media</span><strong>{u.avgAccuracy == null ? '—' : `${u.avgAccuracy}%`}</strong></div>
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
                              <div className="admin-detail-wide"><span>Peor jugada registrada</span><strong><WorstMove move={u.worstMove} /></strong></div>
                              <div className="admin-detail-wide"><span>Actividad reciente</span><strong className="admin-activity-list">{(u.recentActivity || []).length ? (u.recentActivity || []).map((a, i) => <em key={`${a.date}-${i}`}>{a.date ? new Date(a.date).toLocaleString() : ''} · {a.text}{a.detail ? ` · ${a.detail}` : ''}</em>) : '—'}</strong></div>
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
