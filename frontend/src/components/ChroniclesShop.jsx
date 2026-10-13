import { useEffect, useRef, useState } from 'react';
import { chroniclesGoldBalance } from '../chronicles/chroniclesContentRuntime.js';
import { chroniclesMemberCanEquip } from '../chronicles/chroniclesEquipment.js';
import { chroniclesShopEquipmentComparisons } from '../chronicles/chroniclesShopComparison.js';
import { chroniclesMapForState } from '../chronicles/chroniclesMapCatalog.js';
import {
  chroniclesShopSellable,
  chroniclesShopSellPrice,
  chroniclesShopStock,
} from '../chronicles/chroniclesShops.js';
import { chroniclesShopRoom } from '../chronicles/chroniclesShopRooms.js';
import './ChroniclesShop.css';

const SLOT_LABEL = Object.freeze({ weapon: 'Arma', armor: 'Armadura', shield: 'Escudo' });

function ShopComparison({ state, item }) {
  const comparisons = chroniclesShopEquipmentComparisons(state, item);
  return (
    <section className="chronicles-shop__comparison" aria-label={`Comparar ${item.name} con el equipo de la compañía`}>
      <div className="chronicles-shop__comparison-head">
        <strong>Antes → después de equipar</strong>
        <span>Vista previa · comprar no equipa</span>
      </div>
      <div className="chronicles-shop__comparison-grid">
        {comparisons.map((comparison) => (
          <div key={comparison.memberId}
            className={`chronicles-shop__comparison-hero${comparison.eligible ? '' : ' is-incompatible'}`}>
            <strong>{comparison.name}</strong>
            <span className="chronicles-shop__comparison-equipped">
              {comparison.current ? `Lleva: ${comparison.current.name}` : `Sin ${SLOT_LABEL[item.slot].toLowerCase()}`}
            </span>
            {!comparison.eligible ? (
              <span className="chronicles-shop__comparison-restriction">{comparison.reason}</span>
            ) : comparison.alreadyEquipped ? (
              <span className="chronicles-shop__comparison-neutral">Ya lo lleva equipado</span>
            ) : (
              <>
                <div className="chronicles-shop__comparison-stats">
                  {comparison.stats.map((stat) => (
                    <span key={stat.key}
                      className={`chronicles-shop__comparison-stat is-${stat.delta > 0 ? 'better' : stat.delta < 0 ? 'worse' : 'equal'}`}
                      aria-label={`${stat.label}: ${stat.before} a ${stat.after}`}>
                      {stat.label} {stat.before}→{stat.after}
                      <b>({stat.delta > 0 ? '+' : ''}{stat.delta})</b>
                    </span>
                  ))}
                </div>
                {comparison.displacedShield && (
                  <span className="chronicles-shop__comparison-warning">
                    Dos manos: guarda {comparison.displacedShield.name}
                  </span>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// Who in the company could actually use it: MM3 class rules, same as the sheet.
function users(state, item) {
  return (state.party || []).filter((member) => chroniclesMemberCanEquip(member, item));
}

export default function ChroniclesShop({ state, onAction, onClose }) {
  const [tab, setTab] = useState('buy');
  const [comparedItemId, setComparedItemId] = useState(null);
  const closeRef = useRef(null);
  const map = chroniclesMapForState(state);
  const entry = (map?.interactables || []).find((item) => item.id === state.shop?.id);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [onClose]);

  if (!entry) return null;
  const room = chroniclesShopRoom(entry);
  const gold = chroniclesGoldBalance(state);
  const stock = chroniclesShopStock(entry);
  const sellable = chroniclesShopSellable(state);

  return (
    <div className="chronicles-shop__backdrop" onClick={onClose}>
      <section
        className="chronicles-shop"
        role="dialog"
        aria-modal="true"
        aria-label={entry.label}
        data-chronicles-shop={entry.id}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="chronicles-shop__head">
          <div>
            <span>TIENDA</span>
            <h2>{entry.label}</h2>
            <p>{state.message}</p>
          </div>
          <b aria-label={`Oro de la compañía: ${gold}`}>{gold} oro</b>
          <button ref={closeRef} type="button" className="chronicles-shop__close" onClick={onClose}
            aria-label="Salir de la tienda">✕</button>
        </header>

        {room ? (
          <figure className="chronicles-shop__scene" data-chronicles-shop-room={room.id}>
            <img src={room.src} alt={room.alt} draggable="false" />
          </figure>
        ) : null}

        <div className="chronicles-shop__tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'buy'} onClick={() => setTab('buy')}>Comprar</button>
          {entry.shop?.buys !== false && (
            <button type="button" role="tab" aria-selected={tab === 'sell'} onClick={() => setTab('sell')}>
              Vender{sellable.length ? ` (${sellable.length})` : ''}
            </button>
          )}
        </div>

        {tab === 'buy' ? (
          <ul className="chronicles-shop__list">
            {stock.map((item) => {
              const able = users(state, item);
              const affordable = gold >= item.price;
              return (
                <li key={item.id} data-chronicles-shop-item={item.id} className={affordable ? '' : 'is-expensive'}>
                  <div className="chronicles-shop__item">
                    <small>{SLOT_LABEL[item.slot]}</small>
                    <strong>{item.name}</strong>
                    <span>{item.description}</span>
                    <em>{able.length
                      ? `Lo pueden usar: ${able.map((member) => member.name).join(', ')}`
                      : 'Nadie de la compañía puede usarlo'}</em>
                  </div>
                  <div className="chronicles-shop__actions">
                    <button type="button" className="chronicles-shop__compare-button"
                      aria-expanded={comparedItemId === item.id}
                      aria-controls={comparedItemId === item.id ? `chronicles-shop-compare-${item.id}` : undefined}
                      onClick={() => setComparedItemId((selected) => selected === item.id ? null : item.id)}>
                      {comparedItemId === item.id ? 'Ocultar' : 'Comparar'}
                    </button>
                    <button type="button" disabled={!affordable}
                      onClick={() => onAction({ type: 'shop-buy', itemId: item.id })}>
                      {item.price} oro
                    </button>
                  </div>
                  {comparedItemId === item.id && (
                    <div id={`chronicles-shop-compare-${item.id}`} className="chronicles-shop__comparison-wrap">
                      <ShopComparison state={state} item={item} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <ul className="chronicles-shop__list">
            {sellable.length === 0 && <li className="chronicles-shop__empty">No hay equipo en la mochila. Lo que llevas puesto no se vende.</li>}
            {sellable.map(({ item, quantity }) => (
              <li key={item.id} data-chronicles-shop-sell={item.id}>
                <div className="chronicles-shop__item">
                  <small>{SLOT_LABEL[item.slot]}{quantity > 1 ? ` ×${quantity}` : ''}</small>
                  <strong>{item.name}</strong>
                  <span>{item.description}</span>
                </div>
                <button type="button" onClick={() => onAction({ type: 'shop-sell', itemId: item.id })}>
                  +{chroniclesShopSellPrice(item)} oro
                </button>
              </li>
            ))}
          </ul>
        )}
        <footer className="chronicles-shop__foot">
          Lo comprado va a la mochila de la compañía. Equípalo desde la ficha de cada personaje.
        </footer>
      </section>
    </div>
  );
}
