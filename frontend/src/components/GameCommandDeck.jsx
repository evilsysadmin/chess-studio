import { zenModeSummary } from '../zenMode.js';

export default function GameCommandDeck({
  game,
  zenMode,
  controls,
  isThreeD,
  compactViewport,
  onToggleBoardRenderer,
  onEnterFocus,
}) {
  return (
    <div className="game-command-deck" aria-label="Mesa de controles de la partida">
      <div className="game-controls" aria-label="Controles principales de la partida">
        <div className="game-controls-actions">
          {!zenMode && controls.hintMode !== 'off' && (
            <button className="secondary-btn" disabled={!controls.canHint} onClick={controls.onHint}>
              {controls.hintButtonLabel}
            </button>
          )}
          {!zenMode && controls.hintMode === 'free' && (
            <button className="secondary-btn" disabled={controls.busy || game.history.length === 0} onClick={controls.onUndo}>
              Deshacer jugada
            </button>
          )}
          <button
            type="button"
            className={`secondary-btn board-renderer-toggle ${isThreeD ? 'active' : ''}`}
            aria-pressed={isThreeD}
            title={isThreeD ? 'Volver al tablero 2D' : 'Usar tablero 3D con cámara fija'}
            onClick={onToggleBoardRenderer}
          >
            {isThreeD ? 'Vista · 3D' : 'Vista · 2D'}
          </button>
          <button
            type="button"
            className={`secondary-btn zen-mode-toggle ${zenMode ? 'active' : ''}`}
            aria-pressed={zenMode}
            title={zenModeSummary(zenMode)}
            onClick={controls.onToggleZen}
          >
            {zenMode ? 'Zen · ON' : 'Zen · OFF'}
          </button>
          {compactViewport && (
            <button type="button" className="secondary-btn game-mobile-focus-toggle" onClick={onEnterFocus}>
              Focus
            </button>
          )}
          <button className="secondary-btn game-abandon-btn" onClick={controls.onAbandon}>Abandonar partida</button>
        </div>
      </div>
    </div>
  );
}
