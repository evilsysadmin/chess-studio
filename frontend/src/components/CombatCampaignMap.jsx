import {
  CAMPAIGN_MAP_MOBILE_VIEWBOX,
  CAMPAIGN_MAP_VIEWBOX,
  campaignMapEdges,
  campaignNodePoint,
  campaignNodeStatus,
} from '../campaignMapVisual.js';
import campaignCommandMapArt from '../assets/combat-campaign-command-map.webp';

function edgePath(edge, orientation) {
  const a = campaignNodePoint(edge.from, orientation);
  const b = campaignNodePoint(edge.to, orientation);
  if (orientation === 'mobile') {
    const midY = (a.y + b.y) / 2;
    return `M ${a.x} ${a.y} C ${a.x} ${midY}, ${b.x} ${midY}, ${b.x} ${b.y}`;
  }
  const midX = (a.x + b.x) / 2;
  return `M ${a.x} ${a.y} C ${midX} ${a.y}, ${midX} ${b.y}, ${b.x} ${b.y}`;
}

function CampaignEdges({ edges, orientation }) {
  const viewBox = orientation === 'mobile' ? CAMPAIGN_MAP_MOBILE_VIEWBOX : CAMPAIGN_MAP_VIEWBOX;
  return (
    <svg
      className={`campaign-route-lines campaign-route-lines-${orientation}`}
      viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {edges.map((edge) => (
        <path key={`${orientation}-${edge.id}`} d={edgePath(edge, orientation)} className={`campaign-route-edge ${edge.status}`} />
      ))}
    </svg>
  );
}

function MapNode({ node, status, selectable, onSelect }) {
  const label = `${node.typeLabel}: ${node.label}`;
  return (
    <button
      type="button"
      className={`campaign-map-point ${status} campaign-node-${node.type}`}
      style={{ '--stage': node.stage, '--lane': node.lane }}
      disabled={!selectable}
      onClick={() => selectable && onSelect(node.id)}
      aria-current={status === 'current' ? 'step' : undefined}
      aria-label={selectable ? `${label}. Elegir esta ruta.` : label}
      title={`${label} · ${node.description}`}
    >
      <span className="campaign-map-point-core" aria-hidden="true">{node.icon}</span>
      <span className="campaign-map-point-copy">
        <strong>{node.label}</strong>
        <small>{node.typeLabel}</small>
      </span>
      {status === 'cleared' && <span className="campaign-map-point-badge">✓</span>}
      {status === 'available' && <span className="campaign-map-point-pulse" aria-hidden="true" />}
    </button>
  );
}

export default function CombatCampaignMap({ map, campaign, availableNodes, onSelect }) {
  const availableIds = new Set((availableNodes || []).map((node) => node.id));
  const edges = campaignMapEdges(map, campaign, availableNodes);
  const nodes = [map.start, ...map.stages.flat()];

  return (
    <section className="combat-campaign-map-wrap" aria-label="Mapa completo de campaña Combat Chess" title="La topología es visible; dificultad, modificadores y boss requieren inteligencia.">
      <div className="campaign-map-toolbar simplified">
        <div>
          <span className="section-label">MAPA</span>
          <strong>Elige tu siguiente sector</strong>
        </div>
        <details className="campaign-map-legend-details">
          <summary>Leyenda</summary>
          <div className="campaign-map-legend" aria-label="Leyenda del mapa">
            <span><i className="legend-dot current" />posición</span>
            <span><i className="legend-dot available" />accesible</span>
            <span><i className="legend-dot cleared" />superado</span>
            <span><i className="legend-dot elite" />élite</span>
            <span><i className="legend-dot camp" />seguro</span>
          </div>
        </details>
      </div>

      <div className="combat-campaign-map" style={{ '--campaign-map-art': `url(${campaignCommandMapArt})` }}>
        <div className="campaign-map-art" aria-hidden="true" />
        <CampaignEdges edges={edges} orientation="desktop" />
        <CampaignEdges edges={edges} orientation="mobile" />

        <div className="campaign-map-sector-bands" aria-hidden="true">
          {Array.from({ length: 8 }, (_, stage) => (
            <span key={stage} style={{ '--stage': stage }}>{stage === 0 ? 'BASE' : `S${stage}`}</span>
          ))}
        </div>

        {nodes.map((node) => {
          const status = node.id === 'start'
            ? (campaign.currentNodeId === 'start' ? 'current' : ((campaign.route || []).includes('start') ? 'cleared' : 'locked'))
            : campaignNodeStatus(node, campaign, availableIds);
          const selectable = node.id !== 'start' && status === 'available';
          return <MapNode key={node.id} node={node} status={status} selectable={selectable} onSelect={onSelect} />;
        })}
      </div>

      <div className="campaign-map-route-summary">
        <span>◆ Base</span>
        <span>→</span>
        <strong>{Math.max(0, (campaign.route || []).length - 1)} sectores atravesados</strong>
        <span>→</span>
        <span>♚ Rey Viejo</span>
      </div>
    </section>
  );
}
