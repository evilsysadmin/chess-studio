
const OUTCOME = { win: 'Victoria', loss: 'Derrota', draw: 'Tablas' };

function numberedMoves(moves) {
  const rows = [];
  for (let i = 0; i < moves.length; i += 2) {
    rows.push({ n: i / 2 + 1, white: moves[i], black: moves[i + 1] || '' });
  }
  return rows;
}

export default function SharedResultScreen({ record, onOpenApp }) {
  return (
    <div className="app-shell shared-result-page">
      <div className="masthead shared-masthead"><h1>Chess Studio</h1></div>
      <main className="menu shared-result-shell">
        <span className="eyebrow">{record.incident ? 'Cámara del crimen compartida' : 'Partida compartida'}</span>
        <h2>{record.incident ? 'Prueba forense' : (OUTCOME[record.outcome] || record.outcome)}</h2>
        <div className={`share-result-card ${record.outcome}`}>
          <div className="share-result-mark">♟</div>
          <div><strong>{OUTCOME[record.outcome]}</strong><span>contra CPU · nivel {record.difficulty}</span></div>
          <div className="share-result-stats">
            <span>{record.moves.length} jugadas</span>
            <span>{record.humanColor === 'w' ? 'Blancas' : 'Negras'}</span>
            {record.timeControl?.label && <span>{record.timeControl.label}</span>}
          </div>
          {record.incident && <p>Jugada {record.incident.moveNumber}: <b>{record.incident.played}</b> en vez de <b>{record.incident.suggested}</b> · pérdida estimada de {record.incident.loss} puntos</p>}
          {!record.incident && record.opening && <p>{record.opening}</p>}
          {record.series && <p>Serie: Tú {record.series.humanWins} · CPU {record.series.cpuWins}{record.series.draws ? ` · tablas ${record.series.draws}` : ''}</p>}
        </div>

        <div className="shared-moves">
          <h3>Acta del incidente</h3>
          {numberedMoves(record.moves).map((row) => (
            <div className="shared-move-row" key={row.n}>
              <b>{row.n}.</b><span>{row.white}</span><span>{row.black}</span>
            </div>
          ))}
        </div>
        <button className="primary-btn" onClick={onOpenApp}>Abrir Chess Studio</button>
      </main>
    </div>
  );
}
