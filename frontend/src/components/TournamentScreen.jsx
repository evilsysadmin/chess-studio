import React, { useState } from 'react';
import { levelForPoints, pointsIntoLevel, difficultyForLevel, POINTS_PER_LEVEL } from '../tournament.js';
import { difficultyLabel } from '../difficulty.js';
import ColorSelector from './ColorSelector.jsx';
import { useEscapeToClose } from '../useEscapeToClose.js';
import MechanicTutorialHelp from './MechanicTutorialHelp.jsx';
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
        return (
          <span
            key={deg}
            className="level-spark"
            style={{ '--dx': `${dx}px`, '--dy': `${dy}px`, animationDelay: `${i * 0.02}s` }}
          />
        );
      })}
    </>
  );
}

export default function TournamentScreen({ tournament, onPlay, onExit, onReset, onHistory, loading, lastResult }) {
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
  const myUnlockedTitles = unlockedTitles(level);
  const myUnlockedSkins = unlockedSkins(level);
  const unlockedTitleIds = new Set(myUnlockedTitles.map((t) => t.id));
  const unlockedSkinIds = new Set(myUnlockedSkins.map((s) => s.id));
  const nextTitle = nextTitleToUnlock(level);
  const nextSkin = nextSkinToUnlock(level);

  function pickTitle(id) {
    saveSelectedTitle(id);
    setSelectedTitle(id);
  }

  function pickSkin(id) {
    saveSelectedSkin(id);
    setSelectedSkin(id);
  }

  return (
    <div className="menu tournament-panel">
      <button className="back-link" onClick={onExit}>← Volver al menú</button>

      <div className="menu-section">
        <div className="combat-heading-row"><span className="eyebrow">Modo torneo</span><MechanicTutorialHelp tutorialId="tournament" /></div>
        <span className="level-heading-wrap">
          <h2 className={`level-heading ${justLeveledUp ? 'level-up-heading' : ''}`} style={{ marginTop: '0.35rem' }}>
            Nivel {level}
          </h2>
          <p className="hint-text" style={{ margin: '0 0 0.3rem' }}>{currentTitle.label}</p>
          {justLeveledUp && <LevelUpBurst />}
        </span>
        <p className="hint-text">
          CPU en nivel {cpuLevel} · {difficultyLabel(cpuLevel)}
          {maxedOut ? ' (nivel máximo)' : ''}
        </p>
        <div className="tournament-progress-track">
          <div className="tournament-progress-fill" style={{ width: `${progressPct}%` }} />
          <span className="tournament-progress-label">{into} / {POINTS_PER_LEVEL} XP</span>
        </div>
        <p className="tournament-xp-remaining">
          Faltan <b>{POINTS_PER_LEVEL - into}</b> XP de resultados para el nivel {level + 1}
        </p>
      </div>

      {lastResult && (
        <div className={`tournament-result ${lastResult.leveledUp ? 'level-up' : ''}`}>
          {lastResult.outcome === 'win' && <p>Ganaste la última partida · +{lastResult.gained} XP</p>}
          {lastResult.outcome === 'draw' && <p>Tablas en la última partida · +{lastResult.gained} XP</p>}
          {lastResult.outcome === 'loss' && <p>Perdiste la última partida · sin XP, pero puedes reintentar</p>}
          {Number.isFinite(lastResult.eloDelta) && (
            <p>
              ELO {lastResult.eloDelta >= 0 ? '+' : ''}{lastResult.eloDelta}
              {' · '}{lastResult.eloBefore} → {lastResult.eloAfter}
              {Number.isFinite(lastResult.cpuRating) ? ` · rival efectivo ${lastResult.cpuRating}` : ''}
            </p>
          )}
          {lastResult.leveledUp && <p className="level-up-text">¡Subiste al nivel {lastResult.newLevel}!</p>}
        </div>
      )}

      <div className="menu-section">
        <h2>Estadísticas</h2>
        <p className="hint-text">
          {tournament.wins} victorias · {tournament.draws} tablas · {tournament.losses} derrotas · {tournament.points} puntos disponibles para pistas
        </p>
        {(tournament.winStreak > 0 || tournament.bestWinStreak > 0) && (
          <p className="hint-text" style={{ marginTop: '0.3rem' }}>
            Racha de victorias: <b>{tournament.winStreak || 0}</b> · mejor racha: <b>{tournament.bestWinStreak || 0}</b>
          </p>
        )}
        <button className="secondary-btn" style={{ width: '100%', marginTop: '0.6rem' }} onClick={onHistory}>
          Ver historial de partidas
        </button>
      </div>

      <div className="menu-section">
        <h2>Recompensas</h2>
        <p className="hint-text">Se desbloquean solas al subir de nivel — no cuestan puntos.</p>

        <p className="hint-text" style={{ marginTop: '0.7rem', marginBottom: '0.3rem' }}>Título</p>
        <div className="rewards-grid">
          {TITLES.map((t) => {
            const isUnlocked = unlockedTitleIds.has(t.id);
            return (
              <button
                key={t.id}
                type="button"
                className={`reward-chip ${selectedTitle === t.id ? 'reward-chip-selected' : ''} ${!isUnlocked ? 'reward-chip-locked' : ''}`}
                disabled={!isUnlocked}
                onClick={() => pickTitle(t.id)}
                title={isUnlocked ? t.label : `Se desbloquea en el nivel ${t.level}`}
              >
                {isUnlocked ? t.label : `🔒 Nivel ${t.level}`}
              </button>
            );
          })}
        </div>

        <p className="hint-text" style={{ marginTop: '0.9rem', marginBottom: '0.3rem' }}>Piezas</p>
        <div className="rewards-grid">
          {PIECE_SKINS.map((s) => {
            const isUnlocked = unlockedSkinIds.has(s.id);
            return (
              <button
                key={s.id}
                type="button"
                className={`reward-chip ${selectedSkin === s.id ? 'reward-chip-selected' : ''} ${!isUnlocked ? 'reward-chip-locked' : ''}`}
                disabled={!isUnlocked}
                onClick={() => pickSkin(s.id)}
                title={isUnlocked ? s.label : `Se desbloquea en el nivel ${s.level}`}
              >
                {isUnlocked ? s.label : `🔒 Nivel ${s.level}`}
              </button>
            );
          })}
        </div>

        {(nextTitle || nextSkin) && (
          <p className="hint-text" style={{ marginTop: '0.7rem' }}>
            {nextTitle && `Próximo título en nivel ${nextTitle.level} — "${nextTitle.label}"`}
            {nextTitle && nextSkin && ' · '}
            {nextSkin && `Próxima skin en nivel ${nextSkin.level} — "${nextSkin.label}"`}
          </p>
        )}
      </div>

      <div className="menu-section">
        <h2>Color</h2>
        <ColorSelector value={color} onChange={setColor} />
      </div>

      <button className="primary-btn" style={{ width: '100%' }} disabled={loading} onClick={() => onPlay(color)}>
        {loading ? 'Creando partida…' : `Jugar partida (nivel ${cpuLevel})`}
      </button>
      <button className="secondary-btn" style={{ width: '100%', marginTop: '0.6rem' }} onClick={onReset}>
        Reiniciar progreso del torneo
      </button>
    </div>
  );
}
