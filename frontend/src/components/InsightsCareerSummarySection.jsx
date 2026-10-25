import GlossaryTerm from './GlossaryTerm.jsx';
import MechanicTutorialHelp from './MechanicTutorialHelp.jsx';
import RivalryDossier from './RivalryDossier.jsx';
import CareerHallOfFame from './CareerHallOfFame.jsx';
import CareerChronicle from './CareerChronicle.jsx';

// Preserves the existing summary UI while CareerScreen owns every recorded fact.
function pct(n) { return n === null || n === undefined ? '—' : `${n}%`; }
export default function InsightsCareerSummarySection({
  personalSeasons, history, onOpenRecord, hall, onMovie, rivalry,
  rec, survivalRun, conflictingRun, run, onContinueRun, onStartRun,
  weekly, topIncident, personal, daily, onOpenPuzzles,
  nemesis, nemesisPersonalCount, onPlayFromHere,
}) {
  return (
    <>
      <CareerChronicle seasons={personalSeasons} history={history} onOpenRecord={onOpenRecord} />
    <CareerHallOfFame hall={hall} history={history} onOpenRecord={onOpenRecord} onMovie={onMovie} />
    <RivalryDossier rivalry={rivalry} />

    <div className="menu-section survival-run-card">
      <div className="career-section-heading"><div><span className="section-label">MODO DE PRESIÓN</span><h2>🔥 Supervivencia</h2></div><MechanicTutorialHelp tutorialId="survival" /></div>
      <p>Empiezas contra CPU 30. Cada victoria sube 7 puntos la dificultad. Una derrota o unas tablas terminan la expedición.</p>
      <div className="career-mini-grid">
        <span><b>{rec.bestStreakRun||0}</b><small>récord de victorias consecutivas</small></span>
        <span><b>{survivalRun?.active?survivalRun.wins||0:0}</b><small>victorias en la expedición actual</small></span>
        <span><b>CPU {survivalRun?.active?survivalRun.difficulty:30}</b><small>{survivalRun?.active?'siguiente rival':'dificultad inicial'}</small></span>
      </div>
      <div className="coaching-action" style={{marginTop:'.8rem'}}>
        <button className="primary-btn" disabled={conflictingRun} onClick={()=>survivalRun?.active?onContinueRun(survivalRun):onStartRun('streak')}>{survivalRun?.active?'Continuar supervivencia →':'Empezar supervivencia →'}</button>
        {conflictingRun?<span>Ya tienes una {run.mode==='boss'?'Boss Run':'Copa'} activa. Termínala antes de abrir otra expedición.</span>:<span>{survivalRun?.active?'Tu próxima partida continúa exactamente la run guardada.':'No hay vidas extra ni tablas salvadoras. Ganas o vuelves al cuartel.'}</span>}
      </div>
    </div>

    <div className="menu-section"><h2>📅 Informe semanal</h2><div className="career-mini-grid"><span><b>{weekly.current.games}</b><small>partidas últimos 7 días</small></span><span><b>{weekly.current.winPct}%</b><small>victorias · {weekly.winDelta===null?'sin comparación':`${weekly.winDelta>=0?'+':''}${weekly.winDelta} pts vs semana anterior`}</small></span><span><b>{pct(weekly.current.accuracy)}</b><small><GlossaryTerm term="Accuracy">accuracy</GlossaryTerm> media {weekly.accuracyDelta===null?'':`· ${weekly.accuracyDelta>=0?'+':''}${weekly.accuracyDelta} vs anterior`}</small></span><span><b>{topIncident?`${topIncident.count}×`:'—'}</b><small>{topIncident?.label||'sin pecado dominante registrado'}</small></span></div><p className="hint-text">{weekly.current.games===0?'Semana sospechosamente silenciosa. El tablero no puede juzgar lo que no ve.':weekly.winDelta!==null&&weekly.winDelta>10?'Mejora clara. Molesto para el departamento de sarcasmo; excelente para ti.':weekly.winDelta!==null&&weekly.winDelta<-10?'La semana ha venido con pendientes. Conviene revisar autopsias antes de convertir la tendencia en tradición.':'Semana estable. Sigue acumulando datos antes de declarar una revolución ajedrecística.'}</p></div>

    <div className="menu-section"><h2>Entrenamiento personalizado</h2>{topIncident&&<div className="coaching-action" style={{marginBottom:'.8rem'}}><strong>Prioridad sugerida:</strong> {topIncident.label} ×{topIncident.count}. Entrena ese patrón antes de que solicite estatuto de costumbre local.</div>}<div className="career-action-grid">
      <button className="career-action" onClick={()=>onOpenPuzzles('personal',false)}><b>🧠 Acciones inmediatas</b><span>{personal.length} posiciones reales.</span></button><button className="career-action" onClick={()=>onOpenPuzzles('personal',true)}><b>⚡ Puzzle Rush personal</b><span>3 minutos contra tu propio expediente.</span></button><button className="career-action" onClick={()=>onOpenPuzzles('daily',false)}><b>📅 Posición del día</b><span>Racha {daily.streak||0} · mejor {daily.bestStreak||0}.</span></button><button className="career-action" onClick={()=>onOpenPuzzles('curated',true)}><b>🔥 Puzzle Rush clásico</b><span>Cuando quieras sufrir sin contexto autobiográfico.</span></button>
    </div></div>

    <div className="menu-section nemesis-section">
      <div className="nemesis-heading">
        <div><span className="section-label">Objetivo adaptativo</span><h2>🩸 Némesis actual</h2></div>
        {nemesis.opening && <span className={`nemesis-confidence confidence-${nemesis.opening.confidence.key}`}>confianza {nemesis.opening.confidence.label}</span>}
      </div>
      {nemesis.opening ? <>
        <p className="hint-text">No es una etiqueta permanente: se recalcula con tu historial competitivo. Si mejoras, la némesis cambia o desaparece.</p>
        <div className="nemesis-card">
          <div className="nemesis-core">
            <span className="eyebrow">Apertura que más pruebas acumula contra ti</span>
            <h3>{nemesis.opening.opening}</h3>
            <p>Con {nemesis.opening.humanColor==='w'?'blancas':'negras'} · <b>{nemesis.opening.scorePct}%</b> de puntuación · {nemesis.opening.wins}V/{nemesis.opening.draws}T/{nemesis.opening.losses}D en {nemesis.opening.games} partidas.</p>
            <small>CPU · nivel medio {nemesis.opening.avgDifficulty} · últimas {Math.min(5,nemesis.opening.games)}: {nemesis.opening.recentScorePct}%.</small>
          </div>
          <div className="nemesis-actions">
            {nemesis.training && <button className="primary-btn" onClick={()=>onPlayFromHere(nemesis.training.fen,nemesis.training.humanColor,nemesis.training.difficulty,{sourceRecord:nemesis.training.sourceRecord,nemesis:true,nemesisLabel:`${nemesis.opening.opening} · ${nemesis.opening.humanColor==='w'?'blancas':'negras'}`,nemesisOpening:nemesis.opening.opening})}>Entrenar desde mi posición →</button>}
            {nemesis.opening.latestLoss && <button className="secondary-btn" onClick={()=>onOpenRecord(nemesis.opening.latestLoss)}>Revisar derrota real</button>}
            {nemesisPersonalCount>0 && <button className="secondary-btn" onClick={()=>onOpenPuzzles('personal',false,{opening:nemesis.opening.opening})}>Crímenes de esta apertura ({nemesisPersonalCount})</button>}
          </div>
        </div>
        {nemesis.tactic && <div className="nemesis-tactic"><b>Patrón táctico reincidente:</b> {nemesis.tactic.label} · {nemesis.tactic.count} registros. Esto no se atribuye a la apertura: es un antecedente global separado.</div>}
        {nemesisPersonalCount===0 && <p className="hint-text nemesis-footnote">Aún no hay puzzles personales etiquetados con esta apertura. Las próximas autopsias ya guardan esa procedencia para poder filtrarlos sin inventar relaciones.</p>}
      </> : <>
        <p className="hint-text">Todavía no hay una apertura que cumpla el umbral: al menos 4 partidas competitivas con el mismo color, 2 derrotas y ≤45% de puntuación. No voy a fabricar una némesis con tres anécdotas.</p>
        {nemesis.tactic && <div className="nemesis-tactic"><b>Lo que sí está medido:</b> {nemesis.tactic.label} · {nemesis.tactic.count} registros.</div>}
      </>}
    </div>
    </>
  );
}
