import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { availableCampaignNodes, campaignMap } from '../combatCampaign.js';
import { projectCombatOperationsCampaignMap } from '../combatOperationsMapProjection.js';
import CombatPreparationRoom from './CombatPreparationRoom.jsx';
import CombatVeteranDossier from './CombatVeteranDossier.jsx';
import { combatVeteranAtSquare, combatVeteranInspectionOptions } from '../combatVeteranInspection.js';
import CampaignBriefing from './CampaignBriefing.jsx';
import './CampaignCombatPreparationRoom.css';
import './CombatCampaignBriefingRoom.css';

// A view over the campaign authority, not another campaign state machine.
// Selection, intelligence purchases and deployment continue through RoguelikeScreen.
export default function CombatCampaignBriefingRoom({
  campaign, node, roster, armySummary, onExit, onHelp, onOpenMarket, onRestart,
  onBuyIntel, onContinue, onRetire, children,
}) {
  const [inspectingArmy, setInspectingArmy] = useState(false);
  const [inspectedSectorId, setInspectedSectorId] = useState('');
  const [inspectedUnitSquare, setInspectedUnitSquare] = useState('');
  const dossierReturnFocusRef = useRef(null);
  const veteranSelectRef = useRef(null);
  const closeDossier = useCallback(() => {
    setInspectedUnitSquare('');
    const previous = dossierReturnFocusRef.current;
    const target = previous?.isConnected ? previous : veteranSelectRef.current;
    target?.focus?.({ preventScroll: true });
  }, []);
  const unitOptions = useMemo(() => combatVeteranInspectionOptions(roster), [roster]);
  const inspectedUnit = useMemo(() => combatVeteranAtSquare(roster, inspectedUnitSquare), [roster, inspectedUnitSquare]);
  const inspectUnit = useCallback((square) => {
    if (!combatVeteranAtSquare(roster, square)) return;
    const active = document.activeElement;
    dossierReturnFocusRef.current = active?.matches?.('canvas.board3d-main-canvas, .combat-veteran-select select')
      ? active : veteranSelectRef.current;
    setInspectedUnitSquare(square);
    setInspectingArmy(true);
  }, [roster]);
  const cartography = useMemo(() => campaign?.active
    ? projectCombatOperationsCampaignMap(campaignMap(campaign.seed), campaign, availableCampaignNodes(campaign))
    : null, [campaign]);
  const inspected = cartography?.nodes.find((sector) => sector.id === inspectedSectorId);
  useEffect(() => { setInspectedSectorId(''); setInspectedUnitSquare(''); }, [campaign.seed, node.id]);
  useEffect(() => {
    if (!inspectingArmy) return undefined;
    const onEscape = (event) => {
      if (event.key !== 'Escape') return;
      // The application also owns a global Escape-to-exit shortcut. While the
      // preview is open, the first Escape must only close this local view.
      event.preventDefault();
      event.stopPropagation();
      if (inspectedUnitSquare) closeDossier();
      else setInspectingArmy(false);
    };
    window.addEventListener('keydown', onEscape, true);
    return () => window.removeEventListener('keydown', onEscape, true);
  }, [inspectingArmy, inspectedUnitSquare, closeDossier]);

  const stage = Math.max(0, (campaign.route || []).length - 1);
  const fallen = Math.max(0, Number(armySummary?.fallenCount) || 0);

  return (
    <div className="menu combat-operations-screen combat-briefing-room-screen">
      <section
        className={`campaign-preparation-shell combat-operations-shell combat-briefing-room-shell${inspectingArmy ? ' is-inspecting-army' : ''}`}
        aria-label="Mesa de órdenes de Combat Chess"
        data-combat-campaign-room="briefing"
      >
        <CombatPreparationRoom roster={roster} campaign={campaign} cartography={cartography} onSectorInspect={setInspectedSectorId} onUnitInspect={inspectUnit} inspectionPreview={inspectingArmy} />

        <div className="combat-operations-topbar combat-briefing-room-topbar">
          <button type="button" className="back-link combat-operations-exit" onClick={onExit}>
            ← Salir de Combat Chess
          </button>
          <div className="combat-operations-mode-chip"><span>COMBAT CHESS</span><b>ÓRDENES</b></div>
          <button type="button" className="context-help-btn combat-operations-help"
            onClick={() => { setInspectingArmy(false); onHelp(); }} aria-label="Tutorial de campaña">?</button>
        </div>

        <header className="combat-briefing-room-intro">
          <span className="section-label">OPERACIÓN LA TORRE · SECTOR {node.stage}</span>
          <h2>Campaña de Combat Chess</h2>
          <p>Tu ejército aguarda las órdenes para {node.label}.</p>
        </header>

        <div className="combat-briefing-room-status" aria-label="Recursos de campaña">
          <div className="combat-briefing-resource-rail">
            <span>Sector <b>{stage}/7</b></span>
            <span>Suministros <b>{campaign.operationalCredits}</b></span>
            <span>Créditos <b>{roster.credits || 0}</b></span>
            {fallen > 0 && <span className="danger-text">Bajas <b>{fallen}</b></span>}
            <button type="button" onClick={() => { setInspectingArmy(false); onOpenMarket(); }}>Mercado →</button>
            <button type="button" onClick={onRestart}>↻ Reiniciar campaña</button>
          </div>
          <label className="combat-briefing-map-lookup">
            Mapa
            <select aria-label="Consultar sector del mapa" value={inspectedSectorId}
              onChange={(event) => setInspectedSectorId(event.target.value)}>
              <option value="">Consultar sector…</option>
              {(cartography?.nodes || []).map((sector) => (
                <option key={sector.id} value={sector.id}>
                  {sector.stage === 0 ? "Base" : "Sector " + sector.stage} · {sector.status === "locked" ? "sin explorar" : sector.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {inspected && (
          <div className="combat-briefing-map-readout" role="status" aria-live="polite">
            <strong>{inspected.stage === 0 ? "Base" : "Sector " + inspected.stage}</strong>
            <span>{inspected.status === "locked" ? "Aún sin explorar" : inspected.label} · {{
              current: "Posición actual", selected: "Objetivo designado",
              available: "Ruta accesible", cleared: "Sector superado", locked: "Ruta bloqueada",
            }[inspected.status]}</span>
            <button type="button" aria-label="Cerrar consulta de mapa" onClick={() => setInspectedSectorId("")}>×</button>
          </div>
        )}

        <button
          type="button"
          className="combat-briefing-army-inspect"
          aria-controls="combat-briefing-orders"
          aria-expanded={!inspectingArmy}
          aria-pressed={inspectingArmy}
          onClick={() => { setInspectedUnitSquare(''); setInspectingArmy((current) => !current); }}
        >
          {inspectingArmy ? '← Volver a órdenes' : '♞ Inspeccionar ejército'}
        </button>

        {inspectingArmy && (
          <label className="combat-veteran-select">
            Expediente
            <select aria-label="Consultar veterano desplegado" value={inspectedUnit?.square || ''}
              ref={veteranSelectRef}
              onChange={(event) => {
                dossierReturnFocusRef.current = event.currentTarget;
                setInspectedUnitSquare(event.target.value);
              }}>
              <option value="">Seleccionar pieza…</option>
              {unitOptions.map((unit) => (
                <option key={unit.identityId} value={unit.square}>{unit.alias} · {unit.square}</option>
              ))}
            </select>
          </label>
        )}
        {inspectedUnit && <CombatVeteranDossier unit={inspectedUnit} onClose={closeDossier} />}

        <aside id="combat-briefing-orders" className="combat-briefing-room-orders" aria-label="Órdenes para el sector elegido">
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
