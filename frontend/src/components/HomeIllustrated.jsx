import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { IconTrophy, IconBook } from './Icons.jsx';
import HomeScene3D from './HomeScene3D.jsx';
import HomeMatthias3D from './HomeMatthias3D.jsx';
import hall from '../assets/home-canonical/great-hall-dungeon.webp';
import { loadRivalry } from '../rivalry.js';
import { dailyChallengeStats, loadDailyChallenge } from '../dailyChallenge.js';
import { buildHomeCastleLife } from '../homeCastleLife.js';
import { requestLabLaunch } from '../labLaunchIntent.js';
import { msUntilNextLocalHour } from '../matthiasRoutineClock.js';
import { matthiasAmbientVisual, matthiasAmbientVisuals, matthiasHomeZone, matthiasRoutineDwellMs } from '../matthiasVisuals.js';
import { reducedMotionStatus, USER_PREFERENCES_CHANGED_EVENT } from '../userPreferences.js';
import './HomeIllustrated.css';
import './HomeIllustratedDiegetic.css';
import './HomeDiegeticObjects.css';
import './HomeIllustratedDungeonCanonical.css';
import './HomeIllustratedMobileCanonical.css';
import './HomeCastleLife.css';
import './HomeCastle3D.css';
import './HomeIllustratedTallTouch.css';
import './HomeMatthiasRoutine.css';
import './HomeDestinationPlaques.css';

const PRIMARY_DIEGETIC_DESTINATIONS = new Set(['tournament', 'combat', 'play']);

function IconSword(props) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m3 3 5 2 12 14-1 1L5 8 3 3Zm18 0-5 2L4 19l1 1L19 8l2-5ZM2 16l6 6m8-20 6 6M16 22l6-6M2 8l6-6" /></svg>;
}

function IconStairs(props) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M4 20h4v-4h4v-4h4V8h4" /><path d="M4 20h16" /></svg>;
}

function IconScroll(props) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M7 4h11a2 2 0 0 1 2 2v1H9V6a2 2 0 0 0-2-2Zm0 0a2 2 0 0 0-2 2v11a3 3 0 0 0 3 3h9a2 2 0 0 0 2-2v-1" /><path d="M9 11h7M9 15h5" /></svg>;
}

// Positions differ by a few hundredths of a percent between resizes; ignore that noise so
// the beacons do not re-render on every frame of a window drag.
function sameAnchorLayout(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const ids = Object.keys(a);
  if (ids.length !== Object.keys(b).length) return false;
  return ids.every((id) => b[id] && Math.abs(a[id].x - b[id].x) < 0.0005 && Math.abs(a[id].y - b[id].y) < 0.0005);
}

function Flame() {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 1c1 6 7 7 7 14a8 8 0 0 1-16 0c0-4 2-7 5-10 0 4 1 5 2 6 2-3 3-6 2-10Zm-1 12c-1 3-3 4-3 6a3 3 0 0 0 6 0c0-2-2-3-3-6Z" /></svg>;
}

function memoryPresentation(memory, { onDaily, onHistory }) {
  if (memory?.destination === 'daily') return { Icon: Flame, onOpen: onDaily, destinationLabel: 'Desafío diario' };
  if (memory?.kind === 'trophy') return { Icon: IconTrophy, onOpen: onHistory, destinationLabel: 'Historia' };
  return { Icon: IconSword, onOpen: onHistory, destinationLabel: 'Historia' };
}

function currentReducedMotion() {
  return reducedMotionStatus().effective;
}

export default function HomeIllustrated({ hasSavedGame, loading, error, onPlay, onContinue, onPractice, pendingModes = [], pvpSlot, onTournament, onTrain, onCombat, onDaily, onHistory, onInsights, tools, matthiasModel, matthiasSpeaking, onMatthiasAction, onMatthiasDismiss }) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [playMenuOpen, setPlayMenuOpen] = useState(false);
  // Screen positions (0..1 of the stage) of each destination's 3D object, projected by the
  // scene's own camera. null until the Blender scene reports them (and again if it falls
  // back to the legacy hall), in which case the static label layout is used.
  const [anchors, setAnchors] = useState(null);
  const handleAnchorLayout = useCallback((next) => {
    setAnchors((current) => (sameAnchorLayout(current, next) ? current : next));
  }, []);
  const [activeRoom, setActiveRoom] = useState(null);
  const [matthiasRoutineIndex, setMatthiasRoutineIndex] = useState(0);
  const [matthiasRoutineClock, setMatthiasRoutineClock] = useState(() => new Date());
  const [reducedMotion, setReducedMotion] = useState(currentReducedMotion);
  const castleLife = useMemo(() => buildHomeCastleLife({
    rivalry: loadRivalry(),
    dailyStats: dailyChallengeStats(loadDailyChallenge()),
    now: matthiasRoutineClock,
  }), [matthiasRoutineClock]);
  const baseMatthiasRoutine = useMemo(() => matthiasAmbientVisuals(
    matthiasRoutineClock.getHours(),
    matthiasRoutineClock,
  ), [matthiasRoutineClock]);
  const matthiasRoutine = useMemo(() => {
    const moment = castleLife.matthiasMoment;
    if (!moment) return baseMatthiasRoutine;
    const sourceScene = matthiasAmbientVisual(moment.visualKey);
    if (!sourceScene?.avatar) return baseMatthiasRoutine;
    const rareScene = {
      ...sourceScene,
      key: `moment-${moment.id}`,
      label: moment.label,
      detail: moment.detail,
      momentId: moment.id,
      zone: moment.zone,
    };
    return [rareScene, ...baseMatthiasRoutine.filter((scene) => scene.avatar !== sourceScene.avatar)];
  }, [baseMatthiasRoutine, castleLife.matthiasMoment]);
  const matthiasVisual = matthiasRoutine[matthiasRoutineIndex % Math.max(1, matthiasRoutine.length)] || matthiasRoutine[0];
  const matthiasSceneKey = matthiasVisual?.key || 'base';
  const matthiasDwellMs = matthiasRoutineDwellMs(matthiasVisual);
  const memories = castleLife.memories || (castleLife.memory ? [castleLife.memory] : []);
  const experimentsAction = tools.find(([label]) => label === 'Experimentos geniales')?.[1];
  const openPawnSlug = () => {
    if (!experimentsAction) return;
    requestLabLaunch('pawnslug');
    experimentsAction();
  };

  const activateSceneDestination = (destination) => {
    if (loading) return;
    if (destination === 'tournament') onTournament();
    else if (destination === 'combat') onCombat();
    else if (destination === 'play') (hasSavedGame ? onContinue : onPlay)();
  };

  // The "Más formas de jugar" menu closes on Escape and on any press outside it.
  useEffect(() => {
    if (!playMenuOpen) return undefined;
    const onKeyDown = (event) => { if (event.key === 'Escape') setPlayMenuOpen(false); };
    const onPointerDown = (event) => {
      if (!event.target?.closest?.('.illustrated-home__play-more-wrap')) setPlayMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [playMenuOpen]);

  useEffect(() => {
    const refresh = () => setReducedMotion(currentReducedMotion());
    window.addEventListener(USER_PREFERENCES_CHANGED_EVENT, refresh);
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    media?.addEventListener?.('change', refresh);
    return () => {
      window.removeEventListener(USER_PREFERENCES_CHANGED_EVENT, refresh);
      media?.removeEventListener?.('change', refresh);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer = null;
    const scheduleNextHour = () => {
      timer = window.setTimeout(() => {
        if (cancelled) return;
        setMatthiasRoutineClock(new Date());
        setMatthiasRoutineIndex(0);
        scheduleNextHour();
      }, msUntilNextLocalHour(new Date()));
    };
    scheduleNextHour();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (reducedMotion || matthiasSpeaking || matthiasRoutine.length < 2) return undefined;
    let cancelled = false;
    let timer = null;
    const scheduleAttempt = () => {
      timer = window.setTimeout(() => {
        if (cancelled) return;
        if (document.hidden) {
          scheduleAttempt();
          return;
        }
        setMatthiasRoutineIndex((current) => (current + 1) % matthiasRoutine.length);
      }, matthiasDwellMs);
    };
    scheduleAttempt();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [matthiasDwellMs, matthiasRoutine.length, matthiasSceneKey, matthiasSpeaking, reducedMotion]);

  const rooms = [
    ['tournament', 'TORNEOS', 'Compite y escala', IconTrophy, onTournament],
    ['train', 'ENTRENAR', 'Mejora tu juego', IconBook, onTrain],
    ['combat', 'COMBAT CHESS', 'Recluta tu ejército', IconSword, onCombat],
    ['daily', 'DESAFÍO DIARIO', 'Un nuevo reto cada día', Flame, onDaily],
    ['history', 'HISTORIA', 'Descubre el legado', IconScroll, onHistory],
    ['play', hasSavedGame ? 'CONTINUAR' : 'JUGAR', hasSavedGame ? 'Vuelve a tu partida' : 'Partida rápida o privada', IconSword, hasSavedGame ? onContinue : onPlay],
  ];
  const beacons = anchors
    ? [
      ...rooms.filter(([id]) => id !== 'play').map(([id, title, detail, Icon, action]) => ({ id, title, detail, Icon, action })),
      { id: 'dungeon', title: 'MAZMORRAS', detail: 'Modos y herramientas', Icon: IconStairs, action: () => setToolsOpen((open) => !open) },
    ].filter((beacon) => anchors[beacon.id])
    : [];
  const matthiasActivity = matthiasVisual?.label || 'En observación';
  const matthiasZone = matthiasVisual?.zone || matthiasHomeZone(matthiasVisual?.key);
  const matthiasActionDuplicated = matthiasSpeaking && matthiasModel?.action === 'insights';
  return (
    <section className="illustrated-home" aria-label="Modos principales">
      <div
        className="illustrated-home__stage"
        data-home-castle-ambient={castleLife.ambient}
        data-home-castle-memory={memories.map((memory) => memory.kind).join(' ') || 'none'}
        data-home-castle-rare={castleLife.rareSighting || 'none'}
        data-home-castle-focus={activeRoom || 'none'}
        data-home-beacons={anchors ? 'projected' : 'static'}
        style={{ '--home-hall-art': `url("${hall}")` }}
      >
        <HomeScene3D
          artUrl={hall}
          ambient={castleLife.ambient}
          activeRoom={activeRoom}
          onDestinationHover={setActiveRoom}
          onDestinationActivate={activateSceneDestination}
          onAnchorLayout={handleAnchorLayout}
        />
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
        <nav aria-label="Destinos del gran salón">
          {rooms.map(([id, title, detail, Icon, action]) => (
            <Fragment key={id}>
              <button
                type="button"
                className={`illustrated-home__destination illustrated-home__destination--${id}${PRIMARY_DIEGETIC_DESTINATIONS.has(id) ? ' is-diegetic-object' : ''}${activeRoom === id ? ' is-active' : ''}`}
                data-home-diegetic-object={PRIMARY_DIEGETIC_DESTINATIONS.has(id) ? id : undefined}
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
        {/* Beacons sit on the projected position of each 3D object. They repeat the
            destination buttons for the mouse only (those stay the accessible controls). */}
        {beacons.map(({ id, title, detail, Icon, action }) => (
          <button
            key={id}
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className={`illustrated-home__beacon illustrated-home__beacon--${id}${activeRoom === id ? ' is-active' : ''}`}
            style={{ left: `${anchors[id].x * 100}%`, top: `${anchors[id].y * 100}%` }}
            onClick={action}
            onPointerEnter={() => setActiveRoom(id)}
            onPointerLeave={() => setActiveRoom(null)}
            disabled={loading}
          >
            <Icon aria-hidden="true" />
            <span className="illustrated-home__beacon-label"><strong>{title}</strong><small>{detail}</small></span>
          </button>
        ))}
        {/* JUGAR is one tap for the common case (quick game, or CONTINUAR with a saved
            game); every other way to start a game lives one click away in this menu. */}
        <div className={`illustrated-home__play-more-wrap${playMenuOpen ? ' is-open' : ''}`}>
          <button
            type="button"
            className="illustrated-home__play-more"
            aria-expanded={playMenuOpen}
            aria-controls="illustrated-home-play-menu"
            onClick={() => setPlayMenuOpen((open) => !open)}
            disabled={loading}
          >
            <span>Más formas de jugar</span>
            {pendingModes.length > 0 && <b className="illustrated-home__play-more-dot" aria-hidden="true" />}
            <i aria-hidden="true">{playMenuOpen ? '▴' : '▾'}</i>
          </button>
          {playMenuOpen && (
            <div
              id="illustrated-home-play-menu"
              className="illustrated-home__play-menu"
              role="group"
              aria-label="Más formas de jugar"
              onClick={(event) => { if (event.target?.closest?.('button')) setPlayMenuOpen(false); }}
            >
              {pendingModes.length > 0 && (
                <div className="illustrated-home__play-pending" role="group" aria-label="A medias">
                  <span className="illustrated-home__play-pending-label">A MEDIAS</span>
                  {pendingModes.map((item) => (
                    <button key={item.key} type="button" className="illustrated-home__play-menu-item is-pending" onClick={item.action} disabled={loading}>
                      <IconSword aria-hidden="true" />
                      <span><strong>Continuar · {item.title}</strong><small>{item.detail}</small></span>
                    </button>
                  ))}
                </div>
              )}
              {hasSavedGame && (
                <button type="button" className="illustrated-home__play-menu-item" onClick={onPlay} disabled={loading}>
                  <IconSword aria-hidden="true" />
                  <span><strong>Nueva partida rápida</strong><small>Empieza otra sin perder la guardada</small></span>
                </button>
              )}
              {pvpSlot}
              <button type="button" className="illustrated-home__play-menu-item" onClick={onPractice} disabled={loading}>
                <IconBook aria-hidden="true" />
                <span><strong>Partida de práctica</strong><small>Entrena sin jugarte el rating</small></span>
              </button>
            </div>
          )}
        </div>
        {/* Collapsed by default so it never competes with the scene; the chips are
            the same actions as the destination buttons, JUGAR/CONTINUAR first. Hovering
            or focusing a chip highlights the matching prop in the room. */}
        <div className={`illustrated-home__quickbar${quickOpen ? ' is-open' : ''}`}>
          <button
            type="button"
            className="illustrated-home__quickbar-toggle"
            aria-expanded={quickOpen}
            aria-controls="illustrated-home-quickbar"
            onClick={() => setQuickOpen((open) => !open)}
            onKeyDown={(event) => { if (event.key === 'Escape') setQuickOpen(false); }}
          >
            <span>Accesos rápidos</span>
            <i aria-hidden="true">{quickOpen ? '▴' : '▾'}</i>
          </button>
          {quickOpen && (
            <nav
              id="illustrated-home-quickbar"
              className="illustrated-home__quickbar-list"
              aria-label="Accesos rápidos"
              onKeyDown={(event) => { if (event.key === 'Escape') setQuickOpen(false); }}
            >
              {[rooms[5], rooms[0], rooms[1], rooms[2], rooms[3], rooms[4]].map(([id, title, , Icon, action]) => (
                <button
                  key={id}
                  type="button"
                  className={`illustrated-home__quickbar-chip illustrated-home__quickbar-chip--${id}${activeRoom === id ? ' is-active' : ''}`}
                  onClick={() => { setQuickOpen(false); action(); }}
                  onPointerEnter={() => setActiveRoom(id)}
                  onPointerLeave={() => setActiveRoom(null)}
                  onFocus={() => setActiveRoom(id)}
                  onBlur={() => setActiveRoom(null)}
                  disabled={loading}
                >
                  <Icon aria-hidden="true" />
                  <span>{title}</span>
                </button>
              ))}
            </nav>
          )}
        </div>
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
        <button
          className={`illustrated-home__matthias${matthiasSpeaking ? ' is-speaking' : ''}`}
          type="button"
          onClick={onInsights}
          aria-label={matthiasActionDuplicated ? `Matthias · ${matthiasActivity}` : 'Abrir Así juegas con Matthias'}
          title={`Matthias · ${matthiasActivity}`}
          data-home-matthias-scene={matthiasSceneKey}
          data-home-matthias-activity={matthiasActivity}
          data-home-matthias-zone={matthiasZone}
          data-home-matthias-moment={matthiasVisual?.momentId || 'none'}
          data-home-matthias-dwell-ms={matthiasDwellMs}
        >
          {matthiasVisual && (
            <span
              className="illustrated-home__matthias-portrait"
              data-reduced-motion={reducedMotion ? 'true' : 'false'}
              aria-hidden="true"
            >
              <HomeMatthias3D
                fallbackAvatar={matthiasVisual.avatar}
                scene={matthiasVisual.key}
                activity={matthiasActivity}
                speaking={matthiasSpeaking}
                reducedMotion={reducedMotion}
              />
            </span>
          )}
          <span className="illustrated-home__matthias-copy">
            <strong>MATTHIAS</strong>
            <span>{matthiasActivity}</span>
            <em>{matthiasSpeaking ? 'Dictando sentencia' : 'Así juegas →'}</em>
          </span>
        </button>
        </aside>
        <div className={`illustrated-home__utilities${toolsOpen ? ' is-open' : ''}`}>
          <button
            className="illustrated-home__dungeon-trigger"
            type="button"
            aria-label="Más modos y herramientas · Mazmorras"
            aria-expanded={toolsOpen}
            aria-controls="illustrated-home-tools"
            onClick={() => setToolsOpen(!toolsOpen)}
            onPointerEnter={() => setActiveRoom('dungeon')}
            onPointerLeave={() => setActiveRoom(null)}
            onFocus={() => setActiveRoom('dungeon')}
            onBlur={() => setActiveRoom(null)}
          >
            <span className="illustrated-home__dungeon-copy"><strong>MAZMORRAS</strong><small>Entra bajo tu cuenta y riesgo!</small></span>
            <span className="illustrated-home__dungeon-chevron" aria-hidden="true">{toolsOpen ? '↑' : '↓'}</span>
          </button>
          {toolsOpen && <nav id="illustrated-home-tools" className="illustrated-home__dungeon-panel" aria-label="Más modos y herramientas">
            <header><span>BAJO EL CASTILLO</span><strong>MAZMORRAS</strong><small>Entra bajo tu cuenta y riesgo!</small></header>
            {tools.map(([label, action]) => <button type="button" key={label} aria-label={label} onClick={() => { setToolsOpen(false); action(); }}>{label}</button>)}
            {experimentsAction && <button type="button" aria-label="Abrir Pawn Slug directamente" onClick={() => { setToolsOpen(false); openPawnSlug(); }}>Pawn Slug</button>}
          </nav>}
        </div>
      </div>
      {error && <div className="illustrated-home__error" role="alert">{error}</div>}
      {loading && <span className="illustrated-home__loading" role="status">Preparando tu partida…</span>}
    </section>
  );
}
