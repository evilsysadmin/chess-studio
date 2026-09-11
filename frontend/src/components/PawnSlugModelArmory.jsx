import './PawnSlugModelArmory.css';

function percentDelta(value = 1, invert = false) {
  const safe = Math.max(0.01, Number(value) || 1);
  const delta = invert ? (1 / safe) - 1 : safe - 1;
  return Math.round(delta * 100);
}

function highlights(model) {
  const rows = [
    ['Daño', percentDelta(model.damage)],
    ['Cadencia', percentDelta(model.cadence, true)],
    ['Precisión', percentDelta(model.spread, true)],
    ['Control', percentDelta(model.recoil, true)],
    ['Capacidad', percentDelta(model.capacity)],
  ].filter(([, value]) => Math.abs(value) >= 3)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 2);
  return rows.length ? rows : [['Equilibrio', 0]];
}

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
                      {highlights(model).map(([label, value]) => (
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
