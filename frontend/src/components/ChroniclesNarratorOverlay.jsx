import './ChroniclesNarratorOverlay.css';

const LOW_SIGNAL_NARRATION = Object.freeze([
  /^Giras a la (izquierda|derecha)\.$/i,
  /^Piedra, polvo y la sospecha de que algo respira detrás del muro\.$/i,
  /^Hay una pared\./i,
  /contra absolutamente nada\./i,
  / impacta con .* responde/i,
  / alcanza .* con /i,
  / castiga a la torre carcelero desde la retaguardia /i,
  /^Turno de las criaturas:/i,
  /^Combate por turnos · iniciativa =/i,
]);

const PARTY_OWNED_MILESTONES = Object.freeze([
  /^El sello despierta\./i,
  / remata al peón corrompido /i,
  / derriba a la torre carcelero /i,
  / deshace al alfil espectral /i,
  / derriba al caballo carroñero /i,
  /^Salida encontrada\./i,
]);

export function shouldShowChroniclesNarration(message) {
  const text = typeof message === 'string' ? message.trim() : '';
  if (!text) return false;
  return ![...LOW_SIGNAL_NARRATION, ...PARTY_OWNED_MILESTONES].some((pattern) => pattern.test(text));
}

export default function ChroniclesNarratorOverlay({ message }) {
  if (!shouldShowChroniclesNarration(message)) return null;

  return (
    <details className="chronicles-dm-overlay">
      <summary className="chronicles-dm-trigger" aria-label="Crónica de expedición">
        <span className="chronicles-dm-sigil" aria-hidden="true">✦</span>
        <span>Crónica</span>
        <span className="chronicles-dm-chevron" aria-hidden="true">⌄</span>
      </summary>
      <div className="chronicles-dm-panel" role="region" aria-label="Relato de la expedición" aria-live="polite" aria-atomic="true">
        <span className="chronicles-dm-kicker">CRÓNICA DE EXPEDICIÓN</span>
        <p>{message}</p>
      </div>
    </details>
  );
}
