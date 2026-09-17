import { buildCorruptedPawn, buildGateJailer } from './chroniclesOfMatthiasArt.js';
import { buildScavengerKnight } from './chroniclesOfMatthiasScavengerKnight.js';
import { buildSpectralBishop } from './chroniclesOfMatthiasSpectralBishop.js';
import {
  buildAshGoblin,
  buildBoneHound,
  buildCryptSpider,
  buildEmberWisp,
} from './chroniclesFantasyEnemyArt.js';
import { installChroniclesEnemyMotionArt } from './chroniclesEnemyMotionArt.js';

const VISUALS = Object.freeze({
  'corrupted-pawn': Object.freeze({ build: buildCorruptedPawn, scale: 0.92 }),
  'gate-jailer': Object.freeze({ build: buildGateJailer, scale: 1.04 }),
  'spectral-bishop': Object.freeze({ build: buildSpectralBishop, scale: 0.9 }),
  'scavenger-knight': Object.freeze({ build: buildScavengerKnight, scale: 0.96 }),
  'ash-goblin': Object.freeze({ build: buildAshGoblin, scale: 0.9 }),
  'crypt-spider': Object.freeze({ build: buildCryptSpider, scale: 0.82 }),
  'ember-wisp': Object.freeze({ build: buildEmberWisp, scale: 0.78 }),
  'bone-hound': Object.freeze({ build: buildBoneHound, scale: 0.92 }),
});

export function chroniclesEnemyVisualSpec(visualType) {
  const visual = VISUALS[visualType];
  if (!visual) return null;
  return Object.freeze({ visualType, scale: visual.scale });
}

export function buildChroniclesEnemyVisual(visualType, options = {}) {
  const visual = VISUALS[visualType];
  if (!visual) return null;
  const model = visual.build(options);
  installChroniclesEnemyMotionArt(model, visualType, options);
  return Object.freeze({
    model,
    scale: visual.scale,
  });
}
