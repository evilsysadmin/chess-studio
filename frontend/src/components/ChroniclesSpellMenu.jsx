import { useEffect, useRef } from 'react';
import {
  CHRONICLES_SPELL_SCHOOLS,
  chroniclesMemberMaxSp,
  chroniclesMemberSchool,
  chroniclesMemberSp,
  chroniclesMemberSpells,
} from '../chronicles/chroniclesMagic.js';

// MM3 "Cast": the acting hero's spellbook with the cost of each incantation.
export default function ChroniclesSpellMenu({ state, member, onCast, onClose }) {
  const firstRef = useRef(null);
  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [onClose]);

  const spells = chroniclesMemberSpells(state, member);
  const sp = chroniclesMemberSp(state, member);
  const school = CHRONICLES_SPELL_SCHOOLS[chroniclesMemberSchool(member)];
  return (
    <section className="chronicles-spell-menu" role="dialog" aria-label={`Hechizos de ${member.name}`} data-chronicles-spell-menu={member.id}>
      <header>
        <span>{school?.label}</span>
        <strong>{member.name}</strong>
        <b aria-label={`Puntos de hechizo: ${sp} de ${chroniclesMemberMaxSp(state, member)}`}>
          {sp}/{chroniclesMemberMaxSp(state, member)} PH
        </b>
        <button type="button" className="chronicles-spell-menu__close" onClick={onClose} aria-label="Cerrar hechizos">✕</button>
      </header>
      <ul>
        {spells.map((spell, index) => (
          <li key={spell.id}>
            <button
              ref={index === 0 ? firstRef : undefined}
              type="button"
              data-chronicles-cast={spell.id}
              disabled={sp < spell.cost || member.hp <= 0}
              onClick={() => onCast(spell.id)}
            >
              <strong>{spell.name}</strong>
              <small>{spell.description}</small>
              <em>{spell.cost} PH</em>
            </button>
          </li>
        ))}
      </ul>
      <footer>Más hechizos en el gremio. La posada devuelve los PH.</footer>
    </section>
  );
}
