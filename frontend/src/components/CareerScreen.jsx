import { useMemo, useState } from 'react';
import { loadPersonalPuzzles } from '../personalPuzzles.js';
import { currentDailyStreak } from '../dailyChallenge.js';
import { loadRivalry } from '../rivalry.js';
import { loadBoardTheme, loadCareer, loadSpecialRun, saveBoardTheme, unlockedBoardThemes } from '../career.js';
import { buildCemetery, buildOpeningTree, deriveChessProfile, evolutionBuckets } from '../metaProgress.js';
import { conversionStats, hallOfFameAndShame, loadAnalysisArchive, materialDonated, openingClinic, openingRivalry, recurrenceIndex, weeklyReport } from '../advancedCareer.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { buildNemesisDossier } from '../nemesis.js';
import GlossaryTerm from './GlossaryTerm.jsx';
import MechanicTutorialHelp from './MechanicTutorialHelp.jsx';
import { buildCareerHeatmaps, deriveRpgProfile, summarizeRpgProfile } from '../careerVisuals.js';
import RivalryDossier from './RivalryDossier.jsx';
import CareerHallOfFame from './CareerHallOfFame.jsx';
import CareerChronicle from './CareerChronicle.jsx';
import CareerPerformanceSection from './CareerPerformanceSection.jsx';
import CareerOpeningsSection from './CareerOpeningsSection.jsx';
import InsightsCareerArchiveSection from './InsightsCareerArchiveSection.jsx';
import { buildPersonalSeasons } from '../personalSeasons.js';

function pct(n){return n===null||n===undefined?'—':`${n}%`;}

export default function CareerScreen({ history, ratingHistory, onExit, onOpenRecord, onMovie, onPlayFromHere, onOpenPuzzles, onStartRun, onContinueRun, embedded = false }) {
  useEscapeToClose(onExit, { disabled: embedded });
  const [theme,setTheme]=useState(()=>loadBoardTheme());
  const [careerSection,setCareerSection]=useState('summary');
  const career=useMemo(()=>loadCareer(),[history,theme]); const rivalry=useMemo(()=>loadRivalry(),[history]); const personal=useMemo(()=>loadPersonalPuzzles(),[history]); const daily=useMemo(()=>currentDailyStreak(),[]);
  const cemetery=useMemo(()=>buildCemetery(history).slice(0,8),[history]); const tree=useMemo(()=>buildOpeningTree(history,8),[history]); const profile=useMemo(()=>deriveChessProfile(history),[history]); const evolution=useMemo(()=>evolutionBuckets(history,10),[history]);
  const archive=useMemo(()=>loadAnalysisArchive(),[history]); const weekly=useMemo(()=>weeklyReport(history,archive),[history,archive]); const hall=useMemo(()=>hallOfFameAndShame(history,archive),[history,archive]); const conversion=useMemo(()=>conversionStats(archive),[archive]); const pressure=useMemo(()=>{const moves=Number(career.pressure?.moves||0),incidents=Number(career.pressure?.incidents||0);return{moves,incidents,rate:moves?Math.round(incidents/moves*100):null};},[career]); const donations=useMemo(()=>materialDonated(history),[history]); const recurrence=useMemo(()=>recurrenceIndex(rivalry),[rivalry]); const openings=useMemo(()=>openingRivalry(history),[history]); const clinic=useMemo(()=>openingClinic(history),[history]);
  const run=loadSpecialRun(); const rec=career.records||{}; const season=career.season||{}; const themes=unlockedBoardThemes(career); const analyses=Object.values(archive); const avgAccuracy=analyses.length?Math.round(analyses.map(a=>a.accuracy).filter(Number.isFinite).reduce((s,n)=>s+n,0)/Math.max(1,analyses.filter(a=>Number.isFinite(a.accuracy)).length)):null;
  const survivalRun=run?.mode==='streak'?run:null;
  const conflictingRun=Boolean(run?.active&&run.mode!=='streak');
  const nemesis=useMemo(()=>buildNemesisDossier(history,rivalry),[history,rivalry]);
  const topIncident=nemesis.tactic;
  const nemesisPersonalCount=useMemo(()=>nemesis.opening ? personal.filter((p)=>p.opening===nemesis.opening.opening).length : 0,[personal,nemesis.opening]);
  const heatmaps=useMemo(()=>buildCareerHeatmaps(history),[history]);
  const rpg=useMemo(()=>deriveRpgProfile(history,archive,career),[history,archive,career]);
  const rpgSummary=useMemo(()=>summarizeRpgProfile(rpg),[rpg]);
  const personalSeasons=useMemo(()=>buildPersonalSeasons(history,ratingHistory,archive),[history,ratingHistory,archive]);
  const personalSeason=personalSeasons.at(-1);

  return <div className={embedded ? 'career-screen insights-embedded-page' : 'menu tournament-panel career-screen'}>
    {!embedded && (<>
      <button className="back-link" onClick={onExit}>← Volver al menú</button>
      <div className="menu-section career-hero"><span className="section-label">Expediente completo</span><h2>Tu carrera ajedrecística</h2><p className="hero-scope-note">Datos reales, entrenamiento y una cantidad administrativamente irresponsable de pruebas contra ti.</p></div>
    </>)}

    <div className="career-hero-grid">
      <article className="career-card"><span className="eyebrow">Temporada personal #{personalSeason.number}</span><h3>{personalSeason.wins}V · {personalSeason.draws}T · {personalSeason.losses}D</h3><p>{personalSeason.games}/{personalSeason.target} partidas{personalSeason.rating ? ` · rating ${personalSeason.rating.delta>=0?'+':''}${personalSeason.rating.delta}` : ''}. <small>Mes {season.id}: {season.games||0} partidas.</small></p></article>
      <article className="career-card"><span className="eyebrow">Rivalidad competitiva</span><h3>{rivalry.record?.wins||0}–{rivalry.record?.losses||0}</h3><p>{rivalry.record?.draws||0} tablas · racha {rivalry.record?.currentStreak||0}.</p></article>
      <article className="career-card"><span className="eyebrow"><GlossaryTerm term="Accuracy">Accuracy</GlossaryTerm> propia</span><h3>{pct(avgAccuracy)}</h3><p>{analyses.length} autopsias archivadas.</p></article>
      <article className="career-card"><span className="eyebrow">Índice de reincidencia</span><h3>{recurrence.score}/100</h3><p>{recurrence.repeated} repeticiones de errores ya conocidos.</p></article>
    </div>

    <nav className="career-section-nav" aria-label="Secciones de Mi progreso">
      {[['summary','Resumen'],['performance','Rendimiento'],['openings','Aperturas'],['archive','Archivo']].map(([id,label])=><button type="button" key={id} className={careerSection===id?'active':''} aria-current={careerSection===id?'page':undefined} onClick={()=>setCareerSection(id)}>{label}</button>)}
    </nav>

    {careerSection==='summary'&&<>
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
    </>}

    {careerSection==='performance'&&<CareerPerformanceSection conversion={conversion} pressure={pressure} donations={donations} rpgSummary={rpgSummary} rpg={rpg} heatmaps={heatmaps} hall={hall} recurrence={recurrence} evolution={evolution} ratingHistory={ratingHistory} profile={profile} />}

    {careerSection==='openings'&&<CareerOpeningsSection openings={openings} clinic={clinic} tree={tree} history={history} onOpenRecord={onOpenRecord} />}

    {careerSection==='archive'&&<InsightsCareerArchiveSection career={career} run={run} themes={themes} theme={theme} cemetery={cemetery} onStartRun={onStartRun} onContinueRun={onContinueRun} onOpenRecord={onOpenRecord} onMovie={onMovie} onThemeChange={id=>setTheme(saveBoardTheme(id))} />}
  </div>;
}