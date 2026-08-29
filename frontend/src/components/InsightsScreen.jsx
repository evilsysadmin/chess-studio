import { useState } from 'react';
import MechanicTutorialHelp from './MechanicTutorialHelp.jsx';
import InsightsDashboardContent from './InsightsDashboardContent.jsx';
import './InsightsWorkspace.css';

const DIAGNOSIS_VIEWS = [
  { id: 'now', label: 'Ahora', detail: 'Tu foco de hoy' },
  { id: 'matthias', label: 'Matthias', detail: 'Veredicto y consulta' },
  { id: 'errors', label: 'Errores', detail: 'Cagadas y prioridades' },
  { id: 'dossier', label: 'Expediente', detail: 'Datos y tendencias' },
];

export function normalizeInsightsSection(value) {
  return value === 'career' ? 'career' : 'diagnosis';
}

export default function InsightsScreen(props) {
  const [section, setSection] = useState(() => normalizeInsightsSection(props.initialSection));
  const [diagnosisView, setDiagnosisView] = useState('now');
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
            ? 'Tu evolución e historial, separados del ruido del entrenamiento de hoy.'
            : 'Primero, qué merece tu atención. El resto del expediente sólo cuando quieras abrirlo.'}
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
            <strong>Así juegas</strong>
            <small>Diagnóstico y acción</small>
          </button>
          <button
            id="insights-section-career"
            type="button"
            role="tab"
            aria-selected={isCareer}
            className={isCareer ? 'active' : ''}
            onClick={() => setSection('career')}
          >
            <strong>Mi progreso</strong>
            <small>Evolución e historial</small>
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
        <InsightsDashboardContent key={section} {...props} initialSection={section} />
      </div>
    </div>
  );
}
