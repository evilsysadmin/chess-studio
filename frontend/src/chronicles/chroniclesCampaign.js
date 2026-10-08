import {
  CHRONICLES_WORLD_LOCATIONS,
  CHRONICLES_WORLD_START,
  chroniclesWorldDestination,
} from './chroniclesWorldGraph.js';

// Pure transitions, no duplicated profile storage or remote checkpoint writer.
export const CHRONICLES_MAIN_QUEST_ID = 'missing-king';
export const CHRONICLES_QUEST_EVENTS = Object.freeze({
  audience: 'queen-audience',
  rumor: 'capital-guard-rumor',
  tracks: 'forest-tracks',
  clue: 'crypt-seal',
});

const QUEST_STAGES = Object.freeze({
  audience: 0,
  rumor: 1,
  tracks: 2,
  clue: 3,
});

export function createChroniclesCampaign() {
  return {
    version: 1,
    locationId: CHRONICLES_WORLD_START,
    arrivalExitId: null,
    visited: [CHRONICLES_WORLD_START],
    clues: [],
    questId: CHRONICLES_MAIN_QUEST_ID,
    questStage: 0,
  };
}

export function chroniclesCampaignTravel(campaign, exitId) {
  if (!campaign || !CHRONICLES_WORLD_LOCATIONS[campaign.locationId]) return null;
  const destination = chroniclesWorldDestination(campaign.locationId, exitId);
  if (!destination) return null;
  const visited = Array.isArray(campaign.visited) ? campaign.visited : [];
  return {
    ...campaign,
    ...destination,
    visited: visited.includes(destination.locationId) ? [...visited] : [...visited, destination.locationId],
  };
}

// Every clue has one authored source, a prerequisite and a real reachable location.
const CLUES = Object.freeze({
  [CHRONICLES_QUEST_EVENTS.audience]: { locationId: 'royal-capital', requires: null, stage: QUEST_STAGES.audience },
  [CHRONICLES_QUEST_EVENTS.rumor]: { locationId: 'royal-capital', requires: CHRONICLES_QUEST_EVENTS.audience, stage: QUEST_STAGES.rumor },
  [CHRONICLES_QUEST_EVENTS.tracks]: { locationId: 'old-forest-road', requires: CHRONICLES_QUEST_EVENTS.rumor, stage: QUEST_STAGES.tracks },
  [CHRONICLES_QUEST_EVENTS.clue]: { locationId: 'old-crypt', requires: CHRONICLES_QUEST_EVENTS.tracks, stage: QUEST_STAGES.clue },
});

export function chroniclesCampaignDiscover(campaign, clueId) {
  if (!campaign || !Array.isArray(campaign.clues)) return null;
  const clue = CLUES[clueId];
  if (!clue || campaign.locationId !== clue.locationId) return null;
  if (campaign.clues.includes(clueId)) return campaign; // no repeat rewards on retry/F5
  if (clue.requires && !campaign.clues.includes(clue.requires)) return null;
  return {
    ...campaign,
    clues: [...campaign.clues, clueId],
    questStage: Math.max(campaign.questStage || 0, clue.stage + 1),
  };
}

export function chroniclesCampaignObjective(campaign) {
  if (!campaign?.clues?.includes(CHRONICLES_QUEST_EVENTS.audience)) return 'Habla con la Dama en la capital.';
  if (!campaign.clues.includes(CHRONICLES_QUEST_EVENTS.rumor)) return 'Pregunta a la guardia por los caballeros desaparecidos.';
  if (!campaign.clues.includes(CHRONICLES_QUEST_EVENTS.tracks)) return 'Busca rastros de los caballeros en el Bosque Viejo.';
  if (!campaign.clues.includes(CHRONICLES_QUEST_EVENTS.clue)) return 'Investiga la Cripta Antigua.';
  return 'Has encontrado una pista del Rey. Regresa a la capital.';
}
