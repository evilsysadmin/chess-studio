export function CombatDeploymentWarTableHeader({
  assignedCount,
  totalSlots,
  ready,
  credits,
  onOpenMarket,
  onOpenTutorial,
}) {
  return (
    <header className="combat-deployment-header">
      <div>
        <span className="army-memorial-kicker">COMBAT CHESS · MESA DE GUERRA</span>
        <div className="deployment-title-row">
          <h2>Mesa de Guerra</h2>
          <button type="button" className="context-help-btn" onClick={onOpenTutorial}>?</button>
        </div>
        <p className="combat-operational-hint" title="Cada slot valida el tipo de origen. Un peón metamorfoseado sigue ocupando un slot de peón.">
          Forma la escuadra sobre el tablero. La reserva queda fuera de peligro.
        </p>
      </div>
      <div className={`deployment-readiness ${ready ? 'ready' : 'incomplete'}`}>
        <strong>{assignedCount}/{totalSlots}</strong>
        <span>{ready ? 'Formación lista' : 'Formación incompleta'}</span>
      </div>
      {onOpenMarket && (
        <button type="button" className="secondary-btn deployment-market-btn" onClick={onOpenMarket}>
          Mercado · {Number(credits || 0)} cr
        </button>
      )}
    </header>
  );
}

export function CombatDeploymentPresetDrawer({ presets, onLoad, onSave }) {
  return (
    <details className="deployment-presets deployment-war-table-presets" aria-label="Presets de escuadra">
      <summary>
        <span className="deployment-presets-label">ESCUADRAS GUARDADAS</span>
        <b>{presets.filter(Boolean).length}/3</b>
      </summary>
      <div className="deployment-war-table-presets-body">
        {[0, 1, 2].map((index) => {
          const preset = presets[index];
          return (
            <div className="deployment-preset-row" key={index}>
              <button
                type="button"
                className="secondary-btn"
                disabled={!preset}
                onClick={() => onLoad(index)}
                title={preset ? `Cargar ${preset.name}` : 'Preset vacío'}
              >
                {preset?.name || `Escuadra ${index + 1}`}
              </button>
              <button type="button" className="deployment-preset-save" onClick={() => onSave(index)} title="Guardar la formación actual">＋</button>
            </div>
          );
        })}
      </div>
    </details>
  );
}
