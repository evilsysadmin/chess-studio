import React from 'react';
import {
  BASE_STATS,
  statsFor,
  derivedLevel,
  levelTier,
  costForNextPoint,
  reviveCost,
  CANONICAL_ROSTER_SLOTS,
  rosterSlotKey,
  STRENGTH_POINT_VALUE,
  SPEED_POINT_VALUE,
} from '../combat.js';
import { useEscapeToClose } from '../useEscapeToClose.js';

export default function ArmyScreen({ roster, onBuy, onRevive, onClose }) {
  useEscapeToClose(onClose);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="army-card" onClick={(e) => e.stopPropagation()}>
        <button className="piece-info-close" onClick={onClose} aria-label="Cerrar">×</button>
        <h3>Tu ejército</h3>
        <p className="hint-text" style={{ marginBottom: '0.4rem' }}>
          El progreso guardado de tus 15 piezas (el rey no cuenta — sigue las reglas normales de ajedrez, sin
          nivel ni XP), sea cual sea el color que te toque jugar. Puedes gastar XP acá
          mismo, sin esperar a la próxima batalla.
        </p>
        <p className="hint-text army-combat-xp" style={{ marginBottom: '1rem' }}>
          XP de combate disponible: <b>{roster.combatXp}</b> · se usa para revivir piezas caídas.
        </p>

        <div className="army-list">
          {CANONICAL_ROSTER_SLOTS.filter((slot) => slot.type !== 'k').map((slot) => {
            const key = rosterSlotKey(slot);
            const saved = roster.pieces[key];
            // Defensivo: solo cuenta como "caída, revivible" si de verdad
            // invirtió algún punto — revivir en nivel 1 devolvería la mitad
            // de 0. `loadRoster` ya sanea esto al cargar, pero este chequeo
            // acá evita mostrar un botón de revivir sin sentido aunque algo
            // se cuele por otro lado.
            const isDead = saved?.alive === false && (saved.strengthPoints || 0) + (saved.speedPoints || 0) > 0;

            if (isDead) {
              const lastLevel = 1 + (saved.strengthPoints || 0) + (saved.speedPoints || 0);
              const cost = reviveCost(slot.type);
              return (
                <div className="army-row army-row-dead" key={key}>
                  <span className="army-aura tier-dead">✕</span>
                  <div className="army-row-info">
                    <span className="army-row-name">
                      {BASE_STATS[slot.type].name} <span className="army-row-file">({slot.file})</span>
                    </span>
                    <span className="army-row-stats army-row-urgent">
                      Caída · era nivel {lastLevel} · revive a la mitad ahora, o se pierde para siempre
                    </span>
                  </div>
                  <div className="army-row-buy">
                    <button
                      type="button"
                      className="secondary-btn"
                      disabled={roster.combatXp < cost}
                      onClick={() => onRevive(key, slot.type)}
                    >
                      Revivir ({cost} XP)
                    </button>
                  </div>
                </div>
              );
            }

            const piece = { type: slot.type, ...(saved || { strengthPoints: 0, speedPoints: 0, bankedXp: 0 }) };
            const stats = statsFor(piece);
            const level = derivedLevel(piece);
            const tier = levelTier(level);
            const strCost = costForNextPoint(piece.strengthPoints);
            const spdCost = costForNextPoint(piece.speedPoints);

            return (
              <div className="army-row" key={key}>
                <span className={`army-aura tier-${tier}`}>{level}</span>
                <div className="army-row-info">
                  <span className="army-row-name">
                    {BASE_STATS[slot.type].name} <span className="army-row-file">({slot.file})</span>
                  </span>
                  <span className="army-row-stats">
                    Fuerza {stats.strength.toFixed(1)} · Velocidad {stats.speed.toFixed(1)} · XP {piece.bankedXp}
                  </span>
                </div>
                <div className="army-row-buy">
                  <button
                    type="button"
                    className="secondary-btn"
                    disabled={piece.bankedXp < strCost}
                    onClick={() => onBuy(key, 'strength')}
                    title="Comprar un punto de fuerza"
                  >
                    <span>+F ({strCost})</span>
                    <span className="buy-preview">→ {(stats.strength + STRENGTH_POINT_VALUE).toFixed(1)}</span>
                  </button>
                  <button
                    type="button"
                    className="secondary-btn"
                    disabled={piece.bankedXp < spdCost}
                    onClick={() => onBuy(key, 'speed')}
                    title="Comprar un punto de velocidad"
                  >
                    <span>+V ({spdCost})</span>
                    <span className="buy-preview">→ {(stats.speed + SPEED_POINT_VALUE).toFixed(1)}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
