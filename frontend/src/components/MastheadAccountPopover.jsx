// Body of the masthead account menu, loaded only when the crest opens.
export default function MastheadAccountPopover({
  onClose,
  onAccount,
  onProgress,
  onSettings,
  onAdmin = null,
  onLogout,
  loggingOut = false,
  withNewsAndFeedback = false,
  hasNews = false,
  onReleaseNotes,
  onFeedback,
}) {
  const run = (action) => () => { onClose(); action(); };
  return (
    <div className="masthead-account-popover" role="menu" aria-label="Cuenta">
      <button type="button" role="menuitem" onClick={onAccount}>
        <span aria-hidden="true">♙</span><span><b>Mi cuenta</b><small>Perfil y preferencias</small></span>
      </button>
      {onAdmin && (
        <button type="button" role="menuitem" className="masthead-account-menu-admin" onClick={run(onAdmin)}>
          <span aria-hidden="true">◉</span><span><b>Administración</b><small>Usuarios y operación</small></span>
        </button>
      )}
      <button type="button" role="menuitem" onClick={run(onProgress)}>
        <span aria-hidden="true">◫</span><span><b>Mi progreso</b><small>Diagnóstico y siguiente mejora</small></span>
      </button>
      <button type="button" role="menuitem" onClick={onSettings}>
        <span aria-hidden="true">⚙</span><span><b>Personalizar</b><small>Tablero, piezas y sonido</small></span>
      </button>
      {withNewsAndFeedback && (
        <>
          <div className="masthead-account-menu-separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className={`masthead-account-menu-news${hasNews ? ' is-new' : ''}`}
            onClick={run(onReleaseNotes)}
            aria-label={hasNews ? 'Abrir novedades nuevas' : 'Abrir novedades'}
          >
            <span aria-hidden="true">✦</span><span><b>Novedades{hasNews ? ' · Nuevo' : ''}</b><small>Lo último del castillo</small></span>
          </button>
          <button type="button" role="menuitem" onClick={run(onFeedback)} aria-label="Enviar feedback">
            <span aria-hidden="true">✎</span><span><b>Feedback</b><small>Cuéntanos qué mejorar</small></span>
          </button>
        </>
      )}
      <div className="masthead-account-menu-separator" role="separator" />
      <button type="button" role="menuitem" className="masthead-account-menu-logout" onClick={run(onLogout)} disabled={loggingOut}>
        <span aria-hidden="true">↪</span><span><b>{loggingOut ? 'Guardando…' : 'Cerrar sesión'}</b><small>Guarda antes de salir</small></span>
      </button>
    </div>
  );
}
