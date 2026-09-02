import { enemyOfficerDossiers } from '../combatEnemyOfficers.js';
import './CombatEnemyOfficerDossier.css';

const OUTCOME_COPY = {
  win: { label: 'Victoria tuya', mark: '✓' },
  loss: { label: 'Victoria del oficial', mark: '✕' },
  draw: { label: 'Tablas', mark: '=' },
  retired: { label: 'Retirada', mark: '↩' },
};

function formatDate(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 'Sin fecha';
  try {
    return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(parsed));
  } catch {
    return 'Sin fecha';
  }
}

function encounterLabel(entry) {
  return entry?.nodeLabel || entry?.nodeId || 'Sector sin nombre';
}

export default function CombatEnemyOfficerDossier({ dossiers: suppliedDossiers = null, currentOfficerId = null }) {
  const dossiers = suppliedDossiers || enemyOfficerDossiers();
  if (!dossiers.length) return null;

  return (
    <details className="combat-officer-archive" data-combat-officer-archive="true">
      <summary>
        <span>ARCHIVO DE OFICIALES</span>
        <strong>{dossiers.length} identificado{dossiers.length === 1 ? '' : 's'}</strong>
      </summary>
      <div className="combat-officer-archive-body">
        <p className="combat-officer-archive-note">Expediente basado sólo en encuentros registrados. Rangos, ascensos y rivalidad son narrativos: no cambian la fuerza de la CPU ni añaden bonificaciones ocultas.</p>
        <div className="combat-officer-dossier-grid">
          {dossiers.map((officer) => {
            const record = officer.record;
            const current = currentOfficerId === officer.id;
            return (
              <article
                key={officer.id}
                className={`combat-officer-dossier${current ? ' is-current' : ''}`}
                data-officer-id={officer.id}
                data-officer-current={current ? 'true' : 'false'}
              >
                <header>
                  <div>
                    <small>{current ? 'OBJETIVO ACTUAL · ' : ''}{officer.rank}</small>
                    <strong>{officer.name}</strong>
                    <span>«{officer.callsign}»</span>
                  </div>
                  <b>{officer.score}</b>
                </header>

                <dl className="combat-officer-record">
                  <div><dt>Encuentros</dt><dd>{record.encounters}</dd></div>
                  <div><dt>Tus victorias</dt><dd>{record.playerWins}</dd></div>
                  <div><dt>Sus victorias</dt><dd>{record.officerWins}</dd></div>
                  <div><dt>Tablas / retiradas</dt><dd>{record.draws} / {record.retreats}</dd></div>
                </dl>

                <div className="combat-officer-service">
                  <span>Primer contacto · {formatDate(record.firstSeenAt)}</span>
                  <span>Último contacto · {formatDate(record.lastSeenAt)}{record.lastNodeLabel ? ` · ${record.lastNodeLabel}` : ''}</span>
                  {officer.promotions > 0 && <span>Ascensos registrados · {officer.promotions}{officer.baseRank !== officer.rank ? ` · ${officer.baseRank} → ${officer.rank}` : ''}</span>}
                </div>

                {officer.recentEncounters.length > 0 && (
                  <details className="combat-officer-history">
                    <summary>Últimos encuentros · {officer.recentEncounters.length}</summary>
                    <ol>
                      {officer.recentEncounters.map((entry) => {
                        const outcome = OUTCOME_COPY[entry.outcome] || { label: entry.outcome || 'Resultado', mark: '•' };
                        return (
                          <li key={entry.id}>
                            <b aria-hidden="true">{outcome.mark}</b>
                            <span><strong>{outcome.label}</strong><small>{encounterLabel(entry)} · {formatDate(entry.at)}</small></span>
                          </li>
                        );
                      })}
                    </ol>
                  </details>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </details>
  );
}
