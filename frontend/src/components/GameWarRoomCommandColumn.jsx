import { CPU_IDENTITY } from '../cpuIdentity.js';
import { zenModeSummary } from '../zenMode.js';
import MechanicTutorialHelp from './MechanicTutorialHelp.jsx';
import useWarRoomVariant from './useWarRoomVariant.js';
import '../styles/29-war-room-chrome.css';
import './WarRoomReferencePolish.css';
import './WarRoomTurnPill.css';
import './WarRoom3DMobileControls.css';
import './WarRoomDesktopRailLayout.css';
import './WarRoomMatthiasDiegetic.css';
import './WarRoomFloatingFooter.css';
import './WarRoomAppearanceMenu.css';
import './WarRoomAndroidDensity.css';
import './WarRoomGuideHelp.css';

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

function triggerMountedGameAction(event, selector) {
  const root = event.currentTarget.closest('.game-layout-3d');
  closeUtilityMenu(event);
  root?.querySelector(selector)?.click();
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

function WarRoomGuideHelp() {
  return (
    <MechanicTutorialHelp
      tutorialId="war-room-basics"
      markSeenOnClose
      firstRunLabel="Guía"
      label="Abrir guía de la War Room"
    />
  );
}

export function WarRoomUtilityMenu({
  game,
  board,
  controls,
  zenMode,
  compactViewport = false,
  showFocus = true,
  showRendererToggle = true,
  showAppearance = true,
  showZen = true,
}) {
  const {
    selectable: warRoomVariantSelectable,
    variant: warRoomVariant,
    setVariant: setWarRoomVariant,
  } = useWarRoomVariant();
  const hasHint = !zenMode && controls.hintMode !== 'off' && typeof controls.onHint === 'function';
  const hasUndo = !zenMode && controls.hintMode === 'free' && typeof controls.onUndo === 'function';
  const hasAppearance = showAppearance && (compactViewport || typeof board?.onCustomize === 'function');
  const hasNonDangerAction = (compactViewport && showFocus)
    || hasHint
    || hasUndo
    || (compactViewport && showRendererToggle)
    || hasAppearance
    || warRoomVariantSelectable
    || (showZen && typeof controls.onToggleZen === 'function');

  return (
    <details className="game-3d-utility-menu">
      <summary role="button" aria-label="Más acciones de partida" title="Más acciones de partida">⋯</summary>
      <div className="game-3d-utility-popover" role="menu" aria-label="Acciones de partida">
        {compactViewport && showFocus && (
          <button
            type="button"
            role="menuitem"
            onClick={(event) => triggerMountedGameAction(event, '.game-mobile-focus-toggle')}
          >
            Focus
          </button>
        )}
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
            disabled={controls.busy || (game?.history?.length || 0) === 0}
            onClick={(event) => {
              closeUtilityMenu(event);
              controls.onUndo();
            }}
          >
            Deshacer jugada
          </button>
        )}
        {compactViewport && showRendererToggle && (
          <button
            type="button"
            role="menuitem"
            onClick={(event) => triggerMountedGameAction(event, '.board-renderer-toggle')}
          >
            Vista 2D
          </button>
        )}
        {hasAppearance && (
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
        )}
        {warRoomVariantSelectable && (
          <>
            <span className="game-3d-utility-separator" role="separator" />
            <span className="game-3d-utility-section-label" aria-hidden="true">Escena</span>
            <button
              type="button"
              role="menuitemradio"
              aria-label="War Room"
              aria-checked={warRoomVariant === 'classic'}
              className={warRoomVariant === 'classic' ? 'is-selected' : ''}
              onClick={(event) => {
                closeUtilityMenu(event);
                setWarRoomVariant('classic');
              }}
            >
              War Room
            </button>
            <button
              type="button"
              role="menuitemradio"
              aria-label="War Room v2"
              aria-checked={warRoomVariant === 'v2'}
              className={warRoomVariant === 'v2' ? 'is-selected' : ''}
              onClick={(event) => {
                closeUtilityMenu(event);
                setWarRoomVariant('v2');
              }}
            >
              War Room v2
            </button>
          </>
        )}
        {showZen && typeof controls.onToggleZen === 'function' && (
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
            {hasNonDangerAction && <span className="game-3d-utility-separator" role="separator" />}
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
  );
}

function CompactWarRoomPill({ game, signal, board, controls, zenMode }) {
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

        <span className="game-3d-compact-actions" aria-label="Acciones rápidas de partida">
          <button
            type="button"
            className="game-3d-compact-action is-focus"
            aria-label="Focus"
            title="Focus"
            onClick={(event) => triggerMountedGameAction(event, '.game-mobile-focus-toggle')}
          >
            <span aria-hidden="true">◎</span>
          </button>
          {typeof controls.onAbandon === 'function' && (
            <button
              type="button"
              className="game-3d-compact-action is-abandon"
              aria-label="Abandonar partida"
              title="Abandonar partida"
              onClick={controls.onAbandon}
            >
              <span aria-hidden="true">⚑</span>
            </button>
          )}
        </span>

        <WarRoomGuideHelp />
        <WarRoomUtilityMenu
          game={game}
          board={board}
          controls={controls}
          zenMode={zenMode}
          compactViewport
        />
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

  // Compact War Room keeps one HUD surface. Secondary actions are folded into
  // its overflow so Android does not pay for a separate command row above the
  // board. Focus/resign survive as tiny one-tap affordances inside the same HUD.
  if (compactViewport) {
    return (
      <CompactWarRoomPill
        game={game}
        signal={signal}
        board={board}
        controls={controls}
        zenMode={zenMode}
      />
    );
  }

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

        <WarRoomGuideHelp />
        <WarRoomUtilityMenu
          game={game}
          board={board}
          controls={controls}
          zenMode={zenMode}
        />
      </div>
    </aside>
  );
}
