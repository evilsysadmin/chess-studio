import { useMemo } from 'react';
import { careerActivityCalendar } from '../careerActivityCalendar.js';
import './CareerActivityCalendar.css';

function dayLabel(cell) {
  if (!cell.inMonth) return '';
  if (!cell.games) return `Día ${cell.day}, sin partidas registradas`;
  const parts = [];
  if (cell.wins) parts.push(`${cell.wins} victoria${cell.wins === 1 ? '' : 's'}`);
  if (cell.draws) parts.push(`${cell.draws} tabla${cell.draws === 1 ? '' : 's'}`);
  if (cell.losses) parts.push(`${cell.losses} derrota${cell.losses === 1 ? '' : 's'}`);
  return `Día ${cell.day}: ${parts.join(', ')}`;
}

export default function CareerActivityCalendar({ history = [], now = new Date() }) {
  const model = useMemo(() => careerActivityCalendar(history, now), [history, now]);
  if (!model) return null;

  return (
    <details className="career-activity-calendar" data-career-activity-calendar="monthly-v1">
      <summary>
        <span><b>Calendario de partidas</b><small>{model.label}</small></span>
        <span>{model.totals.games} partidas · {model.totals.wins}V {model.totals.draws}T {model.totals.losses}D</span>
      </summary>
      <div className="career-activity-calendar__body">
        <div className="career-activity-calendar__weekdays" aria-hidden="true">
          {model.weekDays.map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="career-activity-calendar__grid" role="grid" aria-label={`Actividad de ${model.label}`}>
          {model.cells.map((cell) => (
            <div
              key={cell.key}
              role="gridcell"
              aria-label={dayLabel(cell)}
              className={`career-activity-day is-${cell.tone}${cell.inMonth ? '' : ' is-outside'}${cell.isToday ? ' is-today' : ''}`}
              data-games={cell.games}
            >
              {cell.inMonth && <>
                <span>{cell.day}</span>
                {cell.games > 0 && <b>{cell.games}</b>}
              </>}
            </div>
          ))}
        </div>
        <div className="career-activity-calendar__legend" aria-label="Leyenda del calendario">
          <span><i className="is-positive" /> Más victorias</span>
          <span><i className="is-mixed" /> Equilibrado/tablas</span>
          <span><i className="is-negative" /> Más derrotas</span>
        </div>
      </div>
    </details>
  );
}
