import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { installChroniclesTacticsSceneArt } from './chroniclesOfMatthiasSceneArt.js';
import {
  chroniclesTacticsTrapVisualMode,
  syncChroniclesTacticsPressurePlateArt,
} from './chroniclesOfMatthiasPressurePlateArt.js';

function sceneModels() {
  const scene = new THREE.Scene();
  const partyRoot = new THREE.Group();
  scene.add(partyRoot);
  const models = new Map();
  ['rook', 'matthias', 'bishop', 'knight'].forEach((id, index) => {
    const model = new THREE.Group();
    model.position.set((index - 1.5) * 0.9, 0, index % 2 ? 0.28 : 0.08);
    partyRoot.add(model);
    models.set(id, model);
  });
  return { scene, partyRoot, models };
}

describe('Chronicles Tactics canonical scene art orchestrator', () => {
  it('mounts every canonical decorative layer from one entry point', () => {
    const { scene, partyRoot, models } = sceneModels();
    const art = installChroniclesTacticsSceneArt(models, { coarsePointer: true });

    expect(art?.fortress?.name).toBe('chronicles-fortress-backdrop');
    expect(art?.foreground?.name).toBe('chronicles-foreground-framing');
    expect(art?.wetStone?.name).toBe('chronicles-wet-stone');
    expect(art?.weathering?.name).toBe('chronicles-stone-weathering');
    expect(art?.grounding?.name).toBe('chronicles-party-grounding');
    expect(art?.architecture?.name).toBe('chronicles-tactics-architecture-depth');
    expect(art?.pressurePlates?.name).toBe('chronicles-tactics-pressure-plates');
    expect(art?.damageFeedback?.name).toBe('chronicles-party-damage-feedback');
    expect(scene.getObjectByName('chronicles-fortress-backdrop')).toBeTruthy();
    expect(scene.getObjectByName('chronicles-wet-stone')).toBeTruthy();
    expect(scene.getObjectByName('chronicles-tactics-architecture-depth')).toBeTruthy();
    expect(scene.getObjectByName('chronicles-tactics-pressure-plates')).toBeTruthy();
    expect(partyRoot.getObjectByName('chronicles-party-grounding')).toBeTruthy();
    expect(partyRoot.getObjectByName('chronicles-party-damage-feedback')).toBeTruthy();
  });

  it('forwards supplied map topology into the premium architecture layer', () => {
    const { models } = sceneModels();
    const scenePlan = {
      center: { x: 8, y: 9 },
      wallFaces: [],
    };
    const art = installChroniclesTacticsSceneArt(models, { coarsePointer: true, scenePlan });

    expect(art?.architecture?.userData.chroniclesSceneCenter).toEqual({ x: 8, y: 9 });
    expect(art?.architecture?.userData.chroniclesArchitectureWallCount).toBe(0);
  });

  it('renders every authored floor trap with stable ids and distinct silhouettes', () => {
    const { scene, models } = sceneModels();
    const scenePlan = {
      center: { x: 5, y: 4 },
      wallFaces: [],
      content: [
        { id: 'slag-vent-west', kind: 'trap', visualType: 'slag-vent', position: { x: 5, y: 6 } },
        { id: 'chain-plate-east', kind: 'trap', visualType: 'chain-plate', position: { x: 9, y: 5 } },
      ],
    };

    const art = installChroniclesTacticsSceneArt(models, { coarsePointer: true, scenePlan });
    const traps = art?.pressurePlates;

    expect(traps?.userData.chroniclesTrapCount).toBe(2);
    expect(traps?.userData.chroniclesTrapIds).toEqual(['slag-vent-west', 'chain-plate-east']);
    expect(scene.getObjectByName('chronicles-trap-slag-vent-west')?.userData.chroniclesTrapVisualType).toBe('slag-vent');
    expect(scene.getObjectByName('chronicles-trap-chain-plate-east')?.userData.chroniclesTrapVisualType).toBe('chain-plate');
    expect(scene.getObjectByName('chronicles-trap-slag-vent-west')?.position.z)
      .toBeGreaterThan(scene.getObjectByName('chronicles-trap-chain-plate-east')?.position.z);
  });

  it('maps authored trap runtime state to armed, spent and safe visual poses', () => {
    expect(chroniclesTacticsTrapVisualMode({ available: true, activated: false })).toBe('armed');
    expect(chroniclesTacticsTrapVisualMode({ available: false, activated: true })).toBe('spent');
    expect(chroniclesTacticsTrapVisualMode({ available: false, activated: false })).toBe('safe');

    const { scene, models } = sceneModels();
    const scenePlan = {
      center: { x: 5, y: 4 },
      wallFaces: [],
      content: [
        { id: 'slag-vent-west', kind: 'trap', visualType: 'slag-vent', position: { x: 5, y: 6 } },
        { id: 'chain-plate-east', kind: 'trap', visualType: 'chain-plate', position: { x: 9, y: 5 } },
      ],
    };
    installChroniclesTacticsSceneArt(models, { coarsePointer: true, scenePlan });

    syncChroniclesTacticsPressurePlateArt(scene, [
      { id: 'slag-vent-west', available: true, activated: false },
      { id: 'chain-plate-east', available: true, activated: false },
    ], { now: 1 });
    const vent = scene.getObjectByName('chronicles-trap-slag-vent-west');
    const plate = scene.getObjectByName('chronicles-trap-chain-plate-east');
    expect(vent?.userData.chroniclesTrapVisualMode).toBe('armed');
    expect(vent?.userData.chroniclesTrapVisual?.glow?.intensity).toBeGreaterThan(0);
    expect(plate?.userData.chroniclesTrapVisualMode).toBe('armed');
    const armedPlateY = plate?.userData.chroniclesTrapVisual?.plate?.position?.y;

    syncChroniclesTacticsPressurePlateArt(scene, [
      { id: 'slag-vent-west', available: false, activated: true },
      { id: 'chain-plate-east', available: false, activated: true },
    ], { now: 2 });
    expect(vent?.userData.chroniclesTrapVisualMode).toBe('spent');
    expect(vent?.userData.chroniclesTrapTriggeredAt).toBe(2);
    expect(plate?.userData.chroniclesTrapVisualMode).toBe('spent');
    expect(plate?.userData.chroniclesTrapVisual?.plate?.position?.y).toBeLessThan(armedPlateY);

    syncChroniclesTacticsPressurePlateArt(scene, [
      { id: 'slag-vent-west', available: false, activated: false },
      { id: 'chain-plate-east', available: false, activated: false },
    ], { now: 3 });
    expect(vent?.userData.chroniclesTrapVisualMode).toBe('safe');
    expect(vent?.userData.chroniclesTrapVisual?.glow?.intensity).toBe(0);
    expect(plate?.userData.chroniclesTrapVisualMode).toBe('safe');
  });

  it('reuses idempotent canonical layers when called twice', () => {
    const { models } = sceneModels();
    const first = installChroniclesTacticsSceneArt(models, { coarsePointer: false });
    const second = installChroniclesTacticsSceneArt(models, { coarsePointer: false });

    expect(second?.fortress).toBe(first?.fortress);
    expect(second?.foreground).toBe(first?.foreground);
    expect(second?.wetStone).toBe(first?.wetStone);
    expect(second?.weathering).toBe(first?.weathering);
    expect(second?.grounding).toBe(first?.grounding);
    expect(second?.architecture).toBe(first?.architecture);
    expect(second?.pressurePlates).toBe(first?.pressurePlates);
    expect(second?.damageFeedback).toBe(first?.damageFeedback);
  });

  it('fails closed when party roots are unavailable', () => {
    expect(installChroniclesTacticsSceneArt(null)).toBeNull();
    expect(installChroniclesTacticsSceneArt(new Map())).toBeNull();
  });
});