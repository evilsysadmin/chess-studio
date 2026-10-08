import { useEffect, useRef, useState } from 'react';
import './ChroniclesActivityLog.css';

export default function ChroniclesActivityLog({ entries = [] }) {
  const [open, setOpen] = useState(() => (
    typeof window === 'undefined'
      || window.matchMedia?.('(min-width: 801px) and (min-height: 601px) and (pointer: fine)')?.matches
  ));
  const bodyRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const latest = entries[entries.length - 1] || null;

  useEffect(() => {
    if (!open || !bodyRef.current || !stickToBottomRef.current) return;
    bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [entries, open]);

  const handleScroll = (event) => {
    const node = event.currentTarget;
    stickToBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight <= 24;
  };

  return (
    <details
      className="chronicles-activity-log"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      data-chronicles-activity-log="true"
    >
      <summary>
        <span><b>REGISTRO</b><small>{latest?.text || 'La expedición acaba de empezar.'}</small></span>
        <em>{entries.length}</em>
      </summary>
      <div
        ref={bodyRef}
        className="chronicles-activity-log__body"
        role="log"
        aria-label="Registro de expedición"
        onScroll={handleScroll}
      >
        {entries.length ? (
          <ol>
            {entries.map((entry) => (
              <li key={entry.id} data-kind={entry.kind}>
                <span>{entry.label || '·'}</span>
                <p>{entry.text}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="chronicles-activity-log__empty">Aún no ha ocurrido nada digno de archivo.</p>
        )}
      </div>
    </details>
  );
}
