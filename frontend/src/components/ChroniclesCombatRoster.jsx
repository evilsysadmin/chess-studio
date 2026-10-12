import { chroniclesActiveEnemies, chroniclesEnemyTargetAhead } from '../chroniclesOfMatthias.js';

// MM3 "Combat" box: while initiative runs, the panel's map slot lists the
// foes in green (healthy), yellow (hurt) or red (near death); the one in
// front of the company is boxed, as the game's current target.
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
  return (
    <section className="chronicles-combat-roster" aria-label="Combate">
      <h3>Combate</h3>
      <ol>
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
    </section>
  );
}
