import CareerOpeningAtlas from './CareerOpeningAtlas.jsx';
// The CareerScreen orchestrator supplies the opening statistics.
// This view does not recalculate or persist chess history.
function TreeRows({ node, depth=0 }) { const rows=Object.values(node?.children||{}).sort((a,b)=>b.count-a.count).slice(0,depth===0?5:2);return <ul className={`career-tree-level depth-${depth}`}>{rows.map(r=><li key={`${depth}-${r.move}-${r.count}`}><div className="career-tree-row"><span>{r.move}</span><b>{r.count}×</b><small>{Math.round((r.wins||0)/Math.max(1,r.count)*100)}% victorias</small></div>{depth<2&&<TreeRows node={r} depth={depth+1}/>}</li>)}</ul>; }

export default function CareerOpeningsSection({ openings = [], clinic = [], tree = { count: 0 }, history = [], onOpenRecord }) {
  return (
    <>

    {openings.length>0&&<div className="menu-section"><h2>⚔ Rivalidad por aperturas</h2><div className="career-rhythm-grid">{openings.slice(0,8).map(row=><div className="career-rhythm" key={row.opening}><b>{row.opening}</b><span>{row.wins}V · {row.draws}T · {row.losses}D · {row.scorePct}%</span><small>{row.games} partidas · CPU · nivel medio {row.avgDifficulty}</small></div>)}</div>{clinic.length>0&&<><h3>🩺 Clínica de aperturas</h3><p className="hint-text">Aperturas con al menos 3 muestras y rendimiento inferior al 50%. Aquí sí hay prueba, no horóscopo.</p><div className="career-training-list">{clinic.map(row=><div key={row.opening}><b>{row.opening} · {row.scorePct}%</b><p>Revisa tus primeras 10–12 jugadas de estas {row.games} partidas y compara el primer punto donde sales de tus líneas habituales. El nivel medio de CPU era {row.avgDifficulty}.</p></div>)}</div></>}</div>}
    {tree.count>0&&<div className="menu-section career-opening-map career-opening-atlas"><div className="career-section-heading"><div><span className="section-label">PRIMERAS DECISIONES</span><h2>Atlas de aperturas</h2></div><small>Rutas de tus partidas, no consejos de motor</small></div><CareerOpeningAtlas tree={tree} history={history} onOpenRecord={onOpenRecord} /><details className="friendly-disclosure career-opening-atlas-tree"><summary>Ver árbol de aperturas completo</summary><div className="career-tree"><TreeRows node={tree}/></div></details></div>}
    
    </>
  );
}
