// Copy and routing for the one-action Combat Chess campaign entry. No game state
// is persisted or inferred here; the controller remains the only battle authority.
export function combatPreparationChoice({ deadCount = 0, ready = false, missing = 0, confirmed = false } = {}) {
  if (deadCount > 0) {
    return {
      label: 'RESOLVER BAJAS →',
      cue: 'TU EJÉRCITO TE NECESITA',
      help: `${deadCount} unidad${deadCount === 1 ? '' : 'es'} caída${deadCount === 1 ? '' : 's'}. Decide si recuperarla${deadCount === 1 ? '' : 's'} o sustituirla${deadCount === 1 ? '' : 's'} antes de combatir.`,
      action: 'resolve',
    };
  }
  if (!ready) {
    return {
      label: 'ORGANIZAR Y COMBATIR →',
      cue: 'PREPARACIÓN RÁPIDA',
      help: `Hay ${missing} puesto${missing === 1 ? '' : 's'} libre${missing === 1 ? '' : 's'}. La opción rápida reorganiza todo el ejército priorizando veteranos. Puedes editarlo primero.`,
      action: 'quick',
    };
  }
  return {
    label: '¡ENTRAR EN COMBATE! →',
    cue: 'EJÉRCITO LISTO',
    help: 'Tu formación está preparada. Puedes combatir ahora o cambiar piezas antes de salir.',
    action: confirmed ? 'start' : 'quick',
  };
}
