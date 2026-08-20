import React from 'react';
import { cpuConfidence } from '../advancedCareer.js';

const CPU = {
  glyph: '☠',
  idle: 'Observando. Procura no dejar nada caro sin vigilancia.',
};

export default function CpuPresence({ comment, pulse = false, rivalryRecord = null }) {
  const confidence = rivalryRecord?.games ? cpuConfidence(rivalryRecord) : null;
  return (
    <aside className={`cpu-presence ${comment ? 'speaking' : ''} ${pulse ? 'pulse' : ''}`} aria-live="polite">
      <div className="cpu-avatar" aria-hidden="true">
        <span className="cpu-avatar-eyes">{CPU.glyph}</span>
        <span className="cpu-avatar-mouth">⌁</span>
      </div>
      <div className="cpu-presence-copy">
        <div className="cpu-presence-name">CPU</div>
        <div className="cpu-presence-comment">{comment || CPU.idle}</div>
        {rivalryRecord?.games > 0 && (
          <>
            <div className="cpu-rivalry-mini">Rivalidad: tú {rivalryRecord.wins} · CPU {rivalryRecord.losses} · tablas {rivalryRecord.draws}</div>
            <div className="cpu-rivalry-mini">Confianza CPU: {confidence.value}% · {confidence.label}</div>
          </>
        )}
      </div>
    </aside>
  );
}
