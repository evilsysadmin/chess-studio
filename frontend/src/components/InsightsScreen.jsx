import { useState } from 'react';
import MechanicTutorialHelp from './MechanicTutorialHelp.jsx';
import InsightsDashboardContent from './InsightsDashboardContent.jsx';
import InsightsRecurringErrors from './InsightsRecurringErrors.jsx';
import InsightsCleanGames from './InsightsCleanGames.jsx';
import InsightsWeeklyGoals from './InsightsWeeklyGoals.jsx';
import InsightsMatthiasMotion from './InsightsMatthiasMotion.jsx';
import './InsightsWorkspace.css';

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

export default function InsightsScreen(props) {
  const [section, setSection] = useState(() => normalizeInsightsSection(props.initialSection));
  const [diagnosisView, setDiagnosisView] = useState(() => normalizeInsightsDiagnosisView(props.initialDiagnosisView));
  const isCareer = section === 'career';

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
        {!isCareer && diagnosisView === 'now' ? <InsightsWeeklyGoals onOpenPuzzles={props.onOpenPuzzles} /> : null}
        {!isCareer && diagnosisView === 'errors' ? (
          <InsightsRecurringErrors onOpenPuzzles={props.onOpenPuzzles} />
        ) : null}
        {!isCareer && diagnosisView === 'dossier' ? <InsightsCleanGames /> : null}
        <InsightsDashboardContent key={section} {...props} initialSection={section} />
      </div>

      {!isCareer && diagnosisView === 'now' ? <InsightsMatthiasMotion /> : null}
    </div>
  );
}
