import { buyStatPoint } from './combat.js';
import { renameRosterIdentity, resetRoster, revivePiece, replaceDeadPiece, saveRoster } from './combatRoster.js';
import { setRosterDeploymentType } from './combatMetamorphosis.js';
import { autofillDeployment, ensureDeploymentState, removeDeploymentUnit, resetDeployment, setDeploymentUnit } from './combatDeployment.js';
import { applyDeploymentPreset } from './combatDeploymentPresets.js';
import { setRosterEquippedTechnique, unlockRosterTechnique } from './combatTechniques.js';

function persistRosterUpdate(setRoster, updater) {
  setRoster((prev) => {
    const next = updater(prev);
    if (next === prev) return prev;
    saveRoster(next);
    return next;
  });
}

export function createCombatRosterActions({ setRoster, requireDeploymentConfirmation = false, setDeploymentConfirmed }) {
  const dirtyDeployment = () => {
    if (requireDeploymentConfirmation) setDeploymentConfirmed(false);
  };

  return {
    resetRoster: () => setRoster(resetRoster()),
    buyStat(key, stat) {
      dirtyDeployment();
      persistRosterUpdate(setRoster, (prev) => {
        const saved = prev.pieces[key] || { strengthPoints: 0, speedPoints: 0, bankedXp: 0, alive: true };
        if (saved.alive === false) return prev;
        const virtualPiece = { type: saved.deploymentType || key.split('-')[0], ...saved };
        const updated = buyStatPoint(virtualPiece, stat);
        if (!updated) return prev;
        return {
          ...prev,
          pieces: {
            ...prev.pieces,
            [key]: {
              ...saved,
              strengthPoints: updated.strengthPoints,
              speedPoints: updated.speedPoints,
              bankedXp: updated.bankedXp,
              alive: true,
              deploymentType: saved.deploymentType || null,
            },
          },
        };
      });
    },
    rename(key, alias) {
      persistRosterUpdate(setRoster, (prev) => renameRosterIdentity(prev, key, alias));
    },
    metamorphose(key, targetType) {
      dirtyDeployment();
      persistRosterUpdate(setRoster, (prev) => {
        const changed = setRosterDeploymentType(prev, key, targetType);
        return changed === prev ? prev : ensureDeploymentState(changed);
      });
    },
    deploy(slotKey, unitKey) {
      dirtyDeployment();
      persistRosterUpdate(setRoster, (prev) => setDeploymentUnit(prev, slotKey, unitKey));
    },
    removeDeployed(unitKey) {
      dirtyDeployment();
      persistRosterUpdate(setRoster, (prev) => removeDeploymentUnit(prev, unitKey));
    },
    resetDeployment() {
      dirtyDeployment();
      persistRosterUpdate(setRoster, (prev) => resetDeployment(prev));
    },
    autofill(preferVeterans = true) {
      dirtyDeployment();
      persistRosterUpdate(setRoster, (prev) => autofillDeployment(prev, { preferVeterans }));
    },
    applyPreset(preset) {
      dirtyDeployment();
      persistRosterUpdate(setRoster, (prev) => applyDeploymentPreset(prev, preset));
    },
    unlockTechnique(key, techniqueId) {
      dirtyDeployment();
      persistRosterUpdate(setRoster, (prev) => unlockRosterTechnique(prev, key, techniqueId));
    },
    equipTechnique(key, techniqueId) {
      dirtyDeployment();
      persistRosterUpdate(setRoster, (prev) => setRosterEquippedTechnique(prev, key, techniqueId));
    },
    revive(key, type) {
      dirtyDeployment();
      persistRosterUpdate(setRoster, (prev) => revivePiece(prev, key, type));
    },
    replace(key) {
      dirtyDeployment();
      persistRosterUpdate(setRoster, (prev) => replaceDeadPiece(prev, key));
    },
  };
}
