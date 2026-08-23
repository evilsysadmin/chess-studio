import { useEffect, useRef } from 'react';
import VoiceToggle from './VoiceToggle.jsx';

function timeLabel(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function GameChat({ messages = [], compact = false, title = 'Game Chat' }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  return (
    <aside className={`game-chat${compact ? ' compact' : ''}`} aria-label="Chat de la partida">
      <div className="game-chat-heading">
        <div className="game-chat-title-block">
          <span className="game-chat-kicker">CPU // LIVE LOG</span>
          <h3>{title}</h3>
        </div>
        <div className="game-chat-tools">
          {!compact && <VoiceToggle />}
          <span className="game-chat-count" title="Comentarios registrados">{messages.length}</span>
        </div>
      </div>
      <div className="game-chat-log" ref={scrollRef} aria-live={compact ? 'off' : 'polite'}>
        {messages.length === 0 ? (
          <p className="game-chat-empty">Silencio táctico. De momento la CPU no ha considerado necesario abrir la boca.</p>
        ) : messages.map((message) => (
          <div className="game-chat-message" key={message.id || `${message.at}-${message.text}`}>
            <div className="game-chat-meta">
              <span className="game-chat-author">CPU</span>
              {message.event && <span className="game-chat-event">{String(message.event).replaceAll('_', ' ')}</span>}
              <time dateTime={message.at}>{timeLabel(message.at)}</time>
            </div>
            <p>{message.text}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}
