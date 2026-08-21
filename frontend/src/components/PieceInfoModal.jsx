import React from 'react';
import { BASE_STATS, statsFor, costForNextPoint, derivedLevel, STRENGTH_POINT_VALUE, SPEED_POINT_VALUE } from '../combat.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { techniqueById } from '../combatTechniques.js';
import { unitDecorations } from '../combatUnitService.js';
import { pieceRankForLevel } from '../combatRanks.js';

export default function PieceInfoModal({ piece, canManage, duringBattle, onBuy, onUseTechnique, techniqueTargetCount = 0, unitRecord = null, onClose }) {
  useEscapeToClose(onClose);
  if (!piece) return null;
  const isKing = piece.type === 'k';
  const stats = statsFor(piece);
  const base = BASE_STATS[piece.type];
  const colorLabel = piece.color === 'w' ? 'Blancas' : 'Negras';
  const bankedXp = piece.bankedXp || 0;
  const strengthCost = costForNextPoint(piece.strengthPoints);
  const speedCost = costForNextPoint(piece.speedPoints);
  const strengthPreview = (stats.strength + STRENGTH_POINT_VALUE).toFixed(1);
  const speedPreview = (stats.speed + SPEED_POINT_VALUE).toFixed(1);
  const equippedTechnique = techniqueById(piece.equippedTechnique);
  const militaryRank = !isKing ? pieceRankForLevel(derivedLevel(piece)) : null;
  const individualDecorations = unitRecord ? unitDecorations(unitRecord) : [];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="piece-info-card" onClick={(e) => e.stopPropagation()}>
        <button className="piece-info-close" onClick={onClose} aria-label="Cerrar">×</button>
        <span className="eyebrow">{colorLabel}</span>
        <h3>{piece.alias ? `${piece.alias} · ` : ''}{base.name}{isKing ? '' : ` · nivel ${derivedLevel(piece)}`}</h3>

        <div className="piece-info-stats">
          <div className="piece-info-stat">
            <span>Fuerza</span>
            <b>{stats.strength.toFixed(1)}</b>
          </div>
          <div className="piece-info-stat">
            <span>Velocidad</span>
            <b>{stats.speed.toFixed(1)}</b>
          </div>
        </div>

        {!isKing && unitRecord && (
          <div className="piece-unit-service-card">
            <div className="piece-unit-service-heading">
              <strong>{militaryRank.short} · {militaryRank.label}</strong>
              <span>{unitRecord.stats?.battles || 0} batallas</span>
            </div>
            <p>
              {unitRecord.stats?.survivals || 0} supervivencias · {unitRecord.stats?.kills || 0} bajas
              {(unitRecord.stats?.bestSurvivalStreak || 0) > 0 ? ` · mejor racha ${unitRecord.stats.bestSurvivalStreak}` : ''}
              {(unitRecord.stats?.revives || 0) > 0 ? ` · revivida ${unitRecord.stats.revives} vez${unitRecord.stats.revives === 1 ? '' : 'es'}` : ''}
            </p>
            {individualDecorations.length > 0 && (
              <div className="piece-unit-medals">
                {individualDecorations.map((medal) => (
                  <span key={medal.id} title={medal.description}>✦ {medal.short} · {medal.label}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {isKing ? (
          <p className="hint-text">
            El rey no gana ni gasta XP — sigue las reglas normales de ajedrez, con jaque y jaque mate estándar.
          </p>
        ) : canManage ? (
          <>
            <p className="hint-text piece-info-xp-line">XP disponible: <b>{bankedXp}</b></p>
            <div className="piece-info-buy-row">
              <button
                type="button"
                className="secondary-btn"
                disabled={bankedXp < strengthCost}
                onClick={() => onBuy('strength')}
              >
                <span>+1 Fuerza ({strengthCost} XP)</span>
                <span className="buy-preview">→ {strengthPreview}</span>
              </button>
              <button
                type="button"
                className="secondary-btn"
                disabled={bankedXp < speedCost}
                onClick={() => onBuy('speed')}
              >
                <span>+1 Velocidad ({speedCost} XP)</span>
                <span className="buy-preview">→ {speedPreview}</span>
              </button>
            </div>
          </>
        ) : duringBattle ? (
          <>
            <p className="hint-text">
              Esta XP se gasta al terminar la batalla, no a mitad de combate — así no puedes reaccionar
              en caliente subiendo justo la pieza que más te conviene en este instante.
            </p>
            {equippedTechnique && (
              <div className="piece-technique-card">
                <strong>{equippedTechnique.label} · {piece.techniqueUsed ? 'USADA' : '1 USO'}</strong>
                <span>{equippedTechnique.description}</span>
                <button
                  type="button"
                  className="primary-btn"
                  disabled={piece.techniqueUsed || techniqueTargetCount === 0}
                  onClick={onUseTechnique}
                >
                  {piece.techniqueUsed ? 'Técnica agotada' : techniqueTargetCount > 0 ? `Usar técnica · ${techniqueTargetCount} objetivo${techniqueTargetCount === 1 ? '' : 's'}` : 'Sin objetivo válido ahora'}
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="hint-text">Es una pieza rival — no puedes gastar XP en ella.</p>
        )}
      </div>
    </div>
  );
}
