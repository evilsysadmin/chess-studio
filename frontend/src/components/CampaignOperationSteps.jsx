import React from 'react';

const STEPS = Object.freeze([
  { id: 'target', label: 'Elegir objetivo' },
  { id: 'briefing', label: 'Ver briefing' },
  { id: 'deployment', label: 'Preparar ejército' },
  { id: 'combat', label: 'Combatir' },
]);

export default function CampaignOperationSteps({ active = 'target' }) {
  const activeIndex = Math.max(0, STEPS.findIndex((step) => step.id === active));
  const current = STEPS[activeIndex] || STEPS[0];
  return (
    <div className="campaign-operation-progress" aria-label={`Paso ${activeIndex + 1} de ${STEPS.length}: ${current.label}`}>
      <div className="campaign-operation-progress-copy">
        <span>Paso {activeIndex + 1} de {STEPS.length}</span>
        <strong>{current.label}</strong>
      </div>
      <div className="campaign-operation-progress-dots" aria-hidden="true">
        {STEPS.map((step, index) => (
          <i key={step.id} className={index < activeIndex ? 'done' : index === activeIndex ? 'current' : ''} />
        ))}
      </div>
    </div>
  );
}
