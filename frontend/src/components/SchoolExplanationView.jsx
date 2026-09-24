export function SchoolExplanationActions({ explanation }) {
  if (!explanation?.open) return null;
  const { step, demo } = explanation;
  return (
    <>
      <button
        type="button"
        className="secondary-btn"
        disabled={step === 0}
        onClick={() => explanation.show(step - 1, { animateForward: false })}
      >
        ← Paso anterior
      </button>
      {step < demo.finalIndex ? (
        <button type="button" className="primary-btn" onClick={() => explanation.show(step + 1)}>
          Siguiente paso
        </button>
      ) : (
        <button
          type="button"
          className="primary-btn"
          onClick={() => explanation.show(0, { animateForward: false })}
        >
          Repetir explicación
        </button>
      )}
      <button type="button" className="secondary-btn" onClick={explanation.close}>
        Volver a practicar
      </button>
    </>
  );
}

export function SchoolExplanationStatus({ explanation, text }) {
  if (!explanation?.open) return null;
  return (
    <>
      <div
        className="matthias-school-sequence-status"
        aria-label={`Demostración ${explanation.step} de ${explanation.demo.finalIndex}`}
      >
        <span>Demostración</span>
        <b>{explanation.step}/{explanation.demo.finalIndex}</b>
        <em>{explanation.label}</em>
      </div>
      <div className="matthias-school-feedback is-explain" role="status" aria-live="polite">
        <b>Matthias · demostración</b>
        <p>{text}</p>
      </div>
    </>
  );
}
