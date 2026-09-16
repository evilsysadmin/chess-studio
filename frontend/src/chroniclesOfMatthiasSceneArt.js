import { installChroniclesTacticsFortressBackdrop } from './chroniclesOfMatthiasFortressArt.js';
import { installChroniclesTacticsForegroundFraming } from './chroniclesOfMatthiasForegroundArt.js';
import { installChroniclesTacticsWetStone } from './chroniclesOfMatthiasGroundArt.js';
import { installChroniclesTacticsStoneWeathering } from './chroniclesOfMatthiasWeatheringArt.js';
import { installChroniclesTacticsPartyGrounding } from './chroniclesOfMatthiasPartyGroundingArt.js';
import { installChroniclesTacticsReadabilityArt } from './chroniclesOfMatthiasReadabilityArt.js';
import { installChroniclesTacticsEnemyIntentArt } from './chroniclesOfMatthiasEnemyIntentArt.js';

const PARTY_IDS = Object.freeze(['rook', 'matthias', 'bishop', 'knight']);

export function installChroniclesTacticsSceneArt(models, { coarsePointer = false } = {}) {
  if (!models?.get) return null;
  const partyRoot = PARTY_IDS.map((id) => models.get(id)?.parent).find(Boolean) || null;
  const scene = partyRoot?.parent || null;
  if (!scene?.add) return null;

  return {
    fortress: installChroniclesTacticsFortressBackdrop(scene, { coarsePointer }),
    foreground: installChroniclesTacticsForegroundFraming(scene, { coarsePointer }),
    wetStone: installChroniclesTacticsWetStone(scene, { coarsePointer }),
    weathering: installChroniclesTacticsStoneWeathering(scene, { coarsePointer }),
    grounding: installChroniclesTacticsPartyGrounding(models, { coarsePointer }),
    readability: installChroniclesTacticsReadabilityArt(models, { coarsePointer }),
    enemyIntent: installChroniclesTacticsEnemyIntentArt(scene, { coarsePointer }),
  };
}
