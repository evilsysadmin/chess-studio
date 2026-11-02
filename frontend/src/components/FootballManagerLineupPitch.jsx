import { useState } from 'react';
import { getFootballFatigue } from '../footballManagerRoster.js';
import './FootballManagerLineupPitch.css';

// One canonical 1-1-2-1 formation; changing a name never changes positional rules.
const SLOTS = [
  { role: 'DEL', label: 'delantero', short: 'DEL', x: 50, y: 16 },
  { role: 'MED', label: 'medio 1', short: 'MED', x: 28, y: 40 },
  { role: 'MED', label: 'medio 2', short: 'MED', x: 72, y: 40 },
  { role: 'DEF', label: 'defensa', short: 'DEF', x: 50, y: 65 },
  { role: 'POR', label: 'portero', short: 'POR', x: 50, y: 88 },
];
// Journal order is POR / DEF / MED / MED / DEL, not the visual row order.
const LINEUP_INDEX = [4, 2, 3, 1, 0];

export default function FootballManagerLineupPitch({ players, lineupIds, fatigue, onLineupChange }) {
  const [activeIndex, setActiveIndex] = useState(null);
  const selected = activeIndex === null ? null : players.find((player) => player.id === lineupIds[activeIndex]);
  const bench = players.filter((player) => !lineupIds.includes(player.id));
  const candidates = selected
    ? players.filter((player) => player.role === selected.role && (player.id === selected.id || !lineupIds.includes(player.id)))
    : bench;

  const selectCandidate = (id) => {
    if (activeIndex === null) return;
    if (id !== lineupIds[activeIndex]) {
      const next = [...lineupIds];
      next[activeIndex] = id;
      onLineupChange(next); // Same editFootballCareer journal as native selects.
    }
    setActiveIndex(null);
  };

  return (
    <section className="football-manager-pitch" aria-label="Campo táctico del quinteto">
      <div className="football-manager-pitch__heading">
        <div>
          <strong>Alineación titular</strong>
          <small>Fútbol 5 · Formación 1–1–2–1</small>
        </div>
        <span>Selecciona una camiseta para cambiar al titular</span>
      </div>

      <div className="football-manager-pitch__columns">
        <div className="football-manager-pitch__field" aria-label="Quinteto colocado sobre el campo">
          <div className="football-manager-pitch__outer" aria-hidden="true" />
          <div className="football-manager-pitch__halfway" aria-hidden="true" />
          <div className="football-manager-pitch__circle" aria-hidden="true" />
          <div className="football-manager-pitch__area football-manager-pitch__area--top" aria-hidden="true" />
          <div className="football-manager-pitch__area football-manager-pitch__area--bottom" aria-hidden="true" />
          {SLOTS.map((spot, index) => {
            const slotIndex = LINEUP_INDEX[index];
            const player = players.find((entry) => entry.id === lineupIds[slotIndex]);
            if (!player) return null;
            const playerFatigue = getFootballFatigue(fatigue, player.id);
            return (
              <button
                type="button"
                key={slotIndex}
                className="football-manager-pitch__player"
                style={{ left: spot.x + '%', top: spot.y + '%' }}
                data-player-id={player.id}
                data-fatigue-tier={playerFatigue >= 60 ? 'high' : playerFatigue >= 35 ? 'medium' : 'low'}
                aria-pressed={activeIndex === slotIndex}
                aria-label={'Cambiar ' + spot.label + ': ' + player.name + ', fatiga ' + playerFatigue + '%'}
                onClick={() => setActiveIndex(activeIndex === slotIndex ? null : slotIndex)}
              >
                <span className="football-manager-pitch__shirt" aria-hidden="true">{slotIndex + 1}</span>
                <strong>{player.name.split(' ').slice(-1)[0]}</strong>
                <small>{spot.short} · F{playerFatigue}%</small>
              </button>
            );
          })}
        </div>

        <aside className="football-manager-pitch__bench">
          <div className="football-manager-pitch__bench-heading">
            <strong>{selected ? 'Cambio · ' + selected.role : 'Banquillo'}</strong>
            {selected ? (
              <button type="button" className="football-manager-pitch__close" onClick={() => setActiveIndex(null)}>
                Cerrar
              </button>
            ) : <span>{bench.length} suplentes</span>}
          </div>
          <p>{selected
            ? 'Elige un futbolista de la misma posición. Sólo cambia este puesto.'
            : 'Reservas disponibles. Pulsa una camiseta en el campo para hacer un cambio.'}</p>
          <ul aria-label={selected ? 'Cambiar titular de ' + SLOTS[LINEUP_INDEX.indexOf(activeIndex)].label : 'Jugadores suplentes'}>
            {candidates.map((player) => {
              const f = getFootballFatigue(fatigue, player.id);
              const current = player.id === selected?.id;
              const body = (
                <>
                  <span className="football-manager-pitch__bench-name">
                    <strong>{player.name}</strong>
                    <small>{player.role} · Fatiga {f}%</small>
                  </span>
                  <span className="football-manager-pitch__attributes">ATQ {player.attack} · DEF {player.defense}</span>
                  {current ? <b className="football-manager-pitch__current">Titular</b> : null}
                </>
              );
              return (
                <li key={player.id}>
                  {selected ? (
                    <button
                      type="button"
                      className="football-manager-pitch__candidate"
                      data-football-candidate={player.id}
                      aria-pressed={current}
                      onClick={() => selectCandidate(player.id)}
                    >
                      {body}
                    </button>
                  ) : <div className="football-manager-pitch__reserve">{body}</div>}
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </section>
  );
}
