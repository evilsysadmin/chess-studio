import { useMemo } from 'react';
import { buildRivalryDossier } from '../rivalryDossier.js';

function OpeningFact({ label, row }) {
  if (!row) return <span><b>—</b><small>{label} · faltan 3 muestras</small></span>;
  return <span><b>{row.opening}</b><small>{label} · {row.scorePct}% · {row.games} partidas</small></span>;
}

export default function RivalryDossier({ rivalry }) {
  const dossier = useMemo(() => buildRivalryDossier(rivalry), [rivalry]);
  if (!dossier.games) return null;

  return (
    <section className="menu-section rivalry-dossier" aria-label="Expediente de rivalidad contra la CPU">
      <div className="rivalry-dossier-heading">
        <div>
          <span className="section-label">UNA CPU · UN HISTORIAL</span>
          <h2>♟ Expediente de rivalidad</h2>
        </div>
        <span className={`rivalry-dossier-lead lead-${dossier.leader.owner}`}>{dossier.leader.label}</span>
      </div>
      <div className="career-mini-grid rivalry-dossier-glance">
        <span><b>{dossier.wins}V · {dossier.draws}T · {dossier.losses}D</b><small>{dossier.games} partidas competitivas</small></span>
        <span><b>{dossier.streak.label}</b><small>racha actual</small></span>
        <span><b>{dossier.recentForm || '—'}</b><small>últimas {Math.min(5, dossier.games)}</small></span>
        <span><b>{dossier.topIncident ? `${dossier.topIncident.count}×` : '—'}</b><small>{dossier.topIncident?.label || 'sin reincidencia dominante'}</small></span>
      </div>

      <details className="friendly-disclosure rivalry-dossier-more">
        <summary>Ver expediente completo</summary>
        <div className="friendly-disclosure-body">
          <div className="career-mini-grid">
            <OpeningFact label="tu mejor apertura medida" row={dossier.strongestOpening} />
            <OpeningFact label="donde la CPU más aprieta" row={dossier.toughestOpening} />
            <span><b>{dossier.bestHumanStreak || 0} / {dossier.bestCpuStreak || 0}</b><small>mejor racha tú / CPU</small></span>
            <span><b>{dossier.highestDifficultyWin ?? '—'}</b><small>nivel más alto derrotado</small></span>
          </div>
          {dossier.fastestWinMoves && <p className="hint-text">Victoria más rápida registrada: {dossier.fastestWinMoves} movimientos.</p>}
          {dossier.memories.length > 0 && (
            <div className="rivalry-memory-list">
              <strong>Últimos antecedentes</strong>
              {dossier.memories.map((memory, index) => (
                <span key={`${memory.date || 'memory'}-${index}`}>{memory.text}</span>
              ))}
            </div>
          )}
        </div>
      </details>
    </section>
  );
}
