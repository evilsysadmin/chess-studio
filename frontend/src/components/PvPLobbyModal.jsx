import { useCallback, useEffect, useMemo, useState } from 'react';
import { pvpApi } from '../pvpApi.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import './PvPLobbyModal.css';

const EMPTY_LOBBY = Object.freeze({ roster: [], challenges: [], activeMatch: null, pollAfterMs: 3000 });

function matchOpponent(match) {
  if (!match) return null;
  return match.youAre === 'w'
    ? { username: match.black, rating: match.blackRating, color: 'Negras' }
    : { username: match.white, rating: match.whiteRating, color: 'Blancas' };
}

function sortRoster(rows) {
  return [...(rows || [])].sort((a, b) => {
    if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
    return (Number(b.rating) || 0) - (Number(a.rating) || 0) || String(a.username).localeCompare(String(b.username));
  });
}

export default function PvPLobbyModal({ onClose, onMatchReady = null }) {
  useEscapeToClose(onClose);
  const [lobby, setLobby] = useState(EMPTY_LOBBY);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');

  const self = useMemo(() => lobby.roster?.find((row) => row.isSelf) || null, [lobby.roster]);
  const roster = useMemo(() => sortRoster(lobby.roster), [lobby.roster]);
  const incoming = useMemo(
    () => (lobby.challenges || []).filter((challenge) => challenge.direction === 'incoming' && challenge.status === 'pending'),
    [lobby.challenges],
  );
  const outgoing = useMemo(
    () => (lobby.challenges || []).filter((challenge) => challenge.direction === 'outgoing' && challenge.status === 'pending'),
    [lobby.challenges],
  );
  const activeOpponent = matchOpponent(lobby.activeMatch);

  const refresh = useCallback(async ({ quiet = false, signal } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const next = await pvpApi.getLobby({ signal });
      setLobby({ ...EMPTY_LOBBY, ...(next || {}) });
      setError('');
      return next;
    } catch (err) {
      if (err?.name !== 'AbortError') setError(err?.message || 'No se pudo actualizar la sala 1 vs 1.');
      return null;
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer = null;
    let controller = new AbortController();

    const poll = async (quiet = false) => {
      if (cancelled) return;
      if (document.visibilityState === 'hidden') {
        timer = window.setTimeout(() => poll(true), 3000);
        return;
      }
      controller.abort();
      controller = new AbortController();
      const next = await refresh({ quiet, signal: controller.signal });
      if (cancelled) return;
      const delay = Math.max(1500, Number(next?.pollAfterMs || lobby.pollAfterMs || 3000));
      timer = window.setTimeout(() => poll(true), delay);
    };

    void poll(false);
    return () => {
      cancelled = true;
      controller.abort();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [refresh]);

  const runAction = useCallback(async (key, action) => {
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

  const handleAccept = useCallback(async (challenge) => {
    const result = await runAction(`accept:${challenge.id}`, () => pvpApi.acceptChallenge(challenge.id));
    const match = result?.match;
    if (match && typeof onMatchReady === 'function') onMatchReady(match);
  }, [onMatchReady, runAction]);

  const handleEnterMatch = useCallback(() => {
    if (lobby.activeMatch && typeof onMatchReady === 'function') onMatchReady(lobby.activeMatch);
  }, [lobby.activeMatch, onMatchReady]);

  return (
    <div className="modal-backdrop pvp-lobby-backdrop" onClick={onClose}>
      <section className="pvp-lobby" role="dialog" aria-modal="true" aria-label="Duelo 1 contra 1 · War Room" onClick={(event) => event.stopPropagation()}>
        <header className="pvp-lobby__header">
          <div>
            <span className="eyebrow">War Room · humano contra humano</span>
            <h2>Roster de duelo</h2>
            <p>Apúntate, elige rival y lanza el guante. El backend arbitra posición, turno y jugadas.</p>
          </div>
          <button type="button" className="piece-info-close" onClick={onClose} aria-label="Cerrar">×</button>
        </header>

        {lobby.activeMatch && activeOpponent && (
          <aside className="pvp-lobby__active" aria-label="Partida 1 contra 1 activa">
            <span className="pvp-lobby__signal" aria-hidden="true" />
            <div>
              <small>PARTIDA ACTIVA</small>
              <strong>{activeOpponent.username} · {activeOpponent.rating}</strong>
              <span>Juegas con {activeOpponent.color.toLowerCase()} · {lobby.activeMatch.yourTurn ? 'tu turno' : 'turno rival'}</span>
            </div>
            <button type="button" className="primary-btn" disabled={!onMatchReady} onClick={handleEnterMatch}>
              Entrar en War Room
            </button>
          </aside>
        )}

        <div className="pvp-lobby__statusbar">
          <div>
            <span className={`pvp-lobby__presence${self ? ' is-on' : ''}`} aria-hidden="true" />
            <strong>{self ? 'Disponible para retos' : 'Fuera del roster'}</strong>
            {self && <small>{self.rating} · {self.tier}</small>}
          </div>
          {self ? (
            <button type="button" className="secondary-btn" disabled={Boolean(busyKey) || Boolean(lobby.activeMatch)} onClick={() => runAction('leave', () => pvpApi.leaveRoster())}>
              {busyKey === 'leave' ? 'Saliendo…' : 'Salir del roster'}
            </button>
          ) : (
            <button type="button" className="primary-btn" disabled={Boolean(busyKey) || Boolean(lobby.activeMatch)} onClick={() => runAction('join', () => pvpApi.joinRoster())}>
              {busyKey === 'join' ? 'Entrando…' : 'Entrar al roster'}
            </button>
          )}
        </div>

        {error && <p className="pvp-lobby__error" role="alert">{error}</p>}

        <div className="pvp-lobby__grid">
          <section className="pvp-lobby__panel" aria-labelledby="pvp-roster-title">
            <header>
              <div><small>OFICIALES PRESENTES</small><h3 id="pvp-roster-title">Roster</h3></div>
              <span>{Math.max(0, roster.length - (self ? 1 : 0))} rival{Math.max(0, roster.length - (self ? 1 : 0)) === 1 ? '' : 'es'}</span>
            </header>
            {loading ? (
              <p className="pvp-lobby__empty" role="status">Consultando la sala…</p>
            ) : roster.length === 0 ? (
              <p className="pvp-lobby__empty">No hay nadie apuntado todavía. Puedes ser el primer insensato.</p>
            ) : (
              <div className="pvp-lobby__roster-list">
                {roster.map((row) => {
                  const challenge = outgoing.find((item) => item.opponent === row.username);
                  const disabled = row.isSelf || !self || Boolean(challenge) || Boolean(busyKey) || Boolean(lobby.activeMatch);
                  return (
                    <article key={row.username} className={`pvp-lobby__player${row.isSelf ? ' is-self' : ''}`}>
                      <span className="pvp-lobby__rank-mark" aria-hidden="true">♟</span>
                      <div><strong>{row.username}{row.isSelf ? ' · tú' : ''}</strong><span>{row.tier}</span></div>
                      <b>{row.rating}</b>
                      {!row.isSelf && (
                        <button
                          type="button"
                          className="secondary-btn"
                          disabled={disabled}
                          onClick={() => runAction(`challenge:${row.username}`, () => pvpApi.challenge(row.username))}
                        >
                          {challenge ? 'Reto enviado' : busyKey === `challenge:${row.username}` ? 'Retando…' : 'Retar'}
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="pvp-lobby__panel pvp-lobby__challenges" aria-labelledby="pvp-challenges-title">
            <header><div><small>DESPACHO DE RETOS</small><h3 id="pvp-challenges-title">Retos</h3></div><span>{incoming.length + outgoing.length}</span></header>
            {incoming.length === 0 && outgoing.length === 0 ? (
              <p className="pvp-lobby__empty">Silencio en la sala. Nadie ha arrojado aún un guante a la cara de nadie.</p>
            ) : (
              <div className="pvp-lobby__challenge-list">
                {incoming.map((challenge) => (
                  <article key={challenge.id} className="pvp-lobby__challenge is-incoming">
                    <div><small>TE RETA</small><strong>{challenge.challenger}</strong><span>{challenge.challengerRating} rating</span></div>
                    <div className="pvp-lobby__challenge-actions">
                      <button type="button" className="primary-btn" disabled={Boolean(busyKey) || !onMatchReady} onClick={() => handleAccept(challenge)}>Aceptar</button>
                      <button type="button" className="secondary-btn" disabled={Boolean(busyKey)} onClick={() => runAction(`decline:${challenge.id}`, () => pvpApi.declineChallenge(challenge.id))}>Declinar</button>
                    </div>
                  </article>
                ))}
                {outgoing.map((challenge) => (
                  <article key={challenge.id} className="pvp-lobby__challenge is-outgoing">
                    <div><small>RETO ENVIADO</small><strong>{challenge.opponent}</strong><span>{challenge.opponentRating} rating · esperando respuesta</span></div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <footer className="pvp-lobby__footer">
          <span>El roster caduca solo si desapareces. No hay emparejamiento fantasma ni rating PvP paralelo.</span>
          <button type="button" className="text-action" onClick={() => refresh()} disabled={loading || Boolean(busyKey)}>Actualizar ahora</button>
        </footer>
      </section>
    </div>
  );
}
