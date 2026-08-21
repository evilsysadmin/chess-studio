import React from 'react';
import ArmyScreen from './ArmyScreen.jsx';
import ColorSelector from './ColorSelector.jsx';
import { BASE_STATS } from '../combat.js';
import CombatServicePanel from './CombatServicePanel.jsx';

export default function CombatSetupView({
  onExit, difficulty, ratingInfo, difficultyOverride, difficultyLabel, forcedHumanColor, encounterLabel, encounterDescription, encounterTier, bossConfig, runPerks, combatVariant, colorChoice, setColorChoice, autoLevelUpEnabled,
  setAutoLevelUpEnabled, roster, rosterCount, deadCount, deadRosterEntries,
  showExpireWarning, setShowExpireWarning, handleStartBattleClick, startBattle,
  showArmy, setShowArmy, handleBuyRosterStat, handleReviveRosterPiece, handleMetamorphoseRosterPiece,
  handleResetRoster, onHistory, serviceSummary,
}) {

    return (
      <div className="menu combat-setup">
        <button className="back-link" onClick={onExit}>← Volver al menú</button>
        <div className="menu-section">
          <span className="eyebrow">{combatVariant === 'roguelike' ? 'Combate Roguelike' : 'Modo combate'}</span>
          <h2 style={{ marginTop: '0.35rem' }}>{combatVariant === 'roguelike' ? 'Piso con reglas de combate' : 'Ajedrez con niveles y esquive'}</h2>
          {encounterLabel && (
            <div className="combat-encounter-card">
              <span>ENCUENTRO</span>
              <strong>{encounterLabel}</strong>
              {encounterTier && <em className="combat-encounter-tier">{encounterTier}</em>}
              {encounterDescription && <p>{encounterDescription}</p>}
              {bossConfig && <p><b>Regla del jefe:</b> su rey tiene {bossConfig.maxHp} HP. Cada jaque hace 1 daño; el mate hace 2 y abre una nueva fase si todavía sigue vivo.</p>}
            </div>
          )}
          <p className="hint-text">
            Es ajedrez normal, con una vuelta: cuando intentas capturar una pieza, primero ves el % de acierto
            y confirmas si te compensa el riesgo. Si falla, la pieza atacada esquiva: el tablero no cambia, pero
            el atacante pierde el turno (y la pieza que esquivó banca algo de XP por sobrevivir). Capturar también banca XP, que se puede
            gastar en fuerza o velocidad — automático o a mano, según la opción de abajo. Atacar sin haberte
            movido de tu casilla de partida da un bono ("en reserva"), y fallar varias veces seguidas contra el
            mismo objetivo afina la puntería; mover tranquilo, cambiar de blanco o acertar rompe esa racha. Las piezas que lleguen vivas al final de la partida guardan su
            progreso para la próxima batalla — las que caigan, tienen una única ventana para revivirlas
            (gastando "XP de combate", una moneda aparte que se gana al terminar cada partida) antes de que
            empieces la siguiente: si no las recuperas a tiempo, se pierde para siempre su veteranía y ese hueco vuelve la próxima batalla con una pieza de nivel 1. El
            rey nunca esquiva y siempre acierta cuando ataca, y tampoco gana ni gasta XP: el jaque mate sigue
            siendo 100% seguro, como en el ajedrez de siempre. Cada pieza de tu ejército tiene alias propio desde nivel 1.
            La metamorfosis empieza mucho más tarde: un peón <b>Comandante</b> desbloquea Caballo, un <b>Coronel</b> añade
            Alfil y un <b>General</b> añade Torre. No es permanente: eliges el despliegue antes de cada batalla y queda
            bloqueado durante el combate. Sí, rompe el ajedrez normal. Aquí estamos en Combate.
          </p>
        </div>

        <CombatServicePanel summary={serviceSummary} />

        {combatVariant === 'roguelike' && Array.isArray(runPerks) && runPerks.length > 0 && (
          <div className="menu-section">
            <h2>Ventajas de este intento</h2>
            <div className="roguelike-active-perks">
              {runPerks.map((perk, index) => (
                <span key={`${perk.id}-${index}`} className="roguelike-perk-chip" title={perk.description}>{perk.label}</span>
              ))}
            </div>
            <p className="hint-text" style={{ marginTop: '0.45rem' }}>Son temporales: desaparecen cuando termina el intento.</p>
          </div>
        )}

        <div className="menu-section">
          <h2>Dificultad de la CPU</h2>
          <p className="hint-text" style={{ marginBottom: '0.6rem' }}>
            {difficultyOverride != null
              ? 'Fijada por este encuentro: el piso manda, no tu rating.'
              : 'Automática, según cómo te ve la CPU — no se elige a mano en Combate.'}
          </p>
          <div className="difficulty-slider-row">
            <div className="difficulty-slider" style={{ background: 'transparent', pointerEvents: 'none', flex: 1 }}>
              <div
                style={{
                  height: '4px',
                  borderRadius: '2px',
                  background: 'linear-gradient(90deg, var(--success), var(--brass) 50%, var(--danger))',
                  width: '100%',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: `${difficulty}%`,
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    background: 'var(--parchment)',
                    border: '2px solid var(--ink)',
                  }}
                />
              </div>
            </div>
            <div className="difficulty-readout">
              <span className="difficulty-number">{difficulty}</span>
              <span className="difficulty-word">{difficultyLabel || ratingInfo.tier.label}</span>
            </div>
          </div>
        </div>

        <div className="menu-section">
          <h2>Color</h2>
          {forcedHumanColor ? (
            <p className="hint-text">
              Fijo en esta modalidad: juegas con <b>{forcedHumanColor === 'w' ? 'blancas' : 'negras'}</b>.
            </p>
          ) : (
            <ColorSelector value={colorChoice} onChange={setColorChoice} />
          )}
        </div>

        <div className="menu-section">
          <h2>Subida de nivel</h2>
          <label className="auto-level-toggle">
            <input
              type="checkbox"
              checked={autoLevelUpEnabled}
              onChange={(e) => setAutoLevelUpEnabled(e.target.checked)}
            />
            <span>Auto-subida de nivel</span>
          </label>
          <p className="hint-text" style={{ marginTop: '0.4rem' }}>
            {autoLevelUpEnabled
              ? 'Activada: al terminar la batalla, cada pieza gasta su XP sola, comprando fuerza y velocidad en pareja. Simple, sin decisiones — pero ya no en caliente, jugada a jugada.'
              : 'Desactivada: el XP queda bancado al terminar y lo gastas desde Tu ejército antes de la siguiente batalla. Más control, sin poder reaccionar a mitad de combate.'}
          </p>
        </div>

        <div className="menu-section">
          <h2>Tu ejército</h2>
          {rosterCount > 0 ? (
            <p className="hint-text">
              Tienes {rosterCount} pieza{rosterCount === 1 ? '' : 's'} propia{rosterCount === 1 ? '' : 's'} con
              progreso guardado de batallas anteriores — van a arrancar ya reforzadas sea cual sea el color que
              te toque esta vez. Las que capturen o sobrevivan en esta partida siguen sumando XP; las que
              pierdas, vuelven a empezar de cero (salvo que las revivas).
            </p>
          ) : (
            <p className="hint-text">
              Todavía no tienes progreso guardado. Las piezas que sobrevivan esta partida van a arrancar la
              próxima ya con lo que hayas invertido en ellas.
            </p>
          )}
          {deadCount > 0 && (
            <p className="hint-text" style={{ marginTop: '0.4rem' }}>
              {deadCount} pieza{deadCount === 1 ? '' : 's'} caída{deadCount === 1 ? '' : 's'} — revívelas ahora
              gastando XP de combate (tienes {roster.combatXp}) desde "Ver tu ejército", o se pierden para
              siempre en cuanto arranques la próxima batalla.
            </p>
          )}
          <button
            type="button"
            className="secondary-btn"
            style={{ width: '100%', marginTop: '0.6rem' }}
            onClick={() => setShowArmy(true)}
          >
            Ver tu ejército {roster.combatXp > 0 ? `(${roster.combatXp} XP de combate)` : ''}
          </button>
          {onHistory && (
            <button
              type="button"
              className="secondary-btn"
              style={{ width: '100%', marginTop: '0.5rem' }}
              onClick={onHistory}
            >
              Ver mis batallas
            </button>
          )}
          {rosterCount > 0 && (
            <button
              type="button"
              className="secondary-btn"
              style={{ width: '100%', marginTop: '0.5rem' }}
              onClick={handleResetRoster}
            >
              Reiniciar progreso de piezas
            </button>
          )}
        </div>

        <button className="primary-btn" style={{ width: '100%' }} onClick={handleStartBattleClick}>
          Empezar combate
        </button>

        {showExpireWarning && (
          <div className="modal-backdrop" onClick={() => setShowExpireWarning(false)}>
            <div className="attack-confirm-card" onClick={(e) => e.stopPropagation()}>
              <p className="attack-confirm-title">
                Tienes {deadRosterEntries.length} pieza{deadRosterEntries.length === 1 ? '' : 's'} caída
                {deadRosterEntries.length === 1 ? '' : 's'} sin revivir
                {' '}({deadRosterEntries.map(([key]) => BASE_STATS[key.split('-')[0]].name).join(', ')}).
                Si empiezas ahora, se pierde para siempre su veteranía; esos huecos volverán como piezas de nivel 1.
              </p>
              <div className="attack-confirm-buttons">
                <button
                  className="secondary-btn"
                  onClick={() => { setShowExpireWarning(false); startBattle(); }}
                >
                  Empezar igual
                </button>
                <button
                  className="primary-btn"
                  onClick={() => { setShowExpireWarning(false); setShowArmy(true); }}
                >
                  Ir a revivir
                </button>
              </div>
            </div>
          </div>
        )}

        {showArmy && (
          <ArmyScreen roster={roster} onBuy={handleBuyRosterStat} onRevive={handleReviveRosterPiece} onMetamorphose={handleMetamorphoseRosterPiece} onClose={() => setShowArmy(false)} />
        )}
      </div>
    );
}
