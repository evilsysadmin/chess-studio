import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pvpApi } from '../pvpApi.js';
import { opponentForMatch } from '../pvpGameModel.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import './PvPLobbyModal.css';

const EMPTY_LOBBY = Object.freeze({ roster: [], challenges: [], messages: [], activeMatch: null, pollAfterMs: 3000 });

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

export function shouldMarkPvpChatRead(chatOpen, messages) {
  return Boolean(chatOpen) && Array.isArray(messages) && messages.length > 0;
}

export function pvpChatRelativeTimeLabel(value, nowMs = Date.now()) {
  const stamp = Date.parse(value || '');
  if (!Number.isFinite(stamp)) return '';
  const seconds = Math.max(0, Math.floor((Number(nowMs) - stamp) / 1000));
  if (seconds < 45) return 'ahora';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
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
  onMarkChatRead = null,
}) {
  useEscapeToClose(onClose);
  const [lobby, setLobby] = useState(EMPTY_LOBBY);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [messageText, setMessageText] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [error, setError] = useState('');
  const lobbyRef = useRef(null);
  const externallyDriven = Boolean(lobbySnapshot && onRefreshRoster);
  const liveLobby = lobbySnapshot || lobby;
  const self = useMemo(() => liveLobby.roster.find((row) => row.isSelf) || null, [liveLobby.roster]);
  const roster = useMemo(() => sortedRoster(liveLobby.roster), [liveLobby.roster]);
  const rivals = useMemo(() => roster.filter((row) => !row.isSelf), [roster]);
  const incoming = useMemo(() => liveLobby.challenges.filter((row) => row.direction === 'incoming' && row.status === 'pending'), [liveLobby.challenges]);
  const outgoing = useMemo(() => liveLobby.challenges.filter((row) => row.direction === 'outgoing' && row.status === 'pending'), [liveLobby.challenges]);
  const opponent = opponentForMatch(liveLobby.activeMatch);
  const messages = Array.isArray(liveLobby.messages) ? liveLobby.messages : [];
  useEffect(() => {
    const node = lobbyRef.current;
    if (!node) return;
    // Mobile browsers can restore the scroll position of a modal-like overflow
    // container when it is reopened. The command table must always reopen at
    // its heading, never halfway through a previous session.
    node.scrollTop = 0;
  }, []);

  useEffect(() => {
    if (shouldMarkPvpChatRead(chatOpen, messages)) onMarkChatRead?.(messages);
  }, [chatOpen, messages, onMarkChatRead]);

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
      void refresh({ quiet: false });
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

  async function challengePlayer(username) {
    await run(`challenge:${username}`, async () => {
      if (!self) {
        if (onJoinRoster) await onJoinRoster();
        else await pvpApi.joinRoster();
      }
      return onChallenge ? onChallenge(username) : pvpApi.challenge(username);
    });
  }

  async function sendMessage(event) {
    event.preventDefault();
    const text = messageText.trim();
    if (!text || busyKey) return;
    const result = await run('chat', () => pvpApi.sendLobbyMessage(text));
    if (result) setMessageText('');
  }

  function mentionPlayer(username) {
    const mention = `@${username} `;
    setChatOpen(true);
    setMessageText((current) => current.startsWith(mention) ? current : `${mention}${current}`.slice(0, 240));
  }

  const rivalCount = rivals.length;
  const challengeCount = incoming.length + outgoing.length;

  return (
    <div className="modal-backdrop pvp-lobby-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={lobbyRef} className="pvp-lobby pvp-duel-hall" role="dialog" aria-modal="true" aria-label="Duelo 1 contra 1 · War Room">
        <button type="button" className="piece-info-close" onClick={onClose} aria-label={self ? 'Cerrar ventana; seguirás disponible para retos' : 'Cerrar ventana de rivales'} title={self ? 'Cerrar · seguirás disponible' : 'Cerrar'}>×</button>

        <header className="pvp-lobby__header">
          <div className="pvp-lobby__header-copy">
            <span className="eyebrow">Castillo · Sala de Duelos</span>
            <div className="pvp-duel-hall__title-row">
              <span className="pvp-duel-hall__crest" aria-hidden="true">⚔</span>
              <h2>Sala de Duelos</h2>
            </div>
            <p>Elige rival o atiende un reto. Cuando el duelo quede concertado, la War Room te espera.</p>
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
              <small>{self ? 'TU PUESTO · DISPONIBLE' : 'TU PUESTO'}</small>
              <strong>{self ? `${self.username} · ${self.rating} Elo` : 'No estás recibiendo retos'}</strong>
              <span>{self ? 'Puedes cerrar la sala y seguir disponible.' : 'Retar a alguien te hará visible automáticamente.'}</span>
            </div>
          </div>
          {self ? (
            <div className="pvp-lobby__identity-actions">
              <button type="button" className="secondary-btn pvp-lobby__minimize-cta" onClick={onClose}>
                <span aria-hidden="true">—</span>
                Cerrar y seguir disponible
              </button>
              <button type="button" className="text-action pvp-lobby__leave" disabled={Boolean(busyKey) || Boolean(liveLobby.activeMatch)} onClick={() => run('leave', () => onLeaveRoster ? onLeaveRoster() : pvpApi.leaveRoster(), { refreshAfter: false })}>{busyKey === 'leave' ? 'Saliendo…' : 'Dejar de estar disponible'}</button>
            </div>
          ) : (
            <button type="button" className="primary-btn pvp-lobby__join" disabled={Boolean(busyKey) || Boolean(liveLobby.activeMatch)} onClick={() => run('join', () => onJoinRoster ? onJoinRoster() : pvpApi.joinRoster())}>{busyKey === 'join' ? 'Activando…' : 'Recibir retos'}</button>
          )}
        </section>

        {error && <p className="pvp-lobby__error" role="alert">{error}</p>}

        <div className={`pvp-lobby__grid${challengeCount > 0 ? ' has-challenges' : ''}`}>
          <section className={`pvp-lobby__panel pvp-lobby__panel--roster${rivalCount === 0 ? ' is-empty' : ''}`} aria-labelledby="pvp-roster-title">
            <header>
              <div>
                <small>TABLÓN DE RIVALES</small>
                <h3 id="pvp-roster-title">¿A quién retas?</h3>
                <p>Elige rival y pulsa Retar. El historial contra ti aparece en su fila.</p>
              </div>
              <span>{rivalCount} rival{rivalCount === 1 ? '' : 'es'}</span>
            </header>
            {loading ? <p className="pvp-lobby__empty" role="status">Consultando la sala…</p> : roster.length === 0 ? (
              <div className="pvp-lobby__empty-state">
                <span aria-hidden="true">♟</span>
                <div><strong>Nadie disponible aún</strong><p>{self ? 'Puedes cerrar: seguirás visible y te avisaremos si alguien te reta.' : 'Cuando aparezca otro jugador podrás retarlo directamente.'}</p></div>
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
                      <article
                        key={row.username}
                        className={`pvp-lobby__player${pending ? ' is-pending' : ''}${coolingDown ? ' is-cooldown' : ''}`}
                      >
                        <span className="pvp-lobby__rank-mark" aria-hidden="true"><i />♟</span>
                        <div className="pvp-lobby__player-copy">
                          <button type="button" className="pvp-lobby__mention-player" onClick={(event) => { event.stopPropagation(); mentionPlayer(row.username); }} title={`Mencionar a ${row.username} en el chat`}>{row.username}</button>
                          <span>{row.tier}</span>
                          {row.headToHead?.games > 0 && <small className="pvp-lobby__head-to-head">{pvpHeadToHeadLabel(row.headToHead)}</small>}
                          {coolingDown && <small className="pvp-lobby__cooldown-note">{cooldownLabel}</small>}
                        </div>
                        <div className="pvp-lobby__player-state"><i aria-hidden="true" /><span>{rowState}</span></div>
                        <div className="pvp-lobby__player-rating"><small>ELO 1V1</small><b>{row.rating}</b></div>
                        <button
                          type="button"
                          className="secondary-btn pvp-lobby__challenge-cta"
                          disabled={Boolean(pending) || coolingDown || Boolean(busyKey) || Boolean(liveLobby.activeMatch)}
                          title={coolingDown ? cooldownLabel : undefined}
                          aria-label={pending
                            ? `Reto enviado a ${row.username}`
                            : coolingDown
                              ? `Espera para retar a ${row.username}. ${cooldownLabel}`
                              : `Retar a ${row.username}`}
                          onClick={(event) => { event.stopPropagation(); void challengePlayer(row.username); }}
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

          <div className="pvp-lobby__side">
          <section className={`pvp-lobby__panel pvp-lobby__panel--challenges${challengeCount === 0 ? ' is-empty' : ' has-attention'}`} aria-labelledby="pvp-challenges-title">
            <header>
              <div>
                <small>MESA DEL HERALDO</small>
                <h3 id="pvp-challenges-title">Retos</h3>
                <p>Acepta, declina o cancela sin salir de la sala.</p>
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
                    <span className="pvp-lobby__challenge-seal" aria-hidden="true">✦</span>
                    <div><small>RETO ENTRANTE</small><strong>{challenge.challenger}</strong><span>{challenge.challengerRating} Elo 1v1{challenge.expiresAt ? ` · ${challengeExpiryLabel(challenge.expiresAt)}` : ''}</span></div>
                    <div className="pvp-lobby__challenge-actions"><button type="button" className="primary-btn" disabled={Boolean(busyKey)} onClick={() => accept(challenge)}>Aceptar</button><button type="button" className="secondary-btn" disabled={Boolean(busyKey)} onClick={() => run(`decline:${challenge.id}`, () => onDeclineChallenge ? onDeclineChallenge(challenge) : pvpApi.declineChallenge(challenge.id))}>Declinar</button></div>
                  </article>
                ))}
                {outgoing.map((challenge) => (
                  <article key={challenge.id} className="pvp-lobby__challenge">
                    <span className="pvp-lobby__challenge-seal is-outgoing" aria-hidden="true">✧</span>
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

          <details
            className="pvp-lobby__chat-disclosure"
            open={chatOpen}
            onToggle={(event) => setChatOpen(event.currentTarget.open)}
          >
            <summary>
              <span><small>MURMULLOS DE LA SALA</small><strong>Conversación</strong></span>
              <b>{messages.length}</b>
              <i aria-hidden="true">{chatOpen ? '▴' : '▾'}</i>
            </summary>
            <section className="pvp-lobby__panel pvp-lobby__panel--chat" aria-label="Conversación de la Sala de Duelos">
              <div className="pvp-lobby__chat-log" role="log" aria-live="polite" aria-relevant="additions">
                {messages.length === 0 ? (
                  <p className="pvp-lobby__chat-empty">La sala está tranquila.</p>
                ) : messages.map((message) => {
                  const system = message.kind === 'system';
                  return (
                    <article key={message.id} className={`pvp-lobby__chat-message${message.isSelf ? ' is-self' : ''}${system ? ' is-system' : ''}`}>
                      {!system && <strong>{message.username}</strong>}
                      <span>{message.text}</span>
                      <time dateTime={message.createdAt || undefined}>{pvpChatRelativeTimeLabel(message.createdAt)}</time>
                    </article>
                  );
                })}
              </div>
              <form className="pvp-lobby__chat-compose" onSubmit={sendMessage}>
                <input
                  type="text"
                  value={messageText}
                  maxLength={240}
                  onChange={(event) => setMessageText(event.target.value)}
                  placeholder="Comenta algo…"
                  aria-label="Mensaje para el chat del lobby"
                  disabled={busyKey === 'chat'}
                />
                <button type="submit" className="secondary-btn" disabled={!messageText.trim() || Boolean(busyKey)}>
                  {busyKey === 'chat' ? 'Enviando…' : 'Enviar'}
                </button>
              </form>
            </section>
          </details>
          </div>
        </div>

        <footer className="pvp-lobby__footer">
          <span>Elo 1v1 competitivo · validado por servidor · independiente del nivel contra Matthias.</span>
          <button type="button" className="secondary-btn pvp-lobby__refresh" onClick={() => refresh()} disabled={loading || Boolean(busyKey)}><span aria-hidden="true">↻</span>{loading ? 'Actualizando…' : 'Actualizar sala'}</button>
        </footer>
      </section>
    </div>
  );
}