import { bubblePlacement } from './Board3DOverlayAnchor.js';

export default function MatthiasBoardBubble({ message, threeD = false, anchor = null }) {
  if (!message?.text) return null;
  const placement = threeD ? bubblePlacement(anchor) : null;
  const style = placement ? {
    left: `${placement.left}px`,
    top: `${placement.top}px`,
    width: `${placement.width}px`,
  } : undefined;
  const className = `matthias-board-bubble${placement ? ` is-king-anchored tail-${placement.tail}` : ''}`;

  return (
    <aside
      key={message.id}
      className={className}
      style={style}
      role="status"
      aria-label="Comentario de Matthias sobre el tablero"
    >
      <span>MATTHIAS</span>
      <p>{message.text}</p>
    </aside>
  );
}
