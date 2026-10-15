// MM3-style tavern counter: entry is free; money is charged only when
// choosing food, drink or a room. All paid effects update the same run state
// and inventory as shops so save checkpoints remain authoritative.
import {
  CHRONICLES_GOLD_ITEM_ID,
  chroniclesApplyContentAction,
  chroniclesApplyContentEffects,
  chroniclesGoldBalance,
} from './chroniclesContentRuntime.js';
import { chroniclesTownCounterInReach } from './chroniclesTownCounterReach.js';

const FOOD_PRICE = 3;
const DRINK_PRICE = 2;

const SWORDHAVEN_RUMORS = Object.freeze([
  '«En el Camino de los Estandartes mandan los desertores. Garrah no suele dejar testigos», murmura un carretero.',
  '«La sacerdotisa Ilse busca remedios del bosque de Rookwood. Id al templo si queréis saber más», cuenta la posadera.',
  '«Dicen que algo se mueve bajo Swordhaven. Las alcantarillas no están tan vacías como asegura el ayuntamiento».',
  '«El alcalde Aldric espera noticias de los caballeros desaparecidos. Por algo lleva noches sin dormir».',
]);

const GENERIC_RUMORS = Object.freeze([
  '«Asegurad las provisiones antes de salir de la muralla», aconseja un viajero.',
  '«No os fiéis de un camino demasiado silencioso: el silencio también cobra peaje».',
]);

export function chroniclesIsTavernEntry(entry) {
  return entry?.visualType === 'building-tavern' && entry?.kind === 'service';
}

export function chroniclesTavernRestPrice(entry) {
  const required = (entry?.requirements || []).find((part) => part.itemId === CHRONICLES_GOLD_ITEM_ID);
  return Number.isSafeInteger(required?.quantity) && required.quantity > 0 ? required.quantity : 5;
}

function tavernEntry(state, map) {
  const entry = map?.interactables?.find((item) => item.id === state?.tavern?.id);
  return chroniclesIsTavernEntry(entry) && chroniclesTownCounterInReach(state, entry, map) ? entry : null;
}

export function chroniclesOpenTavern(state, entry) {
  if (!chroniclesIsTavernEntry(entry)) return state;
  return {
    ...state,
    tavern: { id: entry.id, rumorIndex: 0 },
    message: 'La Espada Mellada huele a pan caliente, cerveza y decisiones cuestionables. La posadera os da la bienvenida.',
  };
}

export function chroniclesCloseTavern(state) {
  if (!state?.tavern) return state;
  const { tavern: _closed, ...rest } = state;
  return rest;
}

export function chroniclesTavernAction(state, map, choice) {
  const entry = tavernEntry(state, map);
  if (!entry || !['food', 'drink', 'rest', 'rumor'].includes(choice)) return state;

  if (choice === 'rumor') {
    const rumors = state.mapId === 'swordhaven-first-book' ? SWORDHAVEN_RUMORS : GENERIC_RUMORS;
    const index = state.tavern.rumorIndex % rumors.length;
    return {
      ...state,
      tavern: { ...state.tavern, rumorIndex: index + 1 },
      turns: state.turns + 1,
      message: rumors[index],
    };
  }

  const price = choice === 'food' ? FOOD_PRICE : choice === 'drink' ? DRINK_PRICE : chroniclesTavernRestPrice(entry);
  if (chroniclesGoldBalance(state) < price) {
    return { ...state, message: `La posadera exige ${price} monedas de oro. No se fía de las promesas heroicas.` };
  }

  if (choice === 'food') {
    const next = chroniclesApplyContentEffects(state, [{
      type: 'exchange-item',
      costItemId: CHRONICLES_GOLD_ITEM_ID,
      costQuantity: FOOD_PRICE,
      itemId: 'road-rations',
      name: 'Raciones de viaje',
      description: 'Provisiones para futuras incursiones; aún no son un consumible de combate.',
      quantity: 1,
    }]);
    return next === state ? { ...state, message: 'No podéis llevar más raciones.' } : {
      ...next, turns: state.turns + 1,
      message: 'Compráis raciones para el camino. La bolsa pesa menos y la mochila bastante más.',
    };
  }

  if (choice === 'drink') {
    const next = chroniclesApplyContentEffects(state, [
      { type: 'consume-item', itemId: CHRONICLES_GOLD_ITEM_ID, quantity: DRINK_PRICE },
      { type: 'heal-party', amount: 2 },
    ]);
    return {
      ...next, turns: state.turns + 1,
      message: 'Una ronda de cerveza y estofado reconforta al grupo (+2 PV a los compañeros conscientes).',
    };
  }

  // Use the authored inn's exact rest effect, including its own cost and
  // spell restoration. Do not duplicate it in a second economy table.
  const rested = chroniclesApplyContentAction(state, entry.action);
  return { ...rested, turns: state.turns + 1 };
}

export const CHRONICLES_TAVERN_PRICES = Object.freeze({
  food: FOOD_PRICE,
  drink: DRINK_PRICE,
});
