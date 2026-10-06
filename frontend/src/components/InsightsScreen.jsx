import { Suspense, lazy, useMemo, useState } from 'react';
import { useEscapeToClose } from '../useEscapeToClose.js';
import MechanicTutorialHelp from './MechanicTutorialHelp.jsx';
import InsightsDashboardContent from './InsightsDashboardContent.jsx';
import InsightsRecurringErrors from './InsightsRecurringErrors.jsx';
import InsightsCleanGames from './InsightsCleanGames.jsx';
import InsightsWeeklyGoals from './InsightsWeeklyGoals.jsx';
import InsightsGuidedSession from './InsightsGuidedSession.jsx';
import InsightsMatthiasCampaign from './InsightsMatthiasCampaign.jsx';
import InsightsMatthiasMotion from './InsightsMatthiasMotion.jsx';
import CareerActivityCalendar from './CareerActivityCalendar.jsx';
import { loadPersonalPuzzles } from '../personalPuzzles.js';
import { loadCleanGameRecords } from '../cleanGames.js';
import { loadRivalry } from '../rivalry.js';
import { buildPlayerModel } from '../playerModel.js';
import './InsightsWorkspace.css';
import './InsightsTrainingRoom.css';
import './InsightsMobilePolish.css';
import '../styles/04-career-dossier.css';

const InsightsTrainingRoomScene3D = lazy(() => import('./InsightsTrainingRoomScene3D.jsx'));

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

export function InsightsOptionalPlans({ children }) {
  return (
    <details className="friendly-disclosure insights-optional-plans">
      <summary>Más planes personales</summary>
      <div className="friendly-disclosure-body friendly-stack">
        {children}
      </div>
    </details>
  );
}

export default function InsightsScreen(props) {
  useEscapeToClose(props.onExit);
  const [section, setSection] = useState(() => normalizeInsightsSection(props.initialSection));
  const [diagnosisView, setDiagnosisView] = useState(() => normalizeInsightsDiagnosisView(props.initialDiagnosisView));
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

  function openTask() {
    setSection('diagnosis');
    setDiagnosisView('now');
  }

  function openDiagnosis(view) {
    setSection('diagnosis');
    setDiagnosisView(view);
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
            onClick={() => openDiagnosis('errors')}
          >
            Errores
          </button>
          <button
            id="insights-view-dossier"
            type="button"
            className="insights-room-tool"
            aria-pressed={!isCareer && diagnosisView === 'dossier'}
            onClick={() => openDiagnosis('dossier')}
          >
            Expediente
          </button>
          <button
            id="insights-section-career"
            type="button"
            className="insights-room-tool"
            aria-pressed={isCareer}
            onClick={() => setSection('career')}
          >
            Mi progreso
          </button>
        </div>
      </header>

      <div className="insights-workspace-panel" role="region" aria-label={panelLabel}>
        {isTask ? (
          <>
            <InsightsGuidedSession
              gameHistory={props.gameHistory}
              onOpenPuzzles={props.onOpenPuzzles}
              onPlayFromHere={props.onPlayFromHere}
              playerModel={playerModel}
              personalPuzzles={personalPuzzles}
              cleanGameRecords={cleanGameRecords}
            />
            <InsightsOptionalPlans>
              <InsightsMatthiasCampaign
                gameHistory={props.gameHistory}
                onOpenPuzzles={props.onOpenPuzzles}
                onPlayFromHere={props.onPlayFromHere}
              />
              <InsightsWeeklyGoals
                onOpenPuzzles={props.onOpenPuzzles}
                playerModel={playerModel}
                personalPuzzles={personalPuzzles}
                cleanGameRecords={cleanGameRecords}
              />
            </InsightsOptionalPlans>
          </>
        ) : null}

        {!isCareer && diagnosisView === 'errors' ? (
          <InsightsRecurringErrors onOpenPuzzles={props.onOpenPuzzles} playerModel={playerModel} />
        ) : null}

        {!isCareer && diagnosisView === 'dossier' ? (
          <>
            <InsightsCleanGames playerModel={playerModel} />
            <InsightsDashboardContent
              key="dossier"
              {...props}
              initialSection="diagnosis"
              playerModel={playerModel}
              personalPuzzles={personalPuzzles}
              cleanGameRecords={cleanGameRecords}
            />
          </>
        ) : null}

        {isCareer ? (
          <>
            <CareerActivityCalendar history={props.gameHistory || []} />
            <InsightsDashboardContent
              key="career"
              {...props}
              initialSection="career"
              playerModel={playerModel}
              personalPuzzles={personalPuzzles}
              cleanGameRecords={cleanGameRecords}
            />
          </>
        ) : null}
      </div>

      {isTask ? <InsightsMatthiasMotion /> : null}
    </div>
  );
}
