import { useState } from 'react';
import { isDeploymentReadyForBattle } from './combatDeployment.js';

export function deploymentStartDecision({ deadCount, requireConfirmation, confirmed, ready }) {
  if (deadCount > 0) return 'open';
  if (requireConfirmation && !confirmed) return 'confirm';
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
  const [showDeployment, setShowDeployment] = useState(() => Boolean(requireDeploymentConfirmation && !restoredSession));
  const [deploymentConfirmed, setDeploymentConfirmed] = useState(() => !requireDeploymentConfirmation || Boolean(restoredSession));

  function handleStartBattleClick(onStart) {
    const action = deploymentStartDecision({
      deadCount,
      requireConfirmation: requireDeploymentConfirmation,
      confirmed: deploymentConfirmed,
      ready: isDeploymentReadyForBattle(roster),
    });
    if (action !== 'start') {
      if (action === 'invalid') {
        // Una confirmación antigua deja de ser válida en cuanto cambia la
        // formación. Igual que hacía el controlador monolítico original,
        // obligamos a confirmar de nuevo después de corregir el despliegue.
        setDeploymentConfirmed(false);
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
    setDeploymentConfirmed(true);
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
    if (!isDeploymentReadyForBattle(roster)) {
      setDeploymentConfirmed(false);
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
