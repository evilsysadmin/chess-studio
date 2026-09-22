import { useMemo, useState } from 'react';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { createSeason, playNextRound, seasonComplete, tableFor } from '../chessFootball/engine.js';
import './ChessFootball.css';

export default function ChessFootball({ onExit }) {
  useEscapeToClose(onExit);
  const [state, setState] = useState(() => createSeason('poc-season-1'));
  const table = useMemo(() => tableFor(state), [state]);
  const latest = state.results.at(-1);
  const done = seasonComplete(state);

  return <main className="chess-football-screen">
    <button className="back-link" onClick={onExit}>← Experimentos geniales</button>
    <header className="chess-football-hero">
      <small>POC · simulación estadística</small>
      <h2>Chess Football</h2>
      <p>Fútbol normal. Piezas de ajedrez sólo para darle carácter. Sin FEN, sin Stockfish y sin que nadie intente correr en L.</p>
    </header>

    <section className="chess-football-grid" aria-label="Temporada de Chess Football">
      <article className="chess-football-card">
        <div className="chess-football-card-head">
          <div><small>Temporada {state.season}</small><h3>Clasificación</h3></div>
          <span>Jornada {Math.min(state.roundIndex + 1, state.schedule.length)}/{state.schedule.length}</span>
        </div>
        <div className="chess-football-table-wrap">
          <table className="chess-football-table">
            <thead><tr><th>#</th><th>Club</th><th>PJ</th><th>DG</th><th>PTS</th></tr></thead>
            <tbody>{table.map((row, index) => <tr key={row.id}>
              <td>{index + 1}</td>
              <td><span aria-hidden="true">{row.glyph}</span> {row.name}</td>
              <td>{row.played}</td>
              <td>{row.gf - row.ga > 0 ? '+' : ''}{row.gf - row.ga}</td>
              <td><strong>{row.points}</strong></td>
            </tr>)}</tbody>
          </table>
        </div>
      </article>

      <article className="chess-football-card chess-football-matchday">
        <small>{latest ? 'Jornada ' + latest.number : 'Vestuario'}</small>
        <h3>{latest ? 'Últimos resultados' : 'La liga está preparada'}</h3>
        {latest ? <div className="chess-football-results">{latest.matches.map((match) => {
          const home = state.clubs.find((club) => club.id === match.homeId);
          const away = state.clubs.find((club) => club.id === match.awayId);
          return <div className="chess-football-result" key={match.homeId + '-' + match.awayId}>
            <span>{home.name}</span><strong>{match.homeGoals}–{match.awayGoals}</strong><span>{away.name}</span>
          </div>;
        })}</div> : <p>Seis clubes, ida y vuelta, treinta partidos. El motor puede reproducir la temporada completa por seed.</p>}

        {!done
          ? <button className="primary-btn" onClick={() => setState((current) => playNextRound(current))}>{state.roundIndex === 0 ? 'Jugar primera jornada' : 'Siguiente jornada'}</button>
          : <><p className="chess-football-champion">🏆 {table[0].name} campeón.</p><button className="secondary-btn" onClick={() => setState(createSeason('poc-season-1'))}>Repetir seed del POC</button></>}
      </article>
    </section>

    <details className="friendly-disclosure chess-football-squad">
      <summary>Ver una plantilla de prueba</summary>
      <div className="friendly-disclosure-body">
        <h3>{state.clubs[0].glyph} {state.clubs[0].name}</h3>
        <div className="chess-football-roster">{state.clubs[0].squad.slice(0, 9).map((player) =>
          <span key={player.id}><b>{player.name}</b><small>{player.archetype} · {player.age} años · {player.rating}/{player.potential}</small></span>
        )}</div>
      </div>
    </details>
  </main>;
}
