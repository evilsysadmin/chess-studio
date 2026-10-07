import { useState } from 'react';
import { levelForPoints, pointsIntoLevel, difficultyForLevel, POINTS_PER_LEVEL } from '../tournament.js';
import { difficultyLabel } from '../difficulty.js';
import ColorSelector from './ColorSelector.jsx';
import { useEscapeToClose } from '../useEscapeToClose.js';
import MechanicTutorialHelp from './MechanicTutorialHelp.jsx';
import './TournamentMobilePolish.css';
import {
  TITLES,
  PIECE_SKINS,
  unlockedTitles,
  unlockedSkins,
  nextTitleToUnlock,
  nextSkinToUnlock,
  loadSelectedTitle,
  saveSelectedTitle,
  loadSelectedSkin,
  saveSelectedSkin,
} from '../tournamentRewards.js';

const SPARK_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

function LevelUpBurst() {
  return (
    <>
      <span className="level-up-glow" />
      {SPARK_ANGLES.map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        const dx = Math.cos(rad) * 46;
        const dy = Math.sin(rad) * 46;
        return <span key={deg} className="level-spark" style={{ '--dx': `${dx}px`, '--dy': `${dy}px`, animationDelay: `${i * 0.02}s` }} />;
      })}
    </>
  );
}

function colorLabel(color) {
  if (color === 'w' || color === 'white') return 'Blancas';
  if (color === 'b' || color === 'black') return 'Negras';
  return 'Aleatorio';
}

export default function TournamentScreen({ tournament, onPlay, onExit, onReset, onHistory, loading, lastResult, isAdminUser = false }) {
  useEscapeToClose(onExit);
  const [color, setColor] = useState('random');
  const [selectedTitle, setSelectedTitle] = useState(loadSelectedTitle());
  const [selectedSkin, setSelectedSkin] = useState(loadSelectedSkin());
  const level = levelForPoints(tournament.progressPoints || 0);
  const into = pointsIntoLevel(tournament.progressPoints || 0);
  const cpuLevel = difficultyForLevel(level);
  const progressPct = Math.round((into / POINTS_PER_LEVEL) * 100);
  const maxedOut = cpuLevel >= 100;
  const justLeveledUp = !!lastResult?.leveledUp;
  const currentTitle = TITLES.find((t) => t.id === selectedTitle) || TITLES[0];
  const myUnlockedTitles = unlockedTitles(level, { isAdmin: isAdminUser });
  const myUnlockedSkins = unlockedSkins(level, { isAdmin: isAdminUser });
  const unlockedTitleIds = new Set(myUnlockedTitles.map((t) => t.id));
  const unlockedSkinIds = new Set(myUnlockedSkins.map((s) => s.id));
  const nextTitle = isAdminUser ? null : nextTitleToUnlock(level);
  const nextSkin = isAdminUser ? null : nextSkinToUnlock(level);

  function pickTitle(id) { saveSelectedTitle(id); setSelectedTitle(id); }
  function pickSkin(id) { saveSelectedSkin(id); setSelectedSkin(id); }

  return (
    <div className="menu tournament-panel tournament-friendly tournament-hall-screen" data-tournament-hall="true">
      <button className="back-link tournament-hall-exit" onClick={onExit}>← Salir del torneo</button>

      <div className="tournament-hall-heading">
        <span className="eyebrow">SALÓN DE TORNEOS</span>
        <MechanicTutorialHelp tutorialId="tournament" />
      </div>

      {lastResult && (
        <aside className={`tournament-hall-last-result ${lastResult.leveledUp ? 'level-up' : ''}`} role="status" aria-label="Resultado de la última partida">
          <strong>
            {lastResult.outcome === 'win' ? `Victoria · +${lastResult.gained} XP` : lastResult.outcome === 'draw' ? `Tablas · +${lastResult.gained} XP` : 'Derrota · puedes reintentar'}
          </strong>
          {Number.isFinite(lastResult.eloDelta) && <span>Rating {lastResult.eloDelta >= 0 ? '+' : ''}{lastResult.eloDelta} · {lastResult.eloBefore} → {lastResult.eloAfter}</span>}
          {lastResult.leveledUp && <b>Nuevo nivel {lastResult.newLevel}</b>}
        </aside>
      )}

      <main className="tournament-hall-rival" aria-label="Siguiente rival">
        <span className="section-label">TORNEO · NIVEL {level}</span>
        <span className="level-heading-wrap">
          <h2 className={`level-heading ${justLeveledUp ? 'level-up-heading' : ''}`}>Siguiente rival</h2>
          {justLeveledUp && <LevelUpBurst />}
        </span>

        <div className="tournament-hall-opponent-seal" aria-label={`CPU nivel ${cpuLevel}, ${difficultyLabel(cpuLevel)}`}>
          <small>CPU</small>
          <strong>{cpuLevel}</strong>
          <span>{difficultyLabel(cpuLevel)}</span>
        </div>

        <p className="tournament-hall-rival-copy">
          {maxedOut ? 'Has llegado al techo del circuito. El siguiente rival ya no va a ponerse más amable.' : `Supera este rival para seguir escalando hacia el nivel ${level + 1}.`}
        </p>

        <div className="tournament-hall-progress-plaque">
          <div className="tournament-progress-track" aria-label={`Progreso del nivel ${level}`}>
            <div className="tournament-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <span>{into} / {POINTS_PER_LEVEL} XP</span>
          {!maxedOut && <small>{POINTS_PER_LEVEL - into} XP para subir</small>}
        </div>

        <details className="friendly-disclosure tournament-color-choice tournament-hall-color">
          <summary>Color · {colorLabel(color)}</summary>
          <div className="friendly-disclosure-body"><ColorSelector value={color} onChange={setColor} minTargetSize={44} /></div>
        </details>

        <button className="primary-btn friendly-main-cta tournament-hall-play" disabled={loading} onClick={() => onPlay(color)}>
          {loading ? 'Abriendo la War Room…' : 'Jugar siguiente partida'}
        </button>
      </main>

      <details className="friendly-disclosure tournament-more tournament-hall-archive">
        <summary>Abrir vitrina y expediente</summary>
        <div className="friendly-disclosure-body tournament-hall-archive-body">
          <section className="tournament-hall-archive-section">
            <h3>Expediente del torneo</h3>
            <p className="hint-text">
              {tournament.wins} victorias · {tournament.draws} tablas · {tournament.losses} derrotas · {tournament.points} puntos para pistas
            </p>
            {(tournament.winStreak > 0 || tournament.bestWinStreak > 0) && (
              <p className="hint-text">Racha actual: <b>{tournament.winStreak || 0}</b> · mejor: <b>{tournament.bestWinStreak || 0}</b></p>
            )}
            <button className="secondary-btn" aria-label="Ver historial de partidas" onClick={onHistory}>Abrir archivo de partidas</button>
          </section>

          <section className="tournament-hall-archive-section tournament-hall-trophy-case">
            <h3>Vitrina</h3>
            <p className="hint-text">{isAdminUser ? 'Catálogo completo abierto para pruebas.' : 'Las piezas de la vitrina se desbloquean al subir de nivel.'} Título actual: <b>{currentTitle.label}</b>.</p>
            <span className="tournament-hall-shelf-label">Título</span>
            <div className="rewards-grid tournament-hall-reward-rack">
              {TITLES.map((t) => {
                const isUnlocked = unlockedTitleIds.has(t.id);
                return (
                  <button key={t.id} type="button" className={`reward-chip ${selectedTitle === t.id ? 'reward-chip-selected' : ''} ${!isUnlocked ? 'reward-chip-locked' : ''}`} disabled={!isUnlocked} onClick={() => pickTitle(t.id)} title={isUnlocked ? t.label : `Se desbloquea en el nivel ${t.level}`}>
                    {isUnlocked ? t.label : `🔒 Nivel ${t.level}`}
                  </button>
                );
              })}
            </div>

            <span className="tournament-hall-shelf-label">Piezas</span>
            <div className="rewards-grid tournament-hall-reward-rack">
              {PIECE_SKINS.map((s) => {
                const isUnlocked = unlockedSkinIds.has(s.id);
                return (
                  <button key={s.id} type="button" className={`reward-chip ${selectedSkin === s.id ? 'reward-chip-selected' : ''} ${!isUnlocked ? 'reward-chip-locked' : ''}`} disabled={!isUnlocked} onClick={() => pickSkin(s.id)} title={isUnlocked ? s.label : `Se desbloquea en el nivel ${s.level}`}>
                    {isUnlocked ? s.label : `🔒 Nivel ${s.level}`}
                  </button>
                );
              })}
            </div>
            {(nextTitle || nextSkin) && (
              <p className="hint-text tournament-hall-next-reward">
                {nextTitle && `Próximo título: nivel ${nextTitle.level}`}{nextTitle && nextSkin && ' · '}{nextSkin && `Próximas piezas: nivel ${nextSkin.level}`}
              </p>
            )}
          </section>

          <details className="friendly-subdisclosure danger-disclosure">
            <summary>Opciones del torneo</summary>
            <div className="friendly-disclosure-body danger-action-zone">
              <div><b>Reiniciar el torneo</b><small>Se perderán el nivel, la XP de torneo y el saldo para pistas actuales.</small></div>
              <button className="danger-btn" onClick={onReset}>Reiniciar progreso</button>
            </div>
          </details>
        </div>
      </details>
    </div>
  );
}
