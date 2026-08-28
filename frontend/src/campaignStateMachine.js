import { strictInvariant, transition } from './stateTransition.js';

export const CAMPAIGN_PHASES = Object.freeze(['idle', 'map', 'briefing', 'battle', 'fighting', 'reward', 'event', 'camp', 'completed']);

const T = Object.freeze({
  idle: { start: 'map' },
  map: { select_battle: 'briefing', select_event: 'event', select_camp: 'camp', complete: 'completed' },
  briefing: { prepare: 'battle', recover: 'briefing', cancel: 'map' },
  battle: { fight: 'fighting', retire: 'briefing', recover: 'briefing' },
  fighting: { win: 'reward', win_boss: 'completed', retire: 'briefing', recover: 'briefing' },
  reward: { reward: 'map' },
  event: { resolve: 'map' },
  camp: { reward: 'map' },
  completed: {},
});

export function campaignPhaseTransition(state, event) { return transition(T, state, event); }

export function assertCampaignInvariant(state, node = null) {
  strictInvariant(Boolean(state && typeof state === 'object'), 'campaign state missing');
  strictInvariant(CAMPAIGN_PHASES.includes(state.phase), `unknown campaign phase ${state.phase}`);
  strictInvariant((Number(state.operationalCredits) || 0) >= 0, 'operational credits cannot be negative');
  const selectedRequired = ['briefing', 'battle', 'fighting', 'reward', 'event', 'camp'].includes(state.phase);
  if (selectedRequired) strictInvariant(Boolean(state.selectedNodeId), `${state.phase} requires selected node`);
  if (['map', 'completed', 'idle'].includes(state.phase)) strictInvariant(!state.selectedNodeId, `${state.phase} must not keep selected node`);
  if (node && ['briefing', 'battle', 'fighting'].includes(state.phase)) strictInvariant(['battle', 'elite', 'boss'].includes(node.type), `${state.phase} requires a combat node`);
  return true;
}
