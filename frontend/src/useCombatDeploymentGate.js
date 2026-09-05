import { useState } from 'react';
import { isDeploymentReadyForBattle } from './combatDeployment.js';
import { deploymentSelectionFingerprint } from './combatTacticalDeployment.js';

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
  const [confirmedDeploymentFingerprint, setConfirmedDeploymentFingerprint] = useState(() => (
    initiallyConfirmed && requireDeploymentConfirmation
      ? deploymentSelectionFingerprint(roster)
      : null
  ));
  const currentDeploymentFingerprint = deploymentSelectionFingerprint(roster);
  const confirmationMatches = !requireDeploymentConfirmation
    || !deploymentConfirmed
    || confirmedDeploymentFingerprint === currentDeploymentFingerprint;

  // Todos los consumidores externos usan este setter, así que invalidar una
  // confirmación también borra su huella. Si alguien vuelve a confirmar de
  // forma explícita, la confirmación queda ligada a la formación ACTUAL.
  function setDeploymentConfirmed(value) {
    const next = typeof value === 'function' ? Boolean(value(deploymentConfirmed)) : Boolean(value);
    setDeploymentConfirmedState(next);
    setConfirmedDeploymentFingerprint(next && requireDeploymentConfirmation ? currentDeploymentFingerprint : null);
  }

  function invalidateDeploymentConfirmation() {
    setDeploymentConfirmedState(false);
    setConfirmedDeploymentFingerprint(null);
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
    onStart?.();
    return true;
  }

  function handleConfirmDeployment() {
    if (!isDeploymentReadyForBattle(roster)) return false;
    setDeploymentConfirmedState(true);
    setConfirmedDeploymentFingerprint(currentDeploymentFingerprint);
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
