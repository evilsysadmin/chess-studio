import { useMemo, useState } from 'react';
import { COMBAT_EQUIPMENT, mercenaryMarketOffers, unitLevel } from '../combatEconomy.js';
import { BASE_STATS } from '../combat.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { hasAdminPreviewAccess } from '../adminPreview.js';

const CONTRACTS = Object.freeze([
  { id: 'one', label: '1 batalla' },
  { id: 'three', label: '3 batallas' },
  { id: 'permanent', label: 'Permanente' },
]);

function eligibleUnits(roster, item, bypassLevel = false) {
  return Object.entries(roster?.pieces || {})
    .filter(([key, piece]) => !key.startsWith('k-') && piece?.alive !== false && !piece?.equipmentId && (bypassLevel || unitLevel(piece) >= item.minLevel))
    .map(([key, piece]) => ({ key, level: unitLevel(piece), alias: roster?.identities?.[key]?.alias || key }))
    .sort((a, b) => b.level - a.level || a.alias.localeCompare(b.alias));
}

export default function CombatMarket({ roster, serviceSummary, onHire, onBuyEquipment, onClose }) {
  useEscapeToClose(onClose);
  const [tab, setTab] = useState('mercenaries');
  const [assignment, setAssignment] = useState({});
  const [notice, setNotice] = useState(null);
  const offers = useMemo(() => mercenaryMarketOffers({ merit: serviceSummary?.merit || 0 }), [serviceSummary?.merit]);
  const credits = Number(roster?.credits || 0);
  const adminPreview = hasAdminPreviewAccess();

  function hire(offer, contract) {
    if (onHire(offer, contract)) setNotice(`${offer.alias} se incorpora al barracón.`);
  }

  function buy(item) {
    const key = assignment[item.id];
    if (key && onBuyEquipment(item.id, key)) setNotice(`${item.label} asignado. Puedes verlo en el expediente de la unidad.`);
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="army-card combat-market" role="dialog" aria-modal="true" aria-labelledby="combat-market-title" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="piece-info-close" onClick={onClose} aria-label="Cerrar mercado">×</button>
        <header className="combat-market-heading">
          <div><span className="section-label">COMBAT CHESS · ABASTECIMIENTO</span><h2 id="combat-market-title">Mercado</h2><p>{adminPreview ? 'Modo admin: catálogo y compras de prueba abiertos.' : 'Opciones tácticas, nunca requisitos para ganar.'}</p></div>
          <div className="combat-market-wallet"><small>{adminPreview ? 'PRUEBA ADMIN' : 'SALDO'}</small><strong>{credits}</strong><span>{adminPreview ? 'sin coste' : 'créditos'}</span></div>
        </header>

        <div className="combat-market-tabs" role="tablist" aria-label="Secciones del mercado">
          <button type="button" role="tab" aria-selected={tab === 'mercenaries'} className={tab === 'mercenaries' ? 'active' : ''} onClick={() => setTab('mercenaries')}>Mercenarios</button>
          <button type="button" role="tab" aria-selected={tab === 'equipment'} className={tab === 'equipment' ? 'active' : ''} onClick={() => setTab('equipment')}>Armas y equipo</button>
        </div>

        {notice && <p className="combat-market-notice" role="status">✓ {notice}</p>}

        {tab === 'mercenaries' ? (
          <div className="combat-market-grid">
            {offers.map((offer) => {
              const pieceName = BASE_STATS[offer.type]?.name || 'Unidad';
              const training = offer.strengthPoints || offer.speedPoints
                ? `${offer.strengthPoints} fuerza / ${offer.speedPoints} velocidad`
                : 'sin mejoras';
              return (
                <article className={`combat-market-card ${offer.rarity}`} key={offer.id}>
                  <div className="combat-market-card-top"><span aria-hidden="true">{offer.type === 'p' ? '♟' : offer.type === 'n' ? '♞' : offer.type === 'b' ? '♝' : offer.type === 'r' ? '♜' : '♛'}</span><i>{offer.rarity === 'veterano' ? 'OFERTA RARA' : 'DISPONIBLE HOY'}</i></div>
                  <h3>{offer.alias}</h3>
                  <p>{pieceName} · nivel {offer.level} · {training}</p>
                  <div className="combat-market-contracts">
                    {CONTRACTS.map((contract) => {
                      const price = offer.prices[contract.id];
                      const sold = (roster.marketPurchases || []).includes(offer.id);
                      return <button type="button" key={contract.id} disabled={sold || (!adminPreview && credits < price)} onClick={() => hire(offer, contract.id)}><span>{sold ? 'Contratado' : contract.label}</span><b>{adminPreview ? 'Prueba' : `${price} cr`}</b></button>;
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="combat-market-grid equipment-grid">
            {COMBAT_EQUIPMENT.map((item) => {
              const units = eligibleUnits(roster, item, adminPreview);
              const selected = assignment[item.id] || '';
              return (
                <article className="combat-market-card equipment" key={item.id}>
                  <div className="combat-market-card-top"><span aria-hidden="true">{item.icon}</span><i>{item.kind} · {adminPreview ? 'PRUEBA ABIERTA' : `NV. ${item.minLevel}+`}</i></div>
                  <h3>{item.label}</h3><p>{item.description}</p>
                  <label>Asignar a
                    <select value={selected} onChange={(event) => setAssignment((current) => ({ ...current, [item.id]: event.target.value }))}>
                      <option value="">{units.length ? 'Elige una unidad' : 'Sin unidades compatibles'}</option>
                      {units.map((unit) => <option key={unit.key} value={unit.key}>{unit.alias} · nv.{unit.level}</option>)}
                    </select>
                  </label>
                  <button type="button" className="secondary-btn combat-market-buy" disabled={!selected || (!adminPreview && credits < item.cost)} onClick={() => buy(item)}>{adminPreview ? 'Equipar para probar' : `Comprar y equipar · ${item.cost} cr`}</button>
                </article>
              );
            })}
          </div>
        )}

        <footer className="combat-market-balance-note"><strong>Equilibrio limpio</strong><span>Los créditos se ganan jugando. El ejército base puede completar toda la campaña; cada unidad sólo admite un objeto y sus bonus están limitados.</span></footer>
      </section>
    </div>
  );
}
