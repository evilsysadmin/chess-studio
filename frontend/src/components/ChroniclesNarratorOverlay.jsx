import './ChroniclesNarratorOverlay.css';

export default function ChroniclesNarratorOverlay({ message }) {
  if (!message) return null;

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
