import { pawnSlugModelArmoryHighlights } from '../pawnSlugModelArmoryHighlights.js';
import './PawnSlugModelArmory.css';

export default function PawnSlugModelArmory({ groups = [], credits = 0, onSelect }) {
  if (!groups.length) return null;
  return (
    <details className="pawn-slug-model-armory">
      <summary>
        <span>ARMERÍA · MODELOS</span>
        <b>{Math.max(0, Math.floor(Number(credits) || 0))} CR</b>
      </summary>
      <div className="pawn-slug-model-armory-groups">
        {groups.map((group) => (
          <section key={group.weaponId} aria-label={`Modelos ${group.weaponId}`}>
            <strong>{group.weaponId === 'pistol' ? 'PISTOLA' : group.weaponId === 'machinegun' ? 'AMETRALLADORA' : group.weaponId === 'shotgun' ? 'ESCOPETA' : 'LANZADOR'}</strong>
            <div>
              {group.models.map((model) => {
                const canAfford = model.owned || credits >= model.cost;
                const action = model.equipped ? 'EQUIPADA' : model.owned ? 'EQUIPAR' : `${model.cost} CR`;
                return (
                  <button
                    key={model.id}
                    type="button"
                    className={model.equipped ? 'is-equipped' : ''}
                    aria-pressed={Boolean(model.equipped)}
                    disabled={model.equipped || !canAfford}
                    onClick={() => onSelect?.(group.weaponId, model.id)}
                  >
                    <span>{model.label}</span>
                    <small>
                      {pawnSlugModelArmoryHighlights(model).map(([label, value]) => (
                        <i key={label}>{label}{value ? ` ${value > 0 ? '+' : ''}${value}%` : ''}</i>
                      ))}
                    </small>
                    <b>{action}</b>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <p>Sidegrades: cambia el carácter del arma, no compra una victoria. El modelo equipado se usa en la siguiente operación.</p>
    </details>
  );
}
