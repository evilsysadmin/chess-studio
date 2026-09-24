import { useEffect, useMemo, useRef, useState } from 'react';
import './TutorialRoute.css';
import './MatthiasClassRoom.css';
import './MatthiasClassRoomFocus.css';
import './MatthiasClassRoomExplanation.css';
import { Chess } from 'chess.js';
import SchoolBoard, { getSchoolBoardRenderer } from './SchoolBoard.jsx';
import { buildSchoolTeachingLayers } from './SchoolTeachingLayers.js';
import { buildSchoolMovePlayback, schoolPlaybackDelay } from './SchoolMovePlayback.js';
import useSchoolExplanationDemo from './useSchoolExplanationDemo.js';
import { SchoolExplanationActions, SchoolExplanationStatus } from './SchoolExplanationView.jsx';
import {
  advanceSchoolCoachContext,
  schoolCoachHintMessage,
  schoolCoachMissMessage,
  schoolCoachSelectionMessage,
  schoolCoachStepMessage,
} from './SchoolCoach.js';
import { abortableDelay, isAbortError } from '../asyncControl.js';
import { WAR_ROOM_VARIANTS } from './WarRoomVariant.js';
import { isClassRoomVariantSelectable, loadClassRoomVariant, saveClassRoomVariant } from './ClassRoomVariant.js';
import ChessGlossary from './ChessGlossary.jsx';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { MECHANIC_TUTORIALS, loadMechanicTutorialProgress, markMechanicTutorialSeen } from '../mechanicTutorials.js';
import { CPU_IDENTITY } from '../cpuIdentity.js';
import {
  MATTHIAS_SCHOOL_COURSES,
  MATTHIAS_SCHOOL_LESSONS,
  incrementMatthiasSchoolAttempt,
  isSchoolCourseAccessible,
  isSchoolLessonAccessible,
  loadMatthiasSchoolProgress,
  markMatthiasSchoolLessonComplete,
  matthiasSchoolCourseSummary,
  matthiasSchoolSummary,
  nextHumanSchoolStep,
  schoolLineForLesson,
  schoolLessonsForCourse,
  schoolBoardGuideMove,
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
  const [hintActive, setHintActive] = useState(false);
  const [dangerSquares, setDangerSquares] = useState([]);
  const [curriculumOpen, setCurriculumOpen] = useState(false);
  const [freeStudy, setFreeStudy] = useState(false);
  const [boardFocusMode, setBoardFocusMode] = useState(false);
  const [boardAnimation, setBoardAnimation] = useState(null);
  const [playbackActive, setPlaybackActive] = useState(false);
  const [masteryReplay, setMasteryReplay] = useState('idle');
  const animationSeqRef = useRef(0);
  const playbackTokenRef = useRef(0);
  const playbackAbortRef = useRef(null);
  const coachIncidentRef = useRef({ kind: null, count: 0 });
  const classRoomVariantSelectable = isClassRoomVariantSelectable();
  const [classRoomVariant, setClassRoomVariant] = useState(() => loadClassRoomVariant());
  const [coach, setCoach] = useState(() => ({ tone: 'neutral', text: initialCoachText(MATTHIAS_SCHOOL_LESSONS[firstSchoolIndex(loadMatthiasSchoolProgress())] || MATTHIAS_SCHOOL_LESSONS[0]) }));
  const [mechanicId, setMechanicId] = useState(MECHANIC_TUTORIALS[0]?.id || null);
  const [mechanicStep, setMechanicStep] = useState(0);
  const [mechanicProgress, setMechanicProgress] = useState(() => loadMechanicTutorialProgress());
  const schoolRenderer = getSchoolBoardRenderer();

  useEffect(() => () => {
    playbackTokenRef.current += 1;
    playbackAbortRef.current?.abort();
  }, []);

  function cancelPlayback() {
    playbackTokenRef.current += 1;
    playbackAbortRef.current?.abort();
    playbackAbortRef.current = null;
    setPlaybackActive(false);
    setBoardAnimation(null);
  }

  const mechanic = MECHANIC_TUTORIALS.find((item) => item.id === mechanicId) || MECHANIC_TUTORIALS[0];
  const mechanicCurrentStep = mechanic?.steps?.[Math.max(0, Math.min((mechanic?.steps?.length || 1) - 1, mechanicStep))];
  const schoolSummary = useMemo(() => matthiasSchoolSummary(schoolProgress), [schoolProgress]);
  const lessonComplete = schoolProgress?.[lesson.id]?.completed === true;
  const lessonAccessible = isSchoolLessonAccessible(schoolProgress, lesson.id, { freeStudy });
  const line = useMemo(() => schoolLineForLesson(lesson), [lesson]);
  const expected = useMemo(() => nextHumanSchoolStep(lesson, lineIndex), [lesson, lineIndex]);
  const boardGuideMove = useMemo(() => masteryReplay === 'active' ? null : schoolBoardGuideMove(lesson, expected, { hintActive }), [lesson, expected, hintActive, masteryReplay]);
  const teachingLayers = useMemo(() => buildSchoolTeachingLayers({ guideMove: boardGuideMove, dangerSquares }), [boardGuideMove, dangerSquares]);
  const completedHumanMoves = line.slice(0, lineIndex).filter((step) => !step.auto).length;
  const totalHumanMoves = humanMoveCount(lesson);
  const runComplete = lineIndex >= line.length;
  const examFailed = Boolean(lesson.exam && mistakes > Number(lesson.maxMistakes || 0));
  const explanation = useSchoolExplanationDemo({
    lesson,
    line,
    lessonComplete,
    practiceFen,
    practiceAnimation: boardAnimation,
    practiceTeachingLayers: teachingLayers,
    animationSeqRef,
    cancelPlayback,
  });

  useEscapeToClose(explanation.open
    ? explanation.close
    : boardFocusMode
      ? () => setBoardFocusMode(false)
      : section === 'school' ? onExit : () => setSection('school'));

  function goTo(newIndex, { freeAccess = freeStudy, closeCurriculum = true } = {}) {
    const clamped = Math.max(0, Math.min(MATTHIAS_SCHOOL_LESSONS.length - 1, newIndex));
    const next = MATTHIAS_SCHOOL_LESSONS[clamped];
    if (!isSchoolLessonAccessible(schoolProgress, next.id, { freeStudy: freeAccess })) return;
    explanation.close();
    cancelPlayback();
    setMasteryReplay('idle');
    coachIncidentRef.current = { kind: null, count: 0 };
    setIndex(clamped);
    setPracticeFen(next.fen);
    setSelected(null);
    setLineIndex(0);
    setMistakes(0);
    setHintActive(false);
    setDangerSquares([]);
    if (closeCurriculum) setCurriculumOpen(false);
    setAttemptEpoch((current) => current + 1);
    setCoach({ tone: 'neutral', text: initialCoachText(next) });
  }

  const legalTargets = useMemo(() => {
    if (!selected || examFailed || runComplete || playbackActive || explanation.open) return [];
    try {
      const board = new Chess(practiceFen);
      const piece = board.get(selected);
      if (!piece || piece.color !== board.turn()) return [];
      return board.moves({ square: selected, verbose: true }).map((move) => ({ to: move.to, san: move.san }));
    } catch {
      return [];
    }
  }, [selected, practiceFen, examFailed, runComplete, playbackActive, explanation.open]);

  function setStudyMode(nextFreeStudy) {
    const enabled = Boolean(nextFreeStudy);
    if (enabled === freeStudy) return;
    setFreeStudy(enabled);
    if (!enabled && !isSchoolLessonAccessible(schoolProgress, lesson.id)) {
      goTo(firstSchoolIndex(schoolProgress), { freeAccess: false, closeCurriculum: false });
    }
  }

  function recordMiss(kind, { danger = [], square = null, selectedSquare = selected } = {}) {
    if (masteryReplay !== 'active') setSchoolProgress(incrementMatthiasSchoolAttempt(lesson.id));
    const nextMistakes = mistakes + 1;
    const nextContext = advanceSchoolCoachContext(coachIncidentRef.current, kind);
    const text = schoolCoachMissMessage({
      lesson,
      kind,
      square,
      selected: selectedSquare,
      expected,
      repeatCount: nextContext.count,
      revealExpected: !lesson.exam && masteryReplay !== 'active',
    });
    coachIncidentRef.current = nextContext;
    setMistakes(nextMistakes);
    setSelected(null);
    setHintActive(false);
    setDangerSquares(danger);
    if (lesson.exam && nextMistakes > Number(lesson.maxMistakes || 0)) {
      setCoach({ tone: 'retry', text: `Suspendido. ${text} Has agotado el margen del examen. Repite cuando quieras; prefiero eso a promocionarte por lástima.` });
      return;
    }
    setCoach({ tone: 'retry', text });
  }

  function resetLesson({ keepCoach = false, clearFailure = true, announce = false, keepMastery = false } = {}) {
    explanation.close();
    cancelPlayback();
    coachIncidentRef.current = { kind: null, count: 0 };
    if (!keepMastery) setMasteryReplay('idle');
    setPracticeFen(lesson.fen);
    setSelected(null);
    setLineIndex(0);
    setHintActive(false);
    setDangerSquares([]);
    setAttemptEpoch((current) => current + 1);
    if (clearFailure) setMistakes(0);
    if (!keepCoach) {
      const resetText = masteryReplay === 'active' && keepMastery
        ? 'Otra vez desde el principio y sin luces. Tú contra la posición.'
        : lesson.exam
          ? `Examen reiniciado. Errores a cero y posición inicial restaurada. ${lesson.objective}`
          : `Lección reiniciada. Volvemos a la posición inicial. ${lesson.objective}`;
      setCoach({ tone: 'neutral', text: announce ? resetText : initialCoachText(lesson) });
    }
  }

  function finishLesson(finalFen) {
    setPracticeFen(finalFen);
    setSelected(null);
    setHintActive(false);
    setDangerSquares([]);
    setLineIndex(line.length);
    coachIncidentRef.current = { kind: null, count: 0 };

    if (masteryReplay === 'active') {
      setMasteryReplay('complete');
      setCoach({ tone: 'success', text: 'Ahora sí. La misma posición, sin luces ni ruedines. Eso ya cuenta como entenderla.' });
      return;
    }

    setSchoolProgress(markMatthiasSchoolLessonComplete(lesson.id));
    setCoach({ tone: 'success', text: lesson.success });
  }

  function startMasteryReplay() {
    if (lesson.exam || !lessonComplete) return;
    explanation.close();
    cancelPlayback();
    setMasteryReplay('active');
    coachIncidentRef.current = { kind: null, count: 0 };
    setPracticeFen(lesson.fen);
    setSelected(null);
    setLineIndex(0);
    setMistakes(0);
    setHintActive(false);
    setDangerSquares([]);
    setAttemptEpoch((current) => current + 1);
    setCoach({ tone: 'neutral', text: 'Bien. Ahora otra vez sin que te lleve de la mano. Mis luces se apagan; tu cerebro, idealmente no.' });
  }

  async function applyCorrectHumanMove(from, to) {
    const playback = buildSchoolMovePlayback({
      fen: practiceFen,
      line,
      lineIndex,
      from,
      to,
    });
    if (!playback.ok) {
      setCoach({ tone: 'retry', text: 'La línea de la lección dejó de ser legal. He parado el ejercicio para no enseñarte basura.' });
      return;
    }

    const token = playbackTokenRef.current + 1;
    playbackTokenRef.current = token;
    playbackAbortRef.current?.abort();
    const controller = new AbortController();
    playbackAbortRef.current = controller;
    setPlaybackActive(true);
    setSelected(null);
    setHintActive(false);
    setDangerSquares([]);

    const reducedMotion = typeof window !== 'undefined'
      && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

    try {
      for (const frame of playback.frames) {
        if (playbackTokenRef.current !== token || controller.signal.aborted) return;
        setPracticeFen(frame.fen);
        animationSeqRef.current += 1;
        setBoardAnimation({
          ...frame.animate,
          seq: animationSeqRef.current,
        });
        const delay = schoolPlaybackDelay({ reducedMotion, auto: frame.auto });
        await abortableDelay(delay, controller.signal);
      }
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) return;
      throw error;
    } finally {
      if (playbackAbortRef.current === controller) playbackAbortRef.current = null;
    }

    if (playbackTokenRef.current !== token || controller.signal.aborted) return;
    setPlaybackActive(false);
    setLineIndex(playback.cursor);

    if (playback.complete) {
      finishLesson(playback.finalFen);
      return;
    }

    const next = nextHumanSchoolStep(lesson, playback.cursor);
    const done = line.slice(0, playback.cursor).filter((step) => !step.auto).length;
    const recovered = Boolean(coachIncidentRef.current?.kind);
    coachIncidentRef.current = { kind: null, count: 0 };
    setCoach({
      tone: 'neutral',
      text: schoolCoachStepMessage({
        autoReplies: playback.autoReplies,
        note: next?.note,
        recovered,
        nextStep: done + 1,
        totalMoves: totalHumanMoves,
      }),
    });
  }

  function handleSquareClick(square) {
    if (explanation.open || playbackActive || runComplete || examFailed || !lessonAccessible || !expected) return;
    let board;
    try { board = new Chess(practiceFen); } catch { return; }
    const piece = board.get(square);

    if (!selected) {
      if (!piece) {
        recordMiss('empty-square', { danger: [square], square });
        return;
      }
      if (square !== expected.from) {
        recordMiss('wrong-piece', { danger: [square], square });
        return;
      }
      setSelected(square);
      setDangerSquares([]);
      setCoach({
        tone: 'neutral',
        text: schoolCoachSelectionMessage({
          square,
          hadRecentMiss: Boolean(coachIncidentRef.current?.kind),
          step: completedHumanMoves + 1,
          totalMoves: totalHumanMoves,
        }),
      });
      return;
    }

    if (square === selected) {
      setSelected(null);
      setCoach({ tone: 'neutral', text: 'Selección cancelada. Dramático, pero recuperable.' });
      return;
    }

    const target = legalTargets.find((move) => move.to === square);
    if (!target) {
      recordMiss('illegal-target', { danger: [square], square, selectedSquare: selected });
      return;
    }

    if (selected !== expected.from || square !== expected.to) {
      recordMiss('off-objective', { danger: [square], square, selectedSquare: selected });
      return;
    }

    applyCorrectHumanMove(selected, square);
  }

  const nextIndex = index + 1;
  const nextLesson = MATTHIAS_SCHOOL_LESSONS[nextIndex] || null;
  const nextUnlocked = nextLesson ? isSchoolLessonAccessible(schoolProgress, nextLesson.id, { freeStudy }) : false;
  const courseSummary = matthiasSchoolCourseSummary(lesson.courseId, schoolProgress);

  return (
    <div
      className="tutorial-shell matthias-school-shell"
      data-school-section={section}
      data-school-curriculum={curriculumOpen ? 'open' : 'closed'}
      data-school-study-mode={freeStudy ? 'free' : 'guided'}
      data-school-focus={boardFocusMode ? 'board' : 'normal'}
    >
      <div className="matthias-school-toolbar">
        <button className="back-link" onClick={section === 'school' ? onExit : () => setSection('school')}>
          ← {section === 'school' ? 'Volver al menú' : 'Volver a la Escuela'}
        </button>
        <span className="matthias-school-room-label">CLASS ROOM</span>
        <details key={section} className="matthias-school-resources">
          <summary>Recursos</summary>
          <div className="matthias-school-resources-menu">
            <button type="button" onClick={() => setSection('glossary')}>Glosario</button>
            <button type="button" onClick={() => setSection('mechanics')}>Modos especiales</button>
            {schoolRenderer === '3d' && classRoomVariantSelectable ? (
              <div className="matthias-school-scene-picker" role="group" aria-label="Escena de clase">
                <span>Escena de clase</span>
                <div>
                  {WAR_ROOM_VARIANTS.map(({ id, label }) => (
                    <button
                      type="button"
                      key={id}
                      aria-pressed={classRoomVariant === id}
                      className={classRoomVariant === id ? 'active' : ''}
                      onClick={() => setClassRoomVariant(saveClassRoomVariant(id))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </details>
      </div>

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
          {boardFocusMode && (
            <div className="matthias-school-focus-mode-bar" role="region" aria-label="Modo tablero">
              <div>
                <span>{explanation.open ? 'DEMO' : masteryReplay === 'active' ? 'SIN AYUDAS' : lesson.exam ? 'EXAMEN' : lesson.eyebrow}</span>
                <strong>{explanation.open ? `Por qué funciona · ${explanation.label}` : lesson.objective}</strong>
                <em>{explanation.open ? `${explanation.step}/${explanation.demo.finalIndex}` : `${runComplete ? totalHumanMoves : Math.min(completedHumanMoves + 1, totalHumanMoves)}/${totalHumanMoves}`}</em>
              </div>
              <button type="button" className="secondary-btn" onClick={() => setBoardFocusMode(false)}>Salir del modo tablero</button>
            </div>
          )}
          <div className="matthias-school-focusbar">
            <div>
              <span>{courseSummary.course?.label || ''}</span>
              <strong>{lesson.title}</strong>
              <small
                className="matthias-school-focus-progress"
                aria-label={`${schoolSummary.passedCourses} de ${schoolSummary.totalCourses} cursos aprobados; ${schoolSummary.completed} de ${schoolSummary.total} lecciones completadas`}
              >
                {schoolSummary.passedCourses}/{schoolSummary.totalCourses} cursos · {schoolSummary.completed}/{schoolSummary.total} lecciones
              </small>
            </div>
            <button
              type="button"
              className="secondary-btn"
              aria-expanded={curriculumOpen}
              aria-controls="matthias-school-curriculum"
              onClick={() => setCurriculumOpen((open) => !open)}
            >
              {curriculumOpen ? 'Cerrar plan de estudios' : 'Plan de estudios'}
            </button>
          </div>

          {curriculumOpen && (
            <div className="matthias-school-study-mode" role="group" aria-label="Modo de estudio">
              <div>
                <span>Acceso</span>
                <button type="button" className={!freeStudy ? 'active' : ''} aria-pressed={!freeStudy} onClick={() => setStudyMode(false)}>Ruta guiada</button>
                <button type="button" className={freeStudy ? 'active' : ''} aria-pressed={freeStudy} onClick={() => setStudyMode(true)}>Estudio libre</button>
              </div>
              <small>{freeStudy ? 'Entra directamente en cualquier curso. Tu progreso se guarda sin saltarse los requisitos de la ruta guiada.' : 'Matthias abre cada curso cuando apruebas el anterior.'}</small>
            </div>
          )}

          <div id="matthias-school-curriculum" className="matthias-school-course-strip" aria-label="Cursos de la Escuela de Matthias">
            {MATTHIAS_SCHOOL_COURSES.map((course) => {
              const summary = matthiasSchoolCourseSummary(course.id, schoolProgress);
              return (
                <button
                  type="button"
                  key={course.id}
                  className={`${course.id === lesson.courseId ? 'active' : ''}${summary.passed ? ' passed' : ''}`}
                  disabled={!isSchoolCourseAccessible(schoolProgress, course.id, { freeStudy })}
                  onClick={() => {
                    const lessons = schoolLessonsForCourse(course.id);
                    const first = freeStudy
                      ? lessons.find((item) => schoolProgress?.[item.id]?.completed !== true) || lessons[0]
                      : lessons.find((item) => isSchoolLessonAccessible(schoolProgress, item.id) && schoolProgress?.[item.id]?.completed !== true) || lessons[0];
                    goTo(MATTHIAS_SCHOOL_LESSONS.findIndex((item) => item.id === first.id));
                  }}
                >
                  <span>{summary.passed ? '✓' : course.rank}</span><div><b>{course.label}</b><small>{freeStudy || summary.unlocked ? `${summary.completed}/${summary.total}` : 'Bloqueado · aprueba el anterior'}</small></div>
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
                const unlocked = isSchoolLessonAccessible(schoolProgress, item.id, { freeStudy });
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
              <div
                key={`${lesson.id}:${attemptEpoch}`}
                className="board-column matthias-school-board"
                data-school-attempt={attemptEpoch}
                data-school-renderer={schoolRenderer}
                data-school-playback={playbackActive ? 'moving' : 'idle'}
                data-school-explanation={explanation.open ? 'demo' : 'practice'}
                data-school-mastery={masteryReplay}
              >
                <SchoolBoard
                  fen={explanation.displayFen}
                  onSquareClick={handleSquareClick}
                  selectedSquare={explanation.open ? null : selected}
                  legalTargets={explanation.open ? [] : legalTargets}
                  teachingLayers={explanation.displayTeachingLayers}
                  animate={explanation.displayAnimation}
                  warRoomVariantOverride={classRoomVariant}
                />
                <div className={`matthias-school-board-actions${explanation.open ? ' is-explanation' : ''}`}>
                  {explanation.open ? (
                    <SchoolExplanationActions explanation={explanation} />
                  ) : (
                    <>
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => resetLesson({ announce: true, keepMastery: masteryReplay === 'active' })}
                      >
                        {examFailed ? 'Reintentar examen' : runComplete ? 'Repetir' : 'Reiniciar'}
                      </button>
                      {!lesson.exam && masteryReplay !== 'active' && <button type="button" className="secondary-btn" disabled={playbackActive} onClick={() => { setDangerSquares([]); setHintActive(true); setCoach({ tone: 'hint', text: schoolCoachHintMessage(lesson) }); }}>Dame una pista</button>}
                      {runComplete && !lesson.exam && masteryReplay === 'idle' && (
                        <button type="button" className="primary-btn" onClick={startMasteryReplay}>Ahora sin ayudas</button>
                      )}
                      {masteryReplay === 'complete' && <span className="matthias-school-mastery-chip">✓ Dominado sin ayudas</span>}
                      {masteryReplay !== 'active' && explanation.available && (
                        <button
                          type="button"
                          className="secondary-btn"
                          disabled={playbackActive}
                          onClick={() => {
                            if (!explanation.openDemo()) {
                              setCoach({ tone: 'retry', text: 'Esta demostración ya no es legal. No voy a enseñarte una fantasía por rellenar espacio.' });
                            }
                          }}
                        >
                          Por qué funciona
                        </button>
                      )}
                      {!boardFocusMode && (
                        <button
                          type="button"
                          className="secondary-btn matthias-school-expand-board"
                          onClick={() => { setCurriculumOpen(false); setBoardFocusMode(true); }}
                        >
                          Expandir tablero
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              <article className={`matthias-school-coach${lesson.exam ? ' is-exam' : ''}`}>
                <div className="matthias-school-coach-heading">
                  <img src={CPU_IDENTITY.avatar} alt="" aria-hidden="true" />
                  <div><span className="section-label">{lesson.eyebrow}</span><h2>{lesson.title}</h2></div>
                  {lessonComplete && <span className="matthias-school-complete-badge">✓ {lesson.exam ? 'aprobado' : 'dominado'}</span>}
                </div>
                <div className="matthias-school-objective"><b>{lesson.exam ? 'Examen' : 'Tu misión'}</b><p>{lesson.objective}</p></div>
                {explanation.open ? (
                  <SchoolExplanationStatus explanation={explanation} text={lesson.explanation} />
                ) : (
                  <>
                    <div className="matthias-school-sequence-status" aria-label={`Secuencia ${Math.min(completedHumanMoves + (runComplete ? 0 : 1), totalHumanMoves)} de ${totalHumanMoves}`}>
                      <span>Secuencia</span><b>{runComplete ? totalHumanMoves : Math.min(completedHumanMoves + 1, totalHumanMoves)}/{totalHumanMoves}</b>
                      {lesson.exam && <em>{Number(lesson.maxMistakes || 0) > 0 ? `Errores ${mistakes}/${lesson.maxMistakes}` : mistakes > 0 ? 'Suspendido' : 'Sin margen de error'}</em>}
                    </div>
                    <div className={`matthias-school-feedback is-${coach.tone}`} role="status" aria-live="polite"><b>Matthias</b><p>{coach.text}</p></div>
                  </>
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
