import Board from './Board.jsx';
import MusicPlayer from './MusicPlayer.jsx';
import PromotionModal from './PromotionModal.jsx';
import PieceInfoModal from './PieceInfoModal.jsx';
import AttackConfirmModal from './AttackConfirmModal.jsx';
import CombatDebrief from './CombatDebrief.jsx';

export default function CombatBattleView({
  onExit, onViewBattle, phase, localChess, status, statusLabel, statusClass, statusText,
  fen, selected, handleSquareClick, handleSquareDoubleClick, legalTargets, pendingAnim,
  pieceLevels, pieceXp, pieceVeteranMarks, humanColor, busy, backToSetup, armySummary, log, battleRecap,
  pendingPromotion, choosePromotion, pendingAttack, confirmAttack, cancelAttack, infoPiece, infoUnitRecord,
  handleBuyStat, handleActivateTechnique, infoTechniqueTargets, setInfoSquare, suspendBattleToMenu, retireBattle, combatVariant, bossHp, bossPhase, bossConfig,
}) {
  return (
    <div className="combat-battle-screen">
      <div className="game-layout combat-game-layout">
        <div className="board-column">
          <div className={`status-line ${statusClass}`}>{statusText}</div>

          {bossConfig && bossHp != null && (
            <div className="roguelike-boss-hud" role="status" aria-label={`Rey Boss: ${bossHp} de ${bossConfig.maxHp} puntos de vida`}>
              <span className="roguelike-boss-kicker">BOSS · FASE {bossPhase}</span>
              <strong>{bossConfig.label}</strong>
              <span className="roguelike-boss-hearts" aria-hidden="true">
                {Array.from({ length: bossConfig.maxHp }, (_, i) => (i < bossHp ? '♥' : '♡')).join(' ')}
              </span>
              <small>{bossHp}/{bossConfig.maxHp} HP · jaque = 1 · mate = 2</small>
            </div>
          )}

          <div className="board-live-row combat-board-live-row">
            <aside className="game-music-rail" aria-label="Música de la batalla">
              <MusicPlayer forceExpanded />
            </aside>

            <div className="game-board-stack">
              <Board
                fen={fen}
                onSquareClick={handleSquareClick}
                onSquareDoubleClick={handleSquareDoubleClick}
                selectedSquare={selected}
                legalTargets={legalTargets}
                animate={pendingAnim}
                pieceLevels={pieceLevels}
                pieceXp={pieceXp}
                pieceVeteranMarks={pieceVeteranMarks}
                orientation={humanColor === 'b' ? 'black' : 'white'}
              />
            </div>

            <aside className="game-side-column combat-game-side-column" aria-label="Registro de batalla y estado táctico">
              <section className="notation-panel combat-tactical-panel">
                <header className="combat-tactical-heading">
                  <span className="game-chat-kicker">COMBAT CHESS</span>
                  <h3>Registro de batalla</h3>
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
              </section>
            </aside>
          </div>

          {phase === 'battle' && (
            <div className="game-controls combat-game-controls">
              <button
                className="secondary-btn"
                onClick={combatVariant === 'roguelike' ? suspendBattleToMenu : backToSetup}
                title={combatVariant === 'roguelike' ? 'Guarda la batalla actual y vuelve al menú. La campaña sigue activa.' : undefined}
              >
                {combatVariant === 'roguelike' ? 'Salir al menú' : 'Salir del combate'}
              </button>
              {combatVariant === 'roguelike' && (
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
              )}
            </div>
          )}
        </div>
      </div>

      {phase === 'over' && (
        <div className="endgame-banner">
          <h2>{statusLabel}</h2>
          <p>
            {status === 'checkmate'
              ? localChess.turn() === humanColor ? 'Ganó la CPU.' : '¡Ganaste el combate!'
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
