import { BOARD_THEMES } from '../career.js';
import GlossaryTerm from './GlossaryTerm.jsx';

const TIME_LABEL = { none:'Sin reloj','1+0':'1+0 Bullet','3+2':'3+2 Blitz','5+0':'5+0','10+0':'10+0','15+10':'15+10' };

// Archive is strictly presentational: CareerScreen remains the owner of
// histories, running sessions, unlocked themes and saved preferences.
export default function InsightsCareerArchiveSection({
  career, run, themes, theme, cemetery,
  onStartRun, onContinueRun, onOpenRecord, onMovie, onThemeChange,
}) {
  return (
    <>
      <div className="menu-section"><h2>Modos de presión y campeonatos</h2><div className="career-action-grid"><button className="career-action danger" onClick={()=>onStartRun('streak')}><b>🔥 Supervivencia</b><span>Ganas: +7 dificultad. Tablas o derrota: se acabó.</span></button><button className="career-action danger" onClick={()=>onStartRun('boss')}><b>👑 Boss Run</b><span>Seis fases: 35 → 95.</span></button><button className="career-action" onClick={()=>onStartRun('cup')}><b>🏆 Copa personal de 8</b><span>8 partidas contra CPU · nivel 55. 1 punto victoria, ½ tablas. 4½ para levantar la copa.</span></button>{run?.active&&<button className="career-action active" onClick={()=>onContinueRun(run)}><b>▶ Continuar {run.mode==='boss'?'Boss Run':run.mode==='cup'?'Copa':'Supervivencia'}</b><span>CPU · nivel {run.difficulty} · {run.mode==='cup'?`${run.completedStages||0}/8 · ${run.points||0} pts`:`${run.wins||0} victorias`}.</span></button>}</div></div>

    {Object.keys(career.byTimeControl||{}).length>0&&<div className="menu-section"><h2>Rivalidad por ritmo</h2><div className="career-rhythm-grid">{Object.entries(career.byTimeControl).map(([id,row])=><div className="career-rhythm" key={id}><b>{TIME_LABEL[id]||id}</b><span>{row.wins}V · {row.draws}T · {row.losses}D</span><small>{row.games} partidas</small></div>)}</div></div>}

<div className="menu-section"><h2>🎨 Tableros desbloqueables</h2><p className="hint-text">Cosmética pura. El <GlossaryTerm term="ELO">ELO</GlossaryTerm> no mejora por pintar las casillas, aunque algunas derrotas quedan más elegantes.</p><div className="board-theme-list">{BOARD_THEMES.map(t=>{const unlocked=themes.some(x=>x.id===t.id);return <button key={t.id} disabled={!unlocked} className={`secondary-btn ${theme===t.id?'active':''}`} onClick={()=>onThemeChange(t.id)}>{unlocked?t.label:`🔒 ${t.label}`}</button>})}</div></div>

    <div className="menu-section"><h2>⚰ Cementerio de partidas</h2><p className="hint-text">Archivo selectivo de derrotas especialmente memorables. Aquí se revisan y se autopsian; para entrenar una posición concreta, usa «Jugar desde aquí» dentro del Replay.</p>{cemetery.length===0?<p className="hint-text">Vacío. Sospechosamente saludable.</p>:<div className="career-cemetery">{cemetery.map(r=><article key={r.id}><div><b>{new Date(r.date).toLocaleDateString('es-ES')} · CPU · nivel {r.difficulty}</b><span>{r.opening||'Apertura sin identificar'} · {Math.ceil((r.moves?.length||0)/2)} mov.</span></div><div><button className="secondary-btn" onClick={()=>onOpenRecord(r)}>Revisar</button><button className="secondary-btn" onClick={()=>onMovie(r)}>Película</button></div></article>)}</div>}</div>

    {career.milestones?.length>0&&<div className="menu-section"><h2>🏛 Museo del horror y la gloria</h2><div className="career-timeline">{career.milestones.slice(0,18).map(m=><div key={m.id}><b>{m.type==='contract-loss'?'☠':m.type==='contract-win'?'✓':'◆'}</b><span>{m.text}</span><small>{new Date(m.date).toLocaleDateString('es-ES')}</small></div>)}</div></div>}
    </>
  );
}
