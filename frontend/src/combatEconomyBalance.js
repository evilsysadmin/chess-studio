export const CAMPAIGN_STARTING_CREDITS = 6;
export const BATTLE_CREDIT_REWARD = Object.freeze({ battle: 4, elite: 7, boss: 12 });
export const CAMPAIGN_INTEL_BASE_COSTS = Object.freeze([3, 5, 7]);
export const CAMPAIGN_MISSION_BONUS_CAP = 9;

export const COMBAT_CAMPAIGN_ECONOMY = Object.freeze({
  startingSupplies: CAMPAIGN_STARTING_CREDITS,
  baseRewards: BATTLE_CREDIT_REWARD,
  intelBaseCosts: CAMPAIGN_INTEL_BASE_COSTS,
  missionBonusCap: CAMPAIGN_MISSION_BONUS_CAP,
});

export function fullIntelCost({ cipher = false } = {}) {
  return CAMPAIGN_INTEL_BASE_COSTS.reduce((sum, cost) => sum + Math.max(1, cost - (cipher ? 2 : 0)), 0);
}

export function projectedCampaignSupplies({ battleTypes = [], missionBonuses = [], intelPurchases = [], eventIncome = 0, relicIncome = 0 } = {}) {
  let supplies = CAMPAIGN_STARTING_CREDITS;
  let earned = 0;
  let spent = 0;
  battleTypes.forEach((type, index) => {
    const base = Number(BATTLE_CREDIT_REWARD[type] || 0);
    const mission = Math.min(CAMPAIGN_MISSION_BONUS_CAP, Math.max(0, Number(missionBonuses[index] || 0)));
    supplies += base + mission;
    earned += base + mission;
  });
  for (const purchase of intelPurchases) {
    const cost = Math.min(supplies, Math.max(0, Number(purchase || 0)));
    supplies -= cost;
    spent += cost;
  }
  supplies += Math.max(0, Number(eventIncome) || 0) + Math.max(0, Number(relicIncome) || 0);
  return { supplies, earned, spent };
}

export function combatEconomyHealth() {
  const fullIntel = fullIntelCost();
  const flawlessNormal = BATTLE_CREDIT_REWARD.battle + CAMPAIGN_MISSION_BONUS_CAP;
  const flawlessElite = BATTLE_CREDIT_REWARD.elite + CAMPAIGN_MISSION_BONUS_CAP;
  return {
    fullIntel, flawlessNormal, flawlessElite,
    normalFundsFullDossier: flawlessNormal >= fullIntel,
    startingFundsFullDossier: CAMPAIGN_STARTING_CREDITS >= fullIntel,
    missionCap: CAMPAIGN_MISSION_BONUS_CAP,
  };
}
