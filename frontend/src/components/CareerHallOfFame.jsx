import { careerHonors } from '../careerHonors.js';
import './CareerHallOfFame.css';

// Read-only projection of saved games and archived analyses; no invented moves.
export default function CareerHallOfFame({ hall = {}, history = [], onOpenRecord, onMovie }) {
  const honors = careerHonors(hall, history);
  return (
    <section className="menu-section career-hall-of-fame" aria-labelledby="career-hall-title">
      <div className="career-hall-heading">
        <div>
          <span className="section-label">El museo de tus partidas</span>
          <h2 id="career-hall-title">Salón de la Gloria</h2>
          <p className="hint-text">Victorias, precisión y defensas que sí están respaldadas por tus partidas. Matthias exige pruebas incluso para felicitarte.</p>
        </div>
        {honors.length > 0 ? <span className="career-hall-count">{honors.length} {honors.length === 1 ? 'hazaña' : 'hazañas'}</span> : null}
      </div>
      {honors.length ? (
        <div className="career-hall-entries">
          {honors.map((honor) => (
            <article className="career-hall-entry" key={honor.id} data-career-honor={honor.id}>
              <span className="career-hall-medallion" aria-hidden="true">{honor.symbol}</span>
              <div className="career-hall-entry-copy">
                <span className="career-hall-label">{honor.title}</span>
                <strong>{honor.value}</strong>
                <small>{honor.proof}</small>
                {honor.record ? (
                  <div className="career-hall-actions">
                    {onOpenRecord ? <button type="button" onClick={() => onOpenRecord(honor.record)}>Revisar partida →</button> : null}
                    {onMovie ? <button type="button" onClick={() => onMovie(honor.record)}>Ver película</button> : null}
                  </div>
                ) : (
                  <span className="career-hall-no-replay">La prueba está archivada; no hay replay inequívoco disponible.</span>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="career-hall-empty">Aún no hay hazañas acreditadas. Juega partidas y analiza su resultado para inaugurar la vitrina.</div>
      )}
    </section>
  );
}
