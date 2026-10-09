import { lazy, Suspense, useState } from 'react';
import { requestWarRoomLandscapeFullscreen } from './useWarRoomImmersive.js';
import './ChessFootballEntry.css';

const ChessFootballGodotHost = lazy(() => import('./ChessFootballGodotHost.jsx'));

export default function ChessFootballEntry({ onExit }) {
  const [view, setView] = useState('welcome');

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
        <button type="button" className="chess-football-entry__back" onClick={view === 'welcome' ? onExit : () => setView('welcome')}>
          ← {view === 'welcome' ? 'Experimentos geniales' : 'Volver a Football'}
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
        ) : (
          <section className="chess-football-entry__manager" aria-labelledby="football-manager-title">
            <span className="chess-football-entry__eyebrow">Modo mánager · En preparación</span>
            <h2 id="football-manager-title">El despacho del míster</h2>
            <p>La selección de club y la primera liga llegarán por fases. Esta entrada está separada del partido rápido: tu carrera no modificará los partidos arcade.</p>
            <button type="button" className="chess-football-entry__manager-return" onClick={() => setView('welcome')}>Volver a elegir modo</button>
          </section>
        )}
      </div>
    </main>
  );
}
