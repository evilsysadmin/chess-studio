
const OPTIONS = [
  { id: 'w', label: 'Blancas' },
  { id: 'b', label: 'Negras' },
  { id: 'random', label: 'Aleatorio' },
];

export default function ColorSelector({ value, onChange }) {
  return (
    <div className="color-row" role="radiogroup" aria-label="Elegir color">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          className={`color-btn ${value === o.id ? 'active' : ''}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
