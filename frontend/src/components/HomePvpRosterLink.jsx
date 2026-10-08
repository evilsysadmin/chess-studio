import './HomePvpRosterLink.css';

export default function HomePvpRosterLink({
  onOpen,
  disabled = false,
  enrolled = false,
  rivalCount = 0,
  incomingCount = 0,
  unreadMessageCount = 0,
  activeMatch = null,
  placement = 'floating',
}) {
  const active = Boolean(activeMatch);
  const challenged = Number(incomingCount) > 0;
  const hasRivals = Number(rivalCount) > 0;
  const hasUnread = Number(unreadMessageCount) > 0;
  const title = active
    ? 'Duelo activo'
    : challenged
      ? 'Reto pendiente'
      : enrolled
        ? hasRivals ? 'Rivales disponibles' : 'Esperando rival'
        : 'Jugar 1 vs 1';
  const detail = active
    ? 'Vuelve a tu partida 1 vs 1'
    : challenged
      ? 'Abre y responde al desafío'
      : enrolled
        ? hasRivals
          ? `${rivalCount} rival${rivalCount === 1 ? '' : 'es'} · abre, elige y pulsa Retar`
          : 'Sigues disponible · te avisaremos cuando aparezca alguien'
        : 'Ponte disponible, elige rival y pulsa Retar';
  const action = active
    ? 'VOLVER'
    : challenged
      ? 'RESPONDER'
      : enrolled
        ? hasRivals ? 'ELEGIR' : 'VER SALA'
        : 'ENTRAR';

  return (
    <button
      type="button"
      className={`home-pvp-roster-link${placement === 'menu' ? ' home-pvp-roster-link--menu' : ''}${enrolled ? ' is-enrolled' : ''}${active ? ' has-active-match' : ''}${challenged ? ' has-challenge' : ''}${hasRivals ? ' has-rivals' : ''}${hasUnread ? ' has-unread-chat' : ''}`}
      onClick={onOpen}
      disabled={disabled}
      aria-label="Abrir Sala de Duelos 1 contra 1"
    >
      <span className="home-pvp-roster-link__emblem" aria-hidden="true">
        <span className="home-pvp-roster-link__signal" />
        {hasUnread && <span className="home-pvp-roster-link__unread">{Math.min(9, Number(unreadMessageCount))}{Number(unreadMessageCount) > 9 ? '+' : ''}</span>}
        <span className="home-pvp-roster-link__mark">♟</span>
      </span>
      <span className="home-pvp-roster-link__copy">
        <small>SALA DE DUELOS · 1 VS 1</small>
        <strong>{title}</strong>
        <span>{detail}</span>
      </span>
      <span className="home-pvp-roster-link__action" aria-hidden="true">
        <span>{action}</span>
        <b>›</b>
      </span>
    </button>
  );
}
