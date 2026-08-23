
const OPTIONS = [
  { code: 'q', symbol: '♛', label: 'Dama' },
  { code: 'r', symbol: '♜', label: 'Torre' },
  { code: 'b', symbol: '♝', label: 'Alfil' },
  { code: 'n', symbol: '♞', label: 'Caballo' },
];

export default function PromotionModal({ onChoose }) {
  return (
    <div className="modal-backdrop">
      <div className="promotion-card" role="dialog" aria-modal="true" aria-label="Promoción de peón">
        <p>Tu peón llegó al final. ¿A qué pieza lo coronas?</p>
        <div className="promotion-options">
          {OPTIONS.map((o) => (
            <button key={o.code} onClick={() => onChoose(o.code)} aria-label={o.label} title={o.label}>
              {o.symbol}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
