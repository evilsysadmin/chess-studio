import { lazy, Suspense, useState } from 'react';
import { requestWarRoomLandscapeFullscreen } from './useWarRoomImmersive.js';
import { FOOTBALL_MANAGER_CLUBS, getFootballManagerClub } from '../footballManagerClubs.js';
import './ChessFootballEntry.css';

const ChessFootballGodotHost = lazy(() => import('./ChessFootballGodotHost.jsx'));

export default function ChessFootballEntry({ onExit }) {
  const [view, setView] = useState('welcome');
  const [selectedClubId, setSelectedClubId] = useState(null);
  const selectedClub = getFootballManagerClub(selectedClubId);

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
        <button type="button" className="chess-football-entry__back" onClick={view === 'welcome' ? onExit : () => setView(view === 'club' ? 'manager' : 'welcome')}>
          ← {view === 'welcome' ? 'Experimentos geniales' : view === 'club' ? 'Volver a los clubes' : 'Volver a Football'}
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
                  onClick={() => { setSelectedClubId(club.id); setView('club'); }}
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
        ) : (
          <section className="chess-football-entry__manager" aria-labelledby="football-club-review-title">
            <span className="chess-football-entry__eyebrow">Modo mánager · Club elegido</span>
            <h2 id="football-club-review-title">{selectedClub?.name || 'Selecciona un club'}</h2>
            {selectedClub ? (
              <div className="chess-football-entry__club-summary">
                <p><strong>Estilo:</strong> {selectedClub.style}</p>
                <p><strong>Objetivo propuesto:</strong> {selectedClub.objective}</p>
                <p>Selección temporal: tu carrera, la plantilla y el calendario estarán disponibles cuando llegue el simulador de temporada. No se ha guardado ningún progreso.</p>
              </div>
            ) : null}
            <button type="button" className="chess-football-entry__manager-return" onClick={() => setView('manager')}>Cambiar de club</button>
          </section>
        )}
      </div>
    </main>
  );
}
