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

export default function PvPLobbyModal({ onClose, onMatchReady, onJoinRoster = null, onLeaveRoster = null }) {
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
  const challengeCount = incoming.length + outgoing.length;

  return (
    <div className="modal-backdrop pvp-lobby-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="pvp-lobby" role="dialog" aria-modal="true" aria-label="Duelo 1 contra 1 · War Room">
        <button type="button" className="piece-info-close pvp-lobby__minimize" onClick={onClose} aria-label="Minimizar roster y seguir jugando" title="Minimizar y seguir jugando">−</button>\n        <button type="button" className="piece-info-close" onClick={onClose} aria-label="Cerrar ventana del roster">×</button>

        <header className="pvp-lobby__header">
          <div className="pvp-lobby__header-copy">
            <span className="eyebrow">War Room · humano contra humano</span>
            <h2>Roster de duelo</h2>
            <p>Entra en servicio y sigue jugando cualquier modo. Mientras estés enrolado, aparecerás disponible y te avisaremos si alguien te reta.</p>
          </div>
          <div className="pvp-lobby__seal" aria-hidden="true">
            <span>1 VS 1</span>
            <strong>WAR ROOM</strong>
            <small>DUELO ONLINE</small>
          </div>
        </header>

        {lobby.activeMatch && opponent && (
          <aside className="pvp-lobby__active" aria-label="Partida 1 contra 1 activa">
            <span className="pvp-lobby__signal" aria-hidden="true" />
            <div className="pvp-lobby__active-copy">
              <small>PARTIDA ACTIVA</small>
              <strong>{opponent.username} · {opponent.rating}</strong>
              <span>{lobby.activeMatch.yourTurn ? 'Tu turno' : `Turno de ${opponent.username}`}</span>
            </div>
            <button type="button" className="primary-btn" onClick={() => onMatchReady(lobby.activeMatch)}>Entrar en War Room</button>
          </aside>
        )}

        <section className={`pvp-lobby__identity${self ? ' is-active' : ''}`} aria-label="Tu estado en el roster">
          <div className="pvp-lobby__identity-main">
            <span className={`pvp-lobby__presence${self ? ' is-on' : ''}`} aria-hidden="true" />
            <span className="pvp-lobby__identity-mark" aria-hidden="true">♟</span>
            <div>
              <small>{self ? 'EN SERVICIO' : 'FUERA DEL ROSTER'}</small>
              <strong>{self ? 'Disponible para retos' : 'Entra para jugar 1 contra 1'}</strong>
              <span>{self ? `${self.username} · puedes minimizar esta sala y seguir jugando; los retos llegarán como aviso global` : 'Podrás ver rivales, retar y recibir desafíos.'}</span>
            </div>
          </div>
          {self && (
            <div className="pvp-lobby__identity-rating" aria-label={`${self.rating} de rating, ${self.tier}`}>
              <small>ELO 1V1</small>
              <strong>{self.rating}</strong>
              <span>{self.tier}</span>
            </div>
          )}
          {self ? (
            <button type="button" className="text-action pvp-lobby__leave" disabled={Boolean(busyKey) || Boolean(lobby.activeMatch)} onClick={() => run('leave', () => onLeaveRoster ? onLeaveRoster() : pvpApi.leaveRoster())}>{busyKey === 'leave' ? 'Saliendo…' : 'Salir del roster'}</button>
          ) : (
            <button type="button" className="primary-btn pvp-lobby__join" disabled={Boolean(busyKey) || Boolean(lobby.activeMatch)} onClick={() => run('join', () => onJoinRoster ? onJoinRoster() : pvpApi.joinRoster())}>{busyKey === 'join' ? 'Entrando…' : 'Entrar al roster'}</button>
          )}
        </section>

        {error && <p className="pvp-lobby__error" role="alert">{error}</p>}

        <div className="pvp-lobby__grid">
          <section className="pvp-lobby__panel pvp-lobby__panel--roster" aria-labelledby="pvp-roster-title">
            <header>
              <div>
                <small>OFICIALES PRESENTES</small>
                <h3 id="pvp-roster-title">Roster</h3>
                <p>Jugadores disponibles en esta sala.</p>
              </div>
              <span>{rivalCount} rival{rivalCount === 1 ? '' : 'es'}</span>
            </header>
            {loading ? <p className="pvp-lobby__empty" role="status">Consultando la sala…</p> : roster.length === 0 ? (
              <div className="pvp-lobby__empty-state">
                <span aria-hidden="true">♟</span>
                <div><strong>La sala está vacía</strong><p>Entra al roster para quedar visible cuando aparezca otro jugador.</p></div>
              </div>
            ) : (
              <>
                <div className="pvp-lobby__roster-list">
                  {roster.map((row) => {
                    const pending = outgoing.find((item) => item.opponent === row.username);
                    return (
                      <article key={row.username} className={`pvp-lobby__player${row.isSelf ? ' is-self' : ''}`}>
                        <span className="pvp-lobby__rank-mark" aria-hidden="true"><i />♟</span>
                        <div className="pvp-lobby__player-copy">
                          <strong>{row.username}{row.isSelf && <em>tú</em>}</strong>
                          <span>{row.tier}{row.isSelf ? ' · tu puesto en la sala' : ' · listo para duelo'}</span>
                        </div>
                        <div className="pvp-lobby__player-rating"><small>ELO 1V1</small><b>{row.rating}</b></div>
                        {!row.isSelf && <button type="button" className="secondary-btn" disabled={!self || Boolean(pending) || Boolean(busyKey) || Boolean(lobby.activeMatch)} onClick={() => run(`challenge:${row.username}`, () => pvpApi.challenge(row.username))}>{pending ? 'Reto enviado' : busyKey === `challenge:${row.username}` ? 'Retando…' : 'Retar'}</button>}
                      </article>
                    );
                  })}
                </div>
                {self && rivalCount === 0 && (
                  <div className="pvp-lobby__quiet-note">
                    <span aria-hidden="true">◇</span>
                    <div><strong>De momento, sólo tú.</strong><p>Puedes minimizar esta sala y jugar normal. Si entra alguien y te reta, Chess Studio te avisará estés donde estés.</p></div>
                  </div>
                )}
              </>
            )}
          </section>

          <section className="pvp-lobby__panel pvp-lobby__panel--challenges" aria-labelledby="pvp-challenges-title">
            <header>
              <div>
                <small>DESPACHO DE RETOS</small>
                <h3 id="pvp-challenges-title">Retos</h3>
                <p>Entrantes y desafíos enviados.</p>
              </div>
              <span>{challengeCount}</span>
            </header>
            {challengeCount === 0 ? (
              <div className="pvp-lobby__empty-state pvp-lobby__empty-state--dispatch">
                <span aria-hidden="true">✦</span>
                <div>
                  <strong>Sin retos pendientes</strong>
                  <p>{self ? 'Cuando alguien te rete, la orden aparecerá aquí.' : 'Entra al roster para poder recibir desafíos.'}</p>
                </div>
              </div>
            ) : (
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

        <footer className="pvp-lobby__footer">
          <span>El Elo 1v1 es competitivo y server-authoritative. Es independiente del nivel estimado contra Matthias.</span>
          <button type="button" className="secondary-btn pvp-lobby__refresh" onClick={() => refresh()} disabled={loading || Boolean(busyKey)}><span aria-hidden="true">↻</span>{loading ? 'Actualizando…' : 'Actualizar sala'}</button>
        </footer>
      </section>
    </div>
  );
}