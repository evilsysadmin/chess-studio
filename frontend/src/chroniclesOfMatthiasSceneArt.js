import { installChroniclesTacticsFortressBackdrop } from './chroniclesOfMatthiasFortressArt.js';
import { installChroniclesTacticsForegroundFraming } from './chroniclesOfMatthiasForegroundArt.js';
import { installChroniclesTacticsWetStone } from './chroniclesOfMatthiasGroundArt.js';
import { installChroniclesTacticsFloorDetail } from './chroniclesOfMatthiasFloorDetailArt.js';
import { installChroniclesTacticsStoneWeathering } from './chroniclesOfMatthiasWeatheringArt.js';
import { installChroniclesTacticsPartyGrounding } from './chroniclesOfMatthiasPartyGroundingArt.js';
import { installChroniclesTacticsReadabilityArt } from './chroniclesOfMatthiasReadabilityArt.js';
import { installChroniclesTacticsEnemyIntentArt } from './chroniclesOfMatthiasEnemyIntentArt.js';
import { installChroniclesTacticsDamageFeedbackArt } from './chroniclesOfMatthiasDamageFeedbackArt.js';
import { installChroniclesTacticsArchitectureArt } from './chroniclesOfMatthiasArchitectureArt.js';
import { installChroniclesTacticsThemeDressing } from './chroniclesOfMatthiasThemeDressingArt.js';
import { installChroniclesTacticsSigilArt } from './chroniclesOfMatthiasSigilArt.js';
import { installChroniclesTacticsPremiumMaterials } from './chroniclesOfMatthiasMaterialArt.js';
import { installChroniclesTacticsPressurePlateArt } from './chroniclesOfMatthiasPressurePlateArt.js';

const PARTY_IDS = Object.freeze(['rook', 'matthias', 'bishop', 'knight']);

export function chroniclesTacticsUsesCanonicalSceneryFrame(scenePlan = null) {
  const width = Math.max(1, Number(scenePlan?.width) || 7);
  const height = Math.max(1, Number(scenePlan?.height) || 7);
  return width <= 7 && height <= 7;
}

export function installChroniclesTacticsSceneArt(models, {
  coarsePointer = false,
  scenePlan = undefined,
} = {}) {
  if (!models?.get) return null;
  const partyRoot = PARTY_IDS.map((id) => models.get(id)?.parent).find(Boolean) || null;
  const scene = partyRoot?.parent || null;
  if (!scene?.add) return null;

  const useCanonicalFrame = chroniclesTacticsUsesCanonicalSceneryFrame(scenePlan);
  const fortress = useCanonicalFrame
    ? installChroniclesTacticsFortressBackdrop(scene, { coarsePointer, scenePlan })
    : null;
  const foreground = useCanonicalFrame
    ? installChroniclesTacticsForegroundFraming(scene, { coarsePointer, scenePlan })
    : null;
  const materials = installChroniclesTacticsPremiumMaterials(scene, { coarsePointer });
  const wetStone = installChroniclesTacticsWetStone(scene, { coarsePointer });
  const floorDetail = installChroniclesTacticsFloorDetail(scene, { coarsePointer, scenePlan });
  const weathering = installChroniclesTacticsStoneWeathering(scene, { coarsePointer });
  const grounding = installChroniclesTacticsPartyGrounding(models, { coarsePointer });
  const readability = installChroniclesTacticsReadabilityArt(models, { coarsePointer });
  const architecture = installChroniclesTacticsArchitectureArt(scene, { coarsePointer, scenePlan });
  const themeDressing = installChroniclesTacticsThemeDressing(scene, { coarsePointer, scenePlan });
  const pressurePlates = installChroniclesTacticsPressurePlateArt(scene, { coarsePointer, scenePlan });
  const sigil = installChroniclesTacticsSigilArt(scene);
  const enemyIntent = installChroniclesTacticsEnemyIntentArt(scene, { coarsePointer });
  const damageFeedback = installChroniclesTacticsDamageFeedbackArt(models, { coarsePointer });

  return {
    fortress,
    foreground,
    materials,
    wetStone,
    floorDetail,
    weathering,
    grounding,
    readability,
    architecture,
    themeDressing,
    pressurePlates,
    sigil,
    enemyIntent,
    damageFeedback,
  };
}
