
const OPTIONS = [
  { id: 'w', label: 'Blancas' },
  { id: 'b', label: 'Negras' },
  { id: 'random', label: 'Aleatorio' },
];

export default function ColorSelector({ value, onChange, minTargetSize = null }) {
  return (
    <div className="color-row" role="radiogroup" aria-label="Elegir color">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          className={`color-btn ${value === o.id ? 'active' : ''}`}
          style={minTargetSize ? { minHeight: minTargetSize, touchAction: 'manipulation' } : undefined}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
