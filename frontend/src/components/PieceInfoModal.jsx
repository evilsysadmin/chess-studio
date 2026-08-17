import React from 'react';
import { BASE_STATS, statsFor, costForNextPoint, derivedLevel, STRENGTH_POINT_VALUE, SPEED_POINT_VALUE } from '../combat.js';
import { useEscapeToClose } from '../useEscapeToClose.js';

export default function PieceInfoModal({ piece, canManage, onBuy, onClose }) {
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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="piece-info-card" onClick={(e) => e.stopPropagation()}>
        <button className="piece-info-close" onClick={onClose} aria-label="Cerrar">×</button>
        <span className="eyebrow">{colorLabel}</span>
        <h3>{base.name}{isKing ? '' : ` · nivel ${derivedLevel(piece)}`}</h3>

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
        ) : (
          <p className="hint-text">Es una pieza rival — no puedes gastar XP en ella.</p>
        )}
      </div>
    </div>
  );
}
