import React, { useMemo, useState } from 'react';
import { glossarySearch } from '../chessGlossary.js';

export default function ChessGlossary() {
  const [query, setQuery] = useState('');
  const entries = useMemo(() => glossarySearch(query), [query]);

  return (
    <section className="chess-glossary" aria-label="Glosario ajedrecístico">
      <div className="chess-glossary-heading">
        <div>
          <span className="eyebrow">Diccionario de campaña y tablero</span>
          <h2>Glosario ajedrecístico</h2>
        </div>
        <span className="chess-glossary-count">{entries.length} términos</span>
      </div>
      <p className="hint-text">Definiciones cortas de los términos que aparecen en consejos, autopsias y análisis. Para que nadie tenga que hablar dialecto Stockfish por obligación.</p>
      <label className="chess-glossary-search">
        <span>Buscar término</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="cp, CCT, clavada, FEN…" />
      </label>
      <div className="chess-glossary-grid">
        {entries.map((entry) => (
          <article className="chess-glossary-entry" key={entry.term}>
            <strong>{entry.term}</strong>
            {entry.aliases.length > 0 && <small>{entry.aliases.join(' · ')}</small>}
            <p>{entry.definition}</p>
          </article>
        ))}
      </div>
      {entries.length === 0 && <p className="hint-text">No encuentro ese término. Si aparece en alguna pantalla, hay que meterlo aquí y dejar de hacerse el interesante.</p>}
    </section>
  );
}
