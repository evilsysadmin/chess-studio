import { useMemo, useState } from 'react';
import { atlasExample, atlasInitialTrail, atlasPosition } from '../careerOpeningAtlas.js';
import InsightsPositionPreview from './InsightsPositionPreview.jsx';
import './CareerOpeningAtlas.css';

// A read-only explorer. No engine suggestion and no synthetic PGN.
export default function CareerOpeningAtlas({ tree, history = [], onOpenRecord }) {
  const [trail, setTrail] = useState(() => atlasInitialTrail(tree));
  const position = useMemo(() => atlasPosition(tree, trail), [tree, trail]);
  const effective = position || atlasPosition(tree, []);
  const sample = useMemo(() => atlasExample(history, effective?.trail), [history, effective?.trail]);
  if (!effective) return null;

  return (
    <section className="career-atlas-explorer" aria-label="Explorar aperturas de mis partidas">
      <div className="career-atlas-navigation">
        <div className="career-atlas-route" aria-label="Recorrido de la apertura">
          <button type="button" onClick={() => setTrail([])} aria-current={effective.trail.length === 0 ? 'step' : undefined}>Inicio</button>
          {effective.trail.map((san, index) => (
            <button type="button" key={index} aria-current={index === effective.trail.length - 1 ? 'step' : undefined}
              onClick={() => setTrail(effective.trail.slice(0, index + 1))}>
              {index % 2 === 0 ? Math.floor(index / 2) + 1 + '. ' : ''}{san}
            </button>
          ))}
        </div>
        <p className="career-atlas-summary">
          <strong>{effective.count} {effective.count === 1 ? 'partida' : 'partidas'}</strong> con esta ruta · {effective.wins} {effective.wins === 1 ? 'victoria' : 'victorias'} registradas
        </p>
        <span className="section-label">Continuaciones registradas</span>
        {effective.choices.length ? (
          <div className="career-atlas-choices">
            {effective.choices.map((item) => (
              <button type="button" key={item.san} onClick={() => setTrail([...effective.trail, item.san])}>
                <b>{item.san}</b><small>{item.count} {item.count === 1 ? 'partida' : 'partidas'}</small>
              </button>
            ))}
          </div>
        ) : (
          <p className="hint-text">No hay más continuaciones verificables dentro de las primeras tres jugadas registradas.</p>
        )}
        {sample && typeof onOpenRecord === 'function' ? (
          <button type="button" className="secondary-btn career-atlas-open-record" onClick={() => onOpenRecord(sample)}>
            Revisar partida de esta línea →
          </button>
        ) : null}
        <p className="hint-text">Estas frecuencias proceden de tu historial. No implican que una jugada sea la mejor.</p>
      </div>
      <figure className="career-atlas-board">
        <InsightsPositionPreview fen={effective.fen} orientation="w" />
        <figcaption>Posición reconstruida legalmente tras {effective.trail.length ? effective.trail.join(' · ') : 'el inicio de la partida'}</figcaption>
      </figure>
    </section>
  );
}
