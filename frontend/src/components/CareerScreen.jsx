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
import { buildCareerHeatmaps, deriveRpgProfile, summarizeRpgProfile } from '../careerVisuals.js';
import CareerPerformanceSection from './CareerPerformanceSection.jsx';
import CareerOpeningsSection from './CareerOpeningsSection.jsx';
import InsightsCareerSummarySection from './InsightsCareerSummarySection.jsx';
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

    {careerSection==='summary'&&<InsightsCareerSummarySection personalSeasons={personalSeasons} history={history} onOpenRecord={onOpenRecord} hall={hall} onMovie={onMovie} rivalry={rivalry} rec={rec} survivalRun={survivalRun} conflictingRun={conflictingRun} run={run} onContinueRun={onContinueRun} onStartRun={onStartRun} weekly={weekly} topIncident={topIncident} personal={personal} daily={daily} onOpenPuzzles={onOpenPuzzles} nemesis={nemesis} nemesisPersonalCount={nemesisPersonalCount} onPlayFromHere={onPlayFromHere} />}

    {careerSection==='performance'&&<CareerPerformanceSection conversion={conversion} pressure={pressure} donations={donations} rpgSummary={rpgSummary} rpg={rpg} heatmaps={heatmaps} hall={hall} recurrence={recurrence} evolution={evolution} ratingHistory={ratingHistory} profile={profile} />}

    {careerSection==='openings'&&<CareerOpeningsSection openings={openings} clinic={clinic} tree={tree} history={history} onOpenRecord={onOpenRecord} />}

    {careerSection==='archive'&&<InsightsCareerArchiveSection career={career} run={run} themes={themes} theme={theme} cemetery={cemetery} onStartRun={onStartRun} onContinueRun={onContinueRun} onOpenRecord={onOpenRecord} onMovie={onMovie} onThemeChange={id=>setTheme(saveBoardTheme(id))} />}
  </div>;
}