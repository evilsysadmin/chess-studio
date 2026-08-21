import React from 'react';
import Board from './Board.jsx';
import PromotionModal from './PromotionModal.jsx';
import PieceInfoModal from './PieceInfoModal.jsx';
import AttackConfirmModal from './AttackConfirmModal.jsx';

export default function CombatBattleView({
  onExit, onViewBattle, phase, localChess, status, statusLabel, statusClass, statusText,
  fen, selected, handleSquareClick, handleSquareDoubleClick, legalTargets, pendingAnim,
  pieceLevels, pieceXp, humanColor, busy, backToSetup, armySummary, log, battleRecap,
  pendingPromotion, choosePromotion, pendingAttack, confirmAttack, cancelAttack, infoPiece,
  handleBuyStat, setInfoSquare, retireBattle, combatVariant, bossHp, bossPhase, bossConfig,
}) {
  return (
    <div>
      <div className="game-layout">
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
          <Board
            fen={fen}
            onSquareClick={handleSquareClick}
            onSquareDoubleClick={handleSquareDoubleClick}
            selectedSquare={selected}
            legalTargets={legalTargets}
            animate={pendingAnim}
            pieceLevels={pieceLevels}
            pieceXp={pieceXp}
            orientation={humanColor === 'b' ? 'black' : 'white'}
          />
          <div className="game-controls">
            <button className="secondary-btn" onClick={combatVariant === 'roguelike' ? retireBattle : backToSetup}>
              {combatVariant === 'roguelike' ? 'Abandonar intento' : 'Salir del combate'}
            </button>
          </div>
        </div>

        <aside className="notation-panel combat-log-panel">
          <div className="army-summary-line">
            <span>{armySummary.aliveCount} piezas en pie</span>
            <span>·</span>
            <span>nivel total <b>{armySummary.totalLevel}</b></span>
            {armySummary.totalXp > 0 && (
              <>
                <span>·</span>
                <span>XP sin gastar <b>{armySummary.totalXp}</b></span>
              </>
            )}
          </div>
          <h3>Registro de combate</h3>
          <div className="notation-list combat-log-list">
            {log.length === 0 && <p className="notation-empty">Todavía no hubo ninguna captura.</p>}
            {log.map((entry, i) => (
              <p key={i} className={`combat-log-entry ${entry.tone}`}>{entry.text}</p>
            ))}
          </div>
          <div className="combat-legend">
            <p className="hint-text"><b>Fuerza</b>: ayuda a acertar el ataque.</p>
            <p className="hint-text"><b>Velocidad</b>: ayuda a esquivar cuando te atacan.</p>
            <p className="hint-text">Toca dos veces una pieza para inspeccionarla. El XP se gasta entre batallas desde Tu ejército.</p>
            <p className="hint-text">La insignia verde (arriba a la izquierda) avisa que a esa pieza le quedó XP sin gastar.</p>
            <p className="hint-text" style={{ marginTop: '0.3rem' }}>
              <span className="legend-swatch bronze" /> nivel 2-3 · <span className="legend-swatch silver" /> nivel 4-5 ·{' '}
              <span className="legend-swatch gold" /> nivel 6+
            </p>
          </div>
        </aside>
      </div>

      {phase === 'over' && (
        <div className="endgame-banner">
          <h2>{statusLabel}</h2>
          <p>
            {status === 'checkmate'
              ? localChess.turn() === humanColor ? 'Ganó la CPU.' : '¡Ganaste el combate!'
              : 'Terminó en tablas.'}
          </p>
          {battleRecap && (
            <p className="hint-text combat-recap-line">
              {battleRecap.survivorCount}/{battleRecap.totalCount} piezas sobrevivieron
              {battleRecap.xpGained > 0 ? ` · +${battleRecap.xpGained} XP de combate` : ''}
            </p>
          )}
          <button className="primary-btn" onClick={backToSetup}>Volver a jugar</button>
          {battleRecap && onViewBattle && (
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
        />
      )}
      {infoPiece && (
        <PieceInfoModal
          piece={infoPiece}
          canManage={infoPiece.color === humanColor && phase !== 'battle'}
          duringBattle={infoPiece.color === humanColor && phase === 'battle'}
          onBuy={handleBuyStat}
          onClose={() => setInfoSquare(null)}
        />
      )}
    </div>
  );
}
