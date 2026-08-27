import { useEffect, useMemo, useState } from 'react';
import {
  campaignIntelBriefing,
  nextCampaignIntelTier,
} from '../combatCampaign.js';
import MechanicTutorialModal from './MechanicTutorialModal.jsx';
import CampaignOperationSteps from './CampaignOperationSteps.jsx';
import { loadMechanicTutorialProgress } from '../mechanicTutorials.js';
import { getToken } from '../auth.js';
import { requestRemoteNarrative } from '../narrativeRemote.js';
import { buildCombatBriefingDossier } from '../aiNarrativeTasks.js';
import { campaignBossForSeed } from '../combatBosses.js';
import ironKing from '../assets/bosses/iron-king.webp';
import nomadKing from '../assets/bosses/nomad-king.webp';
import shadowKing from '../assets/bosses/shadow-king.webp';

const BOSS_SPRITES = { iron: ironKing, nomad: nomadKing, shadow: shadowKing };

export default function CampaignBriefing({ campaign, node, armySummary, onBuyIntel, onContinue, onRetire }) {
  const intel = useMemo(() => campaignIntelBriefing(campaign, node), [campaign, node]);
  const nextTier = useMemo(() => nextCampaignIntelTier(campaign, node?.id), [campaign, node]);
  const [showTutorial, setShowTutorial] = useState(() => !loadMechanicTutorialProgress()?.['combat-intelligence']?.seen);
  const [aiBriefing, setAiBriefing] = useState(null);
  const [aiBriefingLoading, setAiBriefingLoading] = useState(false);
  const aiDossier = useMemo(() => buildCombatBriefingDossier({ campaign, node, intel, armySummary }), [campaign?.operationalCredits, node, intel, armySummary?.assignedCount, armySummary?.totalSlots]);
  const aiFactsKey = JSON.stringify(aiDossier?.facts || {});

  useEffect(() => {
    const token = getToken();
    if (!token || !aiDossier) {
      setAiBriefing(null);
      return undefined;
    }
    let active = true;
    setAiBriefingLoading(true);
    void requestRemoteNarrative(aiDossier, { token, timeoutMs: 8000 })
      .then((text) => { if (active) setAiBriefing(text || null); })
      .catch(() => { if (active) setAiBriefing(null); })
      .finally(() => { if (active) setAiBriefingLoading(false); });
    return () => { active = false; };
  }, [aiFactsKey]);

  if (!node || !intel) return null;
  const canBuy = nextTier && campaign.operationalCredits >= nextTier.cost;
  const boss = node.type === 'boss' ? campaignBossForSeed(campaign.seed) : null;

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
        <span><small>Amenaza</small><b>{intel.threatBand} · Nv. {intel.opponentLevelRange}</b></span>
        <span><small>Ejército</small><b>{armySummary ? `${armySummary.assignedCount}/${armySummary.totalSlots}` : '—'}</b></span>
        <span><small>Intel</small><b>{intel.levelLabel}</b></span>
      </div>

      {boss && (
        <article className="campaign-boss-dossier" aria-label={`Boss: ${boss.label}`}>
          <img src={BOSS_SPRITES[boss.spriteId]} alt="" aria-hidden="true" />
          <div>
            <small>OBJETIVO FINAL</small>
            <strong>{boss.label}</strong>
            <span><b>{boss.mechanicLabel}</b> · {boss.mechanicDescription}</span>
          </div>
        </article>
      )}

      <div className="campaign-rule-alert" aria-label="Regla visible del encuentro">
        <span>EN ESTA BATALLA</span>
        <strong>{boss ? boss.mechanicLabel : intel.modifierLabel}</strong>
        <p>{boss ? boss.mechanicDescription : intel.modifierDescription}</p>
      </div>

      {(aiBriefingLoading || aiBriefing) && (
        <div className={`ai-task-card combat-ai-briefing ${aiBriefingLoading ? 'is-loading' : ''}`} aria-live="polite">
          <small>CONSEJOS // PLAN DE BATALLA</small>
          <p>{aiBriefing || 'Procesando la inteligencia sin añadir tanques imaginarios…'}</p>
        </div>
      )}

      <div className="campaign-operation-primary-zone campaign-briefing-primary-zone friendly-primary-zone">
        <div>
          <span>SIGUIENTE</span>
          <small>Elige qué unidades quieres llevar.</small>
        </div>
        <button type="button" className="primary-btn campaign-main-cta" onClick={onContinue}>PREPARAR EJÉRCITO →</button>
      </div>

      <details className="campaign-optional-panel campaign-intel-optional">
        <summary>Ver informe completo</summary>
        <p className="hint-text">Opcional: precisión de amenaza, suministros, boss y compra de inteligencia.</p>
        <div className="campaign-briefing-grid simplified">
          <section className="campaign-intel-panel" aria-label="Inteligencia de la operación">
            <span className="campaign-intel-kicker">INTELIGENCIA · {intel.levelLabel}</span>
            <dl>
              <div><dt>Nivel rival</dt><dd>Nv. {intel.opponentLevelRange} · confianza {intel.opponentLevelConfidence.toLowerCase()}</dd></div>
              <div><dt>Amenaza</dt><dd>{intel.level >= 1 ? `${intel.threatBand} · CPU ${intel.threatRange}` : `${intel.threatBand} · estimación básica`}</dd></div>
              {intel.exactDifficulty != null && <div><dt>CPU exacta</dt><dd>{intel.exactDifficulty} · nivel {intel.exactOpponentLevel}</dd></div>}
              {boss && <div><dt>Jefe</dt><dd>{boss.label}{intel.bossHp != null ? ` · ${intel.bossHp} HP` : ' · HP exacto requiere Dossier'}</dd></div>}
            </dl>
          </section>

          <section className="campaign-intel-buy" aria-label="Compra de inteligencia">
            <span>CRÉDITOS</span>
            <strong>{campaign.operationalCredits}</strong>
            {nextTier ? (
              <>
                <p>Siguiente nivel: {nextTier.label} · <b>{nextTier.cost}</b> cr.</p>
                <button type="button" className="secondary-btn" disabled={!canBuy} onClick={onBuyIntel}>
                  {canBuy ? `Comprar inteligencia · −${nextTier.cost} suministros` : `Faltan ${nextTier.cost - campaign.operationalCredits} suministros`}
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
