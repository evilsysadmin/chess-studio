import { useEffect, useMemo, useRef, useState } from 'react';
import SchoolTopicExplorer from './SchoolTopicExplorer.jsx';
import {
  MATTHIAS_SCHOOL_COURSES,
  MATTHIAS_SCHOOL_LESSONS,
  isSchoolCourseAccessible,
  isSchoolLessonAccessible,
  matthiasSchoolCourseSummary,
  matthiasSchoolSummary,
  schoolLessonsForCourse,
} from '../matthiasSchool.js';

function visibleFocusable(panel) {
  if (!panel) return [];
  return [...panel.querySelectorAll(
    'button:not([disabled]), select:not([disabled]), summary, [href], [tabindex]:not([tabindex="-1"])',
  )].filter((node) => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  });
}

export default function SchoolCurriculumOverlay({
  progress,
  freeStudy = false,
  currentLessonId,
  onClose,
  onStudyModeChange,
  onOpenLesson,
}) {
  const currentLesson = MATTHIAS_SCHOOL_LESSONS.find((item) => item.id === currentLessonId)
    || MATTHIAS_SCHOOL_LESSONS[0];
  const [courseId, setCourseId] = useState(currentLesson?.courseId || MATTHIAS_SCHOOL_COURSES[0]?.id);
  const panelRef = useRef(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (currentLesson?.courseId) setCourseId(currentLesson.courseId);
  }, [currentLesson?.courseId]);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const panel = panelRef.current;
    panel?.querySelector('[data-school-curriculum-close]')?.focus();

    function handleKeyDown(event) {
      if (!panel) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = visibleFocusable(panel);
      if (!focusable.length) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  const summary = useMemo(() => matthiasSchoolSummary(progress), [progress]);
  const courseSummary = useMemo(
    () => matthiasSchoolCourseSummary(courseId, progress),
    [courseId, progress],
  );
  const lessons = useMemo(() => schoolLessonsForCourse(courseId), [courseId]);

  return (
    <div className="matthias-school-curriculum-overlay">
      <div className="matthias-school-curriculum-backdrop" aria-hidden="true" onClick={onClose} />
      <section
        ref={panelRef}
        id="matthias-school-curriculum"
        className="matthias-school-curriculum-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="matthias-school-curriculum-title"
      >
        <header className="matthias-school-curriculum-header">
          <div>
            <span>ESCUELA DE MATTHIAS</span>
            <h2 id="matthias-school-curriculum-title">Plan de estudios</h2>
            <p>{summary.completed}/{summary.total} lecciones · {summary.passedCourses}/{summary.totalCourses} cursos aprobados</p>
          </div>
          <button
            type="button"
            className="secondary-btn"
            data-school-curriculum-close
            onClick={onClose}
          >
            Cerrar
          </button>
        </header>

        <div className="matthias-school-curriculum-modes" role="group" aria-label="Modo de estudio">
          <span>Acceso</span>
          <div>
            <button
              type="button"
              className={!freeStudy ? 'active' : ''}
              aria-pressed={!freeStudy}
              onClick={() => onStudyModeChange?.(false)}
            >
              Ruta guiada
            </button>
            <button
              type="button"
              className={freeStudy ? 'active' : ''}
              aria-pressed={freeStudy}
              onClick={() => onStudyModeChange?.(true)}
            >
              Estudio libre
            </button>
          </div>
          <small>
            {freeStudy
              ? 'Puedes consultar cualquier curso. Completarlo aquí no falsea los requisitos de la ruta guiada.'
              : 'Matthias abre cada curso cuando apruebas el anterior.'}
          </small>
        </div>

        <SchoolTopicExplorer
          progress={progress}
          freeStudy={freeStudy}
          currentLessonId={currentLessonId}
          onOpenLesson={onOpenLesson}
        />

        <div className="matthias-school-curriculum-browser">
          <nav className="matthias-school-curriculum-courses" aria-label="Cursos de la Escuela de Matthias">
            <span className="matthias-school-curriculum-column-label">Cursos</span>
            {MATTHIAS_SCHOOL_COURSES.map((course) => {
              const itemSummary = matthiasSchoolCourseSummary(course.id, progress);
              const accessible = isSchoolCourseAccessible(progress, course.id, { freeStudy });
              return (
                <button
                  type="button"
                  key={course.id}
                  className={[
                    course.id === courseId ? 'active' : '',
                    itemSummary.passed ? 'passed' : '',
                  ].filter(Boolean).join(' ')}
                  disabled={!accessible}
                  aria-pressed={course.id === courseId}
                  onClick={() => setCourseId(course.id)}
                >
                  <span>{itemSummary.passed ? '✓' : course.rank}</span>
                  <div>
                    <strong>{course.label}</strong>
                    <small>{accessible ? `${itemSummary.completed}/${itemSummary.total} lecciones` : 'Bloqueado'}</small>
                  </div>
                </button>
              );
            })}
          </nav>

          <section className="matthias-school-curriculum-lessons" aria-label={`Lecciones de ${courseSummary.course?.label || 'curso'}`}>
            <header>
              <span>CURSO {courseSummary.course?.rank} · {courseSummary.course?.label}</span>
              <h3>{courseSummary.course?.label}</h3>
              <p>{courseSummary.course?.description}</p>
            </header>
            <div className="matthias-school-curriculum-lesson-grid">
              {lessons.map((item, lessonIndex) => {
                const complete = progress?.[item.id]?.completed === true;
                const unlocked = isSchoolLessonAccessible(progress, item.id, { freeStudy });
                const current = item.id === currentLessonId;
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={[
                      current ? 'active' : '',
                      complete ? 'complete' : '',
                      item.exam ? 'exam' : '',
                    ].filter(Boolean).join(' ')}
                    disabled={!unlocked}
                    onClick={() => onOpenLesson?.(item.id)}
                  >
                    <span>{complete ? '✓' : item.exam ? 'E' : lessonIndex + 1}</span>
                    <div>
                      <small>{item.exam ? 'EXAMEN DE PROMOCIÓN' : item.eyebrow}</small>
                      <strong>{item.title}</strong>
                      {!unlocked && <em>Completa lo anterior para abrirla</em>}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
