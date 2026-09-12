import { CPU_IDENTITY } from '../cpuIdentity.js';
import { zenModeSummary } from '../zenMode.js';
import '../styles/29-war-room-chrome.css';
import './WarRoomReferencePolish.css';
import './WarRoomTurnPill.css';
import './WarRoom3DMobileControls.css';
import './WarRoomDesktopRailLayout.css';
import './WarRoomMatthiasDiegetic.css';
import './WarRoomFloatingFooter.css';
import './WarRoomAppearanceMenu.css';

function resolveWarRoomSignal(game, status) {
  const text = String(status?.statusText || '').trim();
  const humanColor = game?.humanColor || 'w';
  const humanTurn = game?.turn === humanColor;
  const thinking = Boolean(status?.busy) || /pensando|reintentar|cargando|calculando|transici[oó]n/i.test(text);

  if (thinking) return { tone: 'amber', label: 'Pensando…' };
  if (game?.isGameOver) return { tone: 'amber', label: text || 'Partida terminada' };

  if (humanTurn) {
    return { tone: 'green', label: !text || text === 'Tu turno' ? 'Tu turno' : text };
  }

  return {
    tone: 'red',
    label: !text || text === 'Turno de la CPU' ? `${CPU_IDENTITY.name} juega` : text,
  };
}

function closeUtilityMenu(event) {
  event.currentTarget.closest('details')?.removeAttribute('open');
}

function openBoardAppearance(board) {
  if (typeof board?.onCustomize === 'function') {
    board.onCustomize();
    return;
  }
  // Board3D owns the stable customization callback. Compact callers can omit
  // the raw board callback, so bridge to its already-mounted control instead of
  // dropping Appearance from the menu. The control is visually hidden by the
  // War Room chrome, but remains the canonical action owner.
  document.querySelector('.board3d-customize')?.click();
}

function LegacyCompactPill({ game, signal, board }) {
  return (
    <aside className="game-3d-command-column" aria-label="Puesto táctico de Matthias">
      <div
        className={`game-3d-turn-pill game-3d-matthias-card is-${signal.tone}`}
        data-matthias-war-room-presence="king-piece"
      >
        {CPU_IDENTITY.avatar && <img className="game-3d-turn-pill-avatar" src={CPU_IDENTITY.avatar} alt="" aria-hidden="true" />}
        <span className="game-3d-turn-pill-identity">
          <strong role="heading" aria-level="2">{CPU_IDENTITY.name}</strong>
          <span>· CPU nivel {game.difficulty}</span>
        </span>
        <span className="game-3d-turn-pill-divider" aria-hidden="true" />
        <span className="game-3d-turn-pill-light" aria-hidden="true" />
        <strong
          className="game-3d-turn-pill-label"
          role="status"
          aria-live="polite"
          aria-label="Estado de la partida"
        >
          {signal.label}
        </strong>
        <details className="game-3d-utility-menu">
          <summary role="button" aria-label="Más acciones de partida" title="Más acciones de partida">⋯</summary>
          <div className="game-3d-utility-popover" role="menu" aria-label="Acciones de partida">
            <button
              type="button"
              role="menuitem"
              onClick={(event) => {
                closeUtilityMenu(event);
                openBoardAppearance(board);
              }}
            >
              Apariencia
            </button>
          </div>
        </details>
      </div>
    </aside>
  );
}

export default function GameWarRoomCommandColumn({
  game,
  status,
  board,
  zenMode = false,
  controls = {},
  compactViewport = false,
}) {
  const signal = resolveWarRoomSignal(game, status);

  // Mobile/compact keeps the established compact composition, but secondary
  // board customization shares the same overflow contract as desktop so no
  // floating Appearance control can overlap the board.
  if (compactViewport) {
    return (
      <LegacyCompactPill
        game={game}
        signal={signal}
        board={board}
      />
    );
  }

  const hasHint = !zenMode && controls.hintMode !== 'off' && typeof controls.onHint === 'function';
  const hasUndo = !zenMode && controls.hintMode === 'free' && typeof controls.onUndo === 'function';

  return (
    <aside className="game-3d-command-column" aria-label="Puesto táctico de Matthias">
      <div
        className={`game-3d-turn-pill game-3d-matthias-card is-${signal.tone}`}
        data-matthias-war-room-presence="king-piece"
      >
        <span className="game-3d-matchup">
          {CPU_IDENTITY.avatar && <img className="game-3d-turn-pill-avatar" src={CPU_IDENTITY.avatar} alt="" aria-hidden="true" />}
          <span className="game-3d-turn-pill-identity">
            <strong role="heading" aria-level="2">{CPU_IDENTITY.name}</strong>
          </span>
        </span>

        <span className="game-3d-turn-state">
          <span className="game-3d-turn-pill-light" aria-hidden="true" />
          <strong
            className="game-3d-turn-pill-label"
            role="status"
            aria-live="polite"
            aria-label="Estado de la partida"
          >
            {signal.label}
          </strong>
          <span className="game-3d-cpu-level">CPU nivel {game.difficulty}</span>
        </span>

        <details className="game-3d-utility-menu">
          <summary role="button" aria-label="Más acciones de partida" title="Más acciones de partida">⋯</summary>
          <div className="game-3d-utility-popover" role="menu" aria-label="Acciones de partida">
            {hasHint && (
              <button
                type="button"
                role="menuitem"
                disabled={!controls.canHint}
                onClick={(event) => {
                  closeUtilityMenu(event);
                  controls.onHint();
                }}
              >
                {controls.hintButtonLabel || 'Pista'}
              </button>
            )}
            {hasUndo && (
              <button
                type="button"
                role="menuitem"
                disabled={controls.busy || game.history.length === 0}
                onClick={(event) => {
                  closeUtilityMenu(event);
                  controls.onUndo();
                }}
              >
                Deshacer jugada
              </button>
            )}
            {typeof board.onCustomize === 'function' && (
              <button
                type="button"
                role="menuitem"
                onClick={(event) => {
                  closeUtilityMenu(event);
                  board.onCustomize();
                }}
              >
                Apariencia
              </button>
            )}
            {typeof controls.onToggleZen === 'function' && (
              <button
                type="button"
                role="menuitem"
                aria-pressed={zenMode}
                title={zenModeSummary(zenMode)}
                onClick={(event) => {
                  closeUtilityMenu(event);
                  controls.onToggleZen();
                }}
              >
                {zenMode ? 'Salir de Zen' : 'Modo Zen'}
              </button>
            )}
            {typeof controls.onAbandon === 'function' && (
              <>
                <span className="game-3d-utility-separator" role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  className="is-danger"
                  onClick={(event) => {
                    closeUtilityMenu(event);
                    controls.onAbandon();
                  }}
                >
                  Abandonar partida
                </button>
              </>
            )}
          </div>
        </details>
      </div>

      {(typeof controls.onToggleZen === 'function' || typeof controls.onAbandon === 'function') && (
        <div className="game-3d-quick-actions" aria-label="Acciones rápidas de partida">
          {typeof controls.onToggleZen === 'function' && (
            <button
              type="button"
              className={zenMode ? 'game-3d-quick-action is-active' : 'game-3d-quick-action'}
              aria-pressed={zenMode}
              title={zenModeSummary(zenMode)}
              onClick={controls.onToggleZen}
            >
              {zenMode ? 'Salir de Zen' : 'Zen'}
            </button>
          )}
          {typeof controls.onAbandon === 'function' && (
            <button
              type="button"
              className="game-3d-quick-action is-danger"
              onClick={controls.onAbandon}
            >
              Abandonar
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
