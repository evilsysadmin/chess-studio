import { Suspense, lazy, useMemo, useState, useTransition } from 'react';
import { useEscapeToClose } from '../useEscapeToClose.js';
import MechanicTutorialHelp from './MechanicTutorialHelp.jsx';
import InsightsGuidedSession from './InsightsGuidedSession.jsx';
import InsightsMatthiasMotion from './InsightsMatthiasMotion.jsx';
import { loadPersonalPuzzles } from '../personalPuzzles.js';
import { loadCleanGameRecords } from '../cleanGames.js';
import { loadRivalry } from '../rivalry.js';
import { buildPlayerModel } from '../playerModel.js';
import './InsightsWorkspace.css';
import './InsightsTrainingRoom.css';
import './InsightsMobilePolish.css';

const InsightsTrainingRoomScene3D = lazy(() => import('./InsightsTrainingRoomScene3D.jsx'));

let errorsPanelPromise;
let dossierPanelPromise;
let careerPanelPromise;
let optionalPlansPromise;

function loadInsightsErrorsPanel() {
  errorsPanelPromise ||= import('./InsightsErrorsPanel.jsx');
  return errorsPanelPromise;
}

function loadInsightsDossierPanel() {
  dossierPanelPromise ||= import('./InsightsDossierPanel.jsx');
  return dossierPanelPromise;
}

function loadInsightsCareerPanel() {
  careerPanelPromise ||= import('./InsightsCareerPanel.jsx');
  return careerPanelPromise;
}

function loadInsightsOptionalPlansContent() {
  optionalPlansPromise ||= import('./InsightsOptionalPlansContent.jsx');
  return optionalPlansPromise;
}

const InsightsErrorsPanel = lazy(loadInsightsErrorsPanel);
const InsightsDossierPanel = lazy(loadInsightsDossierPanel);
const InsightsCareerPanel = lazy(loadInsightsCareerPanel);
const InsightsOptionalPlansContent = lazy(loadInsightsOptionalPlansContent);

const DIAGNOSIS_VIEWS = [
  { id: 'now', label: 'Ahora', detail: 'Qué entrenar hoy' },
  { id: 'errors', label: 'Errores', detail: 'Qué errores repites' },
  { id: 'dossier', label: 'Expediente', detail: 'Datos y tendencias' },
];

export function normalizeInsightsSection(value) {
  return value === 'career' ? 'career' : 'diagnosis';
}

export function normalizeInsightsDiagnosisView(value) {
  return DIAGNOSIS_VIEWS.some((view) => view.id === value) ? value : 'now';
}

export function InsightsOptionalPlans({ children, onIntent, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const warm = () => onIntent?.();

  return (
    <details
      className="friendly-disclosure insights-optional-plans"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary onPointerEnter={warm} onFocus={warm} onPointerDown={warm}>Más planes personales</summary>
      {open ? (
        <div className="friendly-disclosure-body friendly-stack">
          <Suspense fallback={null}>{children}</Suspense>
        </div>
      ) : null}
    </details>
  );
}

export default function InsightsScreen(props) {
  useEscapeToClose(props.onExit);
  const [section, setSection] = useState(() => normalizeInsightsSection(props.initialSection));
  const [diagnosisView, setDiagnosisView] = useState(() => normalizeInsightsDiagnosisView(props.initialDiagnosisView));
  const [secondaryPending, startSecondaryTransition] = useTransition();
  const isCareer = section === 'career';
  const gameHistoryLength = Array.isArray(props.gameHistory) ? props.gameHistory.length : 0;
  const personalPuzzles = useMemo(() => loadPersonalPuzzles(), [gameHistoryLength]);
  const cleanGameRecords = useMemo(() => loadCleanGameRecords(), [gameHistoryLength]);
  const rivalry = useMemo(() => loadRivalry(), []);
  const playerModel = useMemo(() => buildPlayerModel({
    insights: props.insights,
    personalPuzzles,
    cleanGameRecords,
    timeControlStats: rivalry?.record?.byTimeControl,
  }), [props.insights, personalPuzzles, cleanGameRecords, rivalry]);

  const isTask = !isCareer && diagnosisView === 'now';
  const panelLabel = isCareer
    ? 'Mi progreso'
    : diagnosisView === 'errors'
      ? 'Errores recurrentes'
      : diagnosisView === 'dossier'
        ? 'Expediente'
        : 'Tarea de Matthias';

  function preloadDiagnosis(view) {
    if (view === 'errors') void loadInsightsErrorsPanel();
    if (view === 'dossier') void loadInsightsDossierPanel();
  }

  function preloadCareer() {
    void loadInsightsCareerPanel();
  }

  function preloadOptionalPlans() {
    void loadInsightsOptionalPlansContent();
  }

  function openTask() {
    startSecondaryTransition(() => {
      setSection('diagnosis');
      setDiagnosisView('now');
    });
  }

  function openDiagnosis(view) {
    preloadDiagnosis(view);
    startSecondaryTransition(() => {
      setSection('diagnosis');
      setDiagnosisView(view);
    });
  }

  function openCareer() {
    preloadCareer();
    startSecondaryTransition(() => setSection('career'));
  }

  function openTrainingPuzzles(source = 'curated', rush = false, filter = null, dailySlot = 'tactic') {
    props.onOpenPuzzles?.(source, rush, filter, dailySlot, 'insights-action');
  }

  return (
    <div
      className={`insights-coach-workspace insights-training-room insights-workspace-section-${section} insights-workspace-view-${diagnosisView}`}
      data-insights-room="training-room-v1"
    >
      <div className="insights-training-room-stage" aria-hidden="true">
        <Suspense fallback={null}>
          <InsightsTrainingRoomScene3D />
        </Suspense>
        <div className="insights-training-room-fallback" />
      </div>

      <header className="insights-workspace-header">
        <button className="back-link insights-workspace-back" type="button" onClick={props.onExit}>← Volver al menú</button>

        <div className="insights-workspace-title-row">
          <div>
            <span className="section-label">{isTask ? 'Matthias · mesa de trabajo' : 'Training Room · archivo'}</span>
            <h2>{isCareer ? 'Mi progreso' : diagnosisView === 'errors' ? 'Errores' : diagnosisView === 'dossier' ? 'Expediente' : 'Así juegas'}</h2>
          </div>
          <MechanicTutorialHelp tutorialId="insights" />
        </div>

        <p className="insights-workspace-lead">
          {isTask
            ? 'Matthias ha revisado tus datos y ha dejado una tarea concreta sobre la mesa. Empieza por ella; el resto del expediente puede esperar.'
            : isCareer
              ? 'Tu evolución e historial viven en la misma sala, pero fuera del camino de entrenamiento de hoy.'
              : diagnosisView === 'errors'
                ? 'Aquí sólo aparecen patrones demostrados por partidas y posiciones reales.'
                : 'El informe completo queda archivado aquí para consultarlo cuando necesites contexto, no para bloquear la tarea del día.'}
        </p>

        <div className="insights-room-tools" role="group" aria-label="Material de la Training Room">
          {!isTask ? (
            <button id="insights-view-now" type="button" className="insights-room-tool insights-room-tool-return" onClick={openTask}>
              ← Tarea de Matthias
            </button>
          ) : null}
          <button
            id="insights-view-errors"
            type="button"
            className="insights-room-tool"
            aria-pressed={!isCareer && diagnosisView === 'errors'}
            onPointerEnter={() => preloadDiagnosis('errors')}
            onFocus={() => preloadDiagnosis('errors')}
            onPointerDown={() => preloadDiagnosis('errors')}
            onClick={() => openDiagnosis('errors')}
          >
            Errores
          </button>
          <button
            id="insights-view-dossier"
            type="button"
            className="insights-room-tool"
            aria-pressed={!isCareer && diagnosisView === 'dossier'}
            onPointerEnter={() => preloadDiagnosis('dossier')}
            onFocus={() => preloadDiagnosis('dossier')}
            onPointerDown={() => preloadDiagnosis('dossier')}
            onClick={() => openDiagnosis('dossier')}
          >
            Expediente
          </button>
          <button
            id="insights-section-career"
            type="button"
            className="insights-room-tool"
            aria-pressed={isCareer}
            onPointerEnter={preloadCareer}
            onFocus={preloadCareer}
            onPointerDown={preloadCareer}
            onClick={openCareer}
          >
            Mi progreso
          </button>
        </div>
      </header>

      <div
        className="insights-workspace-panel"
        role="region"
        aria-label={panelLabel}
        aria-busy={secondaryPending || undefined}
      >
        <Suspense fallback={null}>
        {isTask ? (
          <>
            <InsightsGuidedSession
              gameHistory={props.gameHistory}
              onOpenPuzzles={openTrainingPuzzles}
              onPlayFromHere={props.onPlayFromHere}
              playerModel={playerModel}
              personalPuzzles={personalPuzzles}
              cleanGameRecords={cleanGameRecords}
            />
            <InsightsOptionalPlans onIntent={preloadOptionalPlans}>
              <InsightsOptionalPlansContent
                gameHistory={props.gameHistory}
                onOpenPuzzles={openTrainingPuzzles}
                onPlayFromHere={props.onPlayFromHere}
                playerModel={playerModel}
                personalPuzzles={personalPuzzles}
                cleanGameRecords={cleanGameRecords}
              />
            </InsightsOptionalPlans>
          </>
        ) : null}

        {!isCareer && diagnosisView === 'errors' ? (
          <InsightsErrorsPanel onOpenPuzzles={openTrainingPuzzles} playerModel={playerModel} />
        ) : null}

        {!isCareer && diagnosisView === 'dossier' ? (
          <InsightsDossierPanel
            screenProps={props}
            playerModel={playerModel}
            personalPuzzles={personalPuzzles}
            cleanGameRecords={cleanGameRecords}
          />
        ) : null}

        {isCareer ? (
          <InsightsCareerPanel screenProps={props} />
        ) : null}
        </Suspense>
      </div>

      {!isCareer && diagnosisView === 'dossier' ? <InsightsMatthiasMotion /> : null}
    </div>
  );
}
