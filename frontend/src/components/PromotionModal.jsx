import './PromotionModal.css';

const OPTIONS = [
  { code: 'q', symbol: '♛', label: 'Dama' },
  { code: 'r', symbol: '♜', label: 'Torre' },
  { code: 'b', symbol: '♝', label: 'Alfil' },
  { code: 'n', symbol: '♞', label: 'Caballo' },
];

export default function PromotionModal({ onChoose }) {
  return (
    <div className="modal-backdrop promotion-backdrop" role="presentation" data-promotion-modal="mobile-safe-v1">
      <div className="promotion-card" role="dialog" aria-modal="true" aria-label="Promoción de peón">
        <p>Tu peón llegó al final. ¿A qué pieza lo coronas?</p>
        <div className="promotion-options" role="group" aria-label="Elegir pieza de promoción">
          {OPTIONS.map((o) => (
            <button key={o.code} type="button" onClick={() => onChoose(o.code)} aria-label={o.label} title={o.label}>
              <span aria-hidden="true">{o.symbol}</span>
              <small>{o.label}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
