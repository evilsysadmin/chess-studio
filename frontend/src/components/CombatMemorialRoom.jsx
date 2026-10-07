import { useMemo, useState } from 'react';
import { BASE_STATS } from '../combat.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { buildCombatHonoursModel, MemorialDossier } from './CombatHonoursRoom.jsx';
import './CombatMemorialRoom.css';

const PIECE_GLYPH = Object.freeze({ q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' });

function unitLabel(entry) {
  return BASE_STATS[entry?.originType]?.name || 'Unidad';
}

function serviceLine(entry) {
  const battles = Number(entry?.stats?.battles || 0);
  const survivals = Number(entry?.stats?.survivals || 0);
  const kills = Number(entry?.stats?.kills || 0);
  return `${battles} bat. · ${survivals} surv. · ${kills} bajas`;
}

export default function CombatMemorialRoom({ roster, onClose }) {
  useEscapeToClose(onClose);
  const model = useMemo(() => buildCombatHonoursModel(roster), [roster]);
  const [selectedId, setSelectedId] = useState(() => model.memorial[0]?.identityId || null);
  const selected = model.memorial.find((entry) => entry.identityId === selectedId) || model.memorial[0] || null;

  return (
    <div
      className="modal-backdrop combat-memorial-screen"
      data-combat-memorial="room"
      onClick={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="combat-memorial-room-shell" role="dialog" aria-modal="true" aria-labelledby="combat-memorial-title" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="piece-info-close combat-memorial-close" onClick={onClose} aria-label="Cerrar Memorial">×</button>

        <header className="combat-memorial-room-heading">
          <div>
            <span>COMBAT CHESS · MEMORIAL DE CAÍDOS</span>
            <h2 id="combat-memorial-title">Memorial</h2>
            <p>Identidades perdidas definitivamente. Ningún reemplazo hereda su nombre, rango, técnicas ni historia.</p>
          </div>
          <div className="combat-memorial-count" aria-label={`${model.totalMemorial} identidades archivadas`}>
            <strong>{model.totalMemorial}</strong>
            <small>archivados</small>
          </div>
        </header>

        {model.memorial.length > 0 ? (
          <div className="combat-memorial-room-body">
            <div className="combat-memorial-room-wall" aria-label="Muro de los caídos">
              <div className="combat-memorial-room-wall-title">
                <span>MURO DE LOS CAÍDOS</span>
                <small>Selecciona una placa para abrir la hoja de servicio.</small>
              </div>
              <div className="combat-memorial-room-plaques">
                {model.memorial.map((entry) => {
                  const isSelected = selected?.identityId === entry.identityId;
                  return (
                    <button
                      type="button"
                      key={entry.identityId}
                      className={isSelected ? 'is-selected' : ''}
                      data-memorial-entry={entry.identityId}
                      aria-pressed={isSelected}
                      onClick={() => setSelectedId(entry.identityId)}
                    >
                      <span className="combat-memorial-room-sigil" aria-hidden="true">{PIECE_GLYPH[entry.originType] || '♟'}</span>
                      <span className="combat-memorial-room-plaque-copy">
                        <strong>{entry.alias}</strong>
                        <small>{entry.finalRankLabel || 'Recluta'} · {unitLabel(entry)} · nv.{entry.finalLevel || 1}</small>
                        <em>{serviceLine(entry)}</em>
                      </span>
                    </button>
                  );
                })}
              </div>
              {model.totalMemorial > model.memorial.length && (
                <p className="combat-memorial-room-archive-note">
                  Mostrando las {model.memorial.length} bajas permanentes más recientes de {model.totalMemorial}.
                </p>
              )}
            </div>

            <aside className="combat-memorial-room-dossier" aria-label="Hoja de servicio del caído">
              {selected && <MemorialDossier entry={selected} />}
            </aside>
          </div>
        ) : (
          <div className="combat-memorial-room-empty">
            <span aria-hidden="true">♟</span>
            <strong>Aún no hay nombres en el muro.</strong>
            <p>Las bajas revivibles siguen perteneciendo al Barracón. Una identidad entra aquí sólo cuando su ventana de recuperación se cierra y la pérdida pasa a ser permanente.</p>
          </div>
        )}

        <footer className="combat-memorial-room-footnote">
          <strong>Archivo permanente</strong>
          <span>El Memorial proyecta únicamente hechos guardados en el expediente de servicio. No inventa hazañas ni causas de baja.</span>
        </footer>
      </section>
    </div>
  );
}
