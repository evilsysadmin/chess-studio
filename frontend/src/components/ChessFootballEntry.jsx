import { lazy, Suspense, useLayoutEffect, useRef, useState } from 'react';
import { requestWarRoomLandscapeFullscreen } from './useWarRoomImmersive.js';
import { FOOTBALL_MANAGER_CLUBS, getFootballManagerClub } from '../footballManagerClubs.js';
import { footballStandings, FOOTBALL_MANAGER_TACTICS } from '../footballManagerSeason.js';
import { footballClubObjectiveReport } from '../footballManagerObjectives.js';
import { FOOTBALL_TRAINING_PLANS } from '../footballManagerTraining.js';
import { getDevelopedFootballRoster, FOOTBALL_MAX_GROWTH_PER_ATTRIBUTE } from '../footballManagerDevelopment.js';
import { createFootballCareer, editFootballCareer, playFootballCareerRound, startNextFootballSeason, FOOTBALL_CAREER_MAX_SEASONS, readFootballCareer, replayFootballCareer, writeFootballCareer } from '../footballManagerCareer.js';
import { getFootballClubRoster, getDefaultFootballLineup, FOOTBALL_FIVE_POSITIONS, getFootballFatigue } from '../footballManagerRoster.js';
import './ChessFootballEntry.css';

const ChessFootballGodotHost = lazy(() => import('./ChessFootballGodotHost.jsx'));

function FootballSquadDevelopment({ players }) {
  return (
  <details className="chess-football-entry__development" aria-label="Evolución de la plantilla">
    <summary>Desarrollo de la plantilla · {players.filter((player) => player.attackGrowth || player.defenseGrowth).length} mejorados</summary>
    <p>Tras cuatro titularidades: +1 en ataque y defensa. Dos sesiones de remates o repliegue: +1 adicional en su atributo. Máximo +{FOOTBALL_MAX_GROWTH_PER_ATTRIBUTE} por atributo. No se inventan estadísticas individuales.</p>
    <ul>
      {players.map((player) => (
        <li key={player.id}>
          <span><strong>{player.name}</strong> <small>{player.role} · {player.starts} titularidades</small></span>
          <span>ATQ {player.attack}{player.attackGrowth ? ` (+${player.attackGrowth})` : ''} · DEF {player.defense}{player.defenseGrowth ? ` (+${player.defenseGrowth})` : ''}</span>
        </li>
      ))}
    </ul>
  </details>
  );
}

export default function ChessFootballEntry({ onExit }) {
  const [view, setView] = useState('welcome');
  const scrollSurface = useRef(null);
  const [selectedClubId, setSelectedClubId] = useState(null);
  const [season, setSeason] = useState(null);
  const [tactic, setTactic] = useState('balanced');
  const [lineupIds, setLineupIds] = useState(null);
  const [journal, setJournal] = useState(null);
  const [careerHistory, setCareerHistory] = useState([]);
  const [savedCareer, setSavedCareer] = useState(() => readFootballCareer());
  const [replacePending, setReplacePending] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const selectedClub = getFootballManagerClub(selectedClubId);
  const roster = selectedClub ? getFootballClubRoster(selectedClub) : [];
  const developedRoster = getDevelopedFootballRoster(roster, season?.managerDevelopment);
  const defaultLineup = selectedClub ? getDefaultFootballLineup(roster) : [];
  const startingFive = lineupIds || defaultLineup;
  const standings = season ? footballStandings(season) : [];
  const objective = season && selectedClubId ? footballClubObjectiveReport(season, selectedClubId) : null;
  const seasonNumber = (journal?.completedSeasons?.length || 0) + 1;

  // Each new room starts at its entrance. Reusing this mounted full-screen
  // scroller otherwise carries a deep standings offset back into Welcome.
  useLayoutEffect(() => {
    if (view !== 'match' && scrollSurface.current) scrollSurface.current.scrollTop = 0;
  }, [view]);

  const showCareer = ({ journal: nextJournal, season: nextSeason, history = [] }) => {
    setCareerHistory(history);
    setSelectedClubId(nextJournal.clubId);
    setJournal(nextJournal);
    setSeason(nextSeason);
    setTactic(nextJournal.nextTactic);
    setLineupIds(nextJournal.nextLineup);
    setView('season');
  };

  const persistCareer = (next) => {
    const outcome = writeFootballCareer(next.journal);
    if (outcome.status === 'saved' || outcome.status === 'memory') {
      setSavedCareer({ status: 'available', ...next });
    }
    setSaveStatus(outcome.status);
    return outcome;
  };

  const continueCareer = () => {
    const restored = readFootballCareer();
    setSavedCareer(restored);
    if (restored.status === 'available') {
      setSaveStatus(null);
      showCareer(restored);
    }
  };

  const confirmNewSeason = () => {
    if (!selectedClub || savedCareer.status === 'future') return;
    const start = createFootballCareer(selectedClub.id);
    const next = replayFootballCareer(start);
    const result = persistCareer(next);
    if (result.status === 'future' || result.status === 'unavailable') return;
    setReplacePending(false);
    showCareer(next);
  };

  const openSeasonPreview = () => {
    if (savedCareer.status === 'future') return;
    if (savedCareer.status !== 'empty') {
      setReplacePending(true);
      return;
    }
    confirmNewSeason();
  };

  const changeDraft = (patch) => {
    if (!journal) return;
    const next = editFootballCareer(journal, patch);
    const outcome = persistCareer(next);
    if (outcome.status === 'future' || outcome.status === 'unavailable') return;
    showCareer(next);
  };

  const simulateNextRound = () => {
    if (!journal) return;
    const next = playFootballCareerRound(journal);
    const outcome = persistCareer(next);
    if (outcome.status === 'future' || outcome.status === 'unavailable') return;
    showCareer(next);
  };

  const renewSeason = () => {
    if (!journal || season?.currentRound !== 10 || seasonNumber >= FOOTBALL_CAREER_MAX_SEASONS) return;
    const next = startNextFootballSeason(journal);
    const outcome = persistCareer(next);
    if (outcome.status === 'future' || outcome.status === 'unavailable') return;
    showCareer(next);
    if (scrollSurface.current) scrollSurface.current.scrollTop = 0;
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
    <main ref={scrollSurface} className="chess-football-entry" data-football-view={view}>
      <div className="chess-football-entry__content">
        <button type="button" className="chess-football-entry__back" onClick={view === 'welcome' ? onExit : () => setView(view === 'season' ? 'club' : view === 'club' ? 'manager' : 'welcome')}>
          ← {view === 'welcome' ? 'Experimentos geniales' : view === 'season' ? 'Volver a la ficha' : view === 'club' ? 'Volver a los clubes' : 'Volver a Football'}
        </button>
        <header className="chess-football-entry__masthead">
          <span className="chess-football-entry__eyebrow">El vestuario · {view === "season" ? `Temporada ${seasonNumber}` : "Football"}</span>
          <h1>Chess <em>Football</em></h1>
          <p>Elige tu forma de vivir el fútbol. Un partido ahora, o la carrera de un club entero.</p>
        </header>

        {view === 'welcome' ? (
          <div className="chess-football-entry__choices" aria-label="Elige un modo de Chess Football">
            {savedCareer.status === 'available' ? (
              <div className="chess-football-entry__career-resume" aria-label="Temporada guardada">
                <strong>{FOOTBALL_MANAGER_CLUBS.find((club) => club.id === savedCareer.journal.clubId)?.name}</strong>
                <p>Temporada {(savedCareer.journal.completedSeasons?.length || 0) + 1} · Jornada {savedCareer.season.currentRound} de 10. Clasificación, quinteto y evolución guardados.</p>
                <button type="button" className="chess-football-entry__manager-return" onClick={continueCareer}>Continuar temporada</button>
              </div>
            ) : savedCareer.status === 'future' ? (
              <p className="chess-football-entry__career-warning" role="status">Este dispositivo tiene una carrera creada con una versión más nueva. Se conserva intacta; actualiza el juego para continuar.</p>
            ) : savedCareer.status === 'invalid' ? (
              <p className="chess-football-entry__career-warning" role="status">El último guardado no se puede leer. No se borrará hasta que confirmes una nueva temporada.</p>
            ) : null}
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
            <p>Elige tu club. Seis proyectos ficticios, seis maneras de complicarte la vida. Tu temporada estadística se guarda por perfil para poder continuarla.</p>
            <div className="chess-football-entry__clubs" aria-label="Clubes disponibles">
              {FOOTBALL_MANAGER_CLUBS.map((club) => (
                <button
                  type="button"
                  className="chess-football-entry__club"
                  key={club.id}
                  onClick={() => { setSelectedClubId(club.id); setSeason(null); setLineupIds(null); setReplacePending(false); setTactic('balanced'); setView('club'); }}
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
                <p>Temporada estadística de seis clubes y diez jornadas, con quinteto y fatiga. La guardamos en el progreso de tu perfil; todavía no hay contratos, fichajes ni conexión con partidos Godot.</p>
              </div>
            ) : null}
            {replacePending ? (
              <div className="chess-football-entry__career-confirm" role="group" aria-label="Confirmar nueva temporada">
                <p>Ya existe una carrera guardada. Crear otra sustituirá su historial, resultados y fatiga. Esta acción no se puede deshacer.</p>
                <button type="button" className="chess-football-entry__manager-return" onClick={confirmNewSeason}>Confirmar nueva temporada</button>
                <button type="button" className="chess-football-entry__manager-return is-secondary" onClick={() => setReplacePending(false)}>Conservar la anterior</button>
              </div>
            ) : (
              <button type="button" className="chess-football-entry__manager-return" disabled={savedCareer.status === 'future'} onClick={openSeasonPreview}>Empezar temporada de prueba</button>
            )}
            <button type="button" className="chess-football-entry__manager-return is-secondary" onClick={() => setView('manager')}>Cambiar de club</button>
          </section>
        ) : (
          <section className="chess-football-entry__manager chess-football-entry__manager--season" aria-labelledby="football-season-title">
            <span className="chess-football-entry__eyebrow">Temporada {seasonNumber} de {FOOTBALL_CAREER_MAX_SEASONS} · Carrera del club</span>
            <h2 id="football-season-title">{selectedClub?.name || 'Mi club'}</h2>
            <p>Jornada {season?.currentRound || 0} de {season?.rounds.length || 10}. Los resultados pertenecen a esta simulación estadística, no a un partido jugado en Godot.</p>
            {careerHistory.length ? (
              <details className="chess-football-entry__history" aria-label="Historial del club">
                <summary>Archivo de temporadas · {careerHistory.length} {careerHistory.length === 1 ? "completada" : "completadas"}</summary>
                <ol>{careerHistory.map((year) => (
                  <li key={year.number}>
                    Temporada {year.number} · {year.position}.º puesto · {year.points} puntos · {year.objectiveMet ? 'Objetivo cumplido' : 'Objetivo no alcanzado'}
                  </li>
                ))}</ol>
              </details>
            ) : null}
            {saveStatus === 'saved' ? <p className="chess-football-entry__save-state" role="status">Progreso guardado en este dispositivo y pendiente de sincronización del perfil.</p> : null}
            {saveStatus === 'memory' ? <p className="chess-football-entry__career-warning" role="status">El almacenamiento está bloqueado: los cambios sólo están disponibles en esta pestaña.</p> : null}
            {objective ? (
              <section className="chess-football-entry__objective" aria-label="Objetivo del club">
                <div className="chess-football-entry__objective-heading">
                  <strong>Objetivo del club · {objective.title}</strong>
                  <span>{objective.statusLabel}</span>
                </div>
                <p>{objective.detail}</p>
                <p className="chess-football-entry__objective-progress">{objective.progress}</p>
              </section>
            ) : null}
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
                      const player = developedRoster.find((entry) => entry.id === playerId);
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
                              const next = [...startingFive];
                              next[index] = nextId;
                              changeDraft({ lineup: next });
                            }}
                          >
                            {developedRoster.filter((candidate) => candidate.role === player.role).map((candidate) => (
                              <option key={candidate.id} value={candidate.id} disabled={startingFive.includes(candidate.id) && candidate.id !== playerId}>
                                {candidate.name} · ATQ {candidate.attack} / DEF {candidate.defense} · F{getFootballFatigue(season.managerFatigue, candidate.id)}%
                              </option>
                            ))}
                          </select>
                        </label>
                      );
                    })}
                  </div>
                  <FootballSquadDevelopment players={developedRoster} />
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
                      onClick={() => changeDraft({ tactic: plan.id })}
                    >{plan.label}</button>
                  ))}
                </div>
                <p className="chess-football-entry__plan-effect" role="status">
                  {FOOTBALL_MANAGER_TACTICS.find((plan) => plan.id === tactic)?.description}
                </p>
              </section>
            ) : null}
            {season && season.currentRound < season.rounds.length ? (
              <section className="chess-football-entry__training" aria-label="Entrenamiento de la jornada">
                <details>
                  <summary>Preparar entrenamiento · {FOOTBALL_TRAINING_PLANS.find((plan) => plan.id === journal?.nextTraining)?.label || 'Rutina normal'}</summary>
                  <p>Una sesión antes del partido: más ataque, más defensa o recuperación. El esfuerzo también se paga con cansancio.</p>
                  <div className="chess-football-entry__training-options" role="group" aria-label="Plan de entrenamiento">
                    {FOOTBALL_TRAINING_PLANS.map((plan) => (
                      <button type="button" key={plan.id}
                        className="chess-football-entry__training-option"
                        aria-pressed={journal?.nextTraining === plan.id}
                        onClick={() => changeDraft({ training: plan.id })}
                      >{plan.label}</button>
                    ))}
                  </div>
                  <p role="status">{FOOTBALL_TRAINING_PLANS.find((plan) => plan.id === journal?.nextTraining)?.description}</p>
                </details>
              </section>
            ) : null}
            {season && season.currentRound < season.rounds.length ? (
              <div className="chess-football-entry__fixture-list" aria-label="Próxima jornada">
                <h3>Próxima jornada</h3>
                {season.rounds[season.currentRound].map((fixture) => (
                  <p key={fixture.id}>{season.clubs.find((club) => club.id === fixture.homeId)?.name} – {season.clubs.find((club) => club.id === fixture.awayId)?.name}</p>
                ))}
              </div>
            ) : (
              <section className="chess-football-entry__lineup" aria-label="Plantilla al cierre">
                <p>Temporada completada. La clasificación final ya está calculada.</p>
                <FootballSquadDevelopment players={developedRoster} />
              </section>
            )}
            {season?.currentRound === season?.rounds.length && season ? (
              <section className="chess-football-entry__renewal" aria-label="Cierre de temporada">
                <strong>Temporada {seasonNumber} completada · {objective?.position}.º puesto</strong>
                <p>{objective?.statusLabel}. Tus futbolistas mantienen las mejoras ganadas, el cansancio se recupera en pretemporada y el calendario siguiente tendrá un nuevo sorteo reproducible.</p>
                {seasonNumber < FOOTBALL_CAREER_MAX_SEASONS ? (
                  <button type="button" className="chess-football-entry__manager-return" onClick={renewSeason}>
                    Comenzar temporada {seasonNumber + 1}
                  </button>
                ) : <p>Has completado las {FOOTBALL_CAREER_MAX_SEASONS} temporadas de esta primera carrera. Su historial permanece guardado.</p>}
              </section>
            ) : null}
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
                    {result.managerTraining && result.managerTraining !== 'standard' ? (
                      <span className="chess-football-entry__used-plan"> · Entreno: {FOOTBALL_TRAINING_PLANS.find((plan) => plan.id === result.managerTraining)?.label}</span>
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
              onClick={simulateNextRound}
            >
              {season?.currentRound >= season?.rounds.length ? 'Liga completada' : 'Simular siguiente jornada'}
            </button>
          </section>
        )}
      </div>
    </main>
  );
}
