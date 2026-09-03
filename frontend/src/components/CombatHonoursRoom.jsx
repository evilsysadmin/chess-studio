import { useMemo, useState } from 'react';
import { BASE_STATS } from '../combat.js';
import { unitDecorations } from '../combatUnitService.js';
import './CombatHonoursRoom.css';

const MAX_TROPHIES = 3;
const MAX_MEMORIAL = 12;

function stat(record, key) {
  const value = Number(record?.stats?.[key]);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function serviceRecords(roster) {
  return Object.values(roster?.unitRecords || {})
    .filter((record) => record && typeof record === 'object' && record.identityId)
    .map((record) => ({ ...record, decorationsResolved: unitDecorations(record) }));
}

function memorialRecords(roster) {
  return (Array.isArray(roster?.memorial) ? [...roster.memorial] : [])
    .filter((record) => record && record.identityId)
    .reverse()
    .slice(0, MAX_MEMORIAL)
    .map((record) => ({ ...record, decorationsResolved: unitDecorations(record) }));
}

export function buildCombatHonoursModel(roster = {}) {
  const active = serviceRecords(roster);
  const memorial = memorialRecords(roster);
  const trophies = [];

  const bossVeteran = [...active]
    .filter((record) => stat(record, 'bossVictories') > 0 || stat(record, 'bossFinishes') > 0)
    .sort((a, b) => stat(b, 'bossVictories') - stat(a, 'bossVictories') || stat(b, 'bossFinishes') - stat(a, 'bossFinishes'))[0];
  if (bossVeteran) {
    trophies.push({
      id: 'boss-service',
      glyph: '♚',
      label: 'Trofeo de jefe',
      detail: `${bossVeteran.alias} · ${stat(bossVeteran, 'bossVictories')} victorias contra jefe${stat(bossVeteran, 'bossFinishes') ? ` · ${stat(bossVeteran, 'bossFinishes')} remates` : ''}`,
      provenance: 'Expediente individual de servicio',
      unitKey: bossVeteran.slotKey || null,
      tone: 'boss',
    });
  }

  const ace = [...active]
    .filter((record) => stat(record, 'kills') >= 5)
    .sort((a, b) => stat(b, 'kills') - stat(a, 'kills') || stat(b, 'battles') - stat(a, 'battles'))[0];
  if (ace && ace.identityId !== bossVeteran?.identityId) {
    trophies.push({
      id: 'ace-service',
      glyph: '⚔',
      label: 'Hoja de acero',
      detail: `${ace.alias} · ${stat(ace, 'kills')} bajas confirmadas en ${stat(ace, 'battles')} batallas`,
      provenance: 'Bajas registradas en batallas Combat',
      unitKey: ace.slotKey || null,
      tone: 'steel',
    });
  }

  const decorated = [...active, ...memorial].filter((record) => record.decorationsResolved.length > 0);
  const decorationCount = decorated.reduce((sum, record) => sum + record.decorationsResolved.length, 0);
  if (decorationCount > 0) {
    trophies.push({
      id: 'decorations-cabinet',
      glyph: '✦',
      label: 'Vitrina de condecoraciones',
      detail: `${decorationCount} condecoraciones acreditadas · ${decorated.length} identidades`,
      provenance: 'Medallas derivadas de hitos de servicio medidos',
      unitKey: null,
      tone: 'brass',
    });
  }

  return {
    trophies: trophies.slice(0, MAX_TROPHIES),
    memorial,
    totalMemorial: Array.isArray(roster?.memorial) ? roster.memorial.length : 0,
    hasHonours: trophies.length > 0 || memorial.length > 0,
  };
}

function formatDate(value) {
  if (!value) return 'Sin fecha registrada';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Sin fecha registrada' : date.toLocaleDateString('es-ES');
}

function MemorialDossier({ entry }) {
  const origin = BASE_STATS[entry.originType]?.name || 'Unidad';
  const stats = entry.stats || {};
  return (
    <div className="combat-memorial-dossier" data-memorial-dossier={entry.identityId}>
      <div>
        <span>EXPEDIENTE DE SERVICIO</span>
        <strong>{entry.alias}</strong>
        <small>{entry.finalRankLabel || 'Recluta'} · {origin} · nivel {entry.finalLevel || 1}</small>
      </div>
      <dl>
        <div><dt>Batallas</dt><dd>{stats.battles || 0}</dd></div>
        <div><dt>Supervivencias</dt><dd>{stats.survivals || 0}</dd></div>
        <div><dt>Bajas</dt><dd>{stats.kills || 0}</dd></div>
        <div><dt>Boss damage</dt><dd>{stats.bossDamage || 0}</dd></div>
        <div><dt>Revivals</dt><dd>{stats.revives || 0}</dd></div>
        <div><dt>Muerte final</dt><dd>{formatDate(entry.permanentDeathAt)}</dd></div>
      </dl>
      {entry.decorationsResolved.length > 0 && (
        <div className="combat-memorial-medals" aria-label="Condecoraciones del caído">
          {entry.decorationsResolved.map((medal) => (
            <span key={medal.id} title={medal.description}>
              <b>✦ {medal.short}</b>
              <small>{medal.label}{medal.earnedAt ? ` · ${formatDate(medal.earnedAt)}` : ''}</small>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CombatHonoursRoom({ roster, onOpenUnit }) {
  const model = useMemo(() => buildCombatHonoursModel(roster), [roster]);
  const [selectedMemorialId, setSelectedMemorialId] = useState(null);
  if (!model.hasHonours) return null;

  const selectedMemorial = model.memorial.find((entry) => entry.identityId === selectedMemorialId) || null;

  return (
    <section className="combat-honours-room" aria-label="Sala de Honores de Combat Chess" data-combat-honours-room="provenance-v1">
      <header className="combat-honours-heading">
        <div>
          <span>SALA DE HONORES · ARCHIVO REAL</span>
          <h4>Lo que el ejército se ha ganado</h4>
        </div>
        <small>Sin bonus ocultos. Cada objeto sale del expediente.</small>
      </header>

      {model.trophies.length > 0 && (
        <div className="combat-honours-stage" aria-label="Trofeos de servicio">
          {model.trophies.map((trophy) => {
            const clickable = Boolean(trophy.unitKey && onOpenUnit);
            const Tag = clickable ? 'button' : 'article';
            return (
              <Tag
                key={trophy.id}
                type={clickable ? 'button' : undefined}
                className={`combat-honours-plinth tone-${trophy.tone}${clickable ? ' is-clickable' : ''}`}
                data-honour-trophy={trophy.id}
                onClick={clickable ? () => onOpenUnit(trophy.unitKey) : undefined}
              >
                <span className="combat-honours-object" aria-hidden="true">{trophy.glyph}</span>
                <span className="combat-honours-plaque">
                  <strong>{trophy.label}</strong>
                  <small>{trophy.detail}</small>
                  <em>{trophy.provenance}{clickable ? ' · abrir expediente' : ''}</em>
                </span>
              </Tag>
            );
          })}
        </div>
      )}

      {model.memorial.length > 0 && (
        <div className="combat-memorial-wall" data-memorial-depth="css-3d-v1">
          <div className="combat-memorial-heading">
            <div>
              <span>MURO DE LOS CAÍDOS</span>
              <strong>Memorial</strong>
            </div>
            <b>{model.totalMemorial}</b>
          </div>
          <p>Identidades archivadas definitivamente. El reemplazo no hereda nombre, rango, técnicas ni historia.</p>
          <div className="combat-memorial-plaques">
            {model.memorial.map((entry) => (
              <button
                type="button"
                key={entry.identityId}
                className={selectedMemorialId === entry.identityId ? 'is-selected' : ''}
                onClick={() => setSelectedMemorialId((current) => current === entry.identityId ? null : entry.identityId)}
                aria-expanded={selectedMemorialId === entry.identityId}
              >
                <span aria-hidden="true">♟</span>
                <strong>{entry.alias}</strong>
                <small>{entry.finalRankLabel || 'Recluta'} · {entry.stats?.battles || 0} bat.</small>
              </button>
            ))}
          </div>
          {selectedMemorial && <MemorialDossier entry={selectedMemorial} />}
        </div>
      )}
    </section>
  );
}
