import { Fragment, useMemo, useState } from 'react';
import { IconTrophy, IconBook } from './Icons.jsx';
import HomeCastle3D from './HomeCastle3D.jsx';
import hall from '../assets/home-canonical/great-hall-dungeon.webp';
import { loadRivalry } from '../rivalry.js';
import { dailyChallengeStats, loadDailyChallenge } from '../dailyChallenge.js';
import { buildHomeCastleLife } from '../homeCastleLife.js';
import { requestLabLaunch } from '../labLaunchIntent.js';
import './HomeIllustrated.css';
import './HomeIllustratedDiegetic.css';
import './HomeIllustratedDungeonCanonical.css';
import './HomeIllustratedMobileCanonical.css';
import './HomeCastleLife.css';
import './HomeCastle3D.css';
import './HomeIllustratedTallTouch.css';
import './HomePawnSlugEntity.css';

function IconSword(props) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m3 3 5 2 12 14-1 1L5 8 3 3Zm18 0-5 2L4 19l1 1L19 8l2-5ZM2 16l6 6m8-20 6 6M16 22l6-6M2 8l6-6" /></svg>;
}

function Flame() {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 1c1 6 7 7 7 14a8 8 0 0 1-16 0c0-4 2-7 5-10 0 4 1 5 2 6 2-3 3-6 2-10Zm-1 12c-1 3-3 4-3 6a3 3 0 0 0 6 0c0-2-2-3-3-6Z" /></svg>;
}

function memoryPresentation(memory, { onDaily, onHistory }) {
  if (memory?.destination === 'daily') return { Icon: Flame, onOpen: onDaily, destinationLabel: 'Desafío diario' };
  if (memory?.kind === 'trophy') return { Icon: IconTrophy, onOpen: onHistory, destinationLabel: 'Historia' };
  return { Icon: IconSword, onOpen: onHistory, destinationLabel: 'Historia' };
}

export default function HomeIllustrated({ hasSavedGame, loading, error, onPlay, onContinue, onTournament, onTrain, onCombat, onDaily, onHistory, onInsights, tools, matthiasModel, matthiasSpeaking, onMatthiasAction, onMatthiasDismiss }) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const [activeRoom, setActiveRoom] = useState(null);
  const castleLife = useMemo(() => buildHomeCastleLife({
    rivalry: loadRivalry(),
    dailyStats: dailyChallengeStats(loadDailyChallenge()),
  }), []);
  const memories = castleLife.memories || (castleLife.memory ? [castleLife.memory] : []);
  const experimentsAction = tools.find(([label]) => label === 'Experimentos geniales')?.[1];
  const openPawnSlug = () => {
    if (!experimentsAction) return;
    requestLabLaunch('pawnslug');
    experimentsAction();
  };
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
      <div
        className="illustrated-home__stage"
        data-home-castle-ambient={castleLife.ambient}
        data-home-castle-memory={memories.map((memory) => memory.kind).join(' ') || 'none'}
        data-home-castle-rare={castleLife.rareSighting || 'none'}
        data-home-castle-focus={activeRoom || 'none'}
        style={{ '--home-hall-art': `url("${hall}")` }}
      >
        <HomeCastle3D artUrl={hall} ambient={castleLife.ambient} activeRoom={activeRoom} />
        <img className="illustrated-home__art" src={hall} alt="" fetchPriority="high" draggable="false" style={{ zIndex: 0 }} />
        {castleLife.rareSighting && (
          <span className={`illustrated-home__rare-sighting is-${castleLife.rareSighting}`} aria-hidden="true" />
        )}
        {memories.map((memory, index) => {
          const { Icon: MemoryIcon, onOpen, destinationLabel } = memoryPresentation(memory, { onDaily, onHistory });
          return (
            <button
              key={memory.id}
              type="button"
              className={`illustrated-home__memory-object is-${memory.kind} is-slot-${index + 1}`}
              onClick={onOpen}
              aria-label={`${memory.title}. ${memory.detail} Abrir ${destinationLabel}.`}
            >
              <MemoryIcon aria-hidden="true" />
              <span className="illustrated-home__memory-label" aria-hidden="true">
                <strong>{memory.title}</strong>
                <span>{memory.detail}</span>
              </span>
            </button>
          );
        })}
        <header className="illustrated-home__brand">
          <h1>Chess Studio</h1>
          <p>JUEGA · APRENDE · COMPITE</p>
        </header>
        <nav aria-label="Destinos del gran salón">
          {rooms.map(([id, title, detail, Icon, action]) => (
            <Fragment key={id}>
              <button
                type="button"
                className={`illustrated-home__destination illustrated-home__destination--${id}`}
                onClick={action}
                onPointerEnter={() => setActiveRoom(id)}
                onPointerLeave={() => setActiveRoom(null)}
                onFocus={() => setActiveRoom(id)}
                onBlur={() => setActiveRoom(null)}
                disabled={loading}
              >
                <Icon aria-hidden="true" />
                <strong>{title}</strong><span>{detail}</span><i aria-hidden="true">›</i>
              </button>
              <span className={`illustrated-home__scene-fragment illustrated-home__scene-fragment--${id}`} aria-hidden="true" />
            </Fragment>
          ))}
        </nav>
        <button
          className="illustrated-home__pawn-slug"
          type="button"
          onClick={openPawnSlug}
          disabled={loading || !experimentsAction}
          aria-label="Abrir Pawn Slug directamente"
        >
          <strong>PAWN SLUG</strong>
          <small>Operación activa</small>
        </button>
        <aside className="illustrated-home__resident" aria-label="Rincón de Matthias">
        {matthiasSpeaking && <section className="illustrated-home__speech" aria-label="Mensaje de Matthias" aria-live="polite">
          <strong>{matthiasModel.eyebrow}</strong><p>{matthiasModel.text}</p>
          <button
            type="button"
            className={matthiasModel.action === 'insights' ? 'home-learning-card' : undefined}
            onClick={onMatthiasAction}
            aria-label={matthiasModel.action === 'insights' ? 'Abrir Así juegas con Matthias' : undefined}
          >{matthiasModel.actionLabel}</button>
          <button type="button" onClick={onMatthiasDismiss} aria-label="Cerrar comentario de Matthias">×</button>
        </section>}
        {(!matthiasSpeaking || matthiasModel.action !== 'insights') && <button className="illustrated-home__matthias" type="button" onClick={onInsights} aria-label="Abrir Así juegas con Matthias">
          <strong>MATTHIAS</strong><span>Comida táctica</span><em>“El progreso se construye jugada a jugada.”</em>
        </button>}
        </aside>
        <footer className="illustrated-home__motto"><span aria-hidden="true">─　♛　─</span><p>DISCIPLINA · ESTRATEGIA · UN MUNDO MEJOR</p></footer>
        <div className={`illustrated-home__utilities${toolsOpen ? ' is-open' : ''}`}>
          <button
            className="illustrated-home__dungeon-trigger"
            type="button"
            aria-label="Más modos y herramientas · Mazmorras"
            aria-expanded={toolsOpen}
            aria-controls="illustrated-home-tools"
            onClick={() => setToolsOpen(!toolsOpen)}
          >
            <span className="illustrated-home__dungeon-copy"><strong>MAZMORRAS</strong><small>Entra bajo tu cuenta y riesgo!</small></span>
            <span className="illustrated-home__dungeon-chevron" aria-hidden="true">{toolsOpen ? '↑' : '↓'}</span>
          </button>
          {toolsOpen && <nav id="illustrated-home-tools" className="illustrated-home__dungeon-panel" aria-label="Más modos y herramientas">
            <header><span>BAJO EL CASTILLO</span><strong>MAZMORRAS</strong><small>Entra bajo tu cuenta y riesgo!</small></header>
            {tools.map(([label, action]) => <button type="button" key={label} aria-label={label} onClick={() => { setToolsOpen(false); action(); }}>{label}</button>)}
          </nav>}
        </div>
      </div>
      {error && <div className="illustrated-home__error" role="alert">{error}</div>}
      {loading && <span className="illustrated-home__loading" role="status">Preparando tu partida…</span>}
    </section>
  );
}
