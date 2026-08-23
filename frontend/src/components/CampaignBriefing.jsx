import { useMemo, useState } from 'react';
import {
  campaignIntelBriefing,
  nextCampaignIntelTier,
} from '../combatCampaign.js';
import MechanicTutorialModal from './MechanicTutorialModal.jsx';
import CampaignOperationSteps from './CampaignOperationSteps.jsx';
import { loadMechanicTutorialProgress } from '../mechanicTutorials.js';

export default function CampaignBriefing({ campaign, node, armySummary, onBuyIntel, onContinue, onRetire }) {
  const intel = useMemo(() => campaignIntelBriefing(campaign, node), [campaign, node]);
  const nextTier = useMemo(() => nextCampaignIntelTier(campaign, node?.id), [campaign, node]);
  const [showTutorial, setShowTutorial] = useState(() => !loadMechanicTutorialProgress()?.['combat-intelligence']?.seen);
  if (!node || !intel) return null;
  const canBuy = nextTier && campaign.operationalCredits >= nextTier.cost;

  return (
    <div className="campaign-briefing-card campaign-operation-stage simplified-stage">
      <CampaignOperationSteps active="briefing" />

      <div className="campaign-briefing-heading campaign-operation-heading simplified-heading">
        <div>
          <span className="section-label">SECTOR {node.stage}</span>
          <h3 title={node.description}>{node.label}</h3>
          <p className="campaign-briefing-command">Esto es lo único que necesitas saber antes de preparar tus piezas.</p>
        </div>
        <button type="button" className="context-help-btn" onClick={() => setShowTutorial(true)} aria-label="Tutorial de inteligencia">?</button>
      </div>


      <div className="campaign-briefing-at-glance" aria-label="Resumen táctico">
        <span><small>Amenaza</small><b>{intel.level >= 1 ? intel.threatBand : 'Sin estimar'}</b></span>
        <span><small>Ejército</small><b>{armySummary ? `${armySummary.assignedCount}/${armySummary.totalSlots}` : '—'}</b></span>
        <span><small>Intel</small><b>{intel.levelLabel}</b></span>
      </div>

      <div className="campaign-rule-alert" aria-label="Regla visible del encuentro">
        <span>EN ESTA BATALLA</span>
        <strong>{intel.modifierLabel}</strong>
        <p>{intel.modifierDescription}</p>
      </div>

      <div className="campaign-operation-primary-zone campaign-briefing-primary-zone friendly-primary-zone">
        <div>
          <span>SIGUIENTE</span>
          <small>Elige qué unidades quieres llevar.</small>
        </div>
        <button type="button" className="primary-btn campaign-main-cta" onClick={onContinue}>PREPARAR EJÉRCITO →</button>
      </div>

      <details className="campaign-optional-panel campaign-intel-optional">
        <summary>Ver informe completo</summary>
        <p className="hint-text">Opcional: precisión de amenaza, créditos, boss y compra de inteligencia.</p>
        <div className="campaign-briefing-grid simplified">
          <section className="campaign-intel-panel" aria-label="Inteligencia de la operación">
            <span className="campaign-intel-kicker">INTELIGENCIA · {intel.levelLabel}</span>
            <dl>
              <div><dt>Amenaza</dt><dd>{intel.level >= 1 ? `${intel.threatBand} · CPU ${intel.threatRange}` : 'Aún sin estimar'}</dd></div>
              {intel.exactDifficulty != null && <div><dt>CPU exacta</dt><dd>{intel.exactDifficulty}</dd></div>}
              {intel.bossHp != null && <div><dt>Boss</dt><dd>Rey con {intel.bossHp} HP</dd></div>}
            </dl>
          </section>

          <section className="campaign-intel-buy" aria-label="Compra de inteligencia">
            <span>CRÉDITOS</span>
            <strong>{campaign.operationalCredits}</strong>
            {nextTier ? (
              <>
                <p>Siguiente nivel: {nextTier.label} · <b>{nextTier.cost}</b> cr.</p>
                <button type="button" className="secondary-btn" disabled={!canBuy} onClick={onBuyIntel}>
                  {canBuy ? `Comprar inteligencia · −${nextTier.cost}` : `Faltan ${nextTier.cost - campaign.operationalCredits} créditos`}
                </button>
              </>
            ) : (
              <p>Inteligencia máxima.</p>
            )}
          </section>
        </div>
      </details>

      <div className="campaign-briefing-actions campaign-secondary-actions">
        <button type="button" className="campaign-retire-link" onClick={onRetire}>Retirar operación</button>
      </div>

      {showTutorial && <MechanicTutorialModal tutorialId="combat-intelligence" onClose={() => setShowTutorial(false)} />}
    </div>
  );
}
