import { useEffect, useMemo, useRef, useState } from 'react';
import { CHRONICLES_PARTY } from '../chroniclesOfMatthias.js';
import {
  chroniclesRollCharacterStats,
  createCanonicalChroniclesCharacterBuild,
  normalizeChroniclesCharacterBuild,
  validateChroniclesCharacterBuild,
} from '../chronicles/chroniclesCharacterBuilds.js';
import {
  CHRONICLES_MM3_CLASSES,
  CHRONICLES_MM3_CLASS_IDS,
  CHRONICLES_MM3_RACES,
  CHRONICLES_MM3_RACE_IDS,
  CHRONICLES_MM3_SEXES,
  CHRONICLES_MM3_ALIGNMENTS,
  CHRONICLES_MM3_STATS,
  CHRONICLES_MM3_STAT_EFFECTS,
  CHRONICLES_MM3_STAT_LABELS,
  CHRONICLES_MM3_STAT_SHORT,
  chroniclesMM3Derived,
  chroniclesMM3MaxSpellPoints,
  chroniclesMM3UnmetRequirements,
} from '../chronicles/chroniclesMM3Rules.js';
import { chroniclesPartyPortraitUrl } from '../chronicles/chroniclesPartyPortraitAssets.js';
import {
  clearChroniclesCharacterDraft,
  loadChroniclesCharacterDraft,
  saveChroniclesCharacterDraft,
} from '../chronicles/chroniclesCharacterDraft.js';
import { clearRememberedLabMode, rememberLabMode } from '../labLaunchIntent.js';
import './ChroniclesCharacterSetup.css';

function customFrom(build) {
  const normalized = normalizeChroniclesCharacterBuild(build, CHRONICLES_PARTY);
  return {
    ...normalized,
    mode: 'custom',
    characters: normalized.characters.map((character) => ({
      ...character,
      stats: { ...character.stats },
    })),
  };
}

function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}

function requirementText(classId) {
  return Object.entries(CHRONICLES_MM3_CLASSES[classId].requirements)
    .map(([stat, need]) => `${CHRONICLES_MM3_STAT_SHORT[stat]} ${need}`)
    .join(' · ');
}

export default function ChroniclesCharacterSetup({
  currentBuild,
  onConfirm,
  onExit,
  recoveryLabMode = null,
}) {
  const normalizedCurrent = useMemo(
    () => normalizeChroniclesCharacterBuild(currentBuild, CHRONICLES_PARTY),
    [currentBuild],
  );
  const [recoveredDraft, setRecoveredDraft] = useState(() => loadChroniclesCharacterDraft(CHRONICLES_PARTY));
  const [editing, setEditing] = useState(() => Boolean(recoveredDraft));
  const [rolls, setRolls] = useState(0);
  const [editorStep, setEditorStep] = useState(() => recoveredDraft?.editorStep || 'identity');
  const editorTabsRef = useRef(null);
  const [activeSlot, setActiveSlot] = useState(() => recoveredDraft?.activeSlot || 'matthias');
  const [draft, setDraft] = useState(() => (
    recoveredDraft?.build ? customFrom(recoveredDraft.build) : customFrom(normalizedCurrent)
  ));

  useEffect(() => {
    if (!editing) return;
    const saved = saveChroniclesCharacterDraft({ activeSlot, editorStep, build: draft }, CHRONICLES_PARTY);
    if (saved && recoveryLabMode) rememberLabMode(recoveryLabMode);
  }, [activeSlot, editorStep, draft, editing, recoveryLabMode]);

  const clearRecovery = () => {
    clearChroniclesCharacterDraft();
    clearRememberedLabMode();
  };

  const confirmBuild = (build) => {
    // The character draft is finished, but the player is still inside
    // Chronicles. Keep the Lab mode across F5 so the active run can resume.
    clearChroniclesCharacterDraft();
    if (recoveryLabMode) rememberLabMode(recoveryLabMode);
    onConfirm(build);
  };

  const leaveSetup = () => {
    clearRecovery();
    onExit();
  };

  const leaveEditor = () => {
    clearRecovery();
    setRecoveredDraft(null);
    setDraft(customFrom(normalizedCurrent));
    setActiveSlot('matthias');
    setEditorStep('identity');
    setEditing(false);
  };

  const activeCharacter = draft.characters.find((character) => character.slotId === activeSlot) || draft.characters[0];
  const derived = chroniclesMM3Derived(activeCharacter.classId, activeCharacter.stats, { raceId: activeCharacter.raceId });
  const racialProfile = CHRONICLES_MM3_RACES[activeCharacter.raceId] || CHRONICLES_MM3_RACES.human;
  const spellPoints = chroniclesMM3MaxSpellPoints(activeCharacter.classId, activeCharacter.stats, activeCharacter.raceId);
  const activeIndex = draft.characters.findIndex((character) => character.slotId === activeCharacter.slotId);
  const validation = validateChroniclesCharacterBuild(draft);

  const beginCustom = () => {
    setRecoveredDraft(null);
    setDraft(customFrom(normalizedCurrent));
    setActiveSlot('matthias');
    setEditorStep('identity');
    setEditing(true);
  };

  const patchCharacter = (slotId, patch) => {
    setDraft((current) => ({
      ...current,
      mode: 'custom',
      characters: current.characters.map((character) => (
        character.slotId === slotId ? { ...character, ...patch } : character
      )),
    }));
  };

  // MM3 roller: reroll all seven stats as often as you like; keep the class
  // if the new roll still qualifies, otherwise fall to the first that does.
  const rerollStats = () => {
    const { stats, classId } = chroniclesRollCharacterStats(Math.random, activeCharacter.classId);
    patchCharacter(activeCharacter.slotId, { stats, classId });
    setRolls((count) => count + 1);
  };

  const jumpToStep = (step) => {
    setEditorStep(step);
    // Only the stacked mobile composer needs a scroll reset. The desktop
    // three-column ledger should never jump on a stage change.
    if (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 720px), (max-width: 1024px) and (max-height: 480px)').matches) {
      editorTabsRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  };

  const chooseRace = (raceId) => {
    if (!CHRONICLES_MM3_RACE_IDS.includes(raceId)) return;
    patchCharacter(activeCharacter.slotId, { raceId });
  };

  const chooseClass = (classId) => {
    if (chroniclesMM3UnmetRequirements(classId, activeCharacter.stats).length) return;
    patchCharacter(activeCharacter.slotId, { classId });
  };

  if (!editing) {
    const hasCustom = normalizedCurrent.mode === 'custom';
    return (
      <div className="chronicles-character-setup chronicles-character-setup--choice" data-chronicles-character-setup="choice">
        <section className="chronicles-character-setup__panel chronicles-character-setup__panel--choice" aria-labelledby="chronicles-character-setup-title">
          <header className="chronicles-character-setup__choice-head">
            <span className="chronicles-character-setup__eyebrow">FORMAR COMPAÑÍA</span>
            <h2 id="chronicles-character-setup-title">Elige tus personajes</h2>
            <p>Cuatro aventureros aguardan tu decisión. Entra con la compañía canónica o tira los dados para forjar tu propia historia.</p>
          </header>
          <div className="chronicles-character-setup__hero-grid" aria-label="Personajes de la compañía">
            {(hasCustom ? normalizedCurrent.characters : createCanonicalChroniclesCharacterBuild(CHRONICLES_PARTY).characters).map((character) => (
              <article className="chronicles-character-setup__hero" key={character.slotId}>
                <img src={chroniclesPartyPortraitUrl(character.slotId)} alt={`Retrato canónico de ${character.name}`} draggable="false" />
                <div className="chronicles-character-setup__hero-plaque">
                  <strong>{character.name}</strong>
                  <span>{CHRONICLES_MM3_CLASSES[character.classId]?.label || 'Aventurero'}</span>
                </div>
              </article>
            ))}
          </div>
          {hasCustom && (
            <div className="chronicles-character-setup__saved" data-testid="chronicles-custom-party-summary">
              <span>COMPAÑÍA GUARDADA</span>
              <strong>{normalizedCurrent.characters.map((character) => character.name).join(' · ')}</strong>
            </div>
          )}
          <div className="chronicles-character-setup__choice-actions">
            <div className="chronicles-character-setup__choice-main-actions">
              {hasCustom ? (
                <button type="button" className="primary-btn" onClick={() => confirmBuild(normalizedCurrent)}>
                  Continuar con mi compañía
                </button>
              ) : (
                <button type="button" className="primary-btn"
                  onClick={() => confirmBuild(createCanonicalChroniclesCharacterBuild(CHRONICLES_PARTY))}>
                  Entrar con grupo canónico
                </button>
              )}
              <button type="button" className="secondary-btn" onClick={beginCustom}>
                {hasCustom ? 'Editar PJs' : 'Crear PJs'}
              </button>
            </div>
            {hasCustom && (
              <button type="button" className="ghost-btn" onClick={() => confirmBuild(createCanonicalChroniclesCharacterBuild(CHRONICLES_PARTY))}>
                Volver al grupo canónico
              </button>
            )}
            <button type="button" className="ghost-btn chronicles-character-setup__choice-exit" onClick={leaveSetup}>← Salir</button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="chronicles-character-setup" data-chronicles-character-setup="editor" data-editor-step={editorStep}>
      <section className="chronicles-character-setup__panel chronicles-character-setup__panel--editor">
        <div className="chronicles-character-setup__head">
          <div>
            <span className="section-label">LIBRO DE AVENTUREROS · INSPIRADO EN MM3</span>
            <h2>Forja tu compañía</h2>
            <p>Cuatro héroes. Siete atributos, cinco razas y diez clases. El dado decide qué profesiones puedes elegir.</p>
            {recoveredDraft ? (
              <small className="chronicles-character-setup__recovered">Borrador recuperado de esta sesión.</small>
            ) : null}
          </div>
          <button type="button" className="ghost-btn" onClick={leaveEditor}>← Volver</button>
        </div>

        <nav className="chronicles-character-setup__slots" aria-label="Personajes de la compañía">
          {draft.characters.map((character, index) => (
            <button
              type="button"
              key={character.slotId}
              className={character.slotId === activeCharacter.slotId ? 'is-active' : ''}
              onClick={() => {
                setActiveSlot(character.slotId);
                jumpToStep('identity');
              }}
              aria-pressed={character.slotId === activeCharacter.slotId}
            >
              <img src={chroniclesPartyPortraitUrl(character.slotId)} alt="" aria-hidden="true" />
              <span>{index + 1} · {CHRONICLES_MM3_CLASSES[character.classId]?.label}</span>
              <strong>{character.name}</strong>
            </button>
          ))}
        </nav>

        <nav className="chronicles-character-setup__editor-tabs" aria-label="Etapas del personaje" role="tablist" ref={editorTabsRef}>
          {[
            { id: 'identity', label: 'Identidad', next: '1' },
            { id: 'stats', label: 'Atributos', next: '2' },
            { id: 'class', label: 'Clase', next: '3' },
          ].map((step) => (
            <button type="button" key={step.id} role="tab"
              id={`chronicles-step-tab-${step.id}`}
              aria-controls={`chronicles-step-panel-${step.id}`}
              aria-selected={editorStep === step.id}
              onClick={() => jumpToStep(step.id)}>
              <small>{step.next}</small>{step.label}
            </button>
          ))}
        </nav>
        <div className="chronicles-character-setup__mobile-overview" aria-live="polite">
          <strong>{activeCharacter.name} · {CHRONICLES_MM3_CLASSES[activeCharacter.classId]?.label}</strong>
          <span>{racialProfile.label} · {derived.maxHp} PV · {spellPoints} PH</span>
        </div>
        <div className="chronicles-character-setup__sheet">
          <section id="chronicles-step-panel-identity" role="tabpanel" aria-labelledby="chronicles-step-tab-identity"
            className="chronicles-character-setup__identity" aria-label="Identidad del aventurero">
            <div className="chronicles-character-setup__portrait-preview">
              <img
                src={chroniclesPartyPortraitUrl(activeCharacter.slotId)}
                alt={`Retrato canónico de ${activeCharacter.name}`}
                draggable="false"
              />
              <span>HÉROE {activeIndex + 1} / {draft.characters.length}</span>
            </div>
            <span>IDENTIDAD · {CHRONICLES_MM3_CLASSES[activeCharacter.classId]?.label}</span>
            <label>
              Nombre
              <input
                aria-label={`Nombre de ${activeCharacter.slotId}`}
                value={activeCharacter.name}
                maxLength={24}
                onChange={(event) => patchCharacter(activeCharacter.slotId, { name: event.target.value })}
              />
            </label>
            <div className="chronicles-character-setup__identity-fields">
              <label>
                Raza
                <select value={activeCharacter.raceId} onChange={(event) => chooseRace(event.target.value)}>
                  {CHRONICLES_MM3_RACE_IDS.map((id) => (
                    <option value={id} key={id}>{CHRONICLES_MM3_RACES[id].label}</option>
                  ))}
                </select>
              </label>
              <label>
                Sexo
                <select value={activeCharacter.sex} onChange={(event) => patchCharacter(activeCharacter.slotId, { sex: event.target.value })}>
                  {Object.entries(CHRONICLES_MM3_SEXES).map(([id, label]) => (
                    <option value={id} key={id}>{label}</option>
                  ))}
                </select>
              </label>
              <label>
                Alineamiento
                <select value={activeCharacter.alignment} onChange={(event) => patchCharacter(activeCharacter.slotId, { alignment: event.target.value })}>
                  {Object.entries(CHRONICLES_MM3_ALIGNMENTS).map(([id, label]) => (
                    <option value={id} key={id}>{label}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="chronicles-character-setup__race-effect" aria-live="polite">
              <strong>{racialProfile.label} · Origen</strong>
              <p>{racialProfile.description}</p>
              <small>Los retratos son canónicos. Sexo y alineamiento son narrativos; las resistencias raciales aún no están implementadas.</small>
            </div>
            <dl className="chronicles-character-setup__derived" aria-label={`Valores de combate de ${activeCharacter.name}`}>
              <div><dt>Vida</dt><dd>{derived.maxHp}</dd></div>
              <div><dt>Hechizos</dt><dd>{spellPoints} PH</dd></div>
              <div><dt>Armadura</dt><dd>{derived.armorClass}</dd></div>
              <div><dt>Acierto</dt><dd>{signed(derived.toHit)}</dd></div>
            </dl>
            <small className="chronicles-character-setup__derived-note">
              Valores iniciales sin equipamiento. La clase y la raza ya afectan a la vida y a la magia reales.
            </small>
          </section>

          <section id="chronicles-step-panel-stats" role="tabpanel" aria-labelledby="chronicles-step-tab-stats"
            className="chronicles-character-setup__attributes" aria-label={`Estadísticas de ${activeCharacter.name}`}>
            <div className="chronicles-character-setup__section-head">
              <div>
                <span>ESTADÍSTICAS · 3D6</span>
                <strong>{rolls > 0 ? `${rolls} ${rolls === 1 ? 'tirada' : 'tiradas'} en esta sesión` : 'Tirada inicial'}</strong>
              </div>
              <button type="button" className="secondary-btn" onClick={rerollStats}>
                🎲 Tirar dados
              </button>
            </div>
            {CHRONICLES_MM3_STATS.map((key) => {
              const value = Number(activeCharacter.stats?.[key] || 0);
              const bonus = derived.bonuses[key];
              return (
                <div className="chronicles-character-setup__attribute" key={key} data-stat={key}>
                  <span>
                    <b>{CHRONICLES_MM3_STAT_LABELS[key]}</b>
                    <small>{CHRONICLES_MM3_STAT_EFFECTS[key]}</small>
                  </span>
                  <div>
                    <strong>{value}</strong>
                    <em className={bonus > 0 ? 'is-up' : bonus < 0 ? 'is-down' : ''}>{signed(bonus)}</em>
                  </div>
                </div>
              );
            })}
          </section>

          <section id="chronicles-step-panel-class" role="tabpanel" aria-labelledby="chronicles-step-tab-class"
            className="chronicles-character-setup__classes" aria-label={`Clase de ${activeCharacter.name}`}>
            <div className="chronicles-character-setup__section-head">
              <div>
                <span>CLASE · 10 PROFESIONES</span>
                <strong>Elige entre las habilitadas.</strong>
              </div>
            </div>
            <div className="chronicles-character-setup__class-grid">
              {CHRONICLES_MM3_CLASS_IDS.map((classId) => {
                const definition = CHRONICLES_MM3_CLASSES[classId];
                const unmet = chroniclesMM3UnmetRequirements(classId, activeCharacter.stats);
                const selected = activeCharacter.classId === classId;
                return (
                  <button
                    type="button"
                    key={classId}
                    data-class-id={classId}
                    className={selected ? 'is-selected' : ''}
                    aria-pressed={selected}
                    disabled={unmet.length > 0}
                    onClick={() => chooseClass(classId)}
                  >
                    <strong>{definition.label}</strong>
                    <em>{unmet.length ? `Requiere ${requirementText(classId)}` : `✓ ${requirementText(classId) || 'Sin requisitos'}`}</em>
                  </button>
                );
              })}
            </div>
            <div className="chronicles-character-setup__class-detail" aria-live="polite">
              <strong>{CHRONICLES_MM3_CLASSES[activeCharacter.classId]?.label}</strong>
              <p>{CHRONICLES_MM3_CLASSES[activeCharacter.classId]?.summary}</p>
              <small>Vida base {CHRONICLES_MM3_CLASSES[activeCharacter.classId]?.hpBase} · Daño {signed(derived.damageBonus)} · PH {spellPoints}</small>
            </div>
          </section>
        </div>

        {validation.errors.length ? (
          <div className="chronicles-character-setup__errors" role="alert">
            {validation.errors[0]}
          </div>
        ) : null}

        <footer className="chronicles-character-setup__footer">
          <div className="chronicles-character-setup__step-actions">
            {editorStep !== 'class' && (
              <button type="button" className="secondary-btn"
                onClick={() => jumpToStep(editorStep === 'identity' ? 'stats' : 'class')}>
                {editorStep === 'identity' ? 'Siguiente: atributos →' : 'Siguiente: clase →'}
              </button>
            )}
          </div>
          <details className="chronicles-character-setup__mechanics">
            <summary>Resumen de la compañía</summary>
            <div>
              {draft.characters.map((character) => {
                const sheet = chroniclesMM3Derived(character.classId, character.stats, { raceId: character.raceId });
                return (
                  <span key={character.slotId}>
                    <strong>{character.name} · {sheet.classLabel} · {CHRONICLES_MM3_RACES[character.raceId]?.label || 'Humano'}</strong>
                    <small>Vida {sheet.maxHp} · PH {chroniclesMM3MaxSpellPoints(character.classId, character.stats, character.raceId)} · Armadura {sheet.armorClass} · Acierto {signed(sheet.toHit)}</small>
                  </span>
                );
              })}
            </div>
          </details>
          <button
            type="button"
            className="primary-btn"
            disabled={!validation.valid}
            onClick={() => confirmBuild(draft)}
          >
            Confirmar compañía
          </button>
        </footer>
      </section>
    </div>
  );
}
