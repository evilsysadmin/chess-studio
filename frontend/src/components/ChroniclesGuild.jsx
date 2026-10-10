import { useEffect, useRef } from 'react';
import { chroniclesGoldBalance } from '../chronicles/chroniclesContentRuntime.js';
import { chroniclesGuildCanLearn, chroniclesGuildMember, chroniclesGuildSpells } from '../chronicles/chroniclesGuild.js';
import { CHRONICLES_SPELL_SCHOOLS, chroniclesMemberKnowsSpell, chroniclesSpellAvailableTo } from '../chronicles/chroniclesMagic.js';
import { chroniclesMapForState } from '../chronicles/chroniclesMapCatalog.js';
import './ChroniclesShop.css';

// The guild counter shares the shop's parchment frame: membership first,
// then one "learn" button per caster who could copy each spell.
export default function ChroniclesGuild({ state, onAction, onClose }) {
  const closeRef = useRef(null);
  const map = chroniclesMapForState(state);
  const entry = (map?.interactables || []).find((item) => item.id === state.guild?.id);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [onClose]);

  if (!entry) return null;
  const gold = chroniclesGoldBalance(state);
  const member = chroniclesGuildMember(state, entry.id);
  const fee = Number(entry.guild.membership || 0);

  return (
    <div className="chronicles-shop__backdrop" onClick={onClose}>
      <section
        className="chronicles-shop"
        role="dialog"
        aria-modal="true"
        aria-label={entry.label}
        data-chronicles-guild={entry.id}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="chronicles-shop__head">
          <div>
            <span>GREMIO</span>
            <h2>{entry.label}</h2>
            <p>{state.message}</p>
          </div>
          <b aria-label={`Oro de la compañía: ${gold}`}>{gold} oro</b>
          <button ref={closeRef} type="button" className="chronicles-shop__close" onClick={onClose}
            aria-label="Salir del gremio">✕</button>
        </header>

        {!member ? (
          <div className="chronicles-shop__join">
            <p>Sólo los socios pueden comprar hechizos. La membresía vale para toda la compañía.</p>
            <button type="button" data-chronicles-guild-join disabled={gold < fee}
              onClick={() => onAction({ type: 'guild-join' })}>
              Hacerse socios · {fee} oro
            </button>
          </div>
        ) : null}

        <ul className="chronicles-shop__list">
          {chroniclesGuildSpells(entry).map((spell) => {
            const learners = state.party.filter((hero) => chroniclesGuildCanLearn(state, hero, spell.id));
            const known = state.party.filter((hero) => chroniclesMemberKnowsSpell(state, hero, spell.id));
            const anyone = state.party.some((hero) => chroniclesSpellAvailableTo(hero, spell.id));
            return (
              <li key={spell.id} data-chronicles-guild-spell={spell.id}>
                <div className="chronicles-shop__item">
                  <small>{spell.schools.map((id) => CHRONICLES_SPELL_SCHOOLS[id].label).join(' · ')} · {spell.cost} PH</small>
                  <strong>{spell.name}</strong>
                  <span>{spell.description}</span>
                  <em>{known.length
                    ? `Ya lo conocen: ${known.map((hero) => hero.name).join(', ')}`
                    : anyone ? `${spell.price} oro por personaje` : 'Nadie de la compañía estudia esta fuerza'}</em>
                </div>
                <div className="chronicles-shop__learners">
                  {learners.map((hero) => (
                    <button key={hero.id} type="button"
                      data-chronicles-guild-learn={`${hero.id}:${spell.id}`}
                      disabled={!member || gold < spell.price}
                      onClick={() => onAction({ type: 'guild-learn', memberId: hero.id, spellId: spell.id })}>
                      {hero.name} · {spell.price} oro
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
        <footer className="chronicles-shop__foot">
          Cada hechizo se copia en el libro de un personaje. Sólo lo aprende quien sirve a su fuerza.
        </footer>
      </section>
    </div>
  );
}
