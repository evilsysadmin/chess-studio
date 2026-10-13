import { chroniclesActiveEnemies, chroniclesEnemyTargetAhead } from '../chroniclesOfMatthias.js';

// The combat roster is supplementary to the automap, never a replacement for it.
// Keep the currently faced enemy visible, and reveal the complete enemy list on demand.
export function chroniclesHealthBand(hp, maxHp) {
  const ratio = maxHp > 0 ? Math.max(0, hp) / maxHp : 0;
  if (ratio > 0.5) return 'healthy';
  if (ratio > 0.25) return 'hurt';
  return 'critical';
}

export default function ChroniclesCombatRoster({ state }) {
  if (!state?.initiative) return null;
  const foes = chroniclesActiveEnemies(state).filter((enemy) => Number(state[enemy.hpKey] || 0) > 0);
  if (!foes.length) return null;

  const targetId = chroniclesEnemyTargetAhead(state, 3)?.enemy?.id;
  const target = foes.find((enemy) => enemy.id === targetId);

  return (
    <section className="chronicles-combat-roster" aria-label="Combate">
      <details>
        <summary>
          <span className="chronicles-combat-roster__heading">
            Combate · {foes.length} {foes.length === 1 ? 'enemigo' : 'enemigos'}
          </span>
          <span className="chronicles-combat-roster__target" title={target?.name || 'Ningún enemigo delante'}>
            {target ? `Objetivo: ${target.name}` : 'Sin objetivo frontal'}
          </span>
          <span className="chronicles-combat-roster__chevron" aria-hidden="true">▾</span>
        </summary>
        <ol aria-label="Enemigos en combate">
          {foes.map((enemy) => {
            const hp = Number(state[enemy.hpKey] || 0);
            return (
              <li
                key={enemy.id}
                data-band={chroniclesHealthBand(hp, enemy.maxHp)}
                data-target={enemy.id === targetId ? 'true' : undefined}
                title={`${enemy.name}: ${hp}/${enemy.maxHp} PV`}
              >
                {enemy.name}
              </li>
            );
          })}
        </ol>
      </details>
    </section>
  );
}
