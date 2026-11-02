import './FootballManagerDesk.css';

// Pure presentation: the journal remains the sole authority for the season.
export default function FootballManagerDesk({ club, season, standings, onNavigate }) {
  if (!club || !season) return null;
  const position = standings.findIndex((row) => row.id === club.id);
  const ownRow = standings[position];
  const finished = season.currentRound >= season.rounds.length;
  const fixture = finished ? null : season.rounds[season.currentRound]?.find(
    (match) => match.homeId === club.id || match.awayId === club.id,
  );
  const atHome = fixture?.homeId === club.id;
  const opponentId = atHome ? fixture?.awayId : fixture?.homeId;
  const opponent = season.clubs.find((row) => row.id === opponentId);

  return (
    <section className="football-manager-desk" aria-label="Panel del despacho">
      <header className="football-manager-desk__identity">
        <span className="football-manager-desk__crest" aria-hidden="true">{club.initials}</span>
        <div>
          <small>Despacho del míster · Liga</small>
          <strong>{club.name}</strong>
          <span>Jornada {season.currentRound} de {season.rounds.length} · Temporada en curso</span>
        </div>
      </header>
      <div className="football-manager-desk__overview">
        <div className="football-manager-desk__fixture" aria-label="Próximo partido del club">
          <small>{finished ? 'Final de temporada' : 'Próximo partido'}</small>
          {fixture && opponent ? (
            <>
              <div className="football-manager-desk__versus">
                <strong>{atHome ? club.name : opponent.name}</strong>
                <b aria-hidden="true">VS</b>
                <strong>{atHome ? opponent.name : club.name}</strong>
              </div>
              <p>Jornada {season.currentRound + 1} de {season.rounds.length} · {atHome ? 'En casa' : 'A domicilio'}</p>
            </>
          ) : <p>{finished ? 'Liga completada. Consulta el balance.' : 'Calendario no disponible.'}</p>}
        </div>
        <dl className="football-manager-desk__metrics" aria-label="Situación en liga">
          <div><dt>Posición</dt><dd>{position < 0 ? '—' : String(position + 1) + 'º'}</dd></div>
          <div><dt>Puntos</dt><dd>{ownRow?.points ?? '—'}</dd></div>
          <div><dt>Jugados</dt><dd>{ownRow?.played ?? '—'}</dd></div>
        </dl>
      </div>
      <nav className="football-manager-desk__navigation" aria-label="Secciones del despacho">
        <button type="button" onClick={() => onNavigate(finished ? 'objective' : 'plan')}>Jornada</button>
        <button type="button" onClick={() => onNavigate('squad')}>Plantilla</button>
        <button type="button" onClick={() => onNavigate('table')}>Clasificación</button>
        <button type="button" onClick={() => onNavigate('results')}>Resultados</button>
      </nav>
      <small className="football-manager-desk__scope">Simulación estadística · Partidos Godot independientes.</small>
    </section>
  );
}
