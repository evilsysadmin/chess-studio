import { useCallback, useEffect, useMemo, useState } from 'react';
import { pvpApi } from '../pvpApi.js';
import { opponentForMatch } from '../pvpGameModel.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import './PvPLobbyModal.css';

const EMPTY_LOBBY = Object.freeze({ roster: [], challenges: [], activeMatch: null, pollAfterMs: 3000 });

function challengeExpiryLabel(value) {
  const stamp = Date.parse(value || '');
  if (!Number.isFinite(stamp)) return '';
  const time = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(stamp));
  return `caduca ${time}`;
}

export function pvpChallengeCooldownLabel(value) {
  const stamp = Date.parse(value || '');
  if (!Number.isFinite(stamp)) return '';
  const time = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(stamp));
  return `PAUSA · hasta ${time}`;
}


export function pvpHeadToHeadLabel(record) {
  const games = Number(record?.games || 0);
  if (games <= 0) return '';
  return `VS TI · ${Number(record?.wins || 0)}V ${Number(record?.draws || 0)}T ${Number(record?.losses || 0)}D`;
}

function sortedRoster(rows) {
  return [...(rows || [])].sort((a, b) => {
    if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
    return (Number(b.rating) || 0) - (Number(a.rating) || 0) || String(a.username).localeCompare(String(b.username));
  });
}

export default function PvPLobbyModal({
  onClose,
  onMatchReady,
  lobbySnapshot = null,
  onRefreshRoster = null,
  onJoinRoster = null,
  onLeaveRoster = null,
  onChallenge = null,
  onCancelChallenge = null,
  onAcceptChallenge = null,
  onDeclineChallenge = null,
}) {
  useEscapeToClose(onClose);
  const [lobby, setLobby] = useState(EMPTY_LOBBY);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');
  const externallyDriven = Boolean(lobbySnapshot && onRefreshRoster);
  const liveLobby = lobbySnapshot || lobby;
  const self = useMemo(() => liveLobby.roster.find((row) => row.isSelf) || null, [liveLobby.roster]);
  const roster = useMemo(() => sortedRoster(liveLobby.roster), [liveLobby.roster]);
  const rivals = useMemo(() => roster.filter((row) => !row.isSelf), [roster]);
  const incoming = useMemo(() => liveLobby.challenges.filter((row) => row.direction === 'incoming' && row.status === 'pending'), [liveLobby.challenges]);
  const outgoing = useMemo(() => liveLobby.challenges.filter((row) => row.direction === 'outgoing' && row.status === 'pending'), [liveLobby.challenges]);
  const opponent = opponentForMatch(liveLobby.activeMatch);

  const refresh = useCallback(async ({ quiet = false, signal } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const next = externallyDriven
        ? await onRefreshRoster({ signal })
        : await pvpApi.getLobby({ signal });
      if (!externallyDriven) setLobby({ ...EMPTY_LOBBY, ...(next || {}) });
      setError('');
      return next;
    } catch (err) {
      if (err?.name !== 'AbortError') setError(err?.message || 'No se pudo actualizar la sala de duelo.');
      return null;
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [externallyDriven, onRefreshRoster]);

  useEffect(() => {
    if (externallyDriven) {
      setLoading(false);
      return undefined;
    }
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
  }, [externallyDriven, refresh]);

  const run = useCallback(async (key, action, { refreshAfter = true } = {}) => {
    if (busyKey) return null;
    setBusyKey(key);
    setError('');
    try {
      const result = await action();
      if (key === 'leave') setLobby(EMPTY_LOBBY);
      if (refreshAfter) await refresh({ quiet: true });
      return result;
    } catch (err) {
      setError(err?.message || 'La orden no pudo completarse.');
      return null;
    } finally {
      setBusyKey('');
    }
  }, [busyKey, refresh]);

  async function accept(challenge) {
    const result = await run(`accept:${challenge.id}`, () => onAcceptChallenge ? onAcceptChallenge(challenge) : pvpApi.acceptChallenge(challenge.id));
    if (result?.match) onMatchReady(result.match);
  }

  const rivalCount = rivals.length;
  const challengeCount = incoming.length + outgoing.length;

  return (
    <div className="modal-backdrop pvp-lobby-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="pvp-lobby" role="dialog" aria-modal="true" aria-label="Duelo 1 contra 1 · War Room">
        <button type="button" className="piece-info-close" onClick={onClose} aria-label={self ? 'Cerrar ventana; seguirás disponible para retos' : 'Cerrar ventana de rivales'} title={self ? 'Cerrar · seguirás disponible' : 'Cerrar'}>×</button>

        <header className="pvp-lobby__header">
          <div className="pvp-lobby__header-copy">
            <span className="eyebrow">War Room · duelos entre jugadores</span>
            <h2>Elige rival</h2>
            <p>Ponte disponible, elige a alguien y pulsa Retar. Puedes cerrar esta ventana: seguirás visible y los desafíos llegarán como aviso global.</p>
          </div>
          <div className="pvp-lobby__header-status" aria-hidden="true">
            <span className={`pvp-lobby__availability${self ? ' is-live' : ''}`}>
              <i />
              {self ? 'Disponible' : 'No disponible'}
            </span>
            <span className="pvp-lobby__metric">
              <b>{rivalCount}</b>
              <small>rivales</small>
            </span>
            <span className={`pvp-lobby__metric${challengeCount > 0 ? ' has-attention' : ''}`}>
              <b>{challengeCount}</b>
              <small>retos</small>
            </span>
          </div>
        </header>

        {!liveLobby.activeMatch && (
          <ol className="pvp-lobby__flow" aria-label="Cómo jugar 1 contra 1">
            <li className={self ? 'is-done' : 'is-current'}>
              <b aria-hidden="true">1</b>
              <span><strong>Ponte disponible</strong><small>{self ? 'Ya estás visible' : 'Activa tu ficha'}</small></span>
            </li>
            <li className={!self ? '' : rivalCount > 0 ? 'is-done' : 'is-current'}>
              <b aria-hidden="true">2</b>
              <span><strong>Elige rival</strong><small>{rivalCount > 0 ? `${rivalCount} ahora mismo` : 'Aparecerán aquí'}</small></span>
            </li>
            <li className={self && rivalCount > 0 ? 'is-current' : ''}>
              <b aria-hidden="true">3</b>
              <span><strong>Pulsa Retar</strong><small>El rival decide si acepta</small></span>
            </li>
          </ol>
        )}

        {liveLobby.activeMatch && opponent && (
          <aside className="pvp-lobby__active" aria-label="Partida 1 contra 1 activa">
            <span className="pvp-lobby__signal" aria-hidden="true" />
            <div className="pvp-lobby__active-copy">
              <small>PARTIDA ACTIVA</small>
              <strong>{opponent.username} · {opponent.rating}</strong>
              <span>{liveLobby.activeMatch.yourTurn ? 'Tu turno' : `Turno de ${opponent.username}`}</span>
            </div>
            <button type="button" className="primary-btn" onClick={() => onMatchReady(liveLobby.activeMatch)}>Entrar en War Room</button>
          </aside>
        )}

        <section className={`pvp-lobby__identity${self ? ' is-active' : ' is-idle'}`} aria-label="Tu disponibilidad para 1 contra 1">
          <div className="pvp-lobby__identity-main">
            <span className={`pvp-lobby__presence${self ? ' is-on' : ''}`} aria-hidden="true" />
            <span className="pvp-lobby__identity-mark" aria-hidden="true">♟</span>
            <div>
              <small>{self ? 'DISPONIBLE PARA RETOS' : 'NO DISPONIBLE'}</small>
              <strong>{self ? self.username : 'Activa tu ficha para jugar 1 contra 1'}</strong>
              <span>{self ? 'Visible para otros jugadores · puedes cerrar y seguir jugando' : 'Cuando estés disponible podrás retar y recibir desafíos.'}</span>
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
            <div className="pvp-lobby__identity-actions">
              <button type="button" className="secondary-btn pvp-lobby__minimize-cta" onClick={onClose}>
                <span aria-hidden="true">—</span>
                Cerrar y seguir disponible
              </button>
              <button type="button" className="text-action pvp-lobby__leave" disabled={Boolean(busyKey) || Boolean(liveLobby.activeMatch)} onClick={() => run('leave', () => onLeaveRoster ? onLeaveRoster() : pvpApi.leaveRoster(), { refreshAfter: false })}>{busyKey === 'leave' ? 'Saliendo…' : 'Dejar de estar disponible'}</button>
            </div>
          ) : (
            <button type="button" className="primary-btn pvp-lobby__join" disabled={Boolean(busyKey) || Boolean(liveLobby.activeMatch)} onClick={() => run('join', () => onJoinRoster ? onJoinRoster() : pvpApi.joinRoster())}>{busyKey === 'join' ? 'Activando…' : 'Ponerme disponible'}</button>
          )}
        </section>

        {error && <p className="pvp-lobby__error" role="alert">{error}</p>}

        <div className="pvp-lobby__grid">
          <section className={`pvp-lobby__panel pvp-lobby__panel--roster${rivalCount === 0 ? ' is-empty' : ''}`} aria-labelledby="pvp-roster-title">
            <header>
              <div>
                <small>RIVALES EN LÍNEA</small>
                <h3 id="pvp-roster-title">Elige a quién retar</h3>
                <p>Pulsa Retar junto al jugador que quieras desafiar.</p>
              </div>
              <span>{rivalCount} rival{rivalCount === 1 ? '' : 'es'}</span>
            </header>
            {loading ? <p className="pvp-lobby__empty" role="status">Consultando la sala…</p> : roster.length === 0 ? (
              <div className="pvp-lobby__empty-state">
                <span aria-hidden="true">♟</span>
                <div><strong>Nadie disponible aún</strong><p>{self ? 'Puedes cerrar: seguirás visible y te avisaremos si alguien te reta.' : 'Ponte disponible para aparecer aquí cuando llegue otro jugador.'}</p></div>
              </div>
            ) : (
              <>
                <div className="pvp-lobby__roster-list">
                  {rivals.map((row) => {
                    const pending = outgoing.find((item) => item.opponent === row.username);
                    const cooldownLabel = pvpChallengeCooldownLabel(row.challengeCooldownUntil);
                    const coolingDown = Boolean(cooldownLabel);
                    const rowState = pending ? 'RETO ENVIADO' : coolingDown ? 'PAUSA' : 'DISPONIBLE';
                    return (
                      <article key={row.username} className={`pvp-lobby__player${pending ? ' is-pending' : ''}${coolingDown ? ' is-cooldown' : ''}`}>
                        <span className="pvp-lobby__rank-mark" aria-hidden="true"><i />♟</span>
                        <div className="pvp-lobby__player-copy">
                          <strong>{row.username}</strong>
                          <span>{row.tier}</span>
                          {row.headToHead?.games > 0 && <small className="pvp-lobby__head-to-head">{pvpHeadToHeadLabel(row.headToHead)}</small>}
                          {coolingDown && <small className="pvp-lobby__cooldown-note">{cooldownLabel}</small>}
                        </div>
                        <div className="pvp-lobby__player-state"><i aria-hidden="true" /><span>{rowState}</span></div>
                        <div className="pvp-lobby__player-rating"><small>ELO 1V1</small><b>{row.rating}</b></div>
                        <button
                          type="button"
                          className="secondary-btn pvp-lobby__challenge-cta"
                          disabled={!self || Boolean(pending) || coolingDown || Boolean(busyKey) || Boolean(liveLobby.activeMatch)}
                          title={coolingDown ? cooldownLabel : undefined}
                          aria-label={coolingDown ? `Espera para retar a ${row.username}. ${cooldownLabel}` : undefined}
                          onClick={() => run(`challenge:${row.username}`, () => onChallenge ? onChallenge(row.username) : pvpApi.challenge(row.username))}
                        >
                          {pending ? 'En espera' : coolingDown ? 'Espera' : busyKey === `challenge:${row.username}` ? 'Retando…' : 'Retar'}
                        </button>
                      </article>
                    );
                  })}
                </div>
                {self && rivalCount === 0 && (
                  <div className="pvp-lobby__quiet-note">
                    <span aria-hidden="true">◇</span>
                    <div><strong>Estás disponible.</strong><p>Cierra la ventana y sigue jugando. Cuando aparezca un rival podrás retarlo desde aquí; si te reta él primero, Chess Studio te avisará estés donde estés.</p></div>
                  </div>
                )}
              </>
            )}
          </section>

          <section className={`pvp-lobby__panel pvp-lobby__panel--challenges${challengeCount === 0 ? ' is-empty' : ' has-attention'}`} aria-labelledby="pvp-challenges-title">
            <header>
              <div>
                <small>DESPACHO DE RETOS</small>
                <h3 id="pvp-challenges-title">Retos</h3>
                <p>Órdenes que requieren tu atención.</p>
              </div>
              <span>{challengeCount}</span>
            </header>
            {challengeCount === 0 ? (
              <div className="pvp-lobby__empty-state pvp-lobby__empty-state--dispatch">
                <span aria-hidden="true">✦</span>
                <div>
                  <strong>Sin retos pendientes</strong>
                  <p>{self ? 'Cuando alguien te rete, la orden aparecerá aquí.' : 'Ponte disponible para poder recibir desafíos.'}</p>
                </div>
              </div>
            ) : (
              <div className="pvp-lobby__challenge-list">
                {incoming.map((challenge) => (
                  <article key={challenge.id} className="pvp-lobby__challenge is-incoming">
                    <div><small>RETO ENTRANTE</small><strong>{challenge.challenger}</strong><span>{challenge.challengerRating} Elo 1v1{challenge.expiresAt ? ` · ${challengeExpiryLabel(challenge.expiresAt)}` : ''}</span></div>
                    <div className="pvp-lobby__challenge-actions"><button type="button" className="primary-btn" disabled={Boolean(busyKey)} onClick={() => accept(challenge)}>Aceptar</button><button type="button" className="secondary-btn" disabled={Boolean(busyKey)} onClick={() => run(`decline:${challenge.id}`, () => onDeclineChallenge ? onDeclineChallenge(challenge) : pvpApi.declineChallenge(challenge.id))}>Declinar</button></div>
                  </article>
                ))}
                {outgoing.map((challenge) => (
                  <article key={challenge.id} className="pvp-lobby__challenge">
                    <div>
                      <small>RETO ENVIADO</small>
                      <strong>{challenge.opponent}</strong>
                      <span>{challenge.opponentRating} Elo 1v1 · esperando respuesta{challenge.expiresAt ? ` · ${challengeExpiryLabel(challenge.expiresAt)}` : ''}</span>
                    </div>
                    {challenge.expiresAt && (
                      <div className="pvp-lobby__challenge-actions">
                        <button
                          type="button"
                          className="secondary-btn"
                          aria-label={`Cancelar reto a ${challenge.opponent}`}
                          disabled={Boolean(busyKey)}
                          onClick={() => run(
                            `cancel:${challenge.id}`,
                            () => onCancelChallenge ? onCancelChallenge(challenge) : pvpApi.cancelChallenge(challenge.id),
                          )}
                        >
                          {busyKey === `cancel:${challenge.id}` ? 'Cancelando…' : 'Cancelar'}
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <footer className="pvp-lobby__footer">
          <span>Elo 1v1 competitivo · validado por servidor · independiente del nivel contra Matthias.</span>
          <button type="button" className="secondary-btn pvp-lobby__refresh" onClick={() => refresh()} disabled={loading || Boolean(busyKey)}><span aria-hidden="true">↻</span>{loading ? 'Actualizando…' : 'Actualizar sala'}</button>
        </footer>
      </section>
    </div>
  );
}