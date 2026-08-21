import React, { useState } from 'react';
import { difficultyLabel } from '../difficulty.js';
import { levelForPoints } from '../tournament.js';
import { logout, getUsername } from '../auth.js';
import { pushProfileToServer } from '../profileBackup.js';
import { IconBookmark, IconTrophy, IconBulb, IconBook, IconPuzzle, IconSword, IconEye, IconPawn } from './Icons.jsx';
import ProfileBackupModal from './ProfileBackupModal.jsx';
import AchievementsModal from './AchievementsModal.jsx';
import QuickMatchModal from './QuickMatchModal.jsx';
import MirrorModeModal from './MirrorModeModal.jsx';
import AccountModal from './AccountModal.jsx';

import { COMBAT_CHESS_NAME, COMBAT_CHESS_GENRE, COMBAT_CHESS_TAGLINE } from '../combatChessBrand.js';
export default function Menu({
  onNewGame,
  onContinue,
  onTournament,
  onTutorial,
  onOpenings,
  onPuzzle,
  onCombat,
  onCombatRoguelike,
  isAdminUser,
  onAdmin,
  onSpectator,
  onHistory,
  onInsights,
  onLab,
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
  const [seriesBestOf, setSeriesBestOf] = useState(1);
  const [suddenDeath, setSuddenDeath] = useState(false);
  const [threatCheck, setThreatCheck] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  const [showQuickMatch, setShowQuickMatch] = useState(false);
  const [showMirrorMode, setShowMirrorMode] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [logoutError, setLogoutError] = useState(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const tournamentLevel = levelForPoints(tournament.progressPoints || 0);
  const username = getUsername();

  async function handleLogout() {
    // Antes de borrar la caché local intentamos persistir la última foto. Si
    // Mongo no confirma el guardado, no cerramos sesión: es preferible pedir
    // reintento a perder silenciosamente progreso reciente.
    setLogoutError(null);
    setLoggingOut(true);
    try {
      await pushProfileToServer({ throwOnError: true });
      logout();
      window.location.reload();
    } catch (error) {
      // Si la sesión ya expiró, el servidor no aceptará ningún guardado con
      // ese token. No atrapamos al usuario en una sesión imposible de cerrar.
      if (error?.status === 401) {
        logout();
        window.location.reload();
        return;
      }
      setLogoutError('No se pudo guardar tu progreso antes de cerrar sesión. Reintenta cuando vuelva la conexión.');
      setLoggingOut(false);
    }
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
        <div className="menu-grid menu-grid-4">
          <button type="button" className="menu-card accent-brass" onClick={onTournament}>
            <IconTrophy className="menu-card-icon" />
            <h3>Torneo</h3>
            <p>Sube de nivel por resultados; las capturas llenan tu cartera de pistas sin tocar tu ELO.</p>
            <span className="menu-card-cta">Nivel {tournamentLevel} · {tournament.points} pts de pista →</span>
          </button>

          <button type="button" className="menu-card accent-danger" onClick={onCombat}>
            <IconSword className="menu-card-icon" />
            <h3>Combate</h3>
            <p>Ajedrez con niveles y esquive: las capturas se deciden a los dados según fuerza y velocidad.</p>
            <span className="menu-card-cta">Entrar en combate →</span>
          </button>

          <button type="button" className="menu-card accent-danger" onClick={onCombatRoguelike}>
            <IconSword className="menu-card-icon" />
            <h3>{COMBAT_CHESS_NAME}</h3>
            <p><b>{COMBAT_CHESS_GENRE}.</b> {COMBAT_CHESS_TAGLINE} Diez pisos y un Rey Boss con 5 HP.</p>
            <span className="menu-card-cta">Entrar en La Torre →</span>
          </button>

          <button type="button" className="menu-card accent-hint" onClick={() => setShowQuickMatch(true)}>
            <IconPawn className="menu-card-icon" />
            <h3>Partida rápida</h3>
            <p>Elige dificultad, color, y ritmo de reloj — o déjalo en automático y juega ya.</p>
            <span className="menu-card-cta">Nivel {difficulty} · {difficultyLabel(difficulty)} →</span>
          </button>
        </div>
      </div>

      <div className="menu-group">
        <span className="section-label">Aprender y practicar</span>

        <button type="button" className="insights-feature-card" onClick={onInsights}>
          <span className="insights-feature-icon" aria-hidden="true"><IconEye /></span>
          <span className="insights-feature-copy">
            <span className="insights-feature-kicker">TU EXPEDIENTE DE JUEGO</span>
            <strong>Así juegas</strong>
            <span>Diagnóstico, evolución, entrenamiento, aperturas, rivalidad y archivo completo: todo tu juego en un solo sitio.</span>
          </span>
          <span className="insights-feature-cta">Analizar mi juego →</span>
        </button>

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
            <p>Dieciocho aperturas clásicas, reintentos jugada por jugada con explicación en cada una.</p>
            <span className="menu-card-cta">Ver aperturas →</span>
          </button>

          <button type="button" className="menu-card accent-hint" onClick={onPuzzle}>
            <IconPuzzle className="menu-card-icon" />
            <h3>Puzzle</h3>
            <p>Puzzles clásicos, desafío diario y posiciones nacidas de tus propias autopsias.</p>
            <span className="menu-card-cta">Resolver →</span>
          </button>

          <button type="button" className="menu-card accent-success" onClick={onLab}>
            <IconPuzzle className="menu-card-icon" />
            <h3>Laboratorio libre</h3>
            <p>Coloca piezas o pega un FEN y juega la posición contra la CPU sin tocar tu ELO.</p>
            <span className="menu-card-cta">Abrir laboratorio →</span>
          </button>

          <button type="button" className="menu-card accent-hint" onClick={() => setShowMirrorMode(true)}>
            <IconEye className="menu-card-icon" />
            <h3>Rival Fantasma</h3>
            <p>Una CPU calibrada a tus errores y a tendencias reales de tu estilo de juego.</p>
            <span className="menu-card-cta">Construir mi fantasma →</span>
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
        <button type="button" className="backup-link" onClick={() => setShowAchievements(true)}>
          Ver logros
        </button>
        <button type="button" className="backup-link" onClick={() => setShowAccount(true)}>
          Mi cuenta
        </button>
        <button type="button" className="backup-link" onClick={() => setShowBackup(true)}>
          Exportar / importar mi progreso
        </button>
        <button type="button" className="backup-link" onClick={onBoard3D}>
          Experimento 3D (jugable, experimental)
        </button>
        {isAdminUser && (
          <button type="button" className="backup-link" onClick={onAdmin}>
            Panel de admin
          </button>
        )}
        <button type="button" className="backup-link" onClick={handleLogout} disabled={loggingOut}>
          {loggingOut ? 'Guardando…' : `Cerrar sesión${username ? ` (${username})` : ''}`}
        </button>
        {logoutError && <p className="error-text" style={{ marginTop: '0.5rem' }}>{logoutError}</p>}
      </div>

      {showAccount && <AccountModal onClose={() => setShowAccount(false)} />}
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
          seriesBestOf={seriesBestOf}
          setSeriesBestOf={setSeriesBestOf}
          suddenDeath={suddenDeath}
          setSuddenDeath={setSuddenDeath}
          threatCheck={threatCheck}
          setThreatCheck={setThreatCheck}
          loading={loading}
          rating={rating}
          onStart={() => { onNewGame(difficulty, color, { timeControlId, seriesBestOf, suddenDeath, threatCheck }); setShowQuickMatch(false); }}
          onClose={() => setShowQuickMatch(false)}
        />
      )}
      {showMirrorMode && (
        <MirrorModeModal
          onStart={(profile) => {
            onNewGame(profile.difficulty, 'random', { ghost: true, ghostStyle: profile.style });
            setShowMirrorMode(false);
          }}
          onClose={() => setShowMirrorMode(false)}
        />
      )}
    </div>
  );
}
