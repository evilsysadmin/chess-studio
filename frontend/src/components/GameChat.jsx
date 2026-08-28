import { useEffect, useRef } from 'react';
import VoiceToggle from './VoiceToggle.jsx';
import { CPU_IDENTITY } from '../cpuIdentity.js';

function timeLabel(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function GameChat({ messages = [], contextMessages = [], compact = false, title = 'Chat de partida' }) {
  const scrollRef = useRef(null);
  const visibleMessages = [...contextMessages, ...messages];

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visibleMessages.length]);

  return (
    <aside className={`game-chat${compact ? ' compact' : ''}`} aria-label="Chat de la partida">
      <div className="game-chat-heading">
        <div className="game-chat-title-block game-chat-matthias">
          <img className="game-chat-matthias-avatar" src={CPU_IDENTITY.avatar} alt="" aria-hidden="true" />
          <span className="game-chat-kicker">{CPU_IDENTITY.name.toUpperCase()} // EN DIRECTO</span>
          <h3>{title}</h3>
        </div>
        <div className="game-chat-tools">
          {!compact && <VoiceToggle />}
          <span className="game-chat-count" title="Mensajes de la partida">{visibleMessages.length}</span>
        </div>
      </div>
      <div className="game-chat-log" ref={scrollRef} aria-live={compact ? 'off' : 'polite'}>
        {visibleMessages.length === 0 ? (
          <p className="game-chat-empty">Silencio táctico. De momento {CPU_IDENTITY.name} no ha considerado necesario abrir la boca.</p>
        ) : visibleMessages.map((message) => (
          <div className={`game-chat-message${message.by === 'system' ? ' is-system' : ''}`} key={message.id || `${message.at}-${message.text}`}>
            <div className="game-chat-meta">
              <span className="game-chat-author">{message.by === 'system' && message.event ? String(message.event).replaceAll('_', ' ') : message.by === 'system' ? 'PARTIDA' : CPU_IDENTITY.name}</span>
              {message.by !== 'system' && message.event && <span className="game-chat-event">{String(message.event).replaceAll('_', ' ')}</span>}
              {message.at && <time dateTime={message.at}>{timeLabel(message.at)}</time>}
            </div>
            <p>{message.text}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}
