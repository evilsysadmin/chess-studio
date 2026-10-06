import { chroniclesCurrentInitiativeActor } from '../chronicles/chroniclesInitiative.js';

function actorLabel(actor) {
  if (!actor) return '';
  return actor.name || actor.id || 'Combatiente';
}

export default function ChroniclesInitiativeRail({ initiative }) {
  const order = Array.isArray(initiative?.order) ? initiative.order : [];
  if (!order.length) return null;

  const active = chroniclesCurrentInitiativeActor(initiative);
  const activeIndex = Math.max(0, Number(initiative?.cursor || 0));
  const rotated = order.map((_, offset) => order[(activeIndex + offset) % order.length]);
  const visible = rotated.slice(0, Math.min(rotated.length, 5));
  const round = Math.max(1, Number(initiative?.round || 1));

  return (
    <section
      className={`chronicles-initiative-rail ${active?.kind === 'enemy' ? 'is-enemy-turn' : 'is-party-turn'}`}
      data-chronicles-initiative="visible"
      data-active-actor={active?.id || ''}
      role="status"
      aria-live="polite"
      aria-label={`Ronda ${round}. Turno de ${actorLabel(active)}`}
    >
      <div className="chronicles-initiative-rail__heading">
        <span>RONDA {round}</span>
        <strong>{active?.kind === 'enemy' ? 'TURNO ENEMIGO' : 'TU TURNO'}</strong>
      </div>
      <ol aria-label="Orden de iniciativa">
        {visible.map((actor, index) => (
          <li
            key={actor.id}
            className={`${index === 0 ? 'is-active' : ''} ${actor.kind === 'enemy' ? 'is-enemy' : 'is-party'}`}
            aria-current={index === 0 ? 'step' : undefined}
          >
            <span>{index === 0 ? 'AHORA' : `+${index}`}</span>
            <b>{actorLabel(actor)}</b>
            <small>{actor.initiative}</small>
          </li>
        ))}
      </ol>
    </section>
  );
}
