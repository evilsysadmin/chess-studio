import React, { useState } from 'react';
import { difficultyLabel } from '../difficulty.js';
import { levelForPoints } from '../tournament.js';
import { logout, getUsername } from '../auth.js';
import { IconBookmark, IconTrophy, IconBulb, IconBook, IconPuzzle, IconSword, IconEye, IconPawn } from './Icons.jsx';
import ProfileBackupModal from './ProfileBackupModal.jsx';
import AchievementsModal from './AchievementsModal.jsx';
import QuickMatchModal from './QuickMatchModal.jsx';

export default function Menu({
  onNewGame,
  onContinue,
  onTournament,
  onTutorial,
  onOpenings,
  onPuzzle,
  onCombat,
  onSpectator,
  onHistory,
  onInsights,
  onBoard3D,
  hasSavedGame,
  loading,
  error,
  tournament,
  rating,
}) {
  const [difficulty, setDifficulty] = useState(50);
  const [color, setColor] = useState('random');
  const [timeControlId, setTimeControlId] = useState('none');
  const [showBackup, setShowBackup] = useState(false);
  const [showQuickMatch, setShowQuickMatch] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const tournamentLevel = levelForPoints(tournament.points);
  const username = getUsername();

  function handleLogout() {
    // Recarga completa a propósito: fuerza que App.jsx vuelva a chequear
    // isLoggedIn() desde cero al montar, sin necesidad de encadenar un
    // callback onLogout por 3 niveles de componentes hasta acá.
    logout();
    window.location.reload();
  }

  return (
    <div className="menu">
      {hasSavedGame && (
        <button type="button" className="continue-banner" disabled={loading} onClick={onContinue}>
          <IconBookmark className="continue-banner-icon" />
          <span className="continue-banner-text">
            <b>Tienes una partida en curso</b>
            <small>Retómala justo donde la dejaste</small>
          </span>
          <span className="continue-banner-cta">Continuar →</span>
        </button>
      )}

      <div className="menu-group">
        <span className="section-label">Jugar</span>
        <div className="menu-grid menu-grid-3">
          <button type="button" className="menu-card accent-hint" onClick={() => setShowQuickMatch(true)}>
            <IconPawn className="menu-card-icon" />
            <h3>Partida rápida</h3>
            <p>Elige dificultad, color, y ritmo de reloj — o déjalo en automático y juega ya.</p>
            <span className="menu-card-cta">Nivel {difficulty} · {difficultyLabel(difficulty)} →</span>
          </button>

          <button type="button" className="menu-card accent-brass" onClick={onTournament}>
            <IconTrophy className="menu-card-icon" />
            <h3>Torneo</h3>
            <p>Sube de nivel, gana puntos por victorias y capturas, y gástalos en pistas.</p>
            <span className="menu-card-cta">Nivel {tournamentLevel} · {tournament.points} pts →</span>
          </button>

          <button type="button" className="menu-card accent-danger" onClick={onCombat}>
            <IconSword className="menu-card-icon" />
            <h3>Combate</h3>
            <p>Ajedrez con niveles y esquive: las capturas se deciden a los dados según fuerza y velocidad.</p>
            <span className="menu-card-cta">Entrar en combate →</span>
          </button>
        </div>
      </div>

      <div className="menu-group">
        <span className="section-label">Aprender y practicar</span>
        <div className="menu-grid menu-grid-4">
          <button
            type="button"
            className="menu-card accent-success"
            disabled={loading}
            onClick={() => onNewGame(difficulty, color, { learning: true, timeControlId })}
          >
            <IconBulb className="menu-card-icon" />
            <h3>Partida de práctica</h3>
            <p>Partida normal contra la CPU, con pistas del motor gratis e ilimitadas.</p>
            <span className="menu-card-cta">Nivel {difficulty} · {difficultyLabel(difficulty)} →</span>
          </button>

          <button type="button" className="menu-card accent-success" onClick={onTutorial}>
            <IconBook className="menu-card-icon" />
            <h3>Aprendizaje</h3>
            <p>Diez lecciones interactivas: cómo se mueve cada pieza, enroque, jaque mate.</p>
            <span className="menu-card-cta">Ver tutorial →</span>
          </button>

          <button type="button" className="menu-card accent-success" onClick={onOpenings}>
            <IconBookmark className="menu-card-icon" />
            <h3>Aperturas famosas</h3>
            <p>Dieciocho aperturas clásicas, recorridas jugada por jugada con explicación en cada una.</p>
            <span className="menu-card-cta">Ver aperturas →</span>
          </button>

          <button type="button" className="menu-card accent-hint" onClick={onPuzzle}>
            <IconPuzzle className="menu-card-icon" />
            <h3>Puzzle</h3>
            <p>Posiciones cortas para resolver: mate en 1, mate en 2, o encontrar la jugada que gana material.</p>
            <span className="menu-card-cta">Resolver →</span>
          </button>

          <button type="button" className="menu-card accent-hint" onClick={onSpectator}>
            <IconEye className="menu-card-icon" />
            <h3>Espectador</h3>
            <p>Elige el nivel de cada bando (o al azar) y mira cómo juega la CPU contra sí misma.</p>
            <span className="menu-card-cta">Ver partida →</span>
          </button>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="footer-links-row">
        <button type="button" className="backup-link" onClick={onHistory}>
          Historial de partidas
        </button>
        <button type="button" className="backup-link" onClick={onInsights}>
          Así juegas
        </button>
        <button type="button" className="backup-link" onClick={() => setShowAchievements(true)}>
          Ver logros
        </button>
        <button type="button" className="backup-link" onClick={() => setShowBackup(true)}>
          Exportar / importar mi progreso
        </button>
        <button type="button" className="backup-link" onClick={onBoard3D}>
          Experimento 3D (jugable, experimental)
        </button>
        <button type="button" className="backup-link" onClick={handleLogout}>
          Cerrar sesión{username ? ` (${username})` : ''}
        </button>
      </div>

      {showBackup && <ProfileBackupModal onClose={() => setShowBackup(false)} />}
      {showAchievements && <AchievementsModal onClose={() => setShowAchievements(false)} />}
      {showQuickMatch && (
        <QuickMatchModal
          difficulty={difficulty}
          setDifficulty={setDifficulty}
          color={color}
          setColor={setColor}
          timeControlId={timeControlId}
          setTimeControlId={setTimeControlId}
          loading={loading}
          rating={rating}
          onStart={() => { onNewGame(difficulty, color, { timeControlId }); setShowQuickMatch(false); }}
          onClose={() => setShowQuickMatch(false)}
        />
      )}
    </div>
  );
}
