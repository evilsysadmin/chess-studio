import { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import Board from './Board.jsx';
import ChessGlossary from './ChessGlossary.jsx';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { MECHANIC_TUTORIALS, loadMechanicTutorialProgress, markMechanicTutorialSeen } from '../mechanicTutorials.js';
import { CPU_IDENTITY } from '../cpuIdentity.js';
import {
  MATTHIAS_SCHOOL_COURSES,
  MATTHIAS_SCHOOL_LESSONS,
  incrementMatthiasSchoolAttempt,
  isSchoolLessonUnlocked,
  loadMatthiasSchoolProgress,
  markMatthiasSchoolLessonComplete,
  matthiasSchoolCourseSummary,
  matthiasSchoolSummary,
  nextHumanSchoolStep,
  schoolLineForLesson,
  schoolLessonsForCourse,
} from '../matthiasSchool.js';

function initialCoachText(lesson) {
  if (lesson.exam) {
    const margin = Number(lesson.maxMistakes || 0);
    return `Examen de promoción. ${lesson.objective} ${margin > 0 ? `Tienes margen para ${margin} error${margin === 1 ? '' : 'es'}.` : 'Sin margen de error.'} Y no, no hay pista.`;
  }
  return `Objetivo: ${lesson.objective} Hazlo en el tablero. Si sale mal, sobrevivo; tú probablemente también.`;
}

function firstSchoolIndex(progress) {
  const summary = matthiasSchoolSummary(progress);
  const index = MATTHIAS_SCHOOL_LESSONS.findIndex((lesson) => lesson.id === summary.nextLessonId);
  return index >= 0 ? index : 0;
}

function humanMoveCount(lesson) {
  return schoolLineForLesson(lesson).filter((step) => !step.auto).length;
}

export default function Tutorial({ onExit }) {
  const [section, setSection] = useState('school');
  const [schoolProgress, setSchoolProgress] = useState(() => loadMatthiasSchoolProgress());
  const [index, setIndex] = useState(() => firstSchoolIndex(loadMatthiasSchoolProgress()));
  const lesson = MATTHIAS_SCHOOL_LESSONS[index];
  const [practiceFen, setPracticeFen] = useState(() => MATTHIAS_SCHOOL_LESSONS[firstSchoolIndex(loadMatthiasSchoolProgress())]?.fen || MATTHIAS_SCHOOL_LESSONS[0].fen);
  const [selected, setSelected] = useState(null);
  const [lineIndex, setLineIndex] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [attemptEpoch, setAttemptEpoch] = useState(0);
  const [coach, setCoach] = useState(() => ({ tone: 'neutral', text: initialCoachText(MATTHIAS_SCHOOL_LESSONS[firstSchoolIndex(loadMatthiasSchoolProgress())] || MATTHIAS_SCHOOL_LESSONS[0]) }));
  const [mechanicId, setMechanicId] = useState(MECHANIC_TUTORIALS[0]?.id || null);
  const [mechanicStep, setMechanicStep] = useState(0);
  const [mechanicProgress, setMechanicProgress] = useState(() => loadMechanicTutorialProgress());

  useEscapeToClose(section === 'school' ? onExit : () => setSection('school'));

  const mechanic = MECHANIC_TUTORIALS.find((item) => item.id === mechanicId) || MECHANIC_TUTORIALS[0];
  const mechanicCurrentStep = mechanic?.steps?.[Math.max(0, Math.min((mechanic?.steps?.length || 1) - 1, mechanicStep))];
  const schoolSummary = useMemo(() => matthiasSchoolSummary(schoolProgress), [schoolProgress]);
  const lessonComplete = schoolProgress?.[lesson.id]?.completed === true;
  const lessonUnlocked = isSchoolLessonUnlocked(schoolProgress, lesson.id) || lessonComplete;
  const line = useMemo(() => schoolLineForLesson(lesson), [lesson]);
  const expected = useMemo(() => nextHumanSchoolStep(lesson, lineIndex), [lesson, lineIndex]);
  const completedHumanMoves = line.slice(0, lineIndex).filter((step) => !step.auto).length;
  const totalHumanMoves = humanMoveCount(lesson);
  const runComplete = lineIndex >= line.length;
  const examFailed = Boolean(lesson.exam && mistakes > Number(lesson.maxMistakes || 0));

  function goTo(newIndex) {
    const clamped = Math.max(0, Math.min(MATTHIAS_SCHOOL_LESSONS.length - 1, newIndex));
    const next = MATTHIAS_SCHOOL_LESSONS[clamped];
    const unlocked = isSchoolLessonUnlocked(schoolProgress, next.id) || schoolProgress?.[next.id]?.completed === true;
    if (!unlocked) return;
    setIndex(clamped);
    setPracticeFen(next.fen);
    setSelected(null);
    setLineIndex(0);
    setMistakes(0);
    setAttemptEpoch((current) => current + 1);
    setCoach({ tone: 'neutral', text: initialCoachText(next) });
  }

  const legalTargets = useMemo(() => {
    if (!selected || examFailed || runComplete) return [];
    try {
      const board = new Chess(practiceFen);
      const piece = board.get(selected);
      if (!piece || piece.color !== board.turn()) return [];
      return board.moves({ square: selected, verbose: true }).map((move) => ({ to: move.to, san: move.san }));
    } catch {
      return [];
    }
  }, [selected, practiceFen, examFailed, runComplete]);

  function recordMiss(text) {
    setSchoolProgress(incrementMatthiasSchoolAttempt(lesson.id));
    const nextMistakes = mistakes + 1;
    setMistakes(nextMistakes);
    setSelected(null);
    if (lesson.exam && nextMistakes > Number(lesson.maxMistakes || 0)) {
      setCoach({ tone: 'retry', text: `Suspendido. ${text} Has agotado el margen del examen. Repite cuando quieras; prefiero eso a promocionarte por lástima.` });
      return;
    }
    setCoach({ tone: 'retry', text });
  }

  function resetLesson({ keepCoach = false, clearFailure = true } = {}) {
    setPracticeFen(lesson.fen);
    setSelected(null);
    setLineIndex(0);
    setAttemptEpoch((current) => current + 1);
    if (clearFailure) setMistakes(0);
    if (!keepCoach) setCoach({ tone: 'neutral', text: initialCoachText(lesson) });
  }

  function finishLesson(finalFen) {
    setPracticeFen(finalFen);
    setSelected(null);
    setLineIndex(line.length);
    setSchoolProgress(markMatthiasSchoolLessonComplete(lesson.id));
    setCoach({ tone: 'success', text: lesson.success });
  }

  function applyCorrectHumanMove(from, to) {
    let board;
    try {
      board = new Chess(practiceFen);
      const move = board.move({ from, to, promotion: 'q' });
      if (!move) throw new Error('illegal');
    } catch {
      recordMiss('La jugada dejó de ser legal al aplicarla. Reiniciamos antes de acusar al continuo espacio-tiempo.');
      resetLesson({ keepCoach: true, clearFailure: false });
      return;
    }

    let cursor = lineIndex + 1;
    let autoReplies = 0;
    while (cursor < line.length && line[cursor].auto) {
      const response = line[cursor];
      const replyMove = board.move({ from: response.from, to: response.to, promotion: 'q' });
      if (!replyMove) {
        setCoach({ tone: 'retry', text: 'La respuesta programada de la lección ya no es legal. He parado el ejercicio para no enseñarte basura.' });
        return;
      }
      cursor += 1;
      autoReplies += 1;
    }

    if (cursor >= line.length) {
      finishLesson(board.fen());
      return;
    }

    setPracticeFen(board.fen());
    setLineIndex(cursor);
    setSelected(null);
    const next = nextHumanSchoolStep(lesson, cursor);
    const done = line.slice(0, cursor).filter((step) => !step.auto).length;
    setCoach({
      tone: 'neutral',
      text: `${autoReplies ? 'Bien. El rival ha respondido. ' : 'Bien. '}${next?.note || `Sigue con la secuencia: movimiento ${done + 1} de ${totalHumanMoves}.`} No improvises una ópera todavía.`,
    });
  }

  function handleSquareClick(square) {
    if (runComplete || examFailed || !lessonUnlocked || !expected) return;
    let board;
    try { board = new Chess(practiceFen); } catch { return; }
    const piece = board.get(square);

    if (!selected) {
      if (!piece) {
        recordMiss(`Has seleccionado ${square}, una magnífica casilla vacía. Busca la pieza que debe iniciar este paso.`);
        return;
      }
      if (square !== expected.from) {
        recordMiss(`Esa pieza existe, sí. Pero la secuencia pide empezar este paso desde ${expected.from}. Mira la posición, no mi paciencia.`);
        return;
      }
      setSelected(square);
      setCoach({ tone: 'neutral', text: `${square} seleccionado. Ejecuta el paso ${completedHumanMoves + 1} de ${totalHumanMoves}.` });
      return;
    }

    if (square === selected) {
      setSelected(null);
      setCoach({ tone: 'neutral', text: 'Selección cancelada. Dramático, pero recuperable.' });
      return;
    }

    const target = legalTargets.find((move) => move.to === square);
    if (!target) {
      recordMiss(`La pieza no puede ir de ${selected} a ${square}. Las reglas siguen siendo bastante inflexibles, incluso contigo.`);
      return;
    }

    if (selected !== expected.from || square !== expected.to) {
      recordMiss(`Legal, sí. Lo que te he pedido, no. Objetivo: ${lesson.objective} Paciencia; todavía no llamo a la policía del ajedrez.`);
      return;
    }

    applyCorrectHumanMove(selected, square);
  }

  const nextIndex = index + 1;
  const nextLesson = MATTHIAS_SCHOOL_LESSONS[nextIndex] || null;
  const nextUnlocked = nextLesson ? isSchoolLessonUnlocked(schoolProgress, nextLesson.id) || schoolProgress?.[nextLesson.id]?.completed === true : false;
  const courseSummary = matthiasSchoolCourseSummary(lesson.courseId, schoolProgress);

  return (
    <div className="tutorial-shell matthias-school-shell">
      <button className="back-link" onClick={section === 'school' ? onExit : () => setSection('school')}>
        ← {section === 'school' ? 'Volver al menú' : 'Volver a la Escuela'}
      </button>

      <nav className="tutorial-section-tabs" aria-label="Aprendizaje">
        <button type="button" className={section === 'school' ? 'active' : ''} onClick={() => setSection('school')}>Escuela de Matthias</button>
        <button type="button" className={section === 'glossary' ? 'active' : ''} onClick={() => setSection('glossary')}>Glosario</button>
        <button type="button" className={section === 'mechanics' ? 'active' : ''} onClick={() => setSection('mechanics')}>Modos especiales</button>
      </nav>

      {section === 'glossary' ? (
        <ChessGlossary />
      ) : section === 'mechanics' ? (
        <div className="mechanic-library">
          <aside className="mechanic-library-list">
            {MECHANIC_TUTORIALS.map((item) => (
              <button type="button" key={item.id} className={item.id === mechanic?.id ? 'active' : ''} onClick={() => { setMechanicId(item.id); setMechanicStep(0); }}>
                <span>{item.group}</span><strong>{item.title}</strong><small>{mechanicProgress[item.id]?.seen ? '✓ visto' : 'nuevo'}</small>
              </button>
            ))}
          </aside>
          {mechanic && mechanicCurrentStep && (
            <article className="mechanic-library-detail">
              <span className="section-label">{mechanic.group} · TUTORIAL NO ESTÁNDAR</span>
              <h2>{mechanic.title}</h2>
              <p className="hero-scope-note">{mechanic.summary}</p>
              <div className="mechanic-tutorial-step">
                <span className="mechanic-tutorial-counter">{mechanicStep + 1}/{mechanic.steps.length}</span>
                <h3>{mechanicCurrentStep.title}</h3><p>{mechanicCurrentStep.text}</p>
              </div>
              <div className="mechanic-tutorial-actions">
                <button type="button" className="secondary-btn" disabled={mechanicStep === 0} onClick={() => setMechanicStep((i) => Math.max(0, i - 1))}>Anterior</button>
                {mechanicStep < mechanic.steps.length - 1 ? (
                  <button type="button" className="primary-btn" onClick={() => setMechanicStep((i) => Math.min(mechanic.steps.length - 1, i + 1))}>Siguiente</button>
                ) : (
                  <button type="button" className="primary-btn" onClick={() => setMechanicProgress(markMechanicTutorialSeen(mechanic.id))}>Marcar entendido</button>
                )}
              </div>
            </article>
          )}
        </div>
      ) : (
        <>
          <header className="matthias-school-hero">
            <img src={CPU_IDENTITY.avatar} alt="" aria-hidden="true" />
            <div>
              <span className="section-label">ESCUELA DE MATTHIAS · 5 CURSOS · HANDS-ON</span>
              <h1>Aprende jugando. Aprueba demostrando.</h1>
              <p>Básico, Básico-medio, Medio, Medio-avanzado y Avanzado. Cada curso termina en un examen práctico: sin aprobarlo, no asciendes. Yo pongo la posición; tú haces el trabajo.</p>
            </div>
            <div className="matthias-school-progress" aria-label={`${schoolSummary.passedCourses} de ${schoolSummary.totalCourses} cursos aprobados; ${schoolSummary.completed} de ${schoolSummary.total} lecciones completadas`}>
              <strong>{schoolSummary.passedCourses}/{schoolSummary.totalCourses}</strong>
              <span>{schoolSummary.complete ? 'Escuela completada' : `Curso actual · ${schoolSummary.currentCourseLabel}`}</span>
              <i><b style={{ width: `${schoolSummary.total ? (schoolSummary.completed / schoolSummary.total) * 100 : 0}%` }} /></i>
            </div>
          </header>

          <div className="matthias-school-course-strip" aria-label="Cursos de la Escuela de Matthias">
            {MATTHIAS_SCHOOL_COURSES.map((course) => {
              const summary = matthiasSchoolCourseSummary(course.id, schoolProgress);
              return (
                <button
                  type="button"
                  key={course.id}
                  className={`${course.id === lesson.courseId ? 'active' : ''}${summary.passed ? ' passed' : ''}`}
                  disabled={!summary.unlocked}
                  onClick={() => {
                    const first = schoolLessonsForCourse(course.id).find((item) => isSchoolLessonUnlocked(schoolProgress, item.id) && schoolProgress?.[item.id]?.completed !== true)
                      || schoolLessonsForCourse(course.id)[0];
                    goTo(MATTHIAS_SCHOOL_LESSONS.findIndex((item) => item.id === first.id));
                  }}
                >
                  <span>{summary.passed ? '✓' : course.rank}</span><div><b>{course.label}</b><small>{summary.unlocked ? `${summary.completed}/${summary.total}` : 'Bloqueado · aprueba el anterior'}</small></div>
                </button>
              );
            })}
          </div>

          <div className="matthias-school-layout">
            <aside className="matthias-school-lessons" aria-label={`Lecciones del curso ${courseSummary.course?.label || ''}`}>
              <div className="matthias-school-course-intro">
                <span className="section-label">CURSO {courseSummary.course?.rank} · {courseSummary.course?.label}</span>
                <p>{courseSummary.course?.description}</p>
              </div>
              {schoolLessonsForCourse(lesson.courseId).map((item) => {
                const lessonIndex = MATTHIAS_SCHOOL_LESSONS.findIndex((candidate) => candidate.id === item.id);
                const complete = schoolProgress?.[item.id]?.completed === true;
                const unlocked = isSchoolLessonUnlocked(schoolProgress, item.id) || complete;
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={`${lessonIndex === index ? 'active' : ''}${complete ? ' complete' : ''}${item.exam ? ' exam' : ''}`}
                    disabled={!unlocked}
                    onClick={() => goTo(lessonIndex)}
                  >
                    <span>{complete ? '✓' : item.exam ? 'E' : schoolLessonsForCourse(lesson.courseId).findIndex((row) => row.id === item.id) + 1}</span>
                    <div><small>{item.exam ? 'EXAMEN DE PROMOCIÓN' : item.eyebrow}</small><strong>{item.title}</strong></div>
                  </button>
                );
              })}
            </aside>

            <div className="matthias-school-stage">
              <div className="board-column matthias-school-board">
                <Board key={`${lesson.id}:${attemptEpoch}`} fen={practiceFen} onSquareClick={handleSquareClick} selectedSquare={selected} legalTargets={legalTargets} />
                <div className="matthias-school-board-actions">
                  <button type="button" className="secondary-btn" onClick={() => resetLesson()}>{examFailed ? 'Reintentar examen' : runComplete ? 'Repetir' : 'Reiniciar'}</button>
                  {!lesson.exam && <button type="button" className="secondary-btn" onClick={() => setCoach({ tone: 'hint', text: lesson.hint })}>Dame una pista</button>}
                </div>
              </div>

              <article className={`matthias-school-coach${lesson.exam ? ' is-exam' : ''}`}>
                <div className="matthias-school-coach-heading">
                  <img src={CPU_IDENTITY.avatar} alt="" aria-hidden="true" />
                  <div><span className="section-label">{lesson.eyebrow}</span><h2>{lesson.title}</h2></div>
                  {lessonComplete && <span className="matthias-school-complete-badge">✓ {lesson.exam ? 'aprobado' : 'dominado'}</span>}
                </div>
                <div className="matthias-school-objective"><b>{lesson.exam ? 'Examen' : 'Tu misión'}</b><p>{lesson.objective}</p></div>
                <div className="matthias-school-sequence-status" aria-label={`Secuencia ${Math.min(completedHumanMoves + (runComplete ? 0 : 1), totalHumanMoves)} de ${totalHumanMoves}`}>
                  <span>Secuencia</span><b>{runComplete ? totalHumanMoves : Math.min(completedHumanMoves + 1, totalHumanMoves)}/{totalHumanMoves}</b>
                  {lesson.exam && <em>{Number(lesson.maxMistakes || 0) > 0 ? `Errores ${mistakes}/${lesson.maxMistakes}` : mistakes > 0 ? 'Suspendido' : 'Sin margen de error'}</em>}
                </div>
                <div className={`matthias-school-feedback is-${coach.tone}`} role="status" aria-live="polite"><b>Matthias</b><p>{coach.text}</p></div>
                {(!lesson.exam || lessonComplete) && (
                  <details className="friendly-disclosure matthias-school-explanation">
                    <summary>Por qué funciona</summary><p>{lesson.explanation}</p>
                  </details>
                )}
                <div className="tutorial-nav matthias-school-nav">
                  <button className="secondary-btn" onClick={() => goTo(index - 1)} disabled={index === 0}>Anterior</button>
                  <span className="tutorial-progress">{courseSummary.course?.label} · {courseSummary.completed}/{courseSummary.total}</span>
                  {nextLesson ? (
                    <button className="primary-btn" onClick={() => goTo(nextIndex)} disabled={!lessonComplete || !nextUnlocked}>{nextLesson.courseId !== lesson.courseId ? `Entrar en ${schoolSummary.courses.find((item) => item.course?.id === nextLesson.courseId)?.course?.label || 'siguiente curso'}` : nextLesson.exam ? 'Ir al examen' : 'Siguiente lección'}</button>
                  ) : (
                    <button className="primary-btn" onClick={onExit} disabled={!lessonComplete}>Graduarme y jugar</button>
                  )}
                </div>
              </article>
            </div>
          </div>
        </>
      )}
    </div>
  );
}