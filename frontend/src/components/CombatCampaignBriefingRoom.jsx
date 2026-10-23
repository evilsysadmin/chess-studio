import CombatPreparationRoom from './CombatPreparationRoom.jsx';
import CampaignBriefing from './CampaignBriefing.jsx';
import './CampaignCombatPreparationRoom.css';
import './CombatCampaignBriefingRoom.css';

// A view over the campaign authority, not another campaign state machine.
// Selection, intelligence purchases and deployment continue through RoguelikeScreen.
export default function CombatCampaignBriefingRoom({
  campaign, node, roster, armySummary, onExit, onHelp, onOpenMarket,
  onBuyIntel, onContinue, onRetire, children,
}) {
  const stage = Math.max(0, (campaign.route || []).length - 1);
  const fallen = Math.max(0, Number(armySummary?.fallenCount) || 0);

  return (
    <div className="menu combat-operations-screen combat-briefing-room-screen">
      <section
        className="campaign-preparation-shell combat-operations-shell combat-briefing-room-shell"
        aria-label="Mesa de órdenes de Combat Chess"
        data-combat-campaign-room="briefing"
      >
        <CombatPreparationRoom roster={roster} />

        <div className="combat-operations-topbar combat-briefing-room-topbar">
          <button type="button" className="back-link combat-operations-exit" onClick={onExit}>
            ← Salir de Combat Chess
          </button>
          <div className="combat-operations-mode-chip"><span>COMBAT CHESS</span><b>ÓRDENES</b></div>
          <button type="button" className="context-help-btn combat-operations-help"
            onClick={onHelp} aria-label="Tutorial de campaña">?</button>
        </div>

        <header className="combat-briefing-room-intro">
          <span className="section-label">OPERACIÓN LA TORRE · SECTOR {node.stage}</span>
          <h2>Campaña de Combat Chess</h2>
          <p>Tu ejército aguarda las órdenes para {node.label}.</p>
        </header>

        <div className="combat-briefing-room-status" aria-label="Recursos de campaña">
          <span>Sector <b>{stage}/7</b></span>
          <span>Suministros <b>{campaign.operationalCredits}</b></span>
          <span>Créditos <b>{roster.credits || 0}</b></span>
          {fallen > 0 && <span className="danger-text">Bajas <b>{fallen}</b></span>}
          <button type="button" onClick={onOpenMarket}>Mercado →</button>
        </div>

        <aside className="combat-briefing-room-orders" aria-label="Órdenes para el sector elegido">
          <CampaignBriefing
            campaign={campaign}
            node={node}
            armySummary={armySummary}
            onBuyIntel={onBuyIntel}
            onContinue={onContinue}
            onRetire={onRetire}
          />
        </aside>
      </section>
      {children}
    </div>
  );
}
