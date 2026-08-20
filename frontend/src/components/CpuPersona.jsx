import React from 'react';

export default function CpuPersona({ comment, pulse = false }) {
  return (
    <aside className={`cpu-persona ${comment ? 'speaking' : ''} ${pulse ? 'pulse' : ''}`} aria-live="polite">
      <div className="cpu-avatar" aria-hidden="true">
        <span className="cpu-avatar-eyes">••</span>
        <span className="cpu-avatar-mouth">⌁</span>
      </div>
      <div className="cpu-persona-copy">
        <div className="cpu-persona-name">CPU · IA rival</div>
        <div className="cpu-persona-comment">
          {comment || 'Observando en silencio. De momento.'}
        </div>
      </div>
    </aside>
  );
}
