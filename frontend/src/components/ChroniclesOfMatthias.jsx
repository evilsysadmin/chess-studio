import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CHRONICLES_DIRECTIONS,
  chroniclesJournalEntries,
  chroniclesObjective,
  chroniclesReduce,
  createChroniclesState,
} from '../chroniclesOfMatthias.js';
import { chroniclesPartyBark } from '../chroniclesOfMatthiasBarks.js';
import { chroniclesPartyPortraitUrl } from '../chronicles/chroniclesPartyPortraitAssets.js';
import { chroniclesPartyCondition } from '../chroniclesOfMatthiasPartyCondition.js';
import { chroniclesPartyRelic } from '../chroniclesOfMatthiasRelics.js';
import { chroniclesRetaliationCue } from '../chroniclesOfMatthiasRetaliation.js';
import { chroniclesTargetAhead } from '../chroniclesOfMatthiasTargeting.js';
import { CHRONICLES_TURN_ENGINE_VERSION } from '../chroniclesOfMatthiasTurns.js';
import {
  loadChroniclesProgression,
  saveChroniclesProgression,
  setChroniclesCharacterBuild,
} from '../chroniclesOfMatthiasProgression.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import ChroniclesBookOneEpilogue from './ChroniclesBookOneEpilogue.jsx';
import ChroniclesCharacterSetup from './ChroniclesCharacterSetup.jsx';
import ChroniclesEnemyRetaliationFx from './ChroniclesEnemyRetaliationFx.jsx';
import ChroniclesNarratorOverlay from './ChroniclesNarratorOverlay.jsx';
import ChroniclesPartyBark from './ChroniclesPartyBark.jsx';
import ChroniclesTacticalMargin from './ChroniclesTacticalMargin.jsx';
import './ChroniclesOfMatthias.css';
import './ChroniclesOfMatthiasArt.css';
import './ChroniclesOfMatthiasJournal.css';
import './ChroniclesPartyCondition.css';
import './ChroniclesPartyThumbnails.css';
import './ChroniclesRecoveredRelic.css';

const KEY_ACTIONS = Object.freeze({
  ArrowUp: 'forward', w: 'forward', W: 'forward',
  ArrowDown: 'backward', s: 'backward', S: 'backward',
  ArrowLeft: 'turn-left', a: 'turn-left', A: 'turn-left',
  ArrowRight: 'turn-right', d: 'turn-right', D: 'turn-right',
});

export default function ChroniclesOfMatthias({ onExit }) {
  useEscapeToClose(onExit);
  const hostRef = useRef(null);
  const engineRef = useRef(null);
  const retaliationTimerRef = useRef(null);
  const retaliationSequenceRef = useRef(0);
  const partyBarkTimerRef = useRef(null);
  const partyBarkSequenceRef = useRef(0);
  const [progression, setProgression] = useState(() => loadChroniclesProgression());
  const [characterSetupDone, setCharacterSetupDone] = useState(false);
  const stateRef = useRef(createChroniclesState(null, progression.characterBuild));
  const [state, setState] = useState(stateRef.current);
  const [selectedMemberId, setSelectedMemberId] = useState('matthias');
  const selectedMemberIdRef = useRef(selectedMemberId);
  const [rendererName, setRendererName] = useState('CARGANDO');
  const [rendererError, setRendererError] = useState('');
  const [retaliationCue, setRetaliationCue] = useState(null);
  const [partyBark, setPartyBark] = useState(null);

  useEffect(() => {
    selectedMemberIdRef.current = selectedMemberId;
  }, [selectedMemberId]);

  const confirmCharacterBuild = useCallback((build) => {
    const selected = setChroniclesCharacterBuild(progression, build);
    if (!selected.updated) return;
    const saved = saveChroniclesProgression(selected.progression);
    const next = createChroniclesState(null, saved.characterBuild);
    stateRef.current = next;
    setProgression(saved);
    setSelectedMemberId('matthias');
    setState(next);
    setCharacterSetupDone(true);
  }, [progression]);

  const dispatch = useCallback((action) => {
    const current = stateRef.current;
    const next = chroniclesReduce(current, action);
    stateRef.current = next;
    setState(next);

    const bark = chroniclesPartyBark(current, next);
    if (bark) {
      const token = partyBarkSequenceRef.current + 1;
      partyBarkSequenceRef.current = token;
      if (partyBarkTimerRef.current) clearTimeout(partyBarkTimerRef.current);
      setPartyBark({ ...bark, token });
      partyBarkTimerRef.current = setTimeout(() => {
        setPartyBark((active) => active?.token === token ? null : active);
      }, 2800);
    }

    const cue = chroniclesRetaliationCue(current, next);
    if (cue) {
      const token = retaliationSequenceRef.current + 1;
      retaliationSequenceRef.current = token;
      if (retaliationTimerRef.current) clearTimeout(retaliationTimerRef.current);
      setRetaliationCue({ ...cue, token });
      retaliationTimerRef.current = setTimeout(() => {
        setRetaliationCue((active) => active?.token === token ? null : active);
      }, 320);
    }
  }, []);

  const attackWithSelected = useCallback(() => {
    const memberId = selectedMemberIdRef.current;
    engineRef.current?.playAttack?.(memberId);
    dispatch({ type: 'attack', memberId });
  }, [dispatch]);

  const restart = useCallback(() => {
    const next = createChroniclesState(null, progression.characterBuild);
    stateRef.current = next;
    setSelectedMemberId('matthias');
    setState(next);
    if (retaliationTimerRef.current) clearTimeout(retaliationTimerRef.current);
    retaliationTimerRef.current = null;
    setRetaliationCue(null);
    if (partyBarkTimerRef.current) clearTimeout(partyBarkTimerRef.current);
    partyBarkTimerRef.current = null;
    setPartyBark(null);
  }, [progression.characterBuild]);

  useEffect(() => () => {
    if (retaliationTimerRef.current) clearTimeout(retaliationTimerRef.current);
    if (partyBarkTimerRef.current) clearTimeout(partyBarkTimerRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let engine = null;
    const host = hostRef.current;
    if (!characterSetupDone || !host) return undefined;

    void import('../chroniclesOfMatthiasThree.js')
      .then(({ createChroniclesOfMatthiasGame }) => {
        if (cancelled) return;
        engine = createChroniclesOfMatthiasGame(host, {
          onReady: (backend) => { if (!cancelled) setRendererName(backend); },
        });
        engineRef.current = engine;
        engine.renderState(stateRef.current);
      })
      .catch((error) => {
        console.error('Chronicles of Matthias Three.js boot failed', error);
        if (!cancelled) {
          setRendererName('THREE.JS · ERROR');
          setRendererError('La cripta se ha negado a materializarse. El motor 3D no ha arrancado.');
        }
      });

    return () => {
      cancelled = true;
      engine?.destroy();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, [characterSetupDone]);

  useEffect(() => { engineRef.current?.renderState(state); }, [state]);

  useEffect(() => {
    if (!characterSetupDone) return undefined;
    const onKeyDown = (event) => {
      if (/^[1-4]$/.test(event.key)) {
        const member = stateRef.current.party[Number(event.key) - 1];
        if (member) {
          event.preventDefault();
          setSelectedMemberId(member.id);
        }
        return;
      }
      if (event.key === ' ') {
        event.preventDefault();
        attackWithSelected();
        return;
      }
      const action = KEY_ACTIONS[event.key];
      if (!action) return;
      event.preventDefault();
      dispatch(action);
    };
    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [attackWithSelected, characterSetupDone, dispatch]);

  if (!characterSetupDone) {
    return (
      <ChroniclesCharacterSetup
        currentBuild={progression.characterBuild}
        onConfirm={confirmCharacterBuild}
        onExit={onExit}
      />
    );
  }

  const direction = CHRONICLES_DIRECTIONS[state.direction];
  const objective = chroniclesObjective(state);
  const selectedMember = state.party.find((member) => member.id === selectedMemberId) || state.party[0];
  const selectedCondition = chroniclesPartyCondition(selectedMember);
  const selectedRelic = chroniclesPartyRelic(state, selectedMember?.id);
  const tacticalTarget = chroniclesTargetAhead(state, selectedMember?.reach || 1);
  const journalEntries = chroniclesJournalEntries(state);
  const latestJournalEntry = journalEntries[journalEntries.length - 1];

  return (
    <div
      className="chronicles"
      data-chronicles="true"
      data-chronicles-phase={state.phase}
      data-chronicles-turn-engine={CHRONICLES_TURN_ENGINE_VERSION}
    >
      <header className="chronicles-head">
        <div>
          <span className="section-label">EXPERIMENTO RPG · THREE.JS · BOOK I</span>
          <h2>Chronicles of Matthias</h2>
          <p>Dungeon crawler en primera persona. El grupo avanza por casillas; las piezas siguen siendo piezas y la arquitectura tiene memoria de tablero.</p>
        </div>
        <button type="button" className="secondary-btn" onClick={onExit}>← Experimentos</button>
      </header>

      <div className="chronicles-shell">
        <aside className="chronicles-party" aria-label="Grupo de Matthias">
          <span className="chronicles-panel-kicker">GRUPO · 1–4 SELECCIONAR</span>
          <div className="chronicles-party-preview" data-condition={selectedCondition} data-relic={selectedRelic || undefined}>
            <img
              className="chronicles-party-preview-image"
              src={chroniclesPartyPortraitUrl(selectedMember.id)}
              alt={`Retrato de ${selectedMember.name}`}
              data-chronicles-party-renderer="authored"
              data-member-id={selectedMember.id}
              draggable="false"
            />
            <div className="chronicles-party-preview-copy">
              <span>{selectedMember?.role}</span>
              <strong>{selectedMember?.name}</strong>
              <small>{selectedMember?.attackName} · alcance {selectedMember?.reach}</small>
            </div>
          </div>
          {state.party.map((member, index) => {
            return (
              <button
                type="button"
                key={member.id}
                className={`chronicles-party-member ${member.id === 'matthias' ? 'is-leader' : ''} ${member.id === selectedMemberId ? 'is-selected' : ''} ${member.hp <= 0 ? 'is-down' : ''}`}
                onClick={() => setSelectedMemberId(member.id)}
                aria-label={`Seleccionar ${member.name}`}
                aria-pressed={member.id === selectedMemberId}
              >
                <span className="chronicles-party-glyph has-authored-portrait" aria-hidden="true">
                  <img
                    className="chronicles-party-thumbnail"
                    src={chroniclesPartyPortraitUrl(member.id)}
                    alt=""
                    draggable="false"
                    data-chronicles-party-thumbnail={member.id}
                  />
                </span>
                <span><strong>{index + 1}. {member.name}</strong><small>{member.row === 'front' ? 'FRENTE' : 'RETAGUARDIA'} · {member.attackName} · alcance {member.reach}</small></span>
                <b>{member.hp}/{member.maxHp}</b>
              </button>
            );
          })}
        </aside>

        <main className="chronicles-stage-wrap">
          <div className="chronicles-statusbar" aria-live="polite">
            <span>CRIPTA <b>01</b></span>
            <span>RUMBO <b>{direction.label}</b></span>
            <span>ACTIVO <b>{selectedMember?.name}</b></span>
            <span>OBJETIVO <b>{objective}</b></span>
          </div>

          <div className="chronicles-stage">
            <div ref={hostRef} className="chronicles-three" data-chronicles-renderer="three" aria-label="Mazmorra 3D en primera persona de Chronicles of Matthias" />
            <div className="chronicles-vignette" aria-hidden="true" />
            <div className="chronicles-crosshair" aria-hidden="true">·</div>
            <ChroniclesNarratorOverlay message={state.message} />
            <ChroniclesPartyBark key={partyBark?.token || 'none'} bark={partyBark} />
            <ChroniclesTacticalMargin target={tacticalTarget} />
            <ChroniclesEnemyRetaliationFx key={retaliationCue?.token || 'none'} cue={retaliationCue} />
            {rendererError && <div className="chronicles-renderer-error" role="alert">{rendererError}</div>}
            {state.phase === 'escaped' && <ChroniclesBookOneEpilogue state={state} onRestart={restart} />}
          </div>

          <details className="chronicles-journal" aria-label="Crónica de expedición">
            <summary>
              <span><i aria-hidden="true">✦</i><b>Crónica de expedición</b><small>{latestJournalEntry?.title}</small></span>
              <em>{journalEntries.length} {journalEntries.length === 1 ? 'folio' : 'folios'}</em>
            </summary>
            <ol>
              {journalEntries.map((entry) => (
                <li key={entry.id}>
                  <span aria-hidden="true">{entry.sigil}</span>
                  <div><strong>{entry.title}</strong><p>{entry.body}</p></div>
                </li>
              ))}
            </ol>
          </details>

          <div className="chronicles-touch" aria-label="Controles de la mazmorra">
            <button type="button" onClick={() => dispatch('turn-left')} aria-label="Girar a la izquierda">↶<small>GIRAR</small></button>
            <button type="button" onClick={() => dispatch('forward')} aria-label="Avanzar">↑<small>AVANZAR</small></button>
            <button type="button" className="is-attack" onClick={attackWithSelected} aria-label="Atacar">⚔<small>{selectedMember?.name?.toUpperCase() || 'ATACAR'}</small></button>
            <button type="button" onClick={() => dispatch('backward')} aria-label="Retroceder">↓<small>ATRÁS</small></button>
            <button type="button" onClick={() => dispatch('turn-right')} aria-label="Girar a la derecha">↷<small>GIRAR</small></button>
          </div>

          <div className="chronicles-keyboard-help">
            <span><kbd>W</kbd>/<kbd>↑</kbd> avanzar</span>
            <span><kbd>S</kbd>/<kbd>↓</kbd> retroceder</span>
            <span><kbd>A</kbd><kbd>D</kbd> girar</span>
            <span><kbd>1</kbd>–<kbd>4</kbd> pieza</span>
            <span><kbd>ESPACIO</kbd> atacar</span>
          </div>
        </main>
      </div>

      <p className="chronicles-tech-note">Motor {rendererName}. Combate de grupo posicional: piezas de frente absorben represalias; retaguardia puede golpear a distancia según su geometría. Sin rating, sin economía y sin tocar el ajedrez estándar.</p>
    </div>
  );
}
