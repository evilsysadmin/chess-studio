import React from 'react';

function statusForNode(node, campaign, availableIds) {
  if (campaign.selectedNodeId === node.id) return 'selected';
  if ((campaign.clearedNodeIds || []).includes(node.id)) return 'cleared';
  if (campaign.currentNodeId === node.id) return 'current';
  if (availableIds.has(node.id)) return 'available';
  return 'locked';
}

export default function CombatCampaignMap({ map, campaign, availableNodes, onSelect }) {
  const availableIds = new Set((availableNodes || []).map((node) => node.id));
  return (
    <div className="combat-campaign-map-wrap" aria-label="Mapa de campaña Combat Chess">
      <div className="combat-campaign-map">
        <div className="campaign-stage campaign-stage-start">
          <span className="campaign-stage-label">BASE</span>
          <div className="campaign-node current" aria-current={campaign.currentNodeId === 'start' ? 'step' : undefined}>
            <span className="campaign-node-icon">◆</span>
            <strong>Puesto de mando</strong>
            <small>Despliegue</small>
          </div>
        </div>

        {map.stages.map((nodes, stageIndex) => (
          <div className="campaign-stage" key={`stage-${stageIndex + 1}`}>
            <span className="campaign-stage-label">SECTOR {stageIndex + 1}</span>
            <div className="campaign-stage-nodes">
              {nodes.map((node) => {
                const status = statusForNode(node, campaign, availableIds);
                const selectable = status === 'available';
                return (
                  <button
                    type="button"
                    key={node.id}
                    className={`campaign-node ${status} campaign-node-${node.type}`}
                    disabled={!selectable}
                    onClick={() => selectable && onSelect(node.id)}
                    aria-current={status === 'current' ? 'step' : undefined}
                  >
                    <span className="campaign-node-icon" aria-hidden="true">{node.icon}</span>
                    <strong>{node.label}</strong>
                    <small>{node.typeLabel}{['battle', 'elite', 'boss'].includes(node.type) ? ' · intel pendiente' : ''}</small>
                    {selectable && <span className="campaign-node-cta">Elegir ruta →</span>}
                    {status === 'cleared' && <span className="campaign-node-cta">✓ Superado</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
