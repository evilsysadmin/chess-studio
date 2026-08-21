import React from 'react';
import ArmyScreen from './ArmyScreen.jsx';
import ColorSelector from './ColorSelector.jsx';
import { BASE_STATS } from '../combat.js';
import CombatServicePanel from './CombatServicePanel.jsx';

import { COMBAT_CHESS_NAME, COMBAT_CHESS_FREE_DESCRIPTION, COMBAT_CHESS_CAMPAIGN_DESCRIPTION } from '../combatChessBrand.js';
export default function CombatSetupView({
  onExit, difficulty, difficultyBalance, ratingInfo, difficultyOverride, difficultyLabel, forcedHumanColor, encounterLabel, encounterDescription, encounterTier, bossConfig, runPerks, combatVariant, colorChoice, setColorChoice, autoLevelUpEnabled,
  setAutoLevelUpEnabled, roster, rosterCount, deadCount, deadRosterEntries,
  showExpireWarning, setShowExpireWarning, handleStartBattleClick, startBattle,
  showArmy, setShowArmy, handleBuyRosterStat, handleReviveRosterPiece, handleMetamorphoseRosterPiece, handleUnlockRosterTechnique, handleEquipRosterTechnique,
  handleResetRoster, onHistory, serviceSummary,
}) {

    return (
      <div className="menu combat-setup">
        <button className="back-link" onClick={onExit}>← Volver al menú</button>
        <div className="menu-section">
          <span className="eyebrow">{COMBAT_CHESS_NAME}</span>
          <h2 style={{ marginTop: '0.35rem' }}>{combatVariant === 'roguelike' ? 'Campaña roguelike' : 'Batalla libre'}</h2>
          <p className="hint-text combat-mode-summary">{combatVariant === 'roguelike' ? COMBAT_CHESS_CAMPAIGN_DESCRIPTION : COMBAT_CHESS_FREE_DESCRIPTION}</p>
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
            La metamorfosis empieza mucho más tarde y no basta con farmear nivel: el Caballo exige <b>Comandante + 3 supervivencias</b>;
            el Alfil, <b>Coronel + Cinco bajas + Hierro viejo</b>; y la Torre, <b>General + Veterano de campaña + Cicatriz del Rey Viejo</b>.
            No es permanente: eliges el despliegue antes de cada batalla y queda bloqueado durante el combate. Sí, rompe el ajedrez normal.
            Por eso la CPU recibe una compensación automática de dificultad según la potencia permanente real de tu ejército. En Combat Chess, romper las reglas paga impuesto de amenaza.
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
              ? 'La base la fija este encuentro: el piso manda; un ejército veterano puede añadir compensación de amenaza.'
              : 'Automática, según cómo te ve la CPU — no se elige a mano en Combat Chess.'}
          </p>
          {difficultyBalance?.threat?.bonus > 0 && (
            <p className="combat-threat-note">
              Compensación de amenaza <b>{difficultyBalance.threat.tier}</b>: <b>+{difficultyBalance.appliedBonus}</b> · base {difficultyBalance.base} → CPU {difficultyBalance.adjusted}.{difficultyBalance.threat.bonus > difficultyBalance.appliedBonus ? ` Potencial +${difficultyBalance.threat.bonus}, recortado por el tope 100.` : ''}
              {' '}Veteranos {difficultyBalance.threat.activeVeterans} · metamorfosis activas {difficultyBalance.threat.activeMetamorphoses} · técnicas equipadas {difficultyBalance.threat.equippedTechniques}.
              {' '}Escala sólo con potencia permanente; nunca supera dificultad 100.
            </p>
          )}
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
              siempre en cuanto arranques la próxima batalla y pasan al Memorial de Caídos.
            </p>
          )}
          {(roster.memorial?.length || 0) > 0 && (
            <p className="hint-text" style={{ marginTop: '0.35rem' }}>
              Memorial: <b>{roster.memorial.length}</b> identidad{roster.memorial.length === 1 ? '' : 'es'} perdida{roster.memorial.length === 1 ? '' : 's'} definitivamente.
            </p>
          )}
          <button
            type="button"
            className="secondary-btn"
            style={{ width: '100%', marginTop: '0.6rem' }}
            onClick={() => setShowArmy(true)}
          >
            Orden de batalla · 16 unidades {roster.combatXp > 0 ? `(${roster.combatXp} XP)` : ''}
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
                {' '}({deadRosterEntries.map(([key]) => `${roster.identities?.[key]?.alias || 'Sin alias'} · ${BASE_STATS[key.split('-')[0]].name}`).join(', ')}).
                Si empiezas ahora, esas identidades pasan al Memorial de Caídos; los huecos volverán con reclutas de nivel 1 y nombres nuevos.
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
          <ArmyScreen roster={roster} onBuy={handleBuyRosterStat} onRevive={handleReviveRosterPiece} onMetamorphose={handleMetamorphoseRosterPiece} onUnlockTechnique={handleUnlockRosterTechnique} onEquipTechnique={handleEquipRosterTechnique} onClose={() => setShowArmy(false)} />
        )}
      </div>
    );
}
