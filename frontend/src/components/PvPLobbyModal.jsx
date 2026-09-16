import { useCallback, useEffect, useMemo, useState } from 'react';
import { pvpApi } from '../pvpApi.js';
import { opponentForMatch } from '../pvpGameModel.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import './PvPLobbyModal.css';

const EMPTY_LOBBY = Object.freeze({ roster: [], challenges: [], activeMatch: null, pollAfterMs: 3000 });

function sortedRoster(rows) {
  return [...(rows || [])].sort((a, b) => {
    if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
    return (Number(b.rating) || 0) - (Number(a.rating) || 0) || String(a.username).localeCompare(String(b.username));
  });
}

export default function PvPLobbyModal({ onClose, onMatchReady }) {
  useEscapeToClose(onClose);
  const [lobby, setLobby] = useState(EMPTY_LOBBY);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');
  const self = useMemo(() => lobby.roster.find((row) => row.isSelf) || null, [lobby.roster]);
  const roster = useMemo(() => sortedRoster(lobby.roster), [lobby.roster]);
  const incoming = useMemo(() => lobby.challenges.filter((row) => row.direction === 'incoming' && row.status === 'pending'), [lobby.challenges]);
  const outgoing = useMemo(() => lobby.challenges.filter((row) => row.direction === 'outgoing' && row.status === 'pending'), [lobby.challenges]);
  const opponent = opponentForMatch(lobby.activeMatch);

  const refresh = useCallback(async ({ quiet = false, signal } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const next = await pvpApi.getLobby({ signal });
      setLobby({ ...EMPTY_LOBBY, ...(next || {}) });
      setError('');
      return next;
    } catch (err) {
      if (err?.name !== 'AbortError') setError(err?.message || 'No se pudo actualizar la sala de duelo.');
      return null;
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let timer = null;
    let controller = new AbortController();
    const poll = async (quiet = false) => {
      if (!active) return;
      if (document.visibilityState === 'hidden') {
        timer = window.setTimeout(() => poll(true), 3000);
        return;
      }
      controller.abort();
      controller = new AbortController();
      const next = await refresh({ quiet, signal: controller.signal });
      if (!active) return;
      timer = window.setTimeout(() => poll(true), Math.max(1500, Number(next?.pollAfterMs || 3000)));
    };
    void poll(false);
    return () => {
      active = false;
      controller.abort();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [refresh]);

  const run = useCallback(async (key, action) => {
    if (busyKey) return null;
    setBusyKey(key);
    setError('');
    try {
      const result = await action();
      await refresh({ quiet: true });
      return result;
    } catch (err) {
      setError(err?.message || 'La orden no pudo completarse.');
      return null;
    } finally {
      setBusyKey('');
    }
  }, [busyKey, refresh]);

  async function accept(challenge) {
    const result = await run(`accept:${challenge.id}`, () => pvpApi.acceptChallenge(challenge.id));
    if (result?.match) onMatchReady(result.match);
  }

  const rivalCount = Math.max(0, roster.length - (self ? 1 : 0));

  return (
    <div className="modal-backdrop pvp-lobby-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="pvp-lobby" role="dialog" aria-modal="true" aria-label="Duelo 1 contra 1 · War Room">
        <button type="button" className="piece-info-close" onClick={onClose} aria-label="Cerrar">×</button>
        <header className="pvp-lobby__header">
          <span className="eyebrow">War Room · humano contra humano</span>
          <h2>Roster de duelo</h2>
          <p>Hazte visible, elige rival y lanza el reto. La posición y los turnos los arbitra el servidor.</p>
        </header>

        {lobby.activeMatch && opponent && (
          <aside className="pvp-lobby__active" aria-label="Partida 1 contra 1 activa">
            <span className="pvp-lobby__signal" aria-hidden="true" />
            <div><small>PARTIDA ACTIVA</small><strong>{opponent.username} · {opponent.rating}</strong><span>{lobby.activeMatch.yourTurn ? 'Tu turno' : `Turno de ${opponent.username}`}</span></div>
            <button type="button" className="primary-btn" onClick={() => onMatchReady(lobby.activeMatch)}>Entrar en War Room</button>
          </aside>
        )}

        <div className="pvp-lobby__statusbar">
          <div><span className={`pvp-lobby__presence${self ? ' is-on' : ''}`} aria-hidden="true" /><strong>{self ? 'Disponible para retos' : 'Fuera del roster'}</strong>{self && <small>{self.rating} · {self.tier}</small>}</div>
          {self ? (
            <button type="button" className="secondary-btn" disabled={Boolean(busyKey) || Boolean(lobby.activeMatch)} onClick={() => run('leave', () => pvpApi.leaveRoster())}>{busyKey === 'leave' ? 'Saliendo…' : 'Salir del roster'}</button>
          ) : (
            <button type="button" className="primary-btn" disabled={Boolean(busyKey) || Boolean(lobby.activeMatch)} onClick={() => run('join', () => pvpApi.joinRoster())}>{busyKey === 'join' ? 'Entrando…' : 'Entrar al roster'}</button>
          )}
        </div>

        {error && <p className="pvp-lobby__error" role="alert">{error}</p>}

        <div className="pvp-lobby__grid">
          <section className="pvp-lobby__panel" aria-labelledby="pvp-roster-title">
            <header><div><small>OFICIALES PRESENTES</small><h3 id="pvp-roster-title">Roster</h3></div><span>{rivalCount} rival{rivalCount === 1 ? '' : 'es'}</span></header>
            {loading ? <p className="pvp-lobby__empty" role="status">Consultando la sala…</p> : roster.length === 0 ? <p className="pvp-lobby__empty">No hay jugadores disponibles todavía.</p> : (
              <div className="pvp-lobby__roster-list">
                {roster.map((row) => {
                  const pending = outgoing.find((item) => item.opponent === row.username);
                  return (
                    <article key={row.username} className={`pvp-lobby__player${row.isSelf ? ' is-self' : ''}`}>
                      <span className="pvp-lobby__rank-mark" aria-hidden="true">♟</span>
                      <div><strong>{row.username}{row.isSelf ? ' · tú' : ''}</strong><span>{row.tier}</span></div>
                      <b>{row.rating}</b>
                      {!row.isSelf && <button type="button" className="secondary-btn" disabled={!self || Boolean(pending) || Boolean(busyKey) || Boolean(lobby.activeMatch)} onClick={() => run(`challenge:${row.username}`, () => pvpApi.challenge(row.username))}>{pending ? 'Reto enviado' : busyKey === `challenge:${row.username}` ? 'Retando…' : 'Retar'}</button>}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="pvp-lobby__panel" aria-labelledby="pvp-challenges-title">
            <header><div><small>DESPACHO DE RETOS</small><h3 id="pvp-challenges-title">Retos</h3></div><span>{incoming.length + outgoing.length}</span></header>
            {incoming.length === 0 && outgoing.length === 0 ? <p className="pvp-lobby__empty">No hay retos pendientes.</p> : (
              <div className="pvp-lobby__challenge-list">
                {incoming.map((challenge) => (
                  <article key={challenge.id} className="pvp-lobby__challenge is-incoming">
                    <div><small>TE RETA</small><strong>{challenge.challenger}</strong><span>{challenge.challengerRating} rating</span></div>
                    <div className="pvp-lobby__challenge-actions"><button type="button" className="primary-btn" disabled={Boolean(busyKey)} onClick={() => accept(challenge)}>Aceptar</button><button type="button" className="secondary-btn" disabled={Boolean(busyKey)} onClick={() => run(`decline:${challenge.id}`, () => pvpApi.declineChallenge(challenge.id))}>Declinar</button></div>
                  </article>
                ))}
                {outgoing.map((challenge) => <article key={challenge.id} className="pvp-lobby__challenge"><div><small>RETO ENVIADO</small><strong>{challenge.opponent}</strong><span>{challenge.opponentRating} rating · esperando respuesta</span></div></article>)}
              </div>
            )}
          </section>
        </div>

        <footer className="pvp-lobby__footer"><span>Tu rating visible es el nivel real de Chess Studio, no una progresión PvP paralela.</span><button type="button" className="text-action" onClick={() => refresh()} disabled={loading || Boolean(busyKey)}>Actualizar</button></footer>
      </section>
    </div>
  );
}
