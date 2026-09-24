import { useMemo, useState } from 'react';
import {
  isSchoolLessonAccessible,
} from '../matthiasSchool.js';
import {
  SCHOOL_CATALOG_DEPTHS,
  SCHOOL_CATALOG_DISCIPLINES,
  schoolCatalogLessons,
} from '../schoolCatalog.js';

export default function SchoolTopicExplorer({
  progress,
  freeStudy = false,
  currentLessonId = null,
  onOpenLesson,
}) {
  const [discipline, setDiscipline] = useState('all');
  const [depth, setDepth] = useState('all');

  const entries = useMemo(
    () => schoolCatalogLessons({ discipline, depth, includeExams: false }),
    [discipline, depth],
  );

  return (
    <details className="matthias-school-topic-explorer">
      <summary>
        <span>Explorar por tema</span>
        <small>{entries.length} lecciones</small>
      </summary>
      <div className="matthias-school-topic-explorer-body">
        <div className="matthias-school-topic-filter">
          <label htmlFor="school-topic-discipline">Tema</label>
          <select
            id="school-topic-discipline"
            value={discipline}
            onChange={(event) => setDiscipline(event.target.value)}
          >
            <option value="all">Todos</option>
            {SCHOOL_CATALOG_DISCIPLINES.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </div>
        <div className="matthias-school-topic-filter">
          <label htmlFor="school-topic-depth">Profundidad</label>
          <select
            id="school-topic-depth"
            value={depth}
            onChange={(event) => setDepth(event.target.value)}
          >
            <option value="all">Todas</option>
            {SCHOOL_CATALOG_DEPTHS.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </div>
        <div className="matthias-school-topic-results" aria-live="polite">
          {entries.length ? entries.map((entry) => {
            const accessible = isSchoolLessonAccessible(progress, entry.id, { freeStudy });
            return (
              <button
                type="button"
                key={entry.id}
                className={entry.id === currentLessonId ? 'active' : ''}
                disabled={!accessible}
                onClick={() => onOpenLesson?.(entry.id)}
              >
                <span>{entry.courseLabel} · nivel {entry.difficulty}</span>
                <strong>{entry.title}</strong>
                <small>{entry.concept ? entry.concept.replaceAll('-', ' ') : entry.depthLabel}</small>
              </button>
            );
          }) : (
            <p>No hay lecciones con esa combinación. Matthias se niega a fabricar contenido imaginario.</p>
          )}
        </div>
      </div>
    </details>
  );
}
