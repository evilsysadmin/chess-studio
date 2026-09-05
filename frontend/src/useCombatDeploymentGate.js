import { useState } from 'react';
import { isDeploymentReadyForBattle } from './combatDeployment.js';
import { deploymentSelectionFingerprint, freezeTacticalRosterSnapshot } from './combatTacticalDeployment.js';

export function deploymentStartDecision({ deadCount, requireConfirmation, confirmed, ready, confirmationMatches = true }) {
  if (deadCount > 0) return 'open';
  if (requireConfirmation && !confirmed) return 'confirm';
  if (requireConfirmation && confirmed && !confirmationMatches) return 'invalid';
  if (requireConfirmation && !ready) return 'invalid';
  return 'start';
}

export function useCombatDeploymentGate({
  requireDeploymentConfirmation,
  restoredSession,
  roster,
  deadCount,
  onError,
}) {
  const [showDeployment, setShowDeployment] = useState(false);
  const initiallyConfirmed = !requireDeploymentConfirmation || Boolean(restoredSession);
  const [deploymentConfirmed, setDeploymentConfirmedState] = useState(initiallyConfirmed);
  const [confirmedRosterSnapshot, setConfirmedRosterSnapshot] = useState(() => (
    initiallyConfirmed && requireDeploymentConfirmation
      ? freezeTacticalRosterSnapshot(restoredSession?.battleStartRoster || roster)
      : null
  ));
  const [confirmedDeploymentFingerprint, setConfirmedDeploymentFingerprint] = useState(() => (
    initiallyConfirmed && requireDeploymentConfirmation
      ? deploymentSelectionFingerprint(restoredSession?.battleStartRoster || roster)
      : null
  ));
  const currentDeploymentFingerprint = deploymentSelectionFingerprint(roster);
  const confirmationMatches = !requireDeploymentConfirmation
    || !deploymentConfirmed
    || confirmedDeploymentFingerprint === currentDeploymentFingerprint;

  // Todos los consumidores externos usan este setter, así que invalidar una
  // confirmación también borra su huella y snapshot. Una confirmación explícita
  // congela el roster actual antes de que cualquier otro estado React cambie.
  function setDeploymentConfirmed(value) {
    const next = typeof value === 'function' ? Boolean(value(deploymentConfirmed)) : Boolean(value);
    setDeploymentConfirmedState(next);
    if (!next || !requireDeploymentConfirmation) {
      setConfirmedDeploymentFingerprint(null);
      setConfirmedRosterSnapshot(null);
      return;
    }
    const frozen = freezeTacticalRosterSnapshot(roster);
    setConfirmedRosterSnapshot(frozen);
    setConfirmedDeploymentFingerprint(deploymentSelectionFingerprint(frozen));
  }

  function invalidateDeploymentConfirmation() {
    setDeploymentConfirmedState(false);
    setConfirmedDeploymentFingerprint(null);
    setConfirmedRosterSnapshot(null);
  }

  function handleStartBattleClick(onStart) {
    const action = deploymentStartDecision({
      deadCount,
      requireConfirmation: requireDeploymentConfirmation,
      confirmed: deploymentConfirmed,
      ready: isDeploymentReadyForBattle(roster),
      confirmationMatches,
    });
    if (action !== 'start') {
      if (action === 'invalid') {
        invalidateDeploymentConfirmation();
        onError?.('El despliegue cambió o tiene bajas pendientes. Revísalo y confirma de nuevo.');
      }
      setShowDeployment(true);
      return false;
    }
    if (requireDeploymentConfirmation) {
      const frozen = confirmedRosterSnapshot || freezeTacticalRosterSnapshot(roster);
      onStart?.({ rosterOverride: frozen, deploymentValidated: true });
    } else {
      onStart?.();
    }
    return true;
  }

  function handleConfirmDeployment() {
    if (!isDeploymentReadyForBattle(roster)) return false;
    const frozen = freezeTacticalRosterSnapshot(roster);
    setDeploymentConfirmedState(true);
    setConfirmedRosterSnapshot(frozen);
    setConfirmedDeploymentFingerprint(deploymentSelectionFingerprint(frozen));
    setShowDeployment(false);
    return true;
  }

  function guardBattleStart() {
    if (!requireDeploymentConfirmation) return true;
    if (!deploymentConfirmed) {
      setShowDeployment(true);
      onError?.('Confirma el despliegue antes de iniciar la operación.');
      return false;
    }
    if (!confirmationMatches || !isDeploymentReadyForBattle(roster)) {
      invalidateDeploymentConfirmation();
      setShowDeployment(true);
      onError?.('El despliegue cambió o tiene bajas pendientes. Revísalo y confirma de nuevo.');
      return false;
    }
    return true;
  }

  return {
    showDeployment,
    setShowDeployment,
    deploymentConfirmed,
    setDeploymentConfirmed,
    handleStartBattleClick,
    handleConfirmDeployment,
    guardBattleStart,
  };
}
