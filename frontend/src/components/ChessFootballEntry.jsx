import { lazy, Suspense, useState } from 'react';
import { requestWarRoomLandscapeFullscreen } from './useWarRoomImmersive.js';
import { FOOTBALL_MANAGER_CLUBS, getFootballManagerClub } from '../footballManagerClubs.js';
import { advanceFootballSeason, createFootballSeason, footballStandings, FOOTBALL_MANAGER_TACTICS } from '../footballManagerSeason.js';
import { getFootballClubRoster, getDefaultFootballLineup, FOOTBALL_FIVE_POSITIONS, getFootballFatigue } from '../footballManagerRoster.js';
import './ChessFootballEntry.css';

const ChessFootballGodotHost = lazy(() => import('./ChessFootballGodotHost.jsx'));

export default function ChessFootballEntry({ onExit }) {
  const [view, setView] = useState('welcome');
  const [selectedClubId, setSelectedClubId] = useState(null);
  const [season, setSeason] = useState(null);
  const [tactic, setTactic] = useState('balanced');
  const [lineupIds, setLineupIds] = useState(null);
  const selectedClub = getFootballManagerClub(selectedClubId);
  const roster = selectedClub ? getFootballClubRoster(selectedClub) : [];
  const defaultLineup = selectedClub ? getDefaultFootballLineup(roster) : [];
  const startingFive = lineupIds || defaultLineup;
  const standings = season ? footballStandings(season) : [];

  const openSeasonPreview = () => {
    setTactic('balanced');
    setLineupIds(defaultLineup);
    setSeason(createFootballSeason({ seed: 2026 }));
    setView('season');
  };

  const startQuickMatch = () => {
    // Fullscreen/orientation require a real user gesture. Opening Football's
    // welcome screen should never rotate or lock the phone.
    const coarsePointer = typeof window.matchMedia === 'function'
      && window.matchMedia('(pointer: coarse)').matches;
    if (coarsePointer) {
      document.documentElement.dataset.chessFootballImmersive = 'requested';
      void requestWarRoomLandscapeFullscreen();
    }
    setView('match');
  };

  if (view === 'match') {
    return (
      <Suspense fallback={<div className="chess-football-entry__loading" role="status">Preparando el campo…</div>}>
        <ChessFootballGodotHost onExit={() => setView('welcome')} />
      </Suspense>
    );
  }

  return (
    <main className="chess-football-entry" data-football-view={view}>
      <div className="chess-football-entry__content">
        <button type="button" className="chess-football-entry__back" onClick={view === 'welcome' ? onExit : () => setView(view === 'season' ? 'club' : view === 'club' ? 'manager' : 'welcome')}>
          ← {view === 'welcome' ? 'Experimentos geniales' : view === 'season' ? 'Volver a la ficha' : view === 'club' ? 'Volver a los clubes' : 'Volver a Football'}
        </button>
        <header className="chess-football-entry__masthead">
          <span className="chess-football-entry__eyebrow">El vestuario · Temporada cero</span>
          <h1>Chess <em>Football</em></h1>
          <p>Elige tu forma de vivir el fútbol. Un partido ahora, o la carrera de un club entero.</p>
        </header>

        {view === 'welcome' ? (
          <div className="chess-football-entry__choices" aria-label="Elige un modo de Chess Football">
            <button type="button" className="chess-football-entry__choice chess-football-entry__choice--quick" onClick={startQuickMatch}>
              <span className="chess-football-entry__choice-icon" aria-hidden="true">⚽</span>
              <small>Salta al campo</small>
              <strong>Partida rápida</strong>
              <span>El fútbol 5 contra 5 de siempre. Sin calendarios ni despachos: a jugar.</span>
              <b>Jugar ahora →</b>
            </button>
            <button type="button" className="chess-football-entry__choice chess-football-entry__choice--manager" onClick={() => setView('manager')}>
              <span className="chess-football-entry__choice-icon" aria-hidden="true">♚</span>
              <small>Dirige el club</small>
              <strong>Modo mánager</strong>
              <span>Construye tu equipo, prepara la temporada y decide el futuro del club.</span>
              <b>Entrar al despacho →</b>
            </button>
          </div>
        ) : view === 'manager' ? (
          <section className="chess-football-entry__manager chess-football-entry__manager--selection" aria-labelledby="football-manager-title">
            <span className="chess-football-entry__eyebrow">Modo mánager · Pretemporada</span>
            <h2 id="football-manager-title">El despacho del míster</h2>
            <p>Elige tu club. Seis proyectos ficticios, seis maneras de complicarte la vida. Por ahora es una selección de prueba: todavía no se crea ni guarda ninguna carrera.</p>
            <div className="chess-football-entry__clubs" aria-label="Clubes disponibles">
              {FOOTBALL_MANAGER_CLUBS.map((club) => (
                <button
                  type="button"
                  className="chess-football-entry__club"
                  key={club.id}
                  onClick={() => { setSelectedClubId(club.id); setSeason(null); setLineupIds(null); setTactic('balanced'); setView('club'); }}
                  aria-label={`Elegir ${club.name}`}
                >
                  <span className="chess-football-entry__crest" aria-hidden="true">{club.initials}</span>
                  <strong>{club.name}</strong>
                  <span>{club.style}</span>
                  <small>{'★'.repeat(club.level)}{'☆'.repeat(5 - club.level)}</small>
                </button>
              ))}
            </div>
            <button type="button" className="chess-football-entry__manager-return" onClick={() => setView('welcome')}>Volver a elegir modo</button>
          </section>
        ) : view === 'club' ? (
          <section className="chess-football-entry__manager" aria-labelledby="football-club-review-title">
            <span className="chess-football-entry__eyebrow">Modo mánager · Club elegido</span>
            <h2 id="football-club-review-title">{selectedClub?.name || 'Selecciona un club'}</h2>
            {selectedClub ? (
              <div className="chess-football-entry__club-summary">
                <p><strong>Estilo:</strong> {selectedClub.style}</p>
                <p><strong>Objetivo propuesto:</strong> {selectedClub.objective}</p>
                <p>Selección temporal: prueba una liga estadística de seis clubes y diez jornadas, con nueve futbolistas y un quinteto configurable. Aún sin economía ni guardado de carrera. No se ha guardado ningún progreso.</p>
              </div>
            ) : null}
            <button type="button" className="chess-football-entry__manager-return" onClick={openSeasonPreview}>Empezar temporada de prueba</button>
            <button type="button" className="chess-football-entry__manager-return is-secondary" onClick={() => setView('manager')}>Cambiar de club</button>
          </section>
        ) : (
          <section className="chess-football-entry__manager chess-football-entry__manager--season" aria-labelledby="football-season-title">
            <span className="chess-football-entry__eyebrow">Temporada de prueba · Sin guardado</span>
            <h2 id="football-season-title">{selectedClub?.name || 'Mi club'}</h2>
            <p>Jornada {season?.currentRound || 0} de {season?.rounds.length || 10}. Los resultados pertenecen a esta simulación estadística, no a un partido jugado en Godot.</p>
            <table className="chess-football-entry__standings" aria-label="Clasificación de liga">
              <thead><tr><th scope="col">#</th><th scope="col">Club</th><th scope="col">PJ</th><th scope="col">Pts</th></tr></thead>
              <tbody>
                {standings.map((club, index) => (
                  <tr key={club.id} className={club.id === selectedClubId ? 'is-my-club' : ''}>
                    <td>{index + 1}</td><th scope="row">{club.name}</th><td>{club.played}</td><td>{club.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {season && season.currentRound < season.rounds.length ? (
              <section className="chess-football-entry__lineup" aria-label="Alineación del míster">
                <details>
                  <summary>Preparar quinteto titular</summary>
                  <p>Fútbol 5: portero, defensa, dos medios y delantero. Cada jornada suma 17 puntos de cansancio a los titulares y recupera 22 a los suplentes. La fatiga reduce su rendimiento hasta que roten.</p>
                  <div className="chess-football-entry__lineup-slots">
                    {startingFive.map((playerId, index) => {
                      const player = roster.find((entry) => entry.id === playerId);
                      if (!player) return null;
                      return (
                        <label key={index}>
                          <span className="chess-football-entry__slot-label">
                            {FOOTBALL_FIVE_POSITIONS[player.role]} {player.role === 'MED' ? (index === 2 ? '1' : '2') : ''}
                            <b className="chess-football-entry__slot-fatigue">Fatiga {getFootballFatigue(season.managerFatigue, player.id)}%</b>
                          </span>
                          <select
                            aria-label={`Titular ${index + 1} · ${player.role}`}
                            value={playerId}
                            onChange={(event) => {
                              const nextId = event.target.value;
                              setLineupIds((previous) => {
                                const next = [...(previous || defaultLineup)];
                                next[index] = nextId;
                                return next;
                              });
                            }}
                          >
                            {roster.filter((candidate) => candidate.role === player.role).map((candidate) => (
                              <option key={candidate.id} value={candidate.id} disabled={startingFive.includes(candidate.id) && candidate.id !== playerId}>
                                {candidate.name} · ATQ {candidate.attack} / DEF {candidate.defense} · F{getFootballFatigue(season.managerFatigue, candidate.id)}%
                              </option>
                            ))}
                          </select>
                        </label>
                      );
                    })}
                  </div>
                </details>
              </section>
            ) : null}
            {season && season.currentRound < season.rounds.length ? (
              <section className="chess-football-entry__plan" aria-label="Plan del míster para la próxima jornada">
                <h3>Tu planteamiento</h3>
                <p>Elige cómo afrontará tu club el próximo encuentro. Sólo afecta a tu partido; los demás siguen su simulación normal.</p>
                <div className="chess-football-entry__plan-options" role="group" aria-label="Táctica del siguiente partido">
                  {FOOTBALL_MANAGER_TACTICS.map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      aria-pressed={tactic === plan.id}
                      className="chess-football-entry__plan-option"
                      onClick={() => setTactic(plan.id)}
                    >{plan.label}</button>
                  ))}
                </div>
                <p className="chess-football-entry__plan-effect" role="status">
                  {FOOTBALL_MANAGER_TACTICS.find((plan) => plan.id === tactic)?.description}
                </p>
              </section>
            ) : null}
            {season && season.currentRound < season.rounds.length ? (
              <div className="chess-football-entry__fixture-list" aria-label="Próxima jornada">
                <h3>Próxima jornada</h3>
                {season.rounds[season.currentRound].map((fixture) => (
                  <p key={fixture.id}>{season.clubs.find((club) => club.id === fixture.homeId)?.name} – {season.clubs.find((club) => club.id === fixture.awayId)?.name}</p>
                ))}
              </div>
            ) : <p>Temporada completada. La clasificación final ya está calculada.</p>}
            {season?.results.length ? (
              <div className="chess-football-entry__fixture-list" aria-label="Resultados de la última jornada">
                <h3>Últimos resultados</h3>
                {season.results.slice(-3).map((result) => (
                  <p key={result.fixtureId}>
                    {season.clubs.find((club) => club.id === result.homeId)?.name} {result.homeGoals}–{result.awayGoals} {season.clubs.find((club) => club.id === result.awayId)?.name}
                    {result.managerLineup?.some((id, slot) => id !== defaultLineup[slot]) ? (
                      <span className="chess-football-entry__used-plan"> · Quinteto alternativo</span>
                    ) : null}
                    {result.managerFatigueAtKickoff > 0 ? (
                      <span className="chess-football-entry__used-plan"> · Fatiga inicial media: {Math.round(result.managerFatigueAtKickoff)}%</span>
                    ) : null}
                    {result.managerTactic ? (
                      <span className="chess-football-entry__used-plan">
                        {' · Plan: '}{FOOTBALL_MANAGER_TACTICS.find((plan) => plan.id === result.managerTactic)?.label}
                      </span>
                    ) : null}
                  </p>
                ))}
              </div>
            ) : null}
            <button
              type="button"
              className="chess-football-entry__manager-return"
              disabled={!season || season.currentRound >= season.rounds.length}
              onClick={() => setSeason((previous) => advanceFootballSeason(previous, { managerClubId: selectedClubId, tactic, lineup: startingFive }))}
            >
              {season?.currentRound >= season?.rounds.length ? 'Liga completada' : 'Simular siguiente jornada'}
            </button>
          </section>
        )}
      </div>
    </main>
  );
}
