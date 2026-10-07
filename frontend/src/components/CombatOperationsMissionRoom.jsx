import CombatCampaignMap from './CombatCampaignMap.jsx';
import CombatPreparationRoom from './CombatPreparationRoom.jsx';
import './CampaignCombatPreparationRoom.css';
import './CombatOperationsMissionRoom.css';

export default function CombatOperationsMissionRoom({
  campaign,
  map,
  availableNodes,
  roster,
  armySummary,
  onSelect,
  onExit,
  onOpenMarket,
  onRestart,
  onRetire,
  onHelp,
  children,
}) {
  const stage = Math.max(0, (campaign?.route || []).length - 1);
  const fallen = Math.max(0, Number(armySummary?.fallenCount) || 0);

  return (
    <div className="menu combat-operations-screen campaign-mission-room-screen">
      <section
        className="campaign-preparation-shell simplified-stage combat-operations-shell campaign-mission-room-shell"
        aria-label="Mesa de operaciones de campaña"
        data-combat-campaign-room="mission-map"
      >
        <CombatPreparationRoom roster={roster} />

        <div className="combat-operations-topbar campaign-mission-room-topbar">
          <button className="back-link combat-operations-exit" onClick={onExit}>← Salir de Combat Chess</button>
          <div className="combat-operations-mode-chip">
            <span>COMBAT CHESS</span>
            <b>CAMPAÑA</b>
          </div>
          <button
            type="button"
            className="context-help-btn combat-operations-help"
            onClick={onHelp}
            aria-label="Tutorial de campaña"
          >?</button>
        </div>

        <header className="campaign-operation-heading simplified-heading campaign-mission-room-briefing">
          <span className="section-label">MESA DE OPERACIONES</span>
          <h2>Elige el siguiente sector</h2>
          <p>Los sectores iluminados son rutas disponibles. La inteligencia exacta sigue siendo un recurso.</p>
        </header>

        <div className="campaign-mission-room-status" aria-label="Estado de la campaña">
          <span>Sector <b>{stage}/7</b></span>
          <span>Suministros <b>{campaign?.operationalCredits || 0}</b></span>
          <span>Créditos <b>{roster?.credits || 0}</b></span>
          {fallen > 0 && <span className="danger-text">Bajas <b>{fallen}</b></span>}
          <button type="button" onClick={onOpenMarket}>Mercado →</button>
        </div>

        <main className="campaign-mission-room-map">
          <CombatCampaignMap
            map={map}
            campaign={campaign}
            availableNodes={availableNodes}
            onSelect={onSelect}
          />
        </main>

        <div className="campaign-mission-room-actions" aria-label="Acciones de operación">
          <button type="button" className="secondary-btn" onClick={onRestart}>↻ Reiniciar campaña</button>
          <button type="button" className="secondary-btn danger-soft" onClick={onRetire}>Retirar operación</button>
        </div>
      </section>
      {children}
    </div>
  );
}
