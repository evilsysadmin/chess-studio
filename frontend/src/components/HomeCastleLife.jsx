import './HomeCastleLife.css';

const MAX_OBJECTS = 3;
const RARE_SIGHTING_THRESHOLD = 0.025;
// Progress objects are descriptive only: no entry exists without backing state.

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function buildHomeCastleLifeModel({
  hasSavedGame = false,
  combatProgress = {},
  tournamentLevel = 1,
  tournamentProgress = 0,
  today = {},
  rivalry = {},
  rareRoll = 1,
} = {}) {
  const objects = [];
  const credits = asNumber(combatProgress?.credits);
  const combatNext = asNumber(combatProgress?.nextProgress);
  const combatRank = String(combatProgress?.rank?.label || 'Recluta');
  const streak = asNumber(today?.streak);
  const dailySolved = asNumber(today?.dailySolvedCount);
  const humanWins = asNumber(rivalry?.record?.wins);

  if (hasSavedGame) {
    objects.push({
      id: 'saved-game',
      glyph: '♜',
      label: 'Tablero en pausa',
      detail: 'Hay una partida real esperando tu regreso.',
      tone: 'parchment',
    });
  }

  if (credits > 0 || combatNext > 0 || combatRank !== 'Recluta') {
    objects.push({
      id: 'combat-map',
      glyph: '⚔',
      label: 'Mapa de campaña',
      detail: `${combatRank} · ${credits} créditos operativos`,
      tone: 'ember',
    });
  }

  if (streak > 0 || dailySolved > 0) {
    objects.push({
      id: 'daily-seal',
      glyph: '✦',
      label: 'Sello del día',
      detail: dailySolved > 0 ? `${dailySolved}/3 desafíos resueltos · racha ${streak}` : `Racha activa · ${streak}`,
      tone: 'brass',
    });
  }

  if (asNumber(tournamentLevel) > 1 || asNumber(tournamentProgress) > 0) {
    objects.push({
      id: 'tournament-cup',
      glyph: '♛',
      label: 'Copa de torneo',
      detail: `Nivel ${asNumber(tournamentLevel)} · ${asNumber(tournamentProgress)} XP en curso`,
      tone: 'brass',
    });
  }

  if (humanWins > 0) {
    objects.push({
      id: 'rivalry-plaque',
      glyph: '♟',
      label: 'Placa de rivalidad',
      detail: `${humanWins} ${humanWins === 1 ? 'victoria' : 'victorias'} demostradas sobre Matthias`,
      tone: 'steel',
    });
  }

  if (objects.length === 0) {
    objects.push({
      id: 'quiet-desk',
      glyph: '·',
      label: 'Mesa despejada',
      detail: 'Nada urgente. El tablero sigue siendo el centro de la sala.',
      tone: 'quiet',
    });
  }

  const roll = Number(rareRoll);
  const rareSighting = Number.isFinite(roll) && roll >= 0 && roll < RARE_SIGHTING_THRESHOLD
    ? {
        id: 'armour-glance',
        label: 'Una armadura acaba de girar unos grados hacia el tablero. Probablemente nada.',
      }
    : null;

  return {
    objects: objects.slice(0, MAX_OBJECTS),
    rareSighting,
  };
}

export default function HomeCastleLife(props) {
  const model = buildHomeCastleLifeModel(props);
  return (
    <section
      className={`home-castle-life${model.rareSighting ? ' has-rare-sighting' : ''}`}
      aria-label="La estancia de Chess Studio"
      data-castle-life="real-state-v1"
    >
      <div className="home-castle-life__heading">
        <div>
          <span className="section-label">LA ESTANCIA</span>
          <strong>El castillo recuerda lo que de verdad ocurrió.</strong>
        </div>
        <small>Máximo tres señales. Cero inventario decorativo.</small>
      </div>
      <div className="home-castle-life__shelf">
        {model.objects.map((object) => (
          <article className={`home-castle-object tone-${object.tone}`} data-castle-object={object.id} key={object.id}>
            <span className="home-castle-object__glyph" aria-hidden="true">{object.glyph}</span>
            <span className="home-castle-object__copy">
              <strong>{object.label}</strong>
              <small>{object.detail}</small>
            </span>
          </article>
        ))}
      </div>
      {model.rareSighting && (
        <p className="home-castle-life__rare" data-rare-sighting={model.rareSighting.id}>
          <span aria-hidden="true">♜</span>{model.rareSighting.label}
        </p>
      )}
    </section>
  );
}
