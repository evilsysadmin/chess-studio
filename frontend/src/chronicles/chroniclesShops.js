// MM3-style shops: an authored merchant (`shop` on its map entry) opens a
// counter with a stock list instead of firing a single scripted exchange.
// Buying and selling are atomic gold ⇄ item swaps on the shared inventory,
// validated against the merchant actually standing at the party's cell, so
// a stale UI or a replayed action can never buy from a closed or absent shop.
import {
  CHRONICLES_GOLD_ITEM_ID,
  chroniclesApplyContentEffects,
  chroniclesGoldBalance,
} from './chroniclesContentRuntime.js';
import { CHRONICLES_EQUIPMENT } from './chroniclesEquipment.js';

const SELL_RATE = 0.5;

function shopEntry(state, map, shopId) {
  const entry = (map?.interactables || []).find((item) => item.id === shopId && item.shop);
  if (!entry) return null;
  // The counter only exists while the party stands at the merchant.
  if (entry.x !== state.x || entry.y !== state.y) return null;
  return entry;
}

export function chroniclesShopStock(entry) {
  return (entry?.shop?.stock || [])
    .map((itemId) => CHRONICLES_EQUIPMENT[itemId])
    .filter(Boolean);
}

export function chroniclesShopSellPrice(item) {
  return item ? Math.max(1, Math.floor(item.price * SELL_RATE)) : 0;
}

// What the party could sell here: unequipped catalog gear in the shared pack.
export function chroniclesShopSellable(state) {
  const inventory = state?.inventory && typeof state.inventory === 'object' ? state.inventory : {};
  return Object.entries(inventory)
    .filter(([id, entry]) => CHRONICLES_EQUIPMENT[id] && Number(entry?.quantity) > 0)
    .map(([id, entry]) => ({ item: CHRONICLES_EQUIPMENT[id], quantity: Number(entry.quantity) }));
}

export function chroniclesOpenShop(state, entry) {
  return {
    ...state,
    shop: { id: entry.id },
    message: entry.shop.greeting || entry.action?.message || `${entry.label}.`,
  };
}

export function chroniclesCloseShop(state) {
  if (!state?.shop) return state;
  const { shop: _closed, ...rest } = state;
  return rest;
}

export function chroniclesShopBuy(state, map, itemId) {
  const entry = state?.shop ? shopEntry(state, map, state.shop.id) : null;
  if (!entry || !entry.shop.stock.includes(itemId)) return state;
  const item = CHRONICLES_EQUIPMENT[itemId];
  if (!item) return state;
  if (chroniclesGoldBalance(state) < item.price) {
    return { ...state, message: `${item.name} cuesta ${item.price} oro. La bolsa no da para tanto.` };
  }
  const next = chroniclesApplyContentEffects(state, [{
    type: 'exchange-item',
    costItemId: CHRONICLES_GOLD_ITEM_ID,
    costQuantity: item.price,
    itemId: item.id,
    name: item.name,
    description: item.description,
    quantity: 1,
  }]);
  if (next === state) return state;
  return { ...next, message: `Compras ${item.name} por ${item.price} oro. Equípalo desde la ficha del personaje.` };
}

export function chroniclesShopSell(state, map, itemId) {
  const entry = state?.shop ? shopEntry(state, map, state.shop.id) : null;
  const item = CHRONICLES_EQUIPMENT[itemId];
  if (!entry || !item || entry.shop.buys === false) return state;
  const owned = Number(state.inventory?.[itemId]?.quantity || 0);
  if (owned < 1) return state;
  const price = chroniclesShopSellPrice(item);
  // Preflight the purse cap so a sale never takes the item without paying.
  if (chroniclesGoldBalance(state) + price > 9999) return state;
  const next = chroniclesApplyContentEffects(state, [
    { type: 'consume-item', itemId, quantity: 1 },
    { type: 'grant-gold', amount: price },
  ]);
  if (next === state) return state;
  return { ...next, message: `Vendes ${item.name} por ${price} oro.` };
}
