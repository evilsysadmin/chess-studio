import './CombatVeteranDossier.css';

const PIECE_LABELS = Object.freeze({
  p: 'Peón', r: 'Torre', n: 'Caballo', b: 'Alfil', q: 'Dama',
});

function earnedDate(value) {
  if (!value) return 'Fecha no registrada';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha no registrada' : date.toLocaleDateString('es-ES');
}

// A contextual paper folio, never an always-on roster/dashboard and never
// a source of campaign stats. All facts come from the selected live identity.
export default function CombatVeteranDossier({ unit, onClose }) {
  if (!unit) return null;
  return (
    <aside className="combat-veteran-dossier" aria-label={`Expediente de ${unit.alias}`} data-combat-veteran-dossier={unit.identityId}>
      <header>
        <div>
          <small>EXPEDIENTE DE SERVICIO · {unit.square.toUpperCase()}</small>
          <h3>{unit.alias}</h3>
          <p>{unit.rank} · Nivel {unit.level} · {PIECE_LABELS[unit.battlefieldType] || 'Unidad'}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar expediente del veterano">×</button>
      </header>
      <p className="combat-veteran-service">
        {unit.battles} batallas <span>·</span> {unit.survivals} supervivencias <span>·</span> {unit.kills} bajas
      </p>
      <div className="combat-veteran-decorations">
        <strong>Condecoraciones acreditadas</strong>
        {unit.decorations.length ? (
          <ul>{unit.decorations.map((medal) => (
            <li key={medal.id}>
              <b>✦ {medal.label}</b>
              <span>{medal.description} · {earnedDate(medal.earnedAt)}</span>
            </li>
          ))}</ul>
        ) : <p>Sin condecoraciones registradas.</p>}
      </div>
      {unit.serviceMarks.length > 0 && (
        <p className="combat-veteran-marks">{unit.serviceMarks.map((mark) => mark.description).join(' · ')}</p>
      )}
    </aside>
  );
}
