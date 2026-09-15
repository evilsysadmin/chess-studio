import './ChroniclesNarratorOverlay.css';

const LOW_SIGNAL_NARRATION = Object.freeze([
  /^Giras a la (izquierda|derecha)\.$/i,
  /^Piedra, polvo y la sospecha de que algo respira detrás del muro\.$/i,
  /^Hay una pared\./i,
  /contra absolutamente nada\./i,
]);

export function shouldShowChroniclesNarration(message) {
  const text = typeof message === 'string' ? message.trim() : '';
  if (!text) return false;
  return !LOW_SIGNAL_NARRATION.some((pattern) => pattern.test(text));
}

export default function ChroniclesNarratorOverlay({ message }) {
  if (!shouldShowChroniclesNarration(message)) return null;

  return (
    <aside className="chronicles-dm-overlay" aria-live="polite" aria-atomic="true">
      <span className="chronicles-dm-sigil" aria-hidden="true">✦</span>
      <div>
        <span className="chronicles-dm-kicker">CRÓNICA DE LA CRIPTA</span>
        <p>{message}</p>
      </div>
    </aside>
  );
}
