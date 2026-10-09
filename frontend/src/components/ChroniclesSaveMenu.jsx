import { useState } from 'react';
import './ChroniclesSaveMenu.css';

function expeditionArea(save) {
  switch (save.currentMapId || save.entryMapId) {
    case 'swordhaven-square': return 'Swordhaven';
    case 'swordhaven-campaign': return 'Swordhaven · Campaña';
    case 'banner-road': return 'Camino de los Estandartes';
    case 'crypt-eight-squares': return 'Cripta de las Ocho Casillas';
    default: return 'Expedición en curso';
  }
}

function saveWhen(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getTime() <= 0) return 'Fecha no disponible';
  return date.toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function ChroniclesSaveMenu({
  saves = [], onNew, onNewCampaign, onLoad, onRename, onForget, onDelete, onExit,
  loading = false, error = '', busyRunId = null, onRetrySync,
}) {
  const [screen, setScreen] = useState('home');
  const [editing, setEditing] = useState(null);
  const [draftName, setDraftName] = useState('');
  const [confirmForget, setConfirmForget] = useState(null);
  const resume = saves.find((save) => save.active) || saves[0] || null;

  function openList(view) {
    setEditing(null);
    setConfirmForget(null);
    setScreen(view);
  }

  return (
    <main className="chronicles-save-menu" data-chronicles-save-menu={screen}>
      <div className="chronicles-save-menu__sky" aria-hidden="true">
        <span className="chronicles-save-menu__moon" />
        <span className="chronicles-save-menu__tower chronicles-save-menu__tower--near" />
        <span className="chronicles-save-menu__tower chronicles-save-menu__tower--far" />
      </div>
      <section className="chronicles-save-menu__panel" aria-label="Menú principal de Chronicles">
        <p className="chronicles-save-menu__kicker">EL LIBRO DE LAS EXPEDICIONES</p>
        <h1>Chronicles <span>of Matthias</span></h1>
        <p className="chronicles-save-menu__intro">
          Tu compañía te espera. Y Matthias, naturalmente, lleva la cuenta de tus decisiones cuestionables.
        </p>
        {loading && <p className="chronicles-save-menu__sync" role="status">Consultando expediciones del servidor…</p>}
        {error && (
          <div className="chronicles-save-menu__sync-recovery">
            <p className="chronicles-save-menu__sync-error" role="alert">{error}</p>
            <button type="button" onClick={onRetrySync} disabled={loading || busyRunId !== null}>
              Reintentar sincronización
            </button>
          </div>
        )}

        {screen === 'home' ? (
          <div className="chronicles-save-menu__actions">
            {onNewCampaign ? (
              <div className="chronicles-save-menu__new-choices">
                <button type="button" onClick={onNew}>Nuevo juego</button>
                <button type="button" className="is-primary" onClick={onNewCampaign}>Nueva campaña</button>
              </div>
            ) : (
              <button type="button" className="is-primary" onClick={onNew}>Nuevo juego</button>
            )}
            <button type="button" disabled={!resume || loading} onClick={() => onLoad(resume.id)}>
              Continuar partida
              {resume && <small>{resume.title} · {expeditionArea(resume)}</small>}
            </button>
            <button type="button" disabled={!saves.length || loading} onClick={() => openList('load')}>Cargar juego</button>
            <button type="button" onClick={() => openList('manage')}>Gestionar partidas</button>
            <button type="button" className="is-exit" onClick={onExit}>Volver al castillo</button>
          </div>
        ) : (
          <div className="chronicles-save-menu__browser">
            <div className="chronicles-save-menu__browser-heading">
              <h2>{screen === 'load' ? 'Cargar juego' : 'Gestionar partidas'}</h2>
              <button type="button" onClick={() => openList('home')}>← Volver</button>
            </div>
            {saves.length === 0 ? (
              <p className="chronicles-save-menu__empty">{loading ? 'Buscando expediciones…' : 'Todavía no hay expediciones guardadas.'}</p>
            ) : (
              <ol className="chronicles-save-menu__list">
                {saves.map((save) => (
                  <li key={save.id}>
                    <div className="chronicles-save-menu__save">
                      <strong>{save.title}</strong>
                      <span>{expeditionArea(save)} · {saveWhen(save.updatedAt)}</span>
                      {save.active && <em>Última partida</em>}
                      {save.remote && <em>Guardada en servidor</em>}
                    </div>
                    <div className="chronicles-save-menu__row-actions">
                      <button type="button" disabled={busyRunId !== null || loading} onClick={() => onLoad(save.id)}>Cargar</button>
                      {screen === 'manage' && (
                        <>
                          <button type="button" onClick={() => {
                            setEditing(save.id);
                            setDraftName(save.title);
                            setConfirmForget(null);
                          }}>Renombrar</button>
                          <button type="button" disabled={busyRunId !== null} onClick={() => {
                            setConfirmForget(save.id);
                            setEditing(null);
                          }}>Quitar</button>
                        </>
                      )}
                    </div>
                    {screen === 'manage' && editing === save.id && (
                      <form className="chronicles-save-menu__edit" onSubmit={(event) => {
                        event.preventDefault();
                        if (onRename(save.id, draftName)) setEditing(null);
                      }}>
                        <label htmlFor={'chronicles-save-name-' + save.id}>Nombre de la expedición</label>
                        <input id={'chronicles-save-name-' + save.id} value={draftName} maxLength={56} onChange={(event) => setDraftName(event.target.value)} />
                        <button type="submit" disabled={!draftName.trim()}>Guardar nombre</button>
                        <button type="button" onClick={() => setEditing(null)}>Cancelar</button>
                      </form>
                    )}
                    {screen === 'manage' && confirmForget === save.id && (
                      <div className="chronicles-save-menu__confirm" role="group" aria-label={'Quitar ' + save.title}>
                        <p>{save.remote
                          ? 'Se borrará definitivamente esta expedición del servidor y de todos tus dispositivos. Esta acción no se puede deshacer. La progresión de personajes se conserva aparte.'
                          : 'Se quitará la partida pendiente de este dispositivo. No existe aún un guardado remoto confirmado.'}</p>
                        <button type="button" disabled={busyRunId !== null} onClick={async () => {
                          try {
                            const completed = await (onDelete || onForget)?.(save.id, Boolean(save.remote));
                            if (completed !== false) setConfirmForget(null);
                          } catch {
                            // Parent owns the visible server error; keep confirmation open.
                          }
                        }}>{busyRunId === save.id ? 'Procesando…' : save.remote ? 'Eliminar definitivamente' : 'Quitar del dispositivo'}</button>
                        <button type="button" onClick={() => setConfirmForget(null)}>Cancelar</button>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
            <p className="chronicles-save-menu__disclaimer">
              Las partidas marcadas «Guardada en servidor» se sincronizan entre dispositivos al abrir este menú.
              Los nombres personalizados se conservan en este dispositivo.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
