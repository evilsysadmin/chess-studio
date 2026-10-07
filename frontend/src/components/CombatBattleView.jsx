import CombatWarRoomBoard from './CombatWarRoomBoard.jsx';
import './WarRoomImmersive.css';
import './CombatWarRoomBattle.css';
import WarRoomImmersiveMusicDock from './WarRoomImmersiveMusicDock.jsx';
import WarRoomLandscapeGate from './WarRoomLandscapeGate.jsx';
import useWarRoomLandscape from './useWarRoomLandscape.js';
import useWarRoomImmersive from './useWarRoomImmersive.js';
import PromotionModal from './PromotionModal.jsx';
import PieceInfoModal from './PieceInfoModal.jsx';
import AttackConfirmModal from './AttackConfirmModal.jsx';
import CombatDebrief from './CombatDebrief.jsx';
import ironKing from '../assets/bosses/iron-king.webp';
import nomadKing from '../assets/bosses/nomad-king.webp';
import shadowKing from '../assets/bosses/shadow-king.webp';
import { checkedKingSquare } from '../boardState.js';

const BOSS_SPRITES = { iron: ironKing, nomad: nomadKing, shadow: shadowKing };

export default function CombatBattleView({
  onExit, onViewBattle, phase, localChess, status, statusLabel, statusClass, statusText,
  fen, selected, handleSquareClick, handleSquareDoubleClick, legalTargets, pendingAnim,
  pieceLevels, pieceXp, pieceVeteranMarks, humanColor, busy, backToSetup, armySummary, log, battleRecap, registry, roster,
  pendingPromotion, choosePromotion, pendingAttack, confirmAttack, cancelAttack, infoPiece, infoUnitRecord,
  handleBuyStat, handleActivateTechnique, infoTechniqueTargets, setInfoSquare, suspendBattleToMenu, retireBattle, combatVariant, bossHp, bossPhase, bossConfig, cpuRetryNeeded, retryCpuTurn, battleTheme, battleThemeLabel,
}) {
  const {
    needsRotation: warRoomNeedsRotation,
    lockState: warRoomOrientationLock,
    activateLandscape,
  } = useWarRoomLandscape(true);
  const { immersive: warRoomImmersive } = useWarRoomImmersive({ enabled: true, focusActive: false });

  return (
    <div
      className={`game-screen combat-battle-screen ${battleTheme ? `combat-biome-${battleTheme.replace('combat-', '')}` : ''}`}
      data-combat-war-room="generic"
    >
      <div
        className={`game-layout game-layout-3d combat-game-layout combat-warroom-layout${warRoomImmersive ? ' game-layout-immersive' : ''}`}
        data-war-room-immersive={warRoomImmersive ? 'true' : 'false'}
        data-war-room-orientation-lock={warRoomOrientationLock}
      >
        <WarRoomLandscapeGate
          active={warRoomNeedsRotation}
          lockState={warRoomOrientationLock}
          onActivate={activateLandscape}
        />
        <WarRoomImmersiveMusicDock />
        <div className="board-column">
          <div className={`status-line combat-warroom-status ${statusClass}`}>{statusText}</div>

          {bossConfig && bossHp != null && (
            <div className={`roguelike-boss-hud boss-${bossConfig.spriteId || 'classic'}`} role="status" aria-label={`${bossConfig.label}: ${bossHp} de ${bossConfig.maxHp} puntos de vida`}>
              {BOSS_SPRITES[bossConfig.spriteId] && <img className="roguelike-boss-portrait" src={BOSS_SPRITES[bossConfig.spriteId]} alt="" aria-hidden="true" />}
              <div className="roguelike-boss-copy">
                <span className="roguelike-boss-kicker">BOSS · FASE {bossPhase}</span>
                <strong>{bossConfig.label}</strong>
                <span className="roguelike-boss-hearts" aria-hidden="true">
                  {Array.from({ length: bossConfig.maxHp }, (_, i) => (i < bossHp ? '♥' : '♡')).join(' ')}
                </span>
                <small>{bossHp}/{bossConfig.maxHp} HP · {bossConfig.rookShield ? 'torres activas = escudo' : `jaque = ${bossConfig.checkDamage || 1} · mate = ${bossConfig.mateDamage || 2}`}</small>
                {bossConfig.mechanicLabel && <em><b>{bossConfig.mechanicLabel}</b> · {bossConfig.mechanicDescription}</em>}
              </div>
            </div>
          )}

          {battleThemeLabel && <div className="combat-biome-label"><span>TERRENO</span><strong>{battleThemeLabel}</strong></div>}

          <div className="board-live-row is-3d-warroom combat-board-live-row combat-warroom-row">
            <div className="game-board-stack game-board-stack-3d combat-warroom-stack">
              <div className="game-board-3d-stage combat-warroom-stage">
              <CombatWarRoomBoard
                cameraProfile="warroom"
                immersive={warRoomImmersive}
                warRoomMobilePerformance
                fen={fen}
                onSquareClick={handleSquareClick}
                onSquareDoubleClick={handleSquareDoubleClick}
                selectedSquare={selected}
                legalTargets={legalTargets}
                animate={pendingAnim}
                pieceLevels={pieceLevels}
                pieceRankLevels={pieceLevels}
                pieceXp={pieceXp}
                pieceVeteranMarks={pieceVeteranMarks}
                squareClassName={(square) => roster?.pieces?.[registry?.[square]?.rosterKey]?.mercenary ? 'combat-square-mercenary' : ''}
                squareBadge={(square) => roster?.pieces?.[registry?.[square]?.rosterKey]?.mercenary ? <span className="deployment-mercenary-badge" title="Unidad mercenaria">M</span> : null}
                orientation={humanColor === 'b' ? 'black' : 'white'}
                themeOverride={battleTheme}
                checkSquare={checkedKingSquare(fen)}
              />
              </div>
            </div>

            <aside className="game-side-column combat-game-side-column combat-warroom-ops" aria-label="Registro de batalla y estado táctico">
              <details className="notation-panel combat-tactical-panel combat-warroom-log-drawer">
                <summary className="combat-warroom-log-summary"><h3>Registro de batalla</h3><b>{log.length}</b></summary>
                <div className="combat-warroom-log-body">
                <header className="combat-tactical-heading">
                  <span className="game-chat-kicker">COMBAT CHESS</span>
                  <strong>Bitácora táctica</strong>
                </header>

                <div className="combat-tactical-summary-grid">
                  <div><b>{armySummary.aliveCount}</b><span>en pie</span></div>
                  <div><b>{armySummary.totalLevel}</b><span>nivel total</span></div>
                  <div className={armySummary.totalXp > 0 ? 'has-xp' : ''}><b>{armySummary.totalXp}</b><span>XP libre</span></div>
                </div>

                <div className="combat-log-section">
                  <div className="combat-panel-section-title">
                    <span>Bitácora táctica</span>
                    <small>{log.length}</small>
                  </div>
                  <div className="notation-list combat-log-list">
                    {log.length === 0 && <p className="notation-empty">Todavía no hubo ninguna captura.</p>}
                    {log.map((entry, i) => {
                      const glyph = entry.kind === 'capture' ? '✦'
                        : entry.kind === 'casualty' ? '✕'
                          : entry.kind === 'boss' ? '♚'
                            : entry.kind === 'technique' ? '◆'
                              : entry.kind === 'miss' ? '↯' : '·';
                      const label = entry.kind === 'capture' ? 'CAPTURA'
                        : entry.kind === 'casualty' ? 'BAJA PROPIA'
                          : entry.kind === 'boss' ? 'BOSS'
                            : entry.kind === 'technique' ? 'TÉCNICA'
                              : entry.kind === 'miss' ? 'ESQUIVE' : 'EVENTO';
                      return (
                        <div key={i} className={`combat-log-entry ${entry.tone} kind-${entry.kind || 'event'}`}>
                          <span className="combat-log-glyph" aria-hidden="true">{glyph}</span>
                          <span><small>{label}</small>{entry.text}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <details className="combat-quick-help">
                  <summary>Ayuda rápida</summary>
                  <div className="combat-legend">
                    <p className="hint-text"><b>Fuerza</b>: ayuda a acertar el ataque.</p>
                    <p className="hint-text"><b>Velocidad</b>: ayuda a esquivar cuando te atacan.</p>
                    <p className="hint-text">Doble clic en una pieza para inspeccionarla. El XP se gasta entre batallas desde Tu ejército.</p>
                    <p className="hint-text">La insignia verde avisa de XP sin gastar.</p>
                    <p className="hint-text combat-level-legend">
                      <span className="legend-swatch bronze" /> nivel 2-3 · <span className="legend-swatch silver" /> nivel 4-5 ·{' '}
                      <span className="legend-swatch gold" /> nivel 6+
                    </p>
                  </div>
                </details>
                </div>
              </details>
            </aside>
          </div>

          {phase === 'battle' && (
            <div className="game-controls combat-game-controls combat-warroom-controls">
              <button
                type="button"
                className="secondary-btn combat-warroom-exit"
                aria-label="Salir"
                onClick={combatVariant === 'roguelike' ? suspendBattleToMenu : backToSetup}
                title={combatVariant === 'roguelike' ? 'Guarda la batalla actual y vuelve al menú. La campaña sigue activa.' : 'Salir del combate.'}
              >
                <span aria-hidden="true">←</span> Salir
              </button>
              {cpuRetryNeeded && (
                <button type="button" className="primary-btn combat-warroom-retry" onClick={retryCpuTurn}>
                  Reintentar CPU
                </button>
              )}
              {combatVariant === 'roguelike' && (
                <details className="combat-warroom-action-menu">
                  <summary aria-label="Opciones de batalla" title="Opciones de batalla">⋯</summary>
                  <div className="combat-warroom-action-popover">
                    <button
                      type="button"
                      className="secondary-btn combat-retreat-btn"
                      title="Termina esta batalla como retirada y conserva las bajas que ya se hayan producido."
                      onClick={() => {
                        const confirmed = window.confirm(
                          '¿Abandonar batalla y asumir bajas?\n\nLa batalla terminará como retirada. Las piezas ya caídas quedarán registradas como bajas y la campaña continuará con esas consecuencias.',
                        );
                        if (confirmed) retireBattle();
                      }}
                    >
                      Abandonar batalla y asumir bajas
                    </button>
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      </div>

      {phase === 'over' && (
        <div className="endgame-banner combat-warroom-debrief">
          <h2>{statusLabel}</h2>
          <p>
            {status === 'checkmate'
              ? localChess.turn() === humanColor ? 'Ganó la CPU.' : '¡Has ganado el combate!'
              : 'Terminó en tablas.'}
          </p>
          {battleRecap?.debrief ? (
            <CombatDebrief debrief={battleRecap.debrief} compact onViewBattle={onViewBattle} />
          ) : battleRecap ? (
            <p className="hint-text combat-recap-line">
              {battleRecap.survivorCount}/{battleRecap.totalCount} piezas sobrevivieron
              {battleRecap.creditsGained > 0 ? ` · +${battleRecap.creditsGained} créditos` : ''}
            </p>
          ) : null}
          <button className="primary-btn" onClick={backToSetup}>Volver a jugar</button>
          {battleRecap && !battleRecap.debrief && onViewBattle && (
            <button
              type="button"
              className="secondary-btn"
              style={{ marginTop: '0.6rem' }}
              onClick={() => onViewBattle(battleRecap.record)}
            >
              Ver análisis de esta batalla →
            </button>
          )}
        </div>
      )}

      {pendingPromotion && <PromotionModal onChoose={choosePromotion} />}
      {pendingAttack && (
        <AttackConfirmModal
          attacker={pendingAttack.attacker}
          defender={pendingAttack.defender}
          chance={pendingAttack.chance}
          onConfirm={confirmAttack}
          onCancel={cancelAttack}
          techniqueLabel={pendingAttack.techniqueLabel}
        />
      )}
      {infoPiece && (
        <PieceInfoModal
          piece={infoPiece}
          canManage={infoPiece.color === humanColor && phase !== 'battle'}
          duringBattle={infoPiece.color === humanColor && phase === 'battle'}
          onBuy={handleBuyStat}
          onUseTechnique={handleActivateTechnique}
          techniqueTargetCount={infoTechniqueTargets?.length || 0}
          unitRecord={infoUnitRecord}
          onClose={() => setInfoSquare(null)}
        />
      )}
    </div>
  );
}
