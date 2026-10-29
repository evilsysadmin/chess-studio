/* Small presentational chrome for the War Table. The deployment domain and
 * its confirmation rules remain owned by CombatDeploymentView. */
export function CombatDeploymentGuidance({ selectedUnitKey, roster, reverseDeployment }) {
  const alias = roster.identities?.[selectedUnitKey]?.alias || 'Unidad';
  const selected = selectedUnitKey && roster.identities?.[selectedUnitKey];
  const message = selected
    ? reverseDeployment[selectedUnitKey]
      ? `${alias} seleccionada. Elige una casilla resaltada para recolocarla.`
      : `${alias} en reserva. Elige una casilla resaltada para intercambiarla.`
    : 'Selecciona una pieza para recolocarla, o pulsa «Desplegar» junto a una reserva.';
  return <p className="deployment-board-guidance" role="status" aria-live="polite">{message}</p>;
}

export function CombatDeploymentFooter({
  summary,
  canConfirm,
  requireExplicitConfirmation,
  onAutoFill,
  onResetDeployment,
  onReviewCasualties,
  onConfirm,
}) {
  const missing = summary.missingSlots.length;
  return (
    <footer className="combat-deployment-footer">
      <div className="deployment-auto-actions">
        <button type="button" className="secondary-btn" title="Reorganiza toda la formación priorizando veteranos, no solo los huecos." onClick={() => onAutoFill?.(true)}>Auto · veteranos</button>
        <button type="button" className="secondary-btn" title="Reorganiza toda la formación priorizando reclutas, no solo los huecos." onClick={() => onAutoFill?.(false)}>Auto · reclutas</button>
        <button type="button" className="secondary-btn" title="Recupera la formación base; conserva identidad y progresión." onClick={onResetDeployment}>Restablecer</button>
      </div>
      <div className="deployment-footer-copy" role="status">
        <span>{summary.fallenCount > 0
          ? `${summary.fallenCount} baja${summary.fallenCount === 1 ? '' : 's'} pendiente${summary.fallenCount === 1 ? '' : 's'}`
          : summary.ready ? 'Formación completa · 16/16'
            : `Faltan ${missing} puesto${missing === 1 ? '' : 's'}`}</span>
      </div>
      {!summary.ready && summary.fallenCount === 0 && (
        <button type="button" className="secondary-btn deployment-mobile-autofill"
          aria-label="Rehacer formación automática priorizando veteranos"
          title="Reorganiza toda la formación, no solo los huecos libres."
          onClick={() => onAutoFill?.(true)}>Auto · veteranos</button>
      )}
      {summary.fallenCount > 0 ? (
        <button type="button" className="primary-btn" onClick={onReviewCasualties}>
          REVISAR {summary.fallenCount} BAJA{summary.fallenCount === 1 ? '' : 'S'} →
        </button>
      ) : (
        <button type="button" className="primary-btn" disabled={!canConfirm} onClick={() => {
          if (canConfirm) onConfirm?.();
        }}>
          {summary.ready
            ? (requireExplicitConfirmation ? 'CONFIRMAR DESPLIEGUE' : 'Confirmar despliegue')
            : `FALTAN ${missing} PUESTOS`}
        </button>
      )}
    </footer>
  );
}
