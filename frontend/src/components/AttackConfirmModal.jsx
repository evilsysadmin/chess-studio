import React from 'react';
import { BASE_STATS, derivedLevel } from '../combat.js';
import { useEscapeToClose } from '../useEscapeToClose.js';

export default function AttackConfirmModal({ attacker, defender, chance, techniqueLabel, onConfirm, onCancel }) {
  useEscapeToClose(onCancel);
  const pct = Math.round(chance * 100);
  const tone = pct >= 60 ? 'good' : pct >= 40 ? 'neutral' : 'bad';
  const attackerLabel = attacker ? `${attacker.alias ? `${attacker.alias}, ` : ''}${BASE_STATS[attacker.type].name} (nv.${derivedLevel(attacker)})` : 'Tu pieza';
  const defenderLabel = defender ? `${defender.alias ? `${defender.alias}, ` : ''}${BASE_STATS[defender.type].name} (nv.${derivedLevel(defender)})` : 'la pieza rival';

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="attack-confirm-card" role="dialog" aria-modal="true" aria-label="Confirmar ataque" onClick={(e) => e.stopPropagation()}>
        {techniqueLabel && <span className="eyebrow">TÉCNICA · {techniqueLabel}</span>}
        <p className="attack-confirm-title">{attackerLabel} ataca a {defenderLabel}</p>
        <div className="attack-confirm-chance">
          <span className={`attack-confirm-pct ${tone}`}>{pct}%</span>
          <span className="attack-confirm-pct-label">de acierto</span>
        </div>
        <div className="attack-confirm-buttons">
          <button className="secondary-btn" onClick={onCancel}>Cancelar</button>
          <button className="primary-btn" onClick={onConfirm}>Atacar</button>
        </div>
      </div>
    </div>
  );
}
