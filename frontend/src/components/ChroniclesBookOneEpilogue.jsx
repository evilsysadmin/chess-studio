import { chroniclesBookOneEpilogue } from '../chroniclesOfMatthiasEpilogue.js';
import './ChroniclesBookOneEpilogue.css';

export default function ChroniclesBookOneEpilogue({ state, onRestart }) {
  const epilogue = chroniclesBookOneEpilogue(state);

  return (
    <div className="chronicles-epilogue" role="status" aria-label="Epílogo de Book I">
      <div className="chronicles-epilogue-leaf">
        <span className="chronicles-epilogue-kicker">BOOK I · CERRADO</span>
        <strong>{epilogue.title}</strong>
        <p className="chronicles-epilogue-lead">{epilogue.departure}</p>
        <div className="chronicles-epilogue-rule" aria-hidden="true">✦</div>
        <p>{epilogue.fallenLine}</p>
        <p>{epilogue.lanternLine}</p>
        <p>{epilogue.keyLine}</p>
        <blockquote>
          <span>Matthias</span>
          “{epilogue.verdict}”
        </blockquote>
        <button type="button" className="primary-btn" onClick={onRestart}>Reabrir Book I</button>
      </div>
    </div>
  );
}
