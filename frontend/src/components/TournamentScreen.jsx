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

  function pickTitle(id) { saveSelectedTitle(id); setSelectedTitle(id); }
  function pickSkin(id) { saveSelectedSkin(id); setSelectedSkin(id); }

  return (
    <div className="menu tournament-panel tournament-friendly">
      <button className="back-link" onClick={onExit}>← Volver al menú</button>

      <div className="menu-section tournament-next-card friendly-primary-zone">
        <div className="combat-heading-row"><span className="eyebrow">Torneo · Nivel {level}</span><MechanicTutorialHelp tutorialId="tournament" /></div>
        <span className="level-heading-wrap">
          <h2 className={`level-heading ${justLeveledUp ? 'level-up-heading' : ''}`} style={{ marginTop: '0.35rem' }}>Siguiente rival</h2>
          {justLeveledUp && <LevelUpBurst />}
        </span>
        <p className="friendly-big-summary">CPU nivel <b>{cpuLevel}</b> · {difficultyLabel(cpuLevel)}{maxedOut ? ' · máximo' : ''}</p>
        <div className="tournament-progress-track" aria-label={`Progreso del nivel ${level}`}>
          <div className="tournament-progress-fill" style={{ width: `${progressPct}%` }} />
          <span className="tournament-progress-label">{into} / {POINTS_PER_LEVEL} XP</span>
        </div>
        {!maxedOut && <p className="hint-text friendly-inline-note">{POINTS_PER_LEVEL - into} XP para subir al nivel {level + 1}.</p>}

        <details className="friendly-disclosure tournament-color-choice">
          <summary>Color · {colorLabel(color)}</summary>
          <div className="friendly-disclosure-body"><ColorSelector value={color} onChange={setColor} /></div>
        </details>

        <button className="primary-btn friendly-main-cta" disabled={loading} onClick={() => onPlay(color)}>
          {loading ? 'Creando partida…' : 'Jugar siguiente partida'}
        </button>
      </div>

      {lastResult && (
        <div className={`tournament-result ${lastResult.leveledUp ? 'level-up' : ''}`}>
          {lastResult.outcome === 'win' && <p>Última partida: victoria · +{lastResult.gained} XP</p>}
          {lastResult.outcome === 'draw' && <p>Última partida: tablas · +{lastResult.gained} XP</p>}
          {lastResult.outcome === 'loss' && <p>Última partida: derrota · puedes reintentar</p>}
          {Number.isFinite(lastResult.eloDelta) && <p>ELO {lastResult.eloDelta >= 0 ? '+' : ''}{lastResult.eloDelta} · {lastResult.eloBefore} → {lastResult.eloAfter}</p>}
          {lastResult.leveledUp && <p className="level-up-text">¡Subiste al nivel {lastResult.newLevel}!</p>}
        </div>
      )}

      <details className="friendly-disclosure tournament-more">
        <summary>Ver progreso, recompensas y opciones</summary>
        <div className="friendly-disclosure-body friendly-stack">
          <section className="friendly-subsection">
            <h3>Tu torneo</h3>
            <p className="hint-text">
              {tournament.wins} victorias · {tournament.draws} tablas · {tournament.losses} derrotas · {tournament.points} puntos para pistas
            </p>
            {(tournament.winStreak > 0 || tournament.bestWinStreak > 0) && (
              <p className="hint-text">Racha actual: <b>{tournament.winStreak || 0}</b> · mejor: <b>{tournament.bestWinStreak || 0}</b></p>
            )}
            <button className="secondary-btn" style={{ width: '100%', marginTop: '0.5rem' }} onClick={onHistory}>Ver historial de partidas</button>
          </section>

          <section className="friendly-subsection">
            <h3>Recompensas</h3>
            <p className="hint-text">Se desbloquean solas al subir de nivel. Título actual: <b>{currentTitle.label}</b>.</p>
            <p className="hint-text" style={{ marginTop: '0.65rem', marginBottom: '0.25rem' }}>Título</p>
            <div className="rewards-grid">
              {TITLES.map((t) => {
                const isUnlocked = unlockedTitleIds.has(t.id);
                return (
                  <button key={t.id} type="button" className={`reward-chip ${selectedTitle === t.id ? 'reward-chip-selected' : ''} ${!isUnlocked ? 'reward-chip-locked' : ''}`} disabled={!isUnlocked} onClick={() => pickTitle(t.id)} title={isUnlocked ? t.label : `Se desbloquea en el nivel ${t.level}`}>
                    {isUnlocked ? t.label : `🔒 Nivel ${t.level}`}
                  </button>
                );
              })}
            </div>

            <p className="hint-text" style={{ marginTop: '0.8rem', marginBottom: '0.25rem' }}>Piezas</p>
            <div className="rewards-grid">
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
              <p className="hint-text" style={{ marginTop: '0.65rem' }}>
                {nextTitle && `Próximo título: nivel ${nextTitle.level}`}{nextTitle && nextSkin && ' · '}{nextSkin && `Próximas piezas: nivel ${nextSkin.level}`}
              </p>
            )}
          </section>

          <details className="friendly-subdisclosure danger-disclosure">
            <summary>Opciones del torneo</summary>
            <div className="friendly-disclosure-body">
              <button className="secondary-btn" style={{ width: '100%' }} onClick={onReset}>Reiniciar progreso del torneo</button>
            </div>
          </details>
        </div>
      </details>
    </div>
  );
}
