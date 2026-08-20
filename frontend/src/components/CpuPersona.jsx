import React from 'react';
import { CPU_PERSONALITIES, cpuPersonalityById } from '../cpuPersonality.js';

export default function CpuPersona({ comment, pulse = false, personality = 'bco', onPersonalityChange }) {
  const current = cpuPersonalityById(personality);
  return (
    <aside className={`cpu-persona personality-${current.id} ${comment ? 'speaking' : ''} ${pulse ? 'pulse' : ''}`} aria-live="polite">
      <div className="cpu-avatar" aria-hidden="true">
        <span className="cpu-avatar-eyes">{current.glyph}</span>
        <span className="cpu-avatar-mouth">⌁</span>
      </div>
      <div className="cpu-persona-copy">
        <div className="cpu-persona-title-row">
          <div className="cpu-persona-name">CPU · {current.name}</div>
          <label className="cpu-personality-picker" title="Personalidad de la CPU">
            <span className="sr-only">Personalidad de la CPU</span>
            <select value={current.id} onChange={(e) => onPersonalityChange?.(e.target.value)}>
              {CPU_PERSONALITIES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        </div>
        <div className="cpu-persona-comment">{comment || current.idle}</div>
      </div>
    </aside>
  );
}
