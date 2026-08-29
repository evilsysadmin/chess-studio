import { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import Board from './Board.jsx';
import ChessGlossary from './ChessGlossary.jsx';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { MECHANIC_TUTORIALS, loadMechanicTutorialProgress, markMechanicTutorialSeen } from '../mechanicTutorials.js';
import { CPU_IDENTITY } from '../cpuIdentity.js';
import {
  MATTHIAS_SCHOOL_LESSONS,
  incrementMatthiasSchoolAttempt,
  loadMatthiasSchoolProgress,
  markMatthiasSchoolLessonComplete,
  matthiasSchoolSummary,
} from '../matthiasSchool.js';

// Permite consultar movimientos legales de la pieza seleccionada aunque el FEN
// de entrenamiento tenga otro turno. La Escuela no es una partida competitiva.
function withTurn(fen, color) {
  const parts = fen.split(' ');
  parts[1] = color;
  return parts.join(' ');
}

function initialCoachText(lesson) {
  return `Objetivo: ${lesson.objective} Hazlo en el tablero. Si sale mal, sobrevivo; tú probablemente también.`;
}

export default function Tutorial({ onExit }) {
  const [section, setSection] = useState('school');
  const [index, setIndex] = useState(0);
  const lesson = MATTHIAS_SCHOOL_LESSONS[index];
  const [practiceFen, setPracticeFen] = useState(lesson.fen);
  const [selected, setSelected] = useState(null);
  const [coach, setCoach] = useState(() => ({ tone: 'neutral', text: initialCoachText(lesson) }));
  const [schoolProgress, setSchoolProgress] = useState(() => loadMatthiasSchoolProgress());
  const [mechanicId, setMechanicId] = useState(MECHANIC_TUTORIALS[0]?.id || null);
  const [mechanicStep, setMechanicStep] = useState(0);
  const [mechanicProgress, setMechanicProgress] = useState(() => loadMechanicTutorialProgress());

  useEscapeToClose(section === 'school' ? onExit : () => setSection('school'));

  const mechanic = MECHANIC_TUTORIALS.find((item) => item.id === mechanicId) || MECHANIC_TUTORIALS[0];
  const mechanicCurrentStep = mechanic?.steps?.[Math.max(0, Math.min((mechanic?.steps?.length || 1) - 1, mechanicStep))];
  const schoolSummary = useMemo(() => matthiasSchoolSummary(schoolProgress), [schoolProgress]);
  const lessonComplete = schoolProgress?.[lesson.id]?.completed === true;

  function goTo(newIndex) {
    const clamped = Math.max(0, Math.min(MATTHIAS_SCHOOL_LESSONS.length - 1, newIndex));
    const next = MATTHIAS_SCHOOL_LESSONS[clamped];
    setIndex(clamped);
    setPracticeFen(next.fen);
    setSelected(null);
    setCoach({ tone: 'neutral', text: initialCoachText(next) });
  }

  const legalTargets = useMemo(() => {
    if (!selected) return [];
    const piece = new Chess(practiceFen).get(selected);
    if (!piece) return [];
    const temp = new Chess(withTurn(practiceFen, piece.color));
    return temp.moves({ square: selected, verbose: true }).map((m) => ({ to: m.to, san: m.san }));
  }, [selected, practiceFen]);

  function recordMiss(text) {
    setSchoolProgress(incrementMatthiasSchoolAttempt(lesson.id));
    setCoach({ tone: 'retry', text });
  }

  function resetLesson({ keepCoach = false } = {}) {
    setPracticeFen(lesson.fen);
    setSelected(null);
    if (!keepCoach) setCoach({ tone: 'neutral', text: initialCoachText(lesson) });
  }

  function handleSquareClick(square) {
    if (lessonComplete) return;
    const board = new Chess(practiceFen);
    const piece = board.get(square);

    if (!selected) {
      if (!piece) {
        recordMiss(`Has seleccionado ${square}, una magnífica casilla vacía. Prueba con el ${lesson.piece} que te he señalado.`);
        return;
      }
      if (square !== lesson.from) {
        recordMiss(`Esa pieza existe, sí. Bien observado. Pero hoy entrenamos el ${lesson.piece} de ${lesson.from}.`);
        return;
      }
      setSelected(square);
      setCoach({ tone: 'neutral', text: `Bien. ${lesson.from} seleccionado. Ahora ejecuta el objetivo sin convertirlo en una tesis doctoral.` });
      return;
    }

    if (square === selected) {
      setSelected(null);
      setCoach({ tone: 'neutral', text: 'Selección cancelada. Dramático, pero recuperable.' });
      return;
    }

    const target = legalTargets.find((move) => move.to === square);
    if (!target) {
      if (piece && square === lesson.from) return;
      recordMiss(`El ${lesson.piece} no puede ir de ${selected} a ${square}. Las reglas siguen siendo bastante inflexibles, incluso contigo.`);
      setSelected(null);
      return;
    }

    if (selected !== lesson.from || square !== lesson.to) {
      recordMiss(`Legal, sí. Lo que te he pedido, no. Objetivo: ${lesson.objective} Paciencia; todavía no llamo a la policía del ajedrez.`);
      setSelected(null);
      return;
    }

    const selectedPiece = board.get(selected);
    const temp = new Chess(withTurn(practiceFen, selectedPiece.color));
    const move = temp.move({ from: selected, to: square, promotion: 'q' });
    if (!move) {
      recordMiss('Esa jugada parecía legal y luego dejó de serlo. Reiniciamos antes de acusar a la física.');
      resetLesson({ keepCoach: true });
      return;
    }
    setPracticeFen(temp.fen());
    setSelected(null);
    setSchoolProgress(markMatthiasSchoolLessonComplete(lesson.id));
    setCoach({ tone: 'success', text: lesson.success });
  }

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
              <button
                type="button"
                key={item.id}
                className={item.id === mechanic?.id ? 'active' : ''}
                onClick={() => { setMechanicId(item.id); setMechanicStep(0); }}
              >
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
                <h3>{mechanicCurrentStep.title}</h3>
                <p>{mechanicCurrentStep.text}</p>
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
              <span className="section-label">ESCUELA DE MATTHIAS · HANDS-ON</span>
              <h1>Aprende moviendo piezas, no leyendo un prospecto.</h1>
              <p>Yo pongo una posición, tú haces la jugada. Si fallas, te explico por qué y volvemos a intentarlo. Con paciencia. No necesariamente con dulzura.</p>
            </div>
            <div className="matthias-school-progress" aria-label={`${schoolSummary.completed} de ${schoolSummary.total} lecciones completadas`}>
              <strong>{schoolSummary.completed}/{schoolSummary.total}</strong>
              <span>{schoolSummary.complete ? 'Curso básico completado' : 'Fundamentos dominados'}</span>
              <i><b style={{ width: `${schoolSummary.total ? (schoolSummary.completed / schoolSummary.total) * 100 : 0}%` }} /></i>
            </div>
          </header>

          <div className="matthias-school-layout">
            <aside className="matthias-school-lessons" aria-label="Lecciones de la Escuela de Matthias">
              {MATTHIAS_SCHOOL_LESSONS.map((item, lessonIndex) => {
                const complete = schoolProgress?.[item.id]?.completed === true;
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={`${lessonIndex === index ? 'active' : ''}${complete ? ' complete' : ''}`}
                    onClick={() => goTo(lessonIndex)}
                  >
                    <span>{complete ? '✓' : lessonIndex + 1}</span>
                    <div><small>{item.eyebrow}</small><strong>{item.title}</strong></div>
                  </button>
                );
              })}
            </aside>

            <div className="matthias-school-stage">
              <div className="board-column matthias-school-board">
                <Board
                  fen={practiceFen}
                  onSquareClick={handleSquareClick}
                  selectedSquare={selected}
                  legalTargets={legalTargets}
                />
                <div className="matthias-school-board-actions">
                  <button className="secondary-btn" onClick={() => resetLesson()}>Reiniciar</button>
                  <button className="secondary-btn" onClick={() => setCoach({ tone: 'hint', text: lesson.hint })}>Dame una pista</button>
                </div>
              </div>

              <article className="matthias-school-coach">
                <div className="matthias-school-coach-heading">
                  <img src={CPU_IDENTITY.avatar} alt="" aria-hidden="true" />
                  <div><span className="section-label">{lesson.eyebrow}</span><h2>{lesson.title}</h2></div>
                  {lessonComplete && <span className="matthias-school-complete-badge">✓ dominado</span>}
                </div>
                <div className="matthias-school-objective"><b>Tu misión</b><p>{lesson.objective}</p></div>
                <div className={`matthias-school-feedback is-${coach.tone}`} role="status" aria-live="polite">
                  <b>Matthias</b><p>{coach.text}</p>
                </div>
                <details className="friendly-disclosure matthias-school-explanation">
                  <summary>Por qué funciona</summary>
                  <p>{lesson.explanation}</p>
                </details>
                <div className="tutorial-nav matthias-school-nav">
                  <button className="secondary-btn" onClick={() => goTo(index - 1)} disabled={index === 0}>Anterior</button>
                  <span className="tutorial-progress">{index + 1} de {MATTHIAS_SCHOOL_LESSONS.length}</span>
                  {index < MATTHIAS_SCHOOL_LESSONS.length - 1 ? (
                    <button className="primary-btn" onClick={() => goTo(index + 1)} disabled={!lessonComplete}>Siguiente lección</button>
                  ) : (
                    <button className="primary-btn" onClick={onExit} disabled={!lessonComplete}>Ir a jugar</button>
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
