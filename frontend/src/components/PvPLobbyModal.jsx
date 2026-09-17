import { useEffect } from 'react';
import { opponentForMatch } from '../pvpGameModel.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import './PvPLobbyModal.css';

export default function PvPLobbyModal({ pvp, onClose, onMatchReady }) {
  useEscapeToClose(onClose);
  const lobby = pvp?.lobby || { roster: [], challenges: [], activeMatch: null };
  const roster = pvp?.roster || [];
  const self = pvp?.self || null;
  const incoming = pvp?.incoming || [];
  const outgoing = pvp?.outgoing || [];
  const rivalCount = pvp?.rivalCount || 0;
  const loading = Boolean(pvp?.loading);
  const busyKey = pvp?.busyKey || '';
  const error = pvp?.error || '';
  const opponent = opponentForMatch(lobby.activeMatch);
  const challengeCount = incoming.length + outgoing.length;

  useEffect(() => {
    void pvp?.refresh?.({ quiet: false, heartbeat: Boolean(pvp?.enrolled) });
  }, []);

  async function accept(challenge) {
    const result = await pvp?.acceptChallenge?.(challenge.id);
    if (result?.match) onMatchReady(result.match);
  }

  return (
    <div className="modal-backdrop pvp-lobby-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="pvp-lobby" role="dialog" aria-modal="true" aria-label="Duelo 1 contra 1 · War Room">
        <button type="button" className="piece-info-close" onClick={onClose} aria-label="Cerrar">×</button>

        <header className="pvp-lobby__header">
          <div className="pvp-lobby__header-copy">
            <span className="eyebrow">War Room · humano contra humano</span>
            <h2>Roster de duelo</h2>
            <p>Enrólate una vez y sigue jugando a lo que quieras. Mientras estés disponible, los retos te encontrarán.</p>
          </div>
          <div className="pvp-lobby__seal" aria-hidden="true">
            <span>1 VS 1</span><strong>WAR ROOM</strong><small>DUELO ONLINE</small>
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
              <strong>{self ? 'Disponible mientras juegas otros modos' : 'Entra para jugar 1 contra 1'}</strong>
              <span>{self ? `${self.username} · los retos aparecerán como aviso global` : 'Te enrolas y puedes cerrar esta ventana; no hace falta esperar aquí.'}</span>
            </div>
          </div>
          {self && (
            <div className="pvp-lobby__identity-rating" aria-label={`${self.rating} de rating, ${self.tier}`}>
              <small>RATING</small><strong>{self.rating}</strong><span>{self.tier}</span>
            </div>
          )}
          {self ? (
            <button type="button" className="text-action pvp-lobby__leave" disabled={Boolean(busyKey) || Boolean(lobby.activeMatch)} onClick={() => void pvp.leave()}>{busyKey === 'leave' ? 'Saliendo…' : 'Dejar de estar disponible'}</button>
          ) : (
            <button type="button" className="primary-btn pvp-lobby__join" disabled={Boolean(busyKey) || Boolean(lobby.activeMatch)} onClick={() => void pvp.enroll()}>{busyKey === 'join' ? 'Entrando…' : 'Entrar al roster'}</button>
          )}
        </section>

        {error && <p className="pvp-lobby__error" role="alert">{error}</p>}

        <div className="pvp-lobby__grid">
          <section className="pvp-lobby__panel pvp-lobby__panel--roster" aria-labelledby="pvp-roster-title">
            <header>
              <div><small>OFICIALES PRESENTES</small><h3 id="pvp-roster-title">Roster</h3><p>Jugadores disponibles ahora.</p></div>
              <span>{rivalCount} rival{rivalCount === 1 ? '' : 'es'}</span>
            </header>
            {loading ? <p className="pvp-lobby__empty" role="status">Consultando la sala…</p> : roster.length === 0 ? (
              <div className="pvp-lobby__empty-state"><span aria-hidden="true">♟</span><div><strong>La sala está vacía</strong><p>Entra al roster y sigue con tu vida ajedrecística; te avisaremos si aparece alguien.</p></div></div>
            ) : (
              <>
                <div className="pvp-lobby__roster-list">
                  {roster.map((row) => {
                    const pending = outgoing.find((item) => item.opponent === row.username);
                    return (
                      <article key={row.username} className={`pvp-lobby__player${row.isSelf ? ' is-self' : ''}`}>
                        <span className="pvp-lobby__rank-mark" aria-hidden="true"><i />♟</span>
                        <div className="pvp-lobby__player-copy"><strong>{row.username}{row.isSelf && <em>tú</em>}</strong><span>{row.tier}{row.isSelf ? ' · disponible en segundo plano' : ' · listo para duelo'}</span></div>
                        <div className="pvp-lobby__player-rating"><small>RATING</small><b>{row.rating}</b></div>
                        {!row.isSelf && <button type="button" className="secondary-btn" disabled={!self || Boolean(pending) || Boolean(busyKey) || Boolean(lobby.activeMatch)} onClick={() => void pvp.challenge(row.username)}>{pending ? 'Reto enviado' : busyKey === `challenge:${row.username}` ? 'Retando…' : 'Retar'}</button>}
                      </article>
                    );
                  })}
                </div>
                {self && rivalCount === 0 && <div className="pvp-lobby__quiet-note"><span aria-hidden="true">◇</span><div><strong>De momento, sólo tú.</strong><p>Cierra esta ventana y juega otra cosa. Tu disponibilidad sigue activa.</p></div></div>}
              </>
            )}
          </section>

          <section className="pvp-lobby__panel pvp-lobby__panel--challenges" aria-labelledby="pvp-challenges-title">
            <header><div><small>DESPACHO DE RETOS</small><h3 id="pvp-challenges-title">Retos</h3><p>Entrantes y desafíos enviados.</p></div><span>{challengeCount}</span></header>
            {challengeCount === 0 ? (
              <div className="pvp-lobby__empty-state pvp-lobby__empty-state--dispatch"><span aria-hidden="true">✦</span><div><strong>Sin retos pendientes</strong><p>{self ? 'Puedes irte de aquí: un reto nuevo aparecerá como aviso global.' : 'Entra al roster para poder recibir desafíos.'}</p></div></div>
            ) : (
              <div className="pvp-lobby__challenge-list">
                {incoming.map((challenge) => (
                  <article key={challenge.id} className="pvp-lobby__challenge is-incoming">
                    <div><small>TE RETA</small><strong>{challenge.challenger}</strong><span>{challenge.challengerRating} rating</span></div>
                    <div className="pvp-lobby__challenge-actions"><button type="button" className="primary-btn" disabled={Boolean(busyKey)} onClick={() => void accept(challenge)}>Aceptar</button><button type="button" className="secondary-btn" disabled={Boolean(busyKey)} onClick={() => void pvp.declineChallenge(challenge.id)}>Declinar</button></div>
                  </article>
                ))}
                {outgoing.map((challenge) => <article key={challenge.id} className="pvp-lobby__challenge"><div><small>RETO ENVIADO</small><strong>{challenge.opponent}</strong><span>{challenge.opponentRating} rating · esperando respuesta</span></div></article>)}
              </div>
            )}
          </section>
        </div>

        <footer className="pvp-lobby__footer">
          <span>Disponible significa disponible en toda la app; no necesitas dejar el roster abierto.</span>
          <button type="button" className="secondary-btn pvp-lobby__refresh" onClick={() => void pvp.refresh({ quiet: false, heartbeat: Boolean(pvp.enrolled) })} disabled={loading || Boolean(busyKey)}><span aria-hidden="true">↻</span>{loading ? 'Actualizando…' : 'Actualizar sala'}</button>
        </footer>
      </section>
    </div>
  );
}
