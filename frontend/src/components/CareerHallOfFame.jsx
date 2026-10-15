// Measured career accolades are supplied by the career domain; this view owns no new state.
export default function CareerHallOfFame({ hall }) {
  return (
    <div className="menu-section"><h2>🏅 Hall of Fame</h2><div className="museum-grid"><div className="museum-card"><span>👑</span><strong>{hall.hardestWin?`CPU · nivel ${hall.hardestWin.difficulty}`:'—'}</strong><small>victoria de mayor dificultad</small></div><div className="museum-card"><span>⚡</span><strong>{hall.fastestWin?`${Math.ceil((hall.fastestWin.moves?.length||0)/2)} mov.`:'—'}</strong><small>victoria más rápida</small></div><div className="museum-card"><span>💎</span><strong>{hall.bestAccuracy?`${hall.bestAccuracy.accuracy}%`:'—'}</strong><small>mejor precisión archivada</small></div><div className="museum-card"><span>🛡</span><strong>{hall.desperateSave?`${(hall.desperateSave.troughPerspectiveEval/100).toFixed(1)}`:'—'}</strong><small>peor posición que lograste salvar</small></div></div></div>
  );
}
