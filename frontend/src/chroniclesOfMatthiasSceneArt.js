import { installChroniclesTacticsFortressBackdrop } from './chroniclesOfMatthiasFortressArt.js';
import { installChroniclesTacticsForegroundFraming } from './chroniclesOfMatthiasForegroundArt.js';
import { installChroniclesTacticsWetStone } from './chroniclesOfMatthiasGroundArt.js';
import { installChroniclesTacticsStoneWeathering } from './chroniclesOfMatthiasWeatheringArt.js';
import { installChroniclesTacticsPartyGrounding } from './chroniclesOfMatthiasPartyGroundingArt.js';
import { installChroniclesTacticsReadabilityArt } from './chroniclesOfMatthiasReadabilityArt.js';
import { installChroniclesTacticsEnemyIntentArt } from './chroniclesOfMatthiasEnemyIntentArt.js';
import { installChroniclesTacticsDamageFeedbackArt } from './chroniclesOfMatthiasDamageFeedbackArt.js';
import { installChroniclesTacticsArchitectureArt } from './chroniclesOfMatthiasArchitectureArt.js';

const PARTY_IDS = Object.freeze(['rook', 'matthias', 'bishop', 'knight']);

export function installChroniclesTacticsSceneArt(models, { coarsePointer = false } = {}) {
  if (!models?.get) return null;
  const partyRoot = PARTY_IDS.map((id) => models.get(id)?.parent).find(Boolean) || null;
  const scene = partyRoot?.parent || null;
  if (!scene?.add) return null;

  const fortress = installChroniclesTacticsFortressBackdrop(scene, { coarsePointer });
  const foreground = installChroniclesTacticsForegroundFraming(scene, { coarsePointer });
  const wetStone = installChroniclesTacticsWetStone(scene, { coarsePointer });
  const weathering = installChroniclesTacticsStoneWeathering(scene, { coarsePointer });
  const grounding = installChroniclesTacticsPartyGrounding(models, { coarsePointer });
  const readability = installChroniclesTacticsReadabilityArt(models, { coarsePointer });
  const architecture = installChroniclesTacticsArchitectureArt(scene, { coarsePointer });
  const enemyIntent = installChroniclesTacticsEnemyIntentArt(scene, { coarsePointer });
  const damageFeedback = installChroniclesTacticsDamageFeedbackArt(models, { coarsePointer });

  return {
    fortress,
    foreground,
    wetStone,
    weathering,
    grounding,
    readability,
    architecture,
    enemyIntent,
    damageFeedback,
  };
}
