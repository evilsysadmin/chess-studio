import { describe, expect, it } from 'vitest';
import { chroniclesReduce, createChroniclesState } from '../chroniclesOfMatthias.js';
import { chroniclesApplyContentEffects, chroniclesGoldBalance } from './chroniclesContentRuntime.js';
import { CHRONICLES_EQUIPMENT } from './chroniclesEquipment.js';
import { chroniclesMapById } from './chroniclesMapCatalog.js';
import { chroniclesShopSellPrice } from './chroniclesShops.js';
import { chroniclesApplyRunCheckpoint, chroniclesRunCheckpointPayload } from './chroniclesRunCheckpoint.js';

function atForge(gold) {
  const state = chroniclesApplyContentEffects(createChroniclesState('swordhaven-first-book'), [
    { type: 'grant-gold', amount: gold },
  ]);
  return chroniclesReduce({ ...state, x: 7, y: 4 }, 'interact');
}

describe('Chronicles · MM3 shops', () => {
  it('stocks the forge and the armoury only with real catalog gear', () => {
    const map = chroniclesMapById('swordhaven-first-book');
    for (const id of ['first-book-weaponsmith', 'first-book-armorer']) {
      const entry = map.interactables.find((item) => item.id === id);
      expect(entry.shop.stock.length).toBeGreaterThanOrEqual(10);
      for (const itemId of entry.shop.stock) expect(CHRONICLES_EQUIPMENT[itemId], itemId).toBeTruthy();
    }
  });

  it('opens a counter, buys atomically against gold and refuses what the purse cannot pay', () => {
    let state = atForge(10);
    expect(state.shop).toEqual({ id: 'first-book-weaponsmith' });
    const price = CHRONICLES_EQUIPMENT['bronze-sword'].price;
    state = chroniclesReduce(state, { type: 'shop-buy', itemId: 'bronze-sword' });
    expect(chroniclesGoldBalance(state)).toBe(10 - price);
    expect(state.inventory['bronze-sword'].quantity).toBe(1);
    const broke = chroniclesReduce(state, { type: 'shop-buy', itemId: 'steel-sword' });
    expect(broke.inventory['steel-sword']).toBeUndefined();
    expect(chroniclesGoldBalance(broke)).toBe(10 - price);
    expect(broke.message).toMatch(/no da para tanto/);
    // Not in this shop's stock (plate is sold by the armourer, steel plate nowhere here).
    expect(chroniclesReduce(state, { type: 'shop-buy', itemId: 'steel-plate' })).toBe(state);
  });

  it('sells pack gear at half price and never pays for what is worn', () => {
    let state = atForge(20);
    state = chroniclesReduce(state, { type: 'shop-buy', itemId: 'iron-mace' });
    const gold = chroniclesGoldBalance(state);
    const sold = chroniclesReduce(state, { type: 'shop-sell', itemId: 'iron-mace' });
    expect(sold.inventory['iron-mace']).toBeUndefined();
    expect(chroniclesGoldBalance(sold)).toBe(gold + chroniclesShopSellPrice(CHRONICLES_EQUIPMENT['iron-mace']));
    const worn = chroniclesReduce(state, { type: 'equip-item', memberId: 'matthias', itemId: 'iron-mace' });
    expect(chroniclesReduce(worn, { type: 'shop-sell', itemId: 'iron-mace' })).toBe(worn);
  });

  it('closes the counter when the party walks away, and only trades at the merchant', () => {
    const open = atForge(30);
    const walked = chroniclesReduce(open, 'turn-left');
    expect(walked.shop).toBeUndefined();
    // A stale open counter away from the merchant cannot trade.
    const away = { ...open, x: 9, y: 7 };
    expect(chroniclesReduce(away, { type: 'shop-buy', itemId: 'bronze-dagger' })).toBe(away);
    expect(chroniclesReduce(open, { type: 'shop-close' }).shop).toBeUndefined();
  });

  it('persists purchases through a checkpoint but never an open counter', () => {
    let state = atForge(30);
    state = chroniclesReduce(state, { type: 'shop-buy', itemId: 'bronze-axe' });
    const restored = chroniclesApplyRunCheckpoint(
      createChroniclesState('swordhaven-first-book'),
      chroniclesRunCheckpointPayload(state, 2),
    );
    expect(restored.inventory['bronze-axe'].quantity).toBe(1);
    expect(chroniclesGoldBalance(restored)).toBe(30 - CHRONICLES_EQUIPMENT['bronze-axe'].price);
    expect(restored.shop).toBeUndefined();
  });
});
