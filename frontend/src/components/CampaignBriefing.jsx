import React, { useMemo, useState } from 'react';
import {
  campaignIntelBriefing,
  nextCampaignIntelTier,
} from '../combatCampaign.js';
import MechanicTutorialModal from './MechanicTutorialModal.jsx';
import { loadMechanicTutorialProgress } from '../mechanicTutorials.js';

export default function CampaignBriefing({ campaign, node, onBuyIntel, onContinue, onRetire }) {
  const intel = useMemo(() => campaignIntelBriefing(campaign, node), [campaign, node]);
  const nextTier = useMemo(() => nextCampaignIntelTier(campaign, node?.id), [campaign, node]);
  const [showTutorial, setShowTutorial] = useState(() => !loadMechanicTutorialProgress()?.['combat-intelligence']?.seen);
  if (!node || !intel) return null;
  const canBuy = nextTier && campaign.operationalCredits >= nextTier.cost;

  return (
    <div className="campaign-briefing-card">
      <div className="campaign-briefing-heading">
        <div>
          <span className="section-label">BRIEFING TÁCTICO · SECTOR {node.stage}</span>
          <h3 title={node.description}>{node.label}</h3>
          <p className="campaign-briefing-command">Evalúa intel y despliega.</p>
        </div>
        <button type="button" className="context-help-btn" onClick={() => setShowTutorial(true)} aria-label="Tutorial de inteligencia">?</button>
      </div>

      <div className="campaign-briefing-grid">
        <div className="campaign-intel-panel">
          <span className="campaign-intel-kicker">INTEL · NIVEL {intel.level}/3</span>
          <strong>{intel.levelLabel}</strong>
          <dl>
            <div><dt>Amenaza</dt><dd>{intel.level >= 1 ? `${intel.threatBand} · CPU ${intel.threatRange}` : 'No evaluada'}</dd></div>
            <div><dt>Dificultad exacta</dt><dd>{intel.exactDifficulty ?? 'Oculta'}</dd></div>
            <div><dt>Modificador</dt><dd>{intel.modifierLabel || 'Oculto'}</dd></div>
            <div><dt>Composición</dt><dd title={intel.modifierDescription || 'Sin reconocimiento suficiente'}>{intel.modifierDescription || 'Oculta'}</dd></div>
            {intel.bossHp != null && <div><dt>Boss</dt><dd>Rey con {intel.bossHp} HP</dd></div>}
          </dl>
        </div>

        <div className="campaign-intel-buy">
          <span>Créditos operativos</span>
          <strong>{campaign.operationalCredits}</strong>
          {nextTier ? (
            <>
              <p title={`Subir la inteligencia a ${nextTier.label}`}>{nextTier.label} · <b>{nextTier.cost}</b> cr.</p>
              <button type="button" className="secondary-btn" disabled={!canBuy} onClick={onBuyIntel}>
                {canBuy ? `Comprar intel · −${nextTier.cost}` : `Faltan ${nextTier.cost - campaign.operationalCredits} créditos`}
              </button>
            </>
          ) : (
            <p title="No hay más niveles de inteligencia disponibles.">Intel máxima.</p>
          )}
        </div>
      </div>

      <div className="campaign-briefing-actions">
        <button type="button" className="secondary-btn" onClick={onRetire}>Retirar operación</button>
        <button type="button" className="primary-btn" onClick={onContinue}>Ir a preparar despliegue →</button>
      </div>

      {showTutorial && <MechanicTutorialModal tutorialId="combat-intelligence" onClose={() => setShowTutorial(false)} />}
    </div>
  );
}
