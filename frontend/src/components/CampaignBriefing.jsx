import React, { useMemo, useState } from 'react';
import {
  campaignIntelBriefing,
  nextCampaignIntelTier,
} from '../combatCampaign.js';
import MechanicTutorialModal from './MechanicTutorialModal.jsx';
import CampaignOperationSteps from './CampaignOperationSteps.jsx';
import { loadMechanicTutorialProgress } from '../mechanicTutorials.js';

export default function CampaignBriefing({ campaign, node, onBuyIntel, onContinue, onRetire }) {
  const intel = useMemo(() => campaignIntelBriefing(campaign, node), [campaign, node]);
  const nextTier = useMemo(() => nextCampaignIntelTier(campaign, node?.id), [campaign, node]);
  const [showTutorial, setShowTutorial] = useState(() => !loadMechanicTutorialProgress()?.['combat-intelligence']?.seen);
  if (!node || !intel) return null;
  const canBuy = nextTier && campaign.operationalCredits >= nextTier.cost;

  return (
    <div className="campaign-briefing-card campaign-operation-stage">
      <CampaignOperationSteps active="briefing" />

      <div className="campaign-briefing-heading campaign-operation-heading">
        <div>
          <span className="section-label">OPERACIÓN · SECTOR {node.stage}</span>
          <h3 title={node.description}>{node.label}</h3>
          <p className="campaign-briefing-command">Primero mira qué cambia en este combate. La inteligencia sólo añade precisión.</p>
        </div>
        <button type="button" className="context-help-btn" onClick={() => setShowTutorial(true)} aria-label="Tutorial de inteligencia">?</button>
      </div>

      <div className="campaign-rule-alert" aria-label="Regla visible del encuentro">
        <span>QUÉ CAMBIA EN ESTA BATALLA</span>
        <strong>{intel.modifierLabel}</strong>
        <p>{intel.modifierDescription}</p>
      </div>

      <div className="campaign-briefing-grid simplified">
        <section className="campaign-intel-panel" aria-label="Inteligencia de la operación">
          <span className="campaign-intel-kicker">INTELIGENCIA · {intel.levelLabel}</span>
          <dl>
            <div><dt>Amenaza</dt><dd>{intel.level >= 1 ? `${intel.threatBand} · CPU ${intel.threatRange}` : 'Compra Contacto para estimarla'}</dd></div>
            {intel.exactDifficulty != null && <div><dt>CPU exacta</dt><dd>{intel.exactDifficulty}</dd></div>}
            {intel.bossHp != null && <div><dt>Boss</dt><dd>Rey con {intel.bossHp} HP</dd></div>}
          </dl>
          <small className="campaign-intel-note">La regla del tablero de arriba siempre es pública. La intel revela amenaza y detalles, no reglas ocultas.</small>
        </section>

        <section className="campaign-intel-buy" aria-label="Compra de inteligencia">
          <span>CRÉDITOS OPERATIVOS</span>
          <strong>{campaign.operationalCredits}</strong>
          {nextTier ? (
            <>
              <p title={`Subir la inteligencia a ${nextTier.label}`}>Siguiente nivel: {nextTier.label} · <b>{nextTier.cost}</b> cr.</p>
              <button type="button" className="secondary-btn" disabled={!canBuy} onClick={onBuyIntel}>
                {canBuy ? `Comprar inteligencia · −${nextTier.cost}` : `Faltan ${nextTier.cost - campaign.operationalCredits} créditos`}
              </button>
            </>
          ) : (
            <p title="No hay más niveles de inteligencia disponibles.">Inteligencia máxima.</p>
          )}
        </section>
      </div>

      <div className="campaign-operation-primary-zone campaign-briefing-primary-zone">
        <div>
          <span>SIGUIENTE</span>
          <small>Prepara la fuerza que quieres arriesgar.</small>
        </div>
        <button type="button" className="primary-btn campaign-main-cta" onClick={onContinue}>PREPARAR DESPLIEGUE →</button>
      </div>

      <div className="campaign-briefing-actions campaign-secondary-actions">
        <button type="button" className="campaign-retire-link" onClick={onRetire}>Retirar operación</button>
      </div>

      {showTutorial && <MechanicTutorialModal tutorialId="combat-intelligence" onClose={() => setShowTutorial(false)} />}
    </div>
  );
}
