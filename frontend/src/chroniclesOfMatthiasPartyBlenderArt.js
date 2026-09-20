import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { installChroniclesPartyFallbackDetails } from './chroniclesOfMatthiasBlenderArt.js';
import { installChroniclesTacticsSceneArt } from './chroniclesOfMatthiasSceneArt.js';
import { installChroniclesDefaultLoadoutArt } from './chroniclesOfMatthiasPartyEquipmentArt.js';
import { r2AssetUrl } from './r2Assets.js';

export const CHRONICLES_TACTICS_PARTY_R2_ASSET_ID = 'chronicles.tactics.party.runtime';
export const CHRONICLES_TACTICS_PARTY_LEGACY_MODEL_PATH = 'models/chronicles-tactics-party.glb';
export const CHRONICLES_TACTICS_PARTY_ASSET_VERSION = 'chronicles-humanoid-party-v8';
export const CHRONICLES_TACTICS_PARTY_MEMBERS = Object.freeze(['rook', 'bishop', 'knight']);

const LEGACY_PARTY_MODEL_URL = `${import.meta.env.BASE_URL}${CHRONICLES_TACTICS_PARTY_LEGACY_MODEL_PATH}`;
export const CHRONICLES_TACTICS_PARTY_MODEL_URL = r2AssetUrl(
  CHRONICLES_TACTICS_PARTY_R2_ASSET_ID,
  LEGACY_PARTY_MODEL_URL,
);
let partyLoadPromise = null;

function loadPartyAsset() {
  if (!partyLoadPromise) {
    const loader = new GLTFLoader();
    partyLoadPromise = loader.loadAsync(CHRONICLES_TACTICS_PARTY_MODEL_URL).catch((error) => {
      partyLoadPromise = null;
      throw error;
    });
  }
  return partyLoadPromise;
}

export function configureChroniclesTacticsPartyVisual(root, { coarsePointer = false } = {}) {
  if (!root) return root;

  // Placement belongs to the tactical member root, but the GLB's authored
  // orientation and scale belong to the asset. Resetting rotation/scale here
  // discarded Blender/glTF axis compensation and could leave otherwise valid
  // party members lying on their side.
  root.position.set(0, 0, 0);
  root.userData.chroniclesAuthoredTransformPreserved = true;
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = !coarsePointer;
    node.receiveShadow = true;
    node.frustumCulled = true;
  });
  return root;
}

export function installChroniclesTacticsPartyLoadout(
  memberRoot,
  visual,
  memberId,
  { coarsePointer = false } = {},
) {
  // The canonical Blender cast already contains the default weapon/armour kit.
  // Adding the procedural loadout on top renders a second breastplate/weapon
  // assembly at the member origin, which reads as a body lying on the floor.
  // Keep procedural equipment only for non-authored fallback visuals.
  if (visual) {
    visual.userData.chroniclesLoadoutSource = 'embedded-glb';
    return () => {};
  }
  if (!memberRoot) return () => {};
  memberRoot.userData.chroniclesLoadoutSource = 'procedural-fallback';
  return installChroniclesDefaultLoadoutArt(memberRoot, memberId, { coarsePointer });
}

function hideFallbackChildren(memberRoot, visual) {
  [...memberRoot.children].forEach((child) => {
    if (child !== visual) child.visible = false;
  });
}

function restoreFallbackChildren(memberRoot, visual) {
  [...memberRoot.children].forEach((child) => {
    if (child !== visual) child.visible = true;
  });
}

function clipForMember(animations, memberId) {
  return animations?.find((clip) => clip.name === chroniclesTacticsPartyIdleName(memberId)) || null;
}

export function chroniclesTacticsPartyRootName(memberId) {
  return `ChroniclesParty__${memberId}`;
}

export function chroniclesTacticsPartyIdleName(memberId) {
  return `Idle.${memberId}`;
}

export function installChroniclesTacticsPartyBlenderArt(
  models,
  { coarsePointer = false, reducedMotion = false, scenePlan = undefined } = {},
) {
  if (!models?.get) return () => {};

  let cancelled = false;
  const installed = [];
  const fallbackDetailCancels = [];
  const loadoutCancels = [];
  installChroniclesTacticsSceneArt(models, { coarsePointer, scenePlan });

  const installFallbackDetails = (memberIds) => {
    const requested = memberIds.filter((memberId) => models.get(memberId));
    if (!requested.length || cancelled) return;
    const fallbackPartyRoot = models.get(requested[0])?.parent || null;
    if (!fallbackPartyRoot) return;
    fallbackDetailCancels.push(installChroniclesPartyFallbackDetails(fallbackPartyRoot, {
      coarsePointer,
      memberIds: requested,
    }));
  };

  CHRONICLES_TACTICS_PARTY_MEMBERS.forEach((memberId) => {
    const memberRoot = models.get(memberId);
    if (memberRoot) memberRoot.userData.chroniclesPartyArtSource = 'procedural-fallback-loading';
  });

  void loadPartyAsset()
    .then((gltf) => {
      if (cancelled || !gltf?.scene) return;

      const missingMembers = [];
      CHRONICLES_TACTICS_PARTY_MEMBERS.forEach((memberId) => {
        const memberRoot = models.get(memberId);
        const source = gltf.scene.getObjectByName(chroniclesTacticsPartyRootName(memberId));
        if (!memberRoot || !source) {
          if (memberRoot) {
            memberRoot.userData.chroniclesPartyArtSource = 'procedural-fallback';
            missingMembers.push(memberId);
          }
          return;
        }

        // Keep the cached GLTF scene immutable so a destroyed/remounted Tactics
        // view can reuse the single network load instead of losing its roots.
        const visual = source.clone(true);
        visual.name = source.name;
        configureChroniclesTacticsPartyVisual(visual, { coarsePointer });
        const priorTick = memberRoot.userData.chroniclesArtTick || null;
        memberRoot.add(visual);
        hideFallbackChildren(memberRoot, visual);
        loadoutCancels.push(installChroniclesTacticsPartyLoadout(
          memberRoot,
          visual,
          memberId,
          { coarsePointer },
        ));
        memberRoot.userData.chroniclesPartyArtSource = CHRONICLES_TACTICS_PARTY_ASSET_VERSION;

        const clip = clipForMember(gltf.animations, memberId);
        let mixer = null;
        if (clip) {
          mixer = new THREE.AnimationMixer(visual);
          mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play();
          if (reducedMotion) mixer.setTime(Math.max(0, clip.duration * 0.34));
          else {
            memberRoot.userData.chroniclesArtTick = (time) => {
              priorTick?.(time);
              mixer?.setTime(Math.max(0, Number(time) || 0) % Math.max(0.01, clip.duration));
            };
          }
        }

        installed.push({ memberRoot, visual, mixer, priorTick });
      });

      installFallbackDetails(missingMembers);
    })
    .catch(() => {
      if (cancelled) return;
      const fallbackMembers = [];
      CHRONICLES_TACTICS_PARTY_MEMBERS.forEach((memberId) => {
        const memberRoot = models.get(memberId);
        if (memberRoot) {
          memberRoot.userData.chroniclesPartyArtSource = 'procedural-fallback';
          fallbackMembers.push(memberId);
        }
      });
      installFallbackDetails(fallbackMembers);
    });

  return () => {
    cancelled = true;
    fallbackDetailCancels.splice(0).forEach((cancelFallbackDetails) => cancelFallbackDetails?.());
    loadoutCancels.splice(0).forEach((cancelLoadout) => cancelLoadout?.());
    installed.forEach(({ memberRoot, visual, mixer, priorTick }) => {
      mixer?.stopAllAction?.();
      memberRoot.userData.chroniclesArtTick = priorTick;
      restoreFallbackChildren(memberRoot, visual);
      visual.removeFromParent();
      memberRoot.userData.chroniclesPartyArtSource = 'procedural-fallback';
    });
    installed.length = 0;
  };
}
