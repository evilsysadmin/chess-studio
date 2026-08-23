import React from 'react';

const STEPS = Object.freeze([
  { id: 'target', label: 'Objetivo', short: '1' },
  { id: 'briefing', label: 'Briefing', short: '2' },
  { id: 'deployment', label: 'Despliegue', short: '3' },
  { id: 'combat', label: 'Combate', short: '4' },
]);

export default function CampaignOperationSteps({ active = 'target' }) {
  const activeIndex = Math.max(0, STEPS.findIndex((step) => step.id === active));
  return (
    <nav className="campaign-operation-steps" aria-label="Fases de la operación">
      {STEPS.map((step, index) => {
        const state = index < activeIndex ? 'done' : index === activeIndex ? 'current' : 'pending';
        return (
          <div className={`campaign-operation-step ${state}`} key={step.id} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="campaign-operation-step-index">{state === 'done' ? '✓' : step.short}</span>
            <span>{step.label}</span>
          </div>
        );
      })}
    </nav>
  );
}
