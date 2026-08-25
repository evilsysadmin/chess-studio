import MechanicTutorialHelp from './MechanicTutorialHelp.jsx';
import { reanalyzeAdminUser } from '../admin.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { api } from '../api.js';
import { getToken, getUsername } from '../auth.js';
import { requestRemoteNarrative } from '../narrativeRemote.js';
import { buildTrainingPlanDossier } from '../aiNarrativeTasks.js';
import {
  formatTrainingPlanCooldown,
  loadCachedTrainingPlan,
  markTrainingPlanManualRefresh,
  saveCachedTrainingPlan,
  shouldCommitManualTrainingPlanRefresh,
  trainingPlanGenerationKey,
  trainingPlanManualRefreshState,
} from '../aiTrainingPlan.js';
import {
  buildPlayerPortraitFacts,
  formatPlayerPortraitCooldown,
  loadCachedPlayerPortrait,
  markPlayerPortraitManualRefresh,
  playerPortraitGenerationKey,
  playerPortraitManualRefreshState,
  saveCachedPlayerPortrait,
  shouldCommitManualPortraitRefresh,
} from '../aiPlayerPortrait.js';
import { findWorstMoveEver } from '../gameReport.js';
import { generateRoast, generateCoaching, selectTrainingNow, trainingTargetForCoaching } from '../insights.js';
import { formatLongMove } from '../notation.js';
import { loadUnlocked, ACHIEVEMENTS } from '../achievements.js';
import { loadPuzzlesSolved } from '../puzzleStats.js';
import { loadPersonalPuzzles } from '../personalPuzzles.js';
import { loadWorstMoveCache, saveWorstMoveCache } from '../worstMoveCache.js';
import RatingChart from './RatingChart.jsx';
import { loadRivalry } from '../rivalry.js';
import { loadSeriesHistory, seriesHeadline, seriesHistoryStats } from '../series.js';
import CareerScreen from './CareerScreen.jsx';
import { GAME_MODE_LABELS, gameModeLabel } from '../gameModes.js';
import GlossaryTerm from './GlossaryTerm.jsx';


function InsightsHubHeader({ section, onSectionChange, onExit }) {
  return (
    <>
      <button className="back-link" onClick={onExit}>← Volver al menú</button>
      <div className="menu-section insights-hub-hero">
        <span className="section-label">Tu expediente de juego</span>
        <div className="combat-heading-row"><h2>Así juegas</h2><MechanicTutorialHelp tutorialId="insights" /></div>
        <p className="hero-scope-note">Tus patrones, tus errores y qué entrenar ahora.</p>
        <div className="insights-subnav" role="tablist" aria-label="Secciones de Así juegas">
          <button
            type="button"
            role="tab"
            aria-selected={section === 'diagnosis'}
            className={section === 'diagnosis' ? 'active' : ''}
            onClick={() => onSectionChange('diagnosis')}
          >
            Diagnóstico
            <small>Qué mejorar ahora</small>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={section === 'career'}
            className={section === 'career' ? 'active' : ''}
            onClick={() => onSectionChange('career')}
          >
            Expediente
            <small>Historial y progreso</small>
          </button>
        </div>
      </div>
    </>
  );
}

function WinBar({ stats }) {
  if (!stats || stats.total === 0) return null;
  const winPct = (stats.wins / stats.total) * 100;
  const drawPct = (stats.draws / stats.total) * 100;
  return (
    <div className="insights-winbar">
      <div className="insights-winbar-track">
        <span className="insights-winbar-win" style={{ width: `${winPct}%` }} />
        <span className="insights-winbar-draw" style={{ width: `${drawPct}%`, left: `${winPct}%` }} />
      </div>
      <span className="insights-winbar-label">{stats.wins}V · {stats.draws}T · {stats.losses}D</span>
    </div>
  );
}

export default function InsightsScreen({ insights, gameHistory, combatHistory, ratingHistory, onExit, onJumpToMove, onOpenRecord, onMovie, onPlayFromHere, onOpenPuzzles, onStartRun, onContinueRun, isAdminUser = false }) {
  useEscapeToClose(onExit);
  const [section, setSection] = useState('diagnosis');

  const [searchStatus, setSearchStatus] = useState('idle'); // 'idle' | 'running' | 'done'
  const [searchProgress, setSearchProgress] = useState({ done: 0, total: 0 });
  const [searchResult, setSearchResult] = useState(() => {
    const cache = loadWorstMoveCache();
    const records = [
      ...gameHistory.map((record) => ({ record, kind: 'game' })),
      ...combatHistory.map((record) => ({ record, kind: 'combat' })),
    ];
    let best = null;
    for (const item of records) {
      const worst = cache[item.record.id]?.worst;
      if (worst && (!best || worst.loss > best.moveReport.loss)) {
        best = { ...item, moveReport: worst };
      }
    }
    return best;
  });
  const stopRef = useRef(false);
  const rivalry = useMemo(() => loadRivalry(), []);
  const seriesHistory = useMemo(() => loadSeriesHistory(), []);
  const seriesStats = useMemo(() => seriesHistoryStats(seriesHistory), [seriesHistory]);
  const sinRows = useMemo(() => {
    const labels = {
      'human:MISSED_MATE': 'Mates ignorados',
      'human:ALLOWED_MATE': 'Mates regalados',
      'human:QUEEN_EN_PRISE_TO_PAWN': 'Damas expuestas a peón',
      'human:STALEMATE_BLUNDER': 'Ahogados criminales',
      'cpu:PAWN_TAKES_QUEEN': 'Damas devoradas por peón',
      'cpu:KNIGHT_FORK': 'Horquillas de caballo sufridas',
      'cpu:PAWN_FORK': 'Horquillas de peón sufridas',
    };
    return Object.entries(rivalry.incidents || {})
      .filter(([key]) => labels[key])
      .map(([key, count]) => ({ key, label: labels[key], count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [rivalry]);

  // Se recalcula si cambian los insights o si aparece un resultado nuevo
  // de "Buscar mi peor jugada de siempre" — sin volver a llamar al
  // backend, todo esto ya está calculado.
  const personalPuzzles = useMemo(() => loadPersonalPuzzles(), [gameHistory.length]);
  const personalPuzzleCount = personalPuzzles.length;
  const roastExtras = useMemo(() => ({
    achievementsUnlocked: loadUnlocked().size,
    achievementsTotal: ACHIEVEMENTS.length,
    puzzlesSolved: loadPuzzlesSolved(),
    personalPuzzles: personalPuzzleCount,
    rivalryRecord: rivalry.record,
    incidents: rivalry.incidents,
  }), [rivalry, personalPuzzleCount]);
  const roastLines = useMemo(() => generateRoast(insights, searchResult, roastExtras), [insights, searchResult, roastExtras]);
  const portraitFacts = useMemo(
    () => buildPlayerPortraitFacts(insights, rivalry, roastExtras, searchResult),
    [insights, rivalry, roastExtras, searchResult],
  );
  const portraitGenerationKey = useMemo(() => playerPortraitGenerationKey(insights), [insights]);
  const portraitIdentityScope = getUsername();
  const portraitFactsKey = useMemo(() => JSON.stringify(portraitFacts || {}), [portraitFacts]);
  const portraitRemoteEligible = Number(insights.totalGames || 0) >= 3;
  const localPortrait = useMemo(() => roastLines.slice(0, 2).join(' '), [roastLines]);
  const [portraitText, setPortraitText] = useState(() => loadCachedPlayerPortrait(portraitGenerationKey, portraitIdentityScope));
  const [portraitStatus, setPortraitStatus] = useState(() => portraitText ? 'cloudflare' : 'local');
  const [portraitRefresh, setPortraitRefresh] = useState(0);
  const portraitManualRequestRef = useRef(false);
  const [portraitCooldownNow, setPortraitCooldownNow] = useState(() => Date.now());
  const portraitManualState = playerPortraitManualRefreshState({ now: portraitCooldownNow, identityScope: portraitIdentityScope, bypassCooldown: isAdminUser });

  useEffect(() => {
    if (portraitManualState.allowed) return undefined;
    const timer = window.setInterval(() => setPortraitCooldownNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, [portraitManualState.allowed]);

  useEffect(() => {
    if (!portraitFacts || !portraitRemoteEligible) {
      setPortraitText(null);
      setPortraitStatus('local');
      return undefined;
    }

    const cached = loadCachedPlayerPortrait(portraitGenerationKey, portraitIdentityScope);
    if (cached && portraitRefresh === 0) {
      setPortraitText(cached);
      setPortraitStatus('cloudflare');
      return undefined;
    }
    if (!cached && portraitRefresh === 0) setPortraitText(null);

    const token = getToken();
    if (!token) {
      setPortraitStatus('local');
      return undefined;
    }

    let active = true;
    const requestKind = portraitManualRequestRef.current ? 'portrait_manual' : 'portrait_auto';
    portraitManualRequestRef.current = false;
    setPortraitStatus('loading');
    const remotePortrait = isAdminUser && requestKind === 'portrait_manual'
      ? reanalyzeAdminUser(portraitIdentityScope, portraitFacts).then((result) => result?.text || null)
      : requestRemoteNarrative(
        {
          eventType: 'player_portrait',
          requestKind,
          tone: 'friendly_sarcastic',
          facts: portraitFacts,
        },
        { token, timeoutMs: 7000 },
      );

    void remotePortrait.then((text) => {
      if (!active) return;
      if (!text) {
        setPortraitStatus(cached ? 'cloudflare' : 'local');
        return;
      }
      saveCachedPlayerPortrait(portraitGenerationKey, text, portraitIdentityScope);
      if (!isAdminUser && shouldCommitManualPortraitRefresh(requestKind, text)) {
        // El cooldown manual se consume sólo cuando hubo una lectura real de
        // Workers AI. Un timeout/fallback no castiga al usuario durante 6 h.
        markPlayerPortraitManualRefresh({ identityScope: portraitIdentityScope });
        setPortraitCooldownNow(Date.now());
      }
      setPortraitText(text);
      setPortraitStatus('cloudflare');
    }).catch(() => {
      if (!active) return;
      setPortraitStatus(cached ? 'cloudflare' : 'local');
    });

    return () => { active = false; };
  }, [portraitFactsKey, portraitGenerationKey, portraitRefresh, portraitRemoteEligible, isAdminUser]);

  function requestFreshPortrait() {
    const state = playerPortraitManualRefreshState({ identityScope: portraitIdentityScope, bypassCooldown: isAdminUser });
    if (!portraitRemoteEligible || !state.allowed || portraitStatus === 'loading') {
      setPortraitCooldownNow(Date.now());
      return;
    }
    portraitManualRequestRef.current = true;
    setPortraitCooldownNow(Date.now());
    setPortraitRefresh((value) => value + 1);
  }

  const coaching = useMemo(() => generateCoaching(insights, rivalry, roastExtras), [insights, rivalry, roastExtras]);
  const coachingWithTraining = useMemo(() => coaching.map((item) => ({
    item,
    target: trainingTargetForCoaching(item, personalPuzzles),
  })), [coaching, personalPuzzles]);
  const trainingNow = useMemo(() => selectTrainingNow(coaching, personalPuzzles), [coaching, personalPuzzles]);
  const trainingDossier = useMemo(() => buildTrainingPlanDossier({
    insights,
    coaching,
    trainingTargets: coachingWithTraining.map(({ target }) => target),
  }), [insights, coaching, coachingWithTraining]);
  const trainingGenerationKey = useMemo(() => trainingPlanGenerationKey(trainingDossier), [trainingDossier]);
  const trainingIdentityScope = getUsername();
  const [trainingAiText, setTrainingAiText] = useState(() => loadCachedTrainingPlan(trainingGenerationKey, trainingIdentityScope));
  const [trainingAiStatus, setTrainingAiStatus] = useState(() => trainingAiText ? 'cloudflare' : 'local');
  const [trainingRefresh, setTrainingRefresh] = useState(0);
  const trainingManualRequestRef = useRef(false);
  const [trainingCooldownNow, setTrainingCooldownNow] = useState(() => Date.now());
  const trainingManualState = trainingPlanManualRefreshState({
    now: trainingCooldownNow,
    identityScope: trainingIdentityScope,
    bypassCooldown: isAdminUser,
  });

  useEffect(() => {
    if (trainingManualState.allowed) return undefined;
    const timer = window.setInterval(() => setTrainingCooldownNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, [trainingManualState.allowed]);

  useEffect(() => {
    if (!trainingDossier || Number(insights.totalGames || 0) < 3) {
      setTrainingAiText(null);
      setTrainingAiStatus('local');
      return undefined;
    }
    const cached = loadCachedTrainingPlan(trainingGenerationKey, trainingIdentityScope);
    if (cached && trainingRefresh === 0) {
      setTrainingAiText(cached);
      setTrainingAiStatus('cloudflare');
      return undefined;
    }
    if (!cached && trainingRefresh === 0) setTrainingAiText(null);
    const token = getToken();
    if (!token) {
      setTrainingAiStatus(cached ? 'cloudflare' : 'local');
      return undefined;
    }

    let active = true;
    const requestKind = trainingManualRequestRef.current ? 'training_plan_manual' : 'training_plan';
    trainingManualRequestRef.current = false;
    setTrainingAiStatus('loading');
    void requestRemoteNarrative({ ...trainingDossier, requestKind }, { token, timeoutMs: 8000 }).then((text) => {
      if (!active) return;
      if (!text) {
        setTrainingAiStatus(cached ? 'cloudflare' : 'local');
        return;
      }
      saveCachedTrainingPlan(trainingGenerationKey, text, trainingIdentityScope);
      if (!isAdminUser && shouldCommitManualTrainingPlanRefresh(requestKind, text)) {
        markTrainingPlanManualRefresh({ identityScope: trainingIdentityScope });
        setTrainingCooldownNow(Date.now());
      }
      setTrainingAiText(text);
      setTrainingAiStatus('cloudflare');
    }).catch(() => {
      if (active) setTrainingAiStatus(cached ? 'cloudflare' : 'local');
    });
    return () => { active = false; };
  }, [trainingDossier, trainingGenerationKey, trainingIdentityScope, insights.totalGames, trainingRefresh, isAdminUser]);

  function requestFreshTrainingPlan() {
    const state = trainingPlanManualRefreshState({ identityScope: trainingIdentityScope, bypassCooldown: isAdminUser });
    if (!trainingDossier || Number(insights.totalGames || 0) < 3 || !state.allowed || trainingAiStatus === 'loading') {
      setTrainingCooldownNow(Date.now());
      return;
    }
    trainingManualRequestRef.current = true;
    setTrainingCooldownNow(Date.now());
    setTrainingRefresh((value) => value + 1);
  }

  async function startSearch() {
    stopRef.current = false;
    setSearchStatus('running');
    // Conserva visible el mejor resultado cacheado mientras revisa lo nuevo.
    setSearchProgress({ done: 0, total: gameHistory.length + combatHistory.length });

    // Partidas ya analizadas en una búsqueda anterior no vuelven a
    // llamar al backend — una partida terminada nunca cambia, así que su
    // resultado sigue siendo válido para siempre. El caché se guarda
    // (local + sincronizado a Mongo vía el perfil) aunque la búsqueda se
    // cancele a mitad de camino, para no perder el trabajo ya hecho.
    const cache = loadWorstMoveCache();
    const { best, cache: updatedCache } = await findWorstMoveEver(
      gameHistory,
      combatHistory,
      api,
      (done, total, best) => {
        setSearchProgress({ done, total });
        if (best) setSearchResult(best); // resultado parcial, se ve mientras sigue buscando
      },
      () => stopRef.current,
      { cache }
    );

    saveWorstMoveCache(updatedCache);
    setSearchResult(best);
    setSearchStatus('done');
  }

  function cancelSearch() {
    stopRef.current = true;
  }

  if (section === 'career') {
    return (
      <div className="menu tournament-panel insights-hub">
        <InsightsHubHeader section={section} onSectionChange={setSection} onExit={onExit} />
        <CareerScreen
          embedded
          history={gameHistory}
          ratingHistory={ratingHistory}
          onExit={onExit}
          onOpenRecord={onOpenRecord}
          onMovie={onMovie}
          onPlayFromHere={onPlayFromHere}
          onOpenPuzzles={onOpenPuzzles}
          onStartRun={onStartRun}
          onContinueRun={onContinueRun}
        />
      </div>
    );
  }

  if (insights.totalGames === 0) {
    return (
      <div className="menu tournament-panel insights-hub">
        <InsightsHubHeader section={section} onSectionChange={setSection} onExit={onExit} />
        <div className="menu-section">
          <h2>Diagnóstico</h2>
          <p className="hint-text">
            Todavía no hay ninguna partida guardada — juega alguna (en el modo que sea) y esto se va a ir
            llenando solo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="menu tournament-panel insights-hub">
      <InsightsHubHeader section={section} onSectionChange={setSection} onExit={onExit} />

      {localPortrait && (
        <div className="menu-section ai-player-portrait">
          <div className="ai-player-portrait-heading">
            <div>
              <span className="section-label">Retrato dinámico</span>
              <h2>Así te ve la CPU</h2>
            </div>
            <span className={`ai-player-portrait-source source-${portraitStatus}`}>
              {portraitStatus === 'loading' ? 'Pensando…' : portraitStatus === 'cloudflare' ? 'Workers AI' : 'Lectura local'}
            </span>
          </div>
          <p className="ai-player-portrait-text">{portraitText || localPortrait}</p>
          <div className="ai-player-portrait-actions ai-player-portrait-actions-visible">
            {portraitRemoteEligible ? (
              <>
                <button
                  type="button"
                  className="primary-btn ai-player-portrait-refresh-btn"
                  disabled={portraitStatus === 'loading' || !portraitManualState.allowed}
                  onClick={requestFreshPortrait}
                >
                  {portraitStatus === 'loading' ? 'Pensando…' : portraitManualState.allowed ? '↻ Analizarme de nuevo' : 'Lectura reciente'}
                </button>
                <small>
                  {isAdminUser
                    ? 'Admin · sin cooldown · automática tras cada partida.'
                    : portraitManualState.allowed
                      ? 'Una lectura extra cada 6 h · automática tras cada partida.'
                      : `Otra lectura disponible en ${formatPlayerPortraitCooldown(portraitManualState.retryAfterMs)}.`}
                </small>
              </>
            ) : (
              <small>Workers AI se activa cuando haya al menos 3 partidas reales que comentar.</small>
            )}
          </div>
          <details className="friendly-disclosure ai-player-portrait-details">
            <summary>Ver en qué se basa</summary>
            <div className="friendly-disclosure-body">
              <p className="hint-text">Usa sólo tus estadísticas e incidentes guardados: resultados, tendencia de rating, aperturas, rachas, rivalidad y errores realmente registrados. La IA pone la voz; los hechos los pone Chess Studio.</p>
            </div>
          </details>
        </div>
      )}

      <div className="menu-section worst-move-spotlight">
        <div className="worst-move-spotlight-heading">
          <div>
            <span className="section-label">Escena del crimen</span>
            <h2>Tu peor jugada</h2>
          </div>
          <span className="worst-move-spotlight-count">{gameHistory.length + combatHistory.length} partidas</span>
        </div>

        {searchResult ? (
          <div className={`worst-move-card sev-${searchResult.moveReport.severity} worst-move-spotlight-card`}>
            <span className="worst-move-header">
              <span className="worst-move-san">
                {formatLongMove({
                  piece: searchResult.moveReport.playedPiece,
                  from: searchResult.moveReport.playedFrom,
                  to: searchResult.moveReport.playedTo,
                })}
              </span>
              <span className="worst-move-loss">-{searchResult.moveReport.loss} <GlossaryTerm term="cp">cp</GlossaryTerm></span>
            </span>
            <span className="worst-move-detail">
              Debías jugar{' '}
              {formatLongMove({
                piece: searchResult.moveReport.suggestedPiece,
                from: searchResult.moveReport.suggestedFrom,
                to: searchResult.moveReport.suggestedTo,
              })}
              {' · '}{new Date(searchResult.record.date).toLocaleDateString('es-ES')}
              {' · '}{gameModeLabel(searchResult.record)}
            </span>
            <div className="worst-move-spotlight-actions">
              {onJumpToMove && (
                <button type="button" className="primary-btn" onClick={() => onJumpToMove(searchResult.record, searchResult.kind, searchResult.moveReport)}>
                  Ver posición →
                </button>
              )}
              {searchStatus === 'idle' || searchStatus === 'done' ? (
                <button type="button" className="secondary-btn" onClick={startSearch}>Actualizar análisis</button>
              ) : null}
            </div>
          </div>
        ) : searchStatus === 'idle' ? (
          <div className="worst-move-spotlight-empty">
            <p>Busca la mayor pérdida de evaluación de todo tu historial. Después queda guardada y aparecerá aquí nada más entrar.</p>
            <button type="button" className="primary-btn" onClick={startSearch}>Buscar mi peor jugada</button>
          </div>
        ) : null}

        {searchStatus === 'running' && (
          <div className="insights-search-progress worst-move-spotlight-progress">
            <div className="status-chip-bar">
              <span className="status-chip-bar-fill" style={{ width: `${searchProgress.total ? (searchProgress.done / searchProgress.total) * 100 : 0}%` }} />
            </div>
            <p className="hint-text">
              Revisando {searchProgress.done} de {searchProgress.total}…
              {searchResult && <> Peor hasta ahora: {searchResult.moveReport.played} (-{searchResult.moveReport.loss} <GlossaryTerm term="cp">cp</GlossaryTerm>).</>}
            </p>
            <button type="button" className="secondary-btn" onClick={cancelSearch}>Cancelar</button>
          </div>
        )}

        {searchStatus === 'done' && !searchResult && (
          <p className="hint-text">No apareció ninguna jugada con pérdida evaluable en el historial analizado.</p>
        )}
        <p className="hint-text worst-move-spotlight-note">Las partidas ya analizadas salen del caché; al actualizar solo se trabaja de verdad sobre lo nuevo.</p>
      </div>

      <div className="menu-section personal-training-spotlight">
        <div>
          <span className="section-label">Entrenamiento autobiográfico</span>
          <h2>🧠 Entrena tus cagadas</h2>
          <p className="hint-text">Posiciones reales extraídas de errores que ya cometiste. Mucho más educativo que fingir que nunca pasó.</p>
        </div>
        <div className="personal-training-spotlight-actions">
          <strong>{personalPuzzleCount} posiciones</strong>
          <button className="primary-btn" disabled={personalPuzzleCount === 0} onClick={() => onOpenPuzzles('personal', false)}>
            {personalPuzzleCount ? 'Entrenar ahora' : 'Aún sin crímenes'}
          </button>
          {personalPuzzleCount > 2 && <button className="secondary-btn" onClick={() => onOpenPuzzles('personal', true)}>Puzzle Rush personal</button>}
        </div>
      </div>

      {roastLines.length > 0 && (
        <details className="friendly-disclosure insights-roast-details">
          <summary>Ver lectura sarcástica del expediente</summary>
          <div className="friendly-disclosure-body menu-section roast-section">
            <h2>Cómo te ve, sin filtro</h2>
            <ul className="roast-list">
              {roastLines.map((line, i) => <li key={i}>{line}</li>)}
            </ul>
          </div>
        </details>
      )}

      {coaching.length > 0 && (
        <div className="menu-section coaching-section">
          <div className="coaching-heading">
            <div>
              <span className="section-label">Lo útil después del incendio</span>
              <h2>Qué entrenaría ahora</h2>
            </div>
            <span className="coaching-count">{coaching.length} prioridades</span>
          </div>
          {trainingNow && (
            <article className={`training-now-card priority-${trainingNow.item.priority}`} aria-label="Entrenamiento recomendado ahora">
              <div className="training-now-heading">
                <div>
                  <span className="section-label">AHORA MISMO</span>
                  <h3>{trainingNow.item.title}</h3>
                </div>
                <span className="coaching-priority">{trainingNow.item.priorityLabel}</span>
              </div>
              <p>{trainingNow.item.diagnosis}</p>
              <div className="coaching-action"><strong>Sesión recomendada:</strong> {trainingNow.item.action}</div>
              {trainingNow.target ? (
                <div className="coaching-training-cta primary-training-cta">
                  <button type="button" className="primary-btn" onClick={() => onOpenPuzzles(trainingNow.target.source, trainingNow.target.rush, trainingNow.target.filter)}>
                    Entrenar esto ahora →
                  </button>
                  <small>{trainingNow.target.count} {trainingNow.target.count === 1 ? 'posición real disponible' : 'posiciones reales disponibles'}</small>
                </div>
              ) : (
                <small className="hint-text training-now-no-material">Prioridad calculada con datos reales; aún no hay posiciones personales específicas para convertirla en ejercicio.</small>
              )}
            </article>
          )}
          {trainingAiStatus === 'loading' && <p className="hint-text coaching-ai-status">Workers AI está ordenando las prioridades…</p>}
          {trainingAiText && (
            <div className="ai-task-card coaching-ai-plan">
              <small>CPU // PLAN DE ENTRENAMIENTO · WORKERS AI</small>
              <p>{trainingAiText}</p>
              <div className="ai-player-portrait-actions ai-player-portrait-actions-visible">
                <button
                  type="button"
                  className="secondary-btn"
                  disabled={trainingAiStatus === 'loading' || !trainingManualState.allowed}
                  onClick={requestFreshTrainingPlan}
                >
                  {trainingAiStatus === 'loading' ? 'Pensando…' : trainingManualState.allowed ? '↻ Pedir otro plan' : 'Plan reciente'}
                </button>
                <small>
                  {isAdminUser
                    ? 'Admin · sin cooldown.'
                    : trainingManualState.allowed
                      ? 'Una lectura extra cada 6 h.'
                      : `Otro plan disponible en ${formatTrainingPlanCooldown(trainingManualState.retryAfterMs)}.`}
                </small>
              </div>
            </div>
          )}
          <div className="coaching-grid">
            {coachingWithTraining.filter(({ item }) => item !== trainingNow?.item).map(({ item, target }, i) => (
              <article className={`coaching-card priority-${item.priority}`} key={`${item.title}-${i}`}>
                <div className="coaching-card-top">
                  <span className="coaching-priority">{item.priorityLabel}</span>
                  <b>{item.title}</b>
                </div>
                <p>{item.diagnosis}</p>
                <div className="coaching-action"><strong>Haz esto:</strong> {item.action}</div>
                {target && (
                  <div className="coaching-training-cta">
                    <button type="button" className="primary-btn" onClick={() => onOpenPuzzles(target.source, target.rush, target.filter)}>
                      {target.label} →
                    </button>
                    <small>{target.count} {target.count === 1 ? 'posición real relacionada' : 'posiciones reales relacionadas'}</small>
                  </div>
                )}
              </article>
            ))}
          </div>
          <p className="hint-text coaching-footnote">Consejos calculados con tus estadísticas e incidentes guardados. No inventan evaluación de jugadas que no haya pasado por el motor.</p>
        </div>
      )}

      <details className="friendly-disclosure insights-full-details">
        <summary>Ver estadísticas y diagnóstico completo</summary>
        <div className="friendly-disclosure-body friendly-stack">
      <div className="menu-section">
          <h2>General</h2>
          <p className="hint-text">
            <b>{insights.totalGames}</b> partida{insights.totalGames === 1 ? '' : 's'} en total ·{' '}
            <b>{insights.overall.winPct}%</b> de victorias
          </p>
          <WinBar stats={insights.overall} />
        </div>
  
        {Object.keys(insights.byMode).length > 1 && (
          <div className="menu-section">
            <h2>Por modo</h2>
            <div className="insights-mode-list">
              {Object.entries(insights.byMode).map(([mode, stats]) => (
                <div className="insights-mode-row" key={mode}>
                  <span className="insights-mode-name">{GAME_MODE_LABELS[mode] || mode}</span>
                  <WinBar stats={stats} />
                </div>
              ))}
            </div>
          </div>
        )}
  
        <div className="menu-section">
          <h2>Datos sueltos</h2>
          <div className="insights-facts-grid">
            {insights.favoriteOpening && (
              <div className="insights-fact">
                <span className="insights-fact-value">{insights.favoriteOpening.name}</span>
                <span className="insights-fact-label">Tu apertura más jugada ({insights.favoriteOpening.count}×)</span>
              </div>
            )}
            <div className="insights-fact">
              <span className="insights-fact-value">
                {insights.colorPreference.white} / {insights.colorPreference.black}
              </span>
              <span className="insights-fact-label">Partidas con blancas / negras</span>
            </div>
            <div className="insights-fact">
              <span className="insights-fact-value">{insights.longestWinStreak}</span>
              <span className="insights-fact-label">Racha de victorias más larga</span>
            </div>
            <div className="insights-fact">
              <span className="insights-fact-value">{insights.humanCaptures}</span>
              <span className="insights-fact-label">Piezas capturadas por ti (en todos los modos)</span>
            </div>
            {insights.ratingTrend && (
              <div className="insights-fact">
                <span className="insights-fact-value">
                  {insights.ratingTrend.delta >= 0 ? '+' : ''}{insights.ratingTrend.delta}
                </span>
                <span className="insights-fact-label">
                  Cambio de rating desde el primer registro ({insights.ratingTrend.min}–{insights.ratingTrend.max})
                </span>
              </div>
            )}
          </div>
        </div>
  
        {insights.openingDossier?.length > 0 && (
          <div className="menu-section">
            <h2>Expediente de aperturas</h2>
            <p className="hint-text">Qué sueles jugar y qué tal sales vivo de ello.</p>
            <div className="opening-dossier-grid">
              {insights.openingDossier.map((row) => (
                <div className="opening-dossier-card" key={row.name}>
                  <b>{row.name}</b>
                  <span>{row.games} partidas · {row.wins}V/{row.draws}T/{row.losses}D</span>
                  <span>{row.winPct}% victorias · {row.white} blancas / {row.black} negras</span>
                </div>
              ))}
            </div>
          </div>
        )}
  
        {rivalry.record?.games > 0 && (
          <div className="menu-section">
            <h2>Rivalidad con la CPU</h2>
            <p className="hint-text">Una sola rivalidad, una sola memoria y cero botón para pedir clemencia.</p>
            <div className="rivalry-grid">
              <div className="rivalry-card">
                <strong>☠ CPU</strong>
                <span>{rivalry.record.wins}V · {rivalry.record.draws}T · {rivalry.record.losses}D</span>
                <small>Mejor racha tuya: {rivalry.record.bestHumanStreak || 0} · de la CPU: {rivalry.record.bestCpuStreak || 0}</small>
              </div>
            </div>
          </div>
        )}
  
        {seriesStats.total > 0 && (
          <div className="menu-section series-dossier">
            <div className="series-dossier-heading">
              <div>
                <span className="section-label">Jurisprudencia</span>
                <h2>Expediente de series</h2>
              </div>
              <strong>{seriesStats.won} ganadas · {seriesStats.lost} perdidas</strong>
            </div>
            <p className="hint-text">Las partidas sueltas son discusión. Las series dejan antecedentes.</p>
            <div className="series-dossier-stats">
              <span><b>{seriesStats.currentStreak > 0 ? `Tú ×${seriesStats.currentStreak}` : seriesStats.currentStreak < 0 ? `CPU ×${Math.abs(seriesStats.currentStreak)}` : '—'}</b><small>racha actual de series</small></span>
              <span><b>{seriesStats.bestHumanStreak}</b><small>mejor racha tuya</small></span>
              <span><b>{seriesStats.bestCpuStreak}</b><small>mejor racha CPU</small></span>
              <span><b>{seriesStats.humanSweeps} / {seriesStats.cpuSweeps}</b><small>barridas tú / CPU</small></span>
              <span><b>{seriesStats.humanComebacks} / {seriesStats.cpuComebacks}</b><small>remontadas tú / CPU</small></span>
              <span><b>{seriesStats.deciders}</b><small>series a la decisiva</small></span>
            </div>
            <div className="series-dossier-history">
              {seriesHistory.slice(0, 5).map((series) => (
                <article key={series.id || `${series.completedAt}-${series.bestOf}`}>
                  <div>
                    <b>{seriesHeadline(series)}</b>
                    <small>Mejor de {series.bestOf}{series.draws ? ` · ${series.draws} tablas` : ''}</small>
                  </div>
                  <time dateTime={series.completedAt || undefined}>
                    {series.completedAt ? new Date(series.completedAt).toLocaleDateString('es-ES') : 'sin fecha'}
                  </time>
                </article>
              ))}
            </div>
          </div>
        )}
  
        {sinRows.length > 0 && (
          <div className="menu-section">
            <h2>Heatmap de pecados</h2>
            <p className="hint-text">Incidentes tácticos registrados desde que activaste la rivalidad. Cuanto más larga la barra, más reincidencia.</p>
            <div className="sin-heatmap">
              {sinRows.map((row) => {
                const max = Math.max(...sinRows.map((item) => item.count), 1);
                return (
                  <div className="sin-row" key={row.key}>
                    <span>{row.label}</span>
                    <div className="sin-track"><i style={{ width: `${Math.max(8, (row.count / max) * 100)}%` }} /></div>
                    <b>{row.count}</b>
                  </div>
                );
              })}
            </div>
          </div>
        )}
  
  
        {ratingHistory.length >= 2 && (
          <div className="menu-section">
            <h2>Evolución del rating</h2>
            <RatingChart history={ratingHistory} />
          </div>
        )}
          </div>
      </details>
    </div>
  );
}
