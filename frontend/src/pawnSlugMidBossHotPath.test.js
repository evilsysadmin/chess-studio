import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_STURM_BISHOP_META,
  animateSturmBishopModel,
  createSturmBishopModel,
  pawnSlugSturmBishopEntryPose,
  pawnSlugSturmBishopEntryPoseValues,
  pawnSlugSturmBishopSuppressionLane,
} from './pawnSlugMidBoss.js';

describe('Pawn Slug Sturm-Bishop hot path', () => {
  it('caches the exact visual nodes animated every frame', () => {
    const model = createSturmBishopModel();
    const refs = model.userData.sturmVisualRefs;
    expect(refs.warningHalo?.userData.warningHalo).toBe(true);
    expect(refs.weakPoints).toHaveLength(1);
    expect(refs.suppressionTelegraphs).toHaveLength(PAWN_SLUG_STURM_BISHOP_META.weaponMounts);
    expect(refs.shellTelegraphs).toHaveLength(PAWN_SLUG_STURM_BISHOP_META.weaponMounts);
  });

  it('animates from cached refs without traversing the model tree', () => {
    const model = createSturmBishopModel();
    model.userData.entryStartedAt = 0;
    model.traverse = () => { throw new Error('hot path must not traverse'); };

    expect(() => animateSturmBishopModel(
      model,
      PAWN_SLUG_STURM_BISHOP_META.entrySeconds + 1,
      { moving: true, telegraph: 1, suppressionTelegraph: 0.5 },
    )).not.toThrow();
    expect(model.userData.sturmVisualRefs.warningHalo.visible).toBe(true);
    expect(model.userData.sturmVisualRefs.shellTelegraphs.every((node) => node.material.emissiveIntensity > 0)).toBe(true);
  });

  it('reuses settled entry identity and suppression lane definitions', () => {
    const settledScalar = pawnSlugSturmBishopEntryPoseValues(99, false);
    const settledObject = pawnSlugSturmBishopEntryPose(99);
    expect(settledObject).toBe(settledScalar);

    expect(pawnSlugSturmBishopSuppressionLane(0)).toBe(pawnSlugSturmBishopSuppressionLane(3));
    expect(pawnSlugSturmBishopSuppressionLane(1)).toBe(pawnSlugSturmBishopSuppressionLane(4));
  });
});
