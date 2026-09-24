import { useMemo, useState } from 'react';
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
import './InsightsMobilePolish.css';
import '../styles/04-career-dossier.css';

const DIAGNOSIS_VIEWS = [
  { id: 'now', label: 'Ahora', detail: 'Matthias te marca el foco' },
  { id: 'errors', label: 'Errores', detail: 'Patrones y errores recurrentes' },
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

  return (
    <div className={`insights-coach-workspace insights-workspace-section-${section} insights-workspace-view-${diagnosisView}`}>
      <header className="insights-workspace-header">
        <button className="back-link insights-workspace-back" type="button" onClick={props.onExit}>← Volver al menú</button>

        <div className="insights-workspace-title-row">
          <div>
            <span className="section-label">Mi juego</span>
            <h2>{isCareer ? 'Mi progreso' : 'Así juegas'}</h2>
          </div>
          <MechanicTutorialHelp tutorialId="insights" />
        </div>
        <p className="insights-workspace-lead">
          {isCareer
            ? 'Tu evolución e historial, separados del entrenamiento de hoy.'
            : 'Matthias revisa tus datos, te señala el problema que más merece atención y te manda a trabajar. El expediente completo puede esperar.'}
        </p>

        <div className="insights-workspace-primary-tabs" role="tablist" aria-label="Vistas de progreso del jugador">
          <button
            id="insights-section-diagnosis"
            type="button"
            role="tab"
            aria-selected={!isCareer}
            className={!isCareer ? 'active' : ''}
            onClick={() => setSection('diagnosis')}
          >
            Así juegas
          </button>
          <button
            id="insights-section-career"
            type="button"
            role="tab"
            aria-selected={isCareer}
            className={isCareer ? 'active' : ''}
            onClick={() => setSection('career')}
          >
            Mi progreso
          </button>
        </div>
      </header>

      {!isCareer && (
        <nav className="insights-workspace-nav" role="tablist" aria-label="Áreas de Así juegas">
          {DIAGNOSIS_VIEWS.map((view) => (
            <button
              key={view.id}
              id={`insights-view-${view.id}`}
              type="button"
              role="tab"
              aria-selected={diagnosisView === view.id}
              className={diagnosisView === view.id ? 'active' : ''}
              onClick={() => setDiagnosisView(view.id)}
            >
              <strong>{view.label}</strong>
              <small>{view.detail}</small>
            </button>
          ))}
        </nav>
      )}

      <div
        className="insights-workspace-panel"
        role="tabpanel"
        aria-labelledby={isCareer ? 'insights-section-career' : `insights-view-${diagnosisView}`}
      >
        {!isCareer && diagnosisView === 'now' ? (
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
        {!isCareer && diagnosisView === 'dossier' ? <InsightsCleanGames playerModel={playerModel} /> : null}
        {isCareer ? <CareerActivityCalendar history={props.gameHistory || []} /> : null}
        {isCareer || diagnosisView === 'now' ? (
          <InsightsDashboardContent
            key={section}
            {...props}
            initialSection={section}
            playerModel={playerModel}
            personalPuzzles={personalPuzzles}
            cleanGameRecords={cleanGameRecords}
          />
        ) : null}
      </div>

      {!isCareer && diagnosisView === 'now' ? <InsightsMatthiasMotion /> : null}
    </div>
  );
}
