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
  it('stocks the starting town only with junk: wood, brass and leather', () => {
    const map = chroniclesMapById('swordhaven-first-book');
    for (const id of ['first-book-weaponsmith', 'first-book-armorer']) {
      const entry = map.interactables.find((item) => item.id === id);
      expect(entry.shop.stock.length).toBeGreaterThanOrEqual(6);
      for (const itemId of entry.shop.stock) {
        expect(CHRONICLES_EQUIPMENT[itemId], itemId).toBeTruthy();
        // Better gear is looted or sold in later towns, never in Swordhaven.
        expect(CHRONICLES_EQUIPMENT[itemId].tier, itemId).toBe(0);
      }
    }
  });

  it('opens a counter, buys atomically against gold and refuses what the purse cannot pay', () => {
    let state = atForge(10);
    expect(state.shop).toEqual({ id: 'first-book-weaponsmith' });
    const price = CHRONICLES_EQUIPMENT['brass-axe'].price;
    state = chroniclesReduce(state, { type: 'shop-buy', itemId: 'brass-axe' });
    expect(chroniclesGoldBalance(state)).toBe(10 - price);
    expect(state.inventory['brass-axe'].quantity).toBe(1);
    // Spend down to less than a brass sword costs, then try to buy it.
    while (chroniclesGoldBalance(state) >= CHRONICLES_EQUIPMENT['brass-sword'].price) {
      state = chroniclesReduce(state, { type: 'shop-buy', itemId: 'brass-dagger' });
    }
    const gold = chroniclesGoldBalance(state);
    const broke = chroniclesReduce(state, { type: 'shop-buy', itemId: 'brass-sword' });
    expect(broke.inventory['brass-sword']).toBeUndefined();
    expect(chroniclesGoldBalance(broke)).toBe(gold);
    expect(broke.message).toMatch(/no da para tanto/);
    // Steel is not sold in the starting town at all.
    expect(chroniclesReduce(state, { type: 'shop-buy', itemId: 'steel-sword' })).toBe(state);
  });

  it('sells pack gear at half price and never pays for what is worn', () => {
    let state = atForge(20);
    state = chroniclesReduce(state, { type: 'shop-buy', itemId: 'brass-mace' });
    const gold = chroniclesGoldBalance(state);
    const sold = chroniclesReduce(state, { type: 'shop-sell', itemId: 'brass-mace' });
    expect(sold.inventory['brass-mace']).toBeUndefined();
    expect(chroniclesGoldBalance(sold)).toBe(gold + chroniclesShopSellPrice(CHRONICLES_EQUIPMENT['brass-mace']));
    const worn = chroniclesReduce(state, { type: 'equip-item', memberId: 'matthias', itemId: 'brass-mace' });
    expect(chroniclesReduce(worn, { type: 'shop-sell', itemId: 'brass-mace' })).toBe(worn);
  });

  it('closes the counter when the party walks away, and only trades at the merchant', () => {
    const open = atForge(30);
    const walked = chroniclesReduce(open, 'turn-left');
    expect(walked.shop).toBeUndefined();
    // A stale open counter away from the merchant cannot trade.
    const away = { ...open, x: 9, y: 7 };
    expect(chroniclesReduce(away, { type: 'shop-buy', itemId: 'brass-dagger' })).toBe(away);
    expect(chroniclesReduce(open, { type: 'shop-close' }).shop).toBeUndefined();
  });

  it('persists purchases through a checkpoint but never an open counter', () => {
    let state = atForge(30);
    state = chroniclesReduce(state, { type: 'shop-buy', itemId: 'brass-spear' });
    const restored = chroniclesApplyRunCheckpoint(
      createChroniclesState('swordhaven-first-book'),
      chroniclesRunCheckpointPayload(state, 2),
    );
    expect(restored.inventory['brass-spear'].quantity).toBe(1);
    expect(chroniclesGoldBalance(restored)).toBe(30 - CHRONICLES_EQUIPMENT['brass-spear'].price);
    expect(restored.shop).toBeUndefined();
  });

  it('puts better-than-starter gear in enemy loot, as real catalog items', () => {
    const drops = ['banner-road-first-book', 'rookwood-first-book']
      .flatMap((mapId) => chroniclesMapById(mapId).enemies)
      .flatMap((enemy) => (enemy.onDefeat?.effects || []).filter((effect) => effect.type === 'grant-item'))
      .filter((effect) => CHRONICLES_EQUIPMENT[effect.itemId]);
    expect(drops.map((drop) => drop.itemId).sort()).toEqual(['bronze-mace', 'bronze-sword', 'iron-axe', 'iron-shield']);
    for (const drop of drops) {
      expect(CHRONICLES_EQUIPMENT[drop.itemId].tier).toBeGreaterThanOrEqual(1);
      expect(drop.name).toBe(CHRONICLES_EQUIPMENT[drop.itemId].name);
    }
  });
});
