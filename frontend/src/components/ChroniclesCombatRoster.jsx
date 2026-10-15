import { CHRONICLES_DIRECTIONS, chroniclesActiveEnemies, chroniclesEnemyTargetAhead } from '../chroniclesOfMatthias.js';
import { chroniclesRuntimeEnemyPosition } from '../chroniclesOfMatthiasTurns.js';

// The combat roster is supplementary to the automap, never a replacement for it.
// Keep the currently faced enemy visible, and reveal the complete enemy list on demand.
export function chroniclesHealthBand(hp, maxHp) {
  const ratio = maxHp > 0 ? Math.max(0, hp) / maxHp : 0;
  if (ratio > 0.5) return 'healthy';
  if (ratio > 0.25) return 'hurt';
  return 'critical';
}

// Express the location of a participating foe relative to the player's facing.
// A missing frontal target must not suggest that the encounter is empty.
export function chroniclesCombatFoeBearing(state, enemy) {
  const facing = CHRONICLES_DIRECTIONS[state?.direction];
  if (!facing || !enemy) return '';
  const position = chroniclesRuntimeEnemyPosition(state, enemy);
  const dx = position.x - Number(state.x);
  const dy = position.y - Number(state.y);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return '';
  const forward = dx * facing.dx + dy * facing.dy;
  const side = -dx * facing.dy + dy * facing.dx;
  if (forward === 0 && side === 0) return 'Muy cerca';
  if (side !== 0 && Math.abs(side) >= Math.abs(forward)) {
    return side > 0 ? 'A tu derecha' : 'A tu izquierda';
  }
  if (forward < 0) return 'A tu espalda';
  return 'Frente, fuera de vista';
}
export default function ChroniclesCombatRoster({ state }) {
  if (!state?.initiative) return null;
  const participantIds = new Set(state.initiative.order?.filter((actor) => actor.kind === 'enemy').map((actor) => actor.id) || []);
  const foes = chroniclesActiveEnemies(state).filter((enemy) => (
    participantIds.has(enemy.id) && Number(state[enemy.hpKey] || 0) > 0
  ));
  if (!foes.length) return null;

  const targetId = chroniclesEnemyTargetAhead(state, 3)?.enemy?.id;
  const target = foes.find((enemy) => enemy.id === targetId);
  const closest = [...foes].sort((a, b) => {
    const pa = chroniclesRuntimeEnemyPosition(state, a);
    const pb = chroniclesRuntimeEnemyPosition(state, b);
    const da = Math.abs(pa.x - state.x) + Math.abs(pa.y - state.y);
    const db = Math.abs(pb.x - state.x) + Math.abs(pb.y - state.y);
    return da - db || a.id.localeCompare(b.id);
  })[0];
  const bearing = target ? '' : chroniclesCombatFoeBearing(state, closest);

  return (
    <section className="chronicles-combat-roster" aria-label="Combate">
      <details>
        <summary>
          <span className="chronicles-combat-roster__heading">
            Combate · {foes.length} {foes.length === 1 ? 'enemigo' : 'enemigos'}
          </span>
          <span className="chronicles-combat-roster__target" title={target?.name || bearing || 'Ningún enemigo delante'}>
            {target ? `Objetivo: ${target.name}` : (bearing || 'Sin objetivo frontal')}
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
