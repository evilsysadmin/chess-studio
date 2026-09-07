import { useState } from 'react';
import { IconTrophy, IconBook } from './Icons.jsx';
import hall from '../assets/home-canonical/great-hall.png';
import './HomeIllustrated.css';

function IconSword(props) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m3 3 5 2 12 14-1 1L5 8 3 3Zm18 0-5 2L4 19l1 1L19 8l2-5ZM2 16l6 6m8-20 6 6M16 22l6-6M2 8l6-6" /></svg>;
}

function Flame() {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 1c1 6 7 7 7 14a8 8 0 0 1-16 0c0-4 2-7 5-10 0 4 1 5 2 6 2-3 3-6 2-10Zm-1 12c-1 3-3 4-3 6a3 3 0 0 0 6 0c0-2-2-3-3-6Z" /></svg>;
}

export default function HomeIllustrated({ hasSavedGame, loading, error, onPlay, onContinue, onTournament, onTrain, onCombat, onDaily, onHistory, onInsights, tools, matthiasModel, matthiasSpeaking, onMatthiasAction, onMatthiasDismiss }) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const rooms = [
    ['tournament', 'TORNEOS', 'Compite y escala', IconTrophy, onTournament],
    ['train', 'ENTRENAR', 'Mejora tu juego', IconBook, onTrain],
    ['combat', 'COMBAT CHESS', 'Recluta tu ejército', IconSword, onCombat],
    ['daily', 'DESAFÍO DIARIO', 'Un nuevo reto cada día', Flame, onDaily],
    ['history', 'HISTORIA', 'Descubre el legado', IconBook, onHistory],
    ['play', hasSavedGame ? 'CONTINUAR' : 'JUGAR', hasSavedGame ? 'Vuelve a tu partida' : 'Partida rápida o privada', IconSword, hasSavedGame ? onContinue : onPlay],
  ];
  return (
    <section className="illustrated-home" aria-label="Modos principales">
      <div className="illustrated-home__stage">
        <img className="illustrated-home__art" src={hall} alt="" fetchPriority="high" draggable="false" />
        <header className="illustrated-home__brand">
          <p>TU VIAJE AJEDRECÍSTICO COMIENZA AQUÍ</p>
          <h1>Chess Studio</h1>
          <p>JUEGA · APRENDE · COMPITE</p>
        </header>
        <nav aria-label="Destinos del gran salón">
          {rooms.map(([id, title, detail, Icon, action]) => (
            <button type="button" key={id} className={`illustrated-home__destination illustrated-home__destination--${id}`} onClick={action} disabled={loading}>
              <Icon aria-hidden="true" />
              <strong>{title}</strong><span>{detail}</span><i aria-hidden="true">›</i>
            </button>
          ))}
        </nav>
        <aside className="illustrated-home__resident" aria-label="Rincón de Matthias">
        {matthiasSpeaking && <section className="illustrated-home__speech" aria-label="Mensaje de Matthias" aria-live="polite">
          <strong>{matthiasModel.eyebrow}</strong><p>{matthiasModel.text}</p>
          <button type="button" onClick={onMatthiasAction}>{matthiasModel.actionLabel}</button>
          <button type="button" onClick={onMatthiasDismiss} aria-label="Cerrar comentario de Matthias">×</button>
        </section>}
        <button className="illustrated-home__matthias" type="button" onClick={onInsights} aria-label="Abrir Así juegas con Matthias">
          <strong>MATTHIAS</strong><span>Comida táctica</span><em>“El progreso se construye jugada a jugada.”</em>
        </button>
        </aside>
        <div className="illustrated-home__community"><span>UNA<br />COMUNIDAD<br />MÁS FUERTE</span><span aria-hidden="true">♟♟</span></div>
        <footer className="illustrated-home__motto"><span aria-hidden="true">─　♛　─</span><p>DISCIPLINA · ESTRATEGIA · UN MUNDO MEJOR</p></footer>
      </div>
      <div className="illustrated-home__utilities">
        <button type="button" aria-expanded={toolsOpen} aria-controls="illustrated-home-tools" onClick={() => setToolsOpen(!toolsOpen)}>Más modos y herramientas {toolsOpen ? '−' : '+'}</button>
        {toolsOpen && <nav id="illustrated-home-tools" aria-label="Más modos y herramientas">{tools.map(([label, action]) => <button type="button" key={label} onClick={() => { setToolsOpen(false); action(); }}>{label}</button>)}</nav>}
      </div>
      {error && <div className="illustrated-home__error" role="alert">{error}</div>}
      {loading && <span className="illustrated-home__loading" role="status">Preparando tu partida…</span>}
    </section>
  );
}
