import { useMemo, useState } from 'react';
import { loadPersonalPuzzles } from '../personalPuzzles.js';
import { currentDailyStreak } from '../dailyChallenge.js';
import { loadRivalry } from '../rivalry.js';
import { BOARD_THEMES, loadBoardTheme, loadCareer, loadSpecialRun, saveBoardTheme, unlockedBoardThemes } from '../career.js';
import { buildCemetery, buildOpeningTree, deriveChessProfile, evolutionBuckets } from '../metaProgress.js';
import { conversionStats, hallOfFameAndShame, loadAnalysisArchive, materialDonated, openingClinic, openingRivalry, recurrenceIndex, weeklyReport } from '../advancedCareer.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { buildNemesisDossier } from '../nemesis.js';
import GlossaryTerm from './GlossaryTerm.jsx';
import { buildCareerHeatmaps, deriveRpgProfile } from '../careerVisuals.js';

const TIME_LABEL = { none:'Sin reloj','1+0':'1+0 Bullet','3+2':'3+2 Blitz','5+0':'5+0','10+0':'10+0','15+10':'15+10' };
function TreeRows({ node, depth=0 }) { const rows=Object.values(node?.children||{}).sort((a,b)=>b.count-a.count).slice(0,depth===0?6:3);return <>{rows.map(r=><div className="career-tree-row" key={`${depth}-${r.move}-${r.count}`} style={{paddingLeft:`${depth*16}px`}}><span>{depth?'↳ ':''}{r.move}</span><b>{r.count}×</b><small>{Math.round((r.wins||0)/Math.max(1,r.count)*100)}% V</small>{depth<2&&<TreeRows node={r} depth={depth+1}/>}</div>)}</>; }
function pct(n){return n===null||n===undefined?'—':`${n}%`;}

const HEAT_RANKS=['8','7','6','5','4','3','2','1'];
const HEAT_FILES=['a','b','c','d','e','f','g','h'];
function HeatmapBoard({counts,max,tone='activity',label}) {
  const rgb=tone==='loss'?'178,70,70':tone==='capture'?'86,150,105':'198,164,93';
  return <div className="career-heatmap-card"><b>{label}</b><div className="career-heat-board" aria-label={label}>{HEAT_RANKS.flatMap(rank=>HEAT_FILES.map(file=>{const sq=`${file}${rank}`;const n=Number(counts?.[sq]||0);const ratio=max?Math.min(1,n/max):0;return <div key={sq} className={`career-heat-cell ${(Number(rank)+HEAT_FILES.indexOf(file))%2?'dark':'light'}`} title={`${sq}: ${n}`} style={{boxShadow:n?`inset 0 0 0 999px rgba(${rgb},${(.08+ratio*.68).toFixed(2)})`:undefined}}><span>{n||''}</span></div>}))}</div><small>Más intensidad = más veces registrado. Datos de tus partidas guardadas.</small></div>;
}


export default function CareerScreen({ history, ratingHistory, onExit, onOpenRecord, onMovie, onPlayFromHere, onOpenPuzzles, onStartRun, onContinueRun, embedded = false }) {
  useEscapeToClose(onExit, { disabled: embedded });
  const [theme,setTheme]=useState(()=>loadBoardTheme());
  const career=useMemo(()=>loadCareer(),[history,theme]); const rivalry=useMemo(()=>loadRivalry(),[history]); const personal=useMemo(()=>loadPersonalPuzzles(),[history]); const daily=useMemo(()=>currentDailyStreak(),[]);
  const cemetery=useMemo(()=>buildCemetery(history).slice(0,8),[history]); const tree=useMemo(()=>buildOpeningTree(history,8),[history]); const profile=useMemo(()=>deriveChessProfile(history),[history]); const evolution=useMemo(()=>evolutionBuckets(history,10),[history]);
  const archive=useMemo(()=>loadAnalysisArchive(),[history]); const weekly=useMemo(()=>weeklyReport(history,archive),[history,archive]); const hall=useMemo(()=>hallOfFameAndShame(history,archive),[history,archive]); const conversion=useMemo(()=>conversionStats(archive),[archive]); const pressure=useMemo(()=>{const moves=Number(career.pressure?.moves||0),incidents=Number(career.pressure?.incidents||0);return{moves,incidents,rate:moves?Math.round(incidents/moves*100):null};},[career]); const donations=useMemo(()=>materialDonated(history),[history]); const recurrence=useMemo(()=>recurrenceIndex(rivalry),[rivalry]); const openings=useMemo(()=>openingRivalry(history),[history]); const clinic=useMemo(()=>openingClinic(history),[history]);
  const run=loadSpecialRun(); const rec=career.records||{}; const season=career.season||{}; const memories=rivalry.record?.memories||[]; const themes=unlockedBoardThemes(career); const analyses=Object.values(archive); const avgAccuracy=analyses.length?Math.round(analyses.map(a=>a.accuracy).filter(Number.isFinite).reduce((s,n)=>s+n,0)/Math.max(1,analyses.filter(a=>Number.isFinite(a.accuracy)).length)):null;
  const nemesis=useMemo(()=>buildNemesisDossier(history,rivalry),[history,rivalry]);
  const topIncident=nemesis.tactic;
  const nemesisPersonalCount=useMemo(()=>nemesis.opening ? personal.filter((p)=>p.opening===nemesis.opening.opening).length : 0,[personal,nemesis.opening]);
  const heatmaps=useMemo(()=>buildCareerHeatmaps(history),[history]);
  const rpg=useMemo(()=>deriveRpgProfile(history,archive,career),[history,archive,career]);

  return <div className={embedded ? 'career-screen insights-embedded-page' : 'menu tournament-panel career-screen'}>
    {!embedded && (<>
      <button className="back-link" onClick={onExit}>← Volver al menú</button>
      <div className="menu-section career-hero"><span className="section-label">Expediente completo</span><h2>Tu carrera ajedrecística</h2><p className="hero-scope-note">Datos reales, entrenamiento y una cantidad administrativamente irresponsable de pruebas contra ti.</p></div>
    </>)}

    <div className="career-hero-grid">
      <article className="career-card"><span className="eyebrow">Temporada {season.id}</span><h3>{season.wins||0}V · {season.draws||0}T · {season.losses||0}D</h3><p>{season.games||0} partidas este mes.</p></article>
      <article className="career-card"><span className="eyebrow">Rivalidad competitiva</span><h3>{rivalry.record?.wins||0}–{rivalry.record?.losses||0}</h3><p>{rivalry.record?.draws||0} tablas · racha {rivalry.record?.currentStreak||0}.</p></article>
      <article className="career-card"><span className="eyebrow"><GlossaryTerm term="Accuracy">Accuracy</GlossaryTerm> propia</span><h3>{pct(avgAccuracy)}</h3><p>{analyses.length} autopsias archivadas.</p></article>
      <article className="career-card"><span className="eyebrow">Índice de reincidencia</span><h3>{recurrence.score}/100</h3><p>{recurrence.repeated} repeticiones de errores ya conocidos.</p></article>
    </div>

    <div className="menu-section"><h2>📅 Informe semanal</h2><div className="career-mini-grid"><span><b>{weekly.current.games}</b><small>partidas últimos 7 días</small></span><span><b>{weekly.current.winPct}%</b><small>victorias · {weekly.winDelta===null?'sin comparación':`${weekly.winDelta>=0?'+':''}${weekly.winDelta} pts vs semana anterior`}</small></span><span><b>{pct(weekly.current.accuracy)}</b><small><GlossaryTerm term="Accuracy">accuracy</GlossaryTerm> media {weekly.accuracyDelta===null?'':`· ${weekly.accuracyDelta>=0?'+':''}${weekly.accuracyDelta} vs anterior`}</small></span><span><b>{topIncident?`${topIncident.count}×`:'—'}</b><small>{topIncident?.label||'sin pecado dominante registrado'}</small></span></div><p className="hint-text">{weekly.current.games===0?'Semana sospechosamente silenciosa. El tablero no puede juzgar lo que no ve.':weekly.winDelta!==null&&weekly.winDelta>10?'Mejora clara. Molesto para el departamento de sarcasmo; excelente para ti.':weekly.winDelta!==null&&weekly.winDelta<-10?'La semana ha venido con pendientes. Conviene revisar autopsias antes de convertir la tendencia en tradición.':'Semana estable. Sigue acumulando datos antes de declarar una revolución ajedrecística.'}</p></div>

    <div className="menu-section"><h2>Entrenamiento personalizado</h2>{topIncident&&<div className="coaching-action" style={{marginBottom:'.8rem'}}><strong>Prioridad sugerida:</strong> {topIncident.label} ×{topIncident.count}. Entrena ese patrón antes de que solicite estatuto de costumbre local.</div>}<div className="career-action-grid">
      <button className="career-action" onClick={()=>onOpenPuzzles('personal',false)}><b>🧠 Tus crímenes</b><span>{personal.length} posiciones reales.</span></button><button className="career-action" onClick={()=>onOpenPuzzles('personal',true)}><b>⚡ Puzzle Rush personal</b><span>3 minutos contra tu propio expediente.</span></button><button className="career-action" onClick={()=>onOpenPuzzles('daily',false)}><b>📅 Posición del día</b><span>Racha {daily.streak||0} · mejor {daily.bestStreak||0}.</span></button><button className="career-action" onClick={()=>onOpenPuzzles('curated',true)}><b>🔥 Puzzle Rush clásico</b><span>Cuando quieras sufrir sin contexto autobiográfico.</span></button>
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
            <small>CPU media {nemesis.opening.avgDifficulty} · últimas {Math.min(5,nemesis.opening.games)}: {nemesis.opening.recentScorePct}%.</small>
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

    <div className="menu-section"><h2>⚙ Conversión y defensa</h2><div className="career-hero-grid"><article className="career-card"><span className="eyebrow">Ventajas ≥ +3</span><h3>{conversion.converted}/{conversion.winningChances}</h3><p>{conversion.conversionPct===null?'Faltan autopsias':`${conversion.conversionPct}% convertidas en victoria.`}</p></article><article className="career-card"><span className="eyebrow">Defensa desesperada ≤ −3</span><h3>{conversion.saved}/{conversion.desperatePositions}</h3><p>{conversion.defensePct===null?'Faltan autopsias':`${conversion.defensePct}% salvadas como tablas/victoria.`}</p></article><article className="career-card"><span className="eyebrow">Apuros de tiempo</span><h3>{pressure.incidents}/{pressure.moves}</h3><p>{pressure.rate===null?'Sin datos bajo 40 s':`${pressure.rate}% de movimientos bajo presión acabaron en incidente grave.`}</p></article><article className="career-card"><span className="eyebrow">Material donado</span><h3>{donations.points} pts</h3><p>{donations.pieces} piezas capturadas por la CPU · {donations.queens} damas. Filantropía táctica.</p></article></div></div>

    <div className="menu-section"><div className="career-rpg-heading"><div><span className="section-label">Perfil RPG basado en datos</span><h2>🧬 {rpg.title}</h2></div><small>{rpg.games} partidas registradas · los índices son métricas derivadas, no ELO ni diagnóstico.</small></div><div className="career-rpg-grid">{rpg.attributes.map(a=><article className={`career-rpg-stat ${a.id===rpg.leaderId?'leader':''}`} key={a.id} title={a.explanation}><span>{a.label}</span><b>{a.value===null?'—':`${a.value}%`}</b><div><i style={{width:`${a.value||0}%`}}/></div><small>{a.sample?`${a.sample} muestras · ${a.explanation}`:'Sin muestras suficientes.'}</small></article>)}</div></div>

    <div className="menu-section"><h2>🗺 Heatmaps de tu tablero</h2><p className="hint-text">Actividad, capturas y bajas calculadas únicamente desde las casillas de destino registradas. No evalúan si la jugada fue buena: enseñan dónde ocurre tu ajedrez.</p><div className="career-heatmap-grid"><HeatmapBoard counts={heatmaps.activity} max={heatmaps.maxima.activity} label={`Actividad · ${heatmaps.totals.humanMoves} movimientos`} /><HeatmapBoard counts={heatmaps.captures} max={heatmaps.maxima.captures} tone="capture" label={`Tus capturas · ${heatmaps.totals.humanCaptures}`} /><HeatmapBoard counts={heatmaps.losses} max={heatmaps.maxima.losses} tone="loss" label={`Tus bajas · ${heatmaps.totals.humanLosses}`} /></div></div>

    <div className="menu-section"><h2>🏅 Hall of Fame</h2><div className="museum-grid"><div className="museum-card"><span>👑</span><strong>{hall.hardestWin?`CPU ${hall.hardestWin.difficulty}`:'—'}</strong><small>victoria de mayor dificultad</small></div><div className="museum-card"><span>⚡</span><strong>{hall.fastestWin?`${Math.ceil((hall.fastestWin.moves?.length||0)/2)} mov.`:'—'}</strong><small>victoria más rápida</small></div><div className="museum-card"><span>💎</span><strong>{hall.bestAccuracy?`${hall.bestAccuracy.accuracy}%`:'—'}</strong><small>mejor accuracy archivada</small></div><div className="museum-card"><span>🛡</span><strong>{hall.desperateSave?`${(hall.desperateSave.troughPerspectiveEval/100).toFixed(1)}`:'—'}</strong><small>peor posición que lograste salvar</small></div></div></div>
    <div className="menu-section"><h2>☠ Hall of Shame</h2><div className="museum-grid"><div className="museum-card"><span>💥</span><strong>{hall.worst?<>{`−${hall.worst.worst.loss} `}<GlossaryTerm term="cp">cp</GlossaryTerm></>:'—'}</strong><small>peor <GlossaryTerm term="Blunder">blunder</GlossaryTerm> analizado</small></div><div className="museum-card"><span>📉</span><strong>{hall.missedConversion?`+${(hall.missedConversion.peakPerspectiveEval/100).toFixed(1)}`:'—'}</strong><small>mayor ventaja no convertida</small></div><div className="museum-card"><span>🏚</span><strong>{donations.queens}</strong><small>damas entregadas a la contabilidad rival</small></div><div className="museum-card"><span>🧾</span><strong>{recurrence.repeated}</strong><small>errores reincidentes</small></div></div></div>

    <div className="menu-section"><h2>Modos de presión y campeonatos</h2><div className="career-action-grid"><button className="career-action danger" onClick={()=>onStartRun('streak')}><b>🔥 Modo racha</b><span>Ganas: +7 dificultad. Pierdes: se acabó.</span></button><button className="career-action danger" onClick={()=>onStartRun('boss')}><b>👑 Boss Run</b><span>Seis fases: 35 → 95.</span></button><button className="career-action" onClick={()=>onStartRun('cup')}><b>🏆 Copa personal de 8</b><span>8 partidas a CPU 55. 1 punto victoria, ½ tablas. 4½ para levantar la copa.</span></button>{run?.active&&<button className="career-action active" onClick={()=>onContinueRun(run)}><b>▶ Continuar {run.mode==='boss'?'Boss Run':run.mode==='cup'?'Copa':'racha'}</b><span>CPU {run.difficulty} · {run.mode==='cup'?`${run.completedStages||0}/8 · ${run.points||0} pts`:`${run.wins||0} victorias`}.</span></button>}</div></div>

    {Object.keys(career.byTimeControl||{}).length>0&&<div className="menu-section"><h2>Rivalidad por ritmo</h2><div className="career-rhythm-grid">{Object.entries(career.byTimeControl).map(([id,row])=><div className="career-rhythm" key={id}><b>{TIME_LABEL[id]||id}</b><span>{row.wins}V · {row.draws}T · {row.losses}D</span><small>{row.games} partidas</small></div>)}</div></div>}

    {openings.length>0&&<div className="menu-section"><h2>⚔ Rivalidad por aperturas</h2><div className="career-rhythm-grid">{openings.slice(0,8).map(row=><div className="career-rhythm" key={row.opening}><b>{row.opening}</b><span>{row.wins}V · {row.draws}T · {row.losses}D · {row.scorePct}%</span><small>{row.games} partidas · CPU media {row.avgDifficulty}</small></div>)}</div>{clinic.length>0&&<><h3>🩺 Clínica de aperturas</h3><p className="hint-text">Aperturas con al menos 3 muestras y rendimiento inferior al 50%. Aquí sí hay prueba, no horóscopo.</p><div className="career-training-list">{clinic.map(row=><div key={row.opening}><b>{row.opening} · {row.scorePct}%</b><p>Revisa tus primeras 10–12 jugadas de estas {row.games} partidas y compara el primer punto donde sales de tus líneas habituales. La CPU media era {row.avgDifficulty}.</p></div>)}</div></>}</div>}

    {evolution.length>0&&<div className="menu-section"><h2>Evolución</h2><div className="career-evolution">{evolution.map(b=><div className="career-evolution-row" key={b.label}><span>{b.label}</span><div><i style={{width:`${b.winPct}%`}}/></div><b>{b.winPct}%</b><small>CPU {b.avgDifficulty}</small></div>)}</div>{ratingHistory?.length>1&&<p className="hint-text">Rating: {ratingHistory[0]?.rating??ratingHistory[0]} → {ratingHistory.at(-1)?.rating??ratingHistory.at(-1)}.</p>}</div>}
    {profile.length>0&&<div className="menu-section"><h2>Perfil ajedrecístico automático</h2><ul className="roast-list">{profile.map((x,i)=><li key={i}>{x}</li>)}</ul></div>}
    {tree.count>0&&<div className="menu-section"><h2>Mapa de aperturas</h2><div className="career-tree"><TreeRows node={tree}/></div></div>}

    <div className="menu-section"><h2>🎨 Tableros desbloqueables</h2><p className="hint-text">Cosmética pura. El <GlossaryTerm term="ELO">ELO</GlossaryTerm> no mejora por pintar las casillas, aunque algunas derrotas quedan más elegantes.</p><div className="board-theme-list">{BOARD_THEMES.map(t=>{const unlocked=themes.some(x=>x.id===t.id);return <button key={t.id} disabled={!unlocked} className={`secondary-btn ${theme===t.id?'active':''}`} onClick={()=>{const next=saveBoardTheme(t.id);setTheme(next);}}>{unlocked?t.label:`🔒 ${t.label}`}</button>})}</div></div>

    <div className="menu-section"><h2>⚰ Cementerio de partidas</h2><p className="hint-text">Archivo selectivo de derrotas especialmente memorables. Aquí se revisan y se autopsian; para entrenar una posición concreta, usa «Jugar desde aquí» dentro del Replay.</p>{cemetery.length===0?<p className="hint-text">Vacío. Sospechosamente saludable.</p>:<div className="career-cemetery">{cemetery.map(r=><article key={r.id}><div><b>{new Date(r.date).toLocaleDateString()} · CPU {r.difficulty}</b><span>{r.opening||'Apertura sin identificar'} · {Math.ceil((r.moves?.length||0)/2)} mov.</span></div><div><button className="secondary-btn" onClick={()=>onOpenRecord(r)}>Revisar</button><button className="secondary-btn" onClick={()=>onMovie(r)}>Película</button></div></article>)}</div>}</div>

    {career.milestones?.length>0&&<div className="menu-section"><h2>🏛 Museo del horror y la gloria</h2><div className="career-timeline">{career.milestones.slice(0,18).map(m=><div key={m.id}><b>{m.type==='contract-loss'?'☠':m.type==='contract-win'?'✓':'◆'}</b><span>{m.text}</span><small>{new Date(m.date).toLocaleDateString()}</small></div>)}</div></div>}
    {memories.length>0&&<div className="menu-section"><h2>📜 Crónica de la rivalidad</h2><p className="hint-text">Hitos y antecedentes reales que la CPU puede utilizar más tarde contra ti.</p><div className="career-timeline">{memories.slice(0,18).map((m,i)=><div key={`${m.date}-${i}`}><b>♟</b><span>{m.text}</span><small>{new Date(m.date).toLocaleDateString()}</small></div>)}</div></div>}
  </div>;
}
