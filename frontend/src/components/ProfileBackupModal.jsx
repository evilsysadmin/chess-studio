import { useRef, useState } from 'react';
import { downloadProfile, exportProfile, importProfile, pushProfileToServer } from '../profileBackup.js';
import { resetAllProgress } from '../resetProgress.js';
import { useEscapeToClose } from '../useEscapeToClose.js';

export default function ProfileBackupModal({ onClose }) {
  useEscapeToClose(onClose);
  const fileInputRef = useRef(null);
  const [importMessage, setImportMessage] = useState(null); // { text, tone }
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [resetMessage, setResetMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  function handleExport() {
    downloadProfile();
  }

  async function handleResetConfirmed() {
    const previous = exportProfile();
    setBusy(true);
    setResetMessage(null);
    try {
      resetAllProgress();
      await pushProfileToServer({ throwOnError: true });
      setConfirmingReset(false);
      setResetDone(true);
    } catch {
      // Mongo no confirmó el reset: devolvemos también la caché local a su
      // estado anterior para que cliente y servidor no queden divergentes.
      importProfile(previous, { replace: true, markDirty: true });
      setResetMessage('No se pudo guardar el reinicio en el servidor. No se ha borrado tu progreso; inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const previous = exportProfile();
      setBusy(true);
      setImportMessage(null);
      try {
        // replace=true evita mezclar un backup parcial con restos del perfil
        // actual. Después esperamos confirmación de Mongo antes de decir OK.
        const restored = importProfile(reader.result, { replace: true, markDirty: true });
        await pushProfileToServer({ throwOnError: true });
        setImportMessage({
          text: `Listo — se restauraron ${restored} sección${restored === 1 ? '' : 'es'} y el perfil quedó guardado en MongoDB. Recarga la página para verlo reflejado en todos lados.`,
          tone: 'good',
        });
      } catch (err) {
        importProfile(previous, { replace: true, markDirty: true });
        setImportMessage({
          text: err?.message?.startsWith('El archivo')
            ? err.message
            : 'No se pudo guardar el perfil importado en el servidor. Se ha conservado tu progreso anterior.',
          tone: 'bad',
        });
      } finally {
        setBusy(false);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // permite volver a elegir el mismo archivo si hace falta
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="army-card" role="dialog" aria-modal="true" aria-label="Copia de seguridad del perfil" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <button className="piece-info-close" onClick={onClose} aria-label="Cerrar">×</button>
        <h3>Exportar / importar progreso</h3>
        <p className="hint-text" style={{ marginBottom: '1rem' }}>
          Tu perfil se guarda en MongoDB y este navegador mantiene una caché de trabajo. La exportación JSON es una copia adicional que puedes guardar por tu cuenta.
        </p>

        <div className="menu-section">
          <h2>Exportar</h2>
          <p className="hint-text">Descarga una copia del perfil que está cargado ahora mismo.</p>
          <button type="button" className="primary-btn" style={{ width: '100%', marginTop: '0.5rem' }} onClick={handleExport} disabled={busy}>
            Descargar mi progreso
          </button>
        </div>

        <div className="menu-section">
          <h2>Importar</h2>
          <p className="hint-text">
            Restaura un archivo exportado antes. <b>Esto reemplaza</b> tu progreso actual y guarda el resultado en MongoDB.
          </p>
          <input
            type="file"
            accept="application/json,.json"
            ref={fileInputRef}
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <button type="button" className="secondary-btn" style={{ width: '100%', marginTop: '0.5rem' }} onClick={handleImportClick} disabled={busy}>
            {busy ? 'Guardando…' : 'Elegir archivo para importar'}
          </button>
          {importMessage && (
            <p className={`hint-text ${importMessage.tone === 'bad' ? 'import-error' : 'import-success'}`} style={{ marginTop: '0.6rem' }}>
              {importMessage.text}
            </p>
          )}
        </div>

        <div className="menu-section">
          <h2>Empezar de cero</h2>
          <p className="hint-text">
            Borra tu progreso (torneo, rating, logros, historial, ejército de Combat Chess, títulos y skins elegidos) y guarda el perfil vacío en MongoDB.
            <b> Esto no se puede deshacer.</b> No cierra tu sesión ni cambia tus preferencias de sonido/voz.
          </p>
          {!confirmingReset && !resetDone && (
            <button
              type="button"
              className="secondary-btn danger-btn"
              style={{ width: '100%', marginTop: '0.5rem' }}
              onClick={() => setConfirmingReset(true)}
              disabled={busy}
            >
              Borrar todo mi progreso
            </button>
          )}
          {confirmingReset && (
            <div className="game-controls" style={{ marginTop: '0.5rem' }}>
              <button type="button" className="danger-btn" onClick={handleResetConfirmed} disabled={busy}>
                {busy ? 'Guardando…' : 'Sí, borrar todo — no hay vuelta atrás'}
              </button>
              <button type="button" className="secondary-btn" onClick={() => setConfirmingReset(false)} disabled={busy}>
                No, dejarlo como está
              </button>
            </div>
          )}
          {resetMessage && (
            <p className="hint-text import-error" style={{ marginTop: '0.6rem' }}>{resetMessage}</p>
          )}
          {resetDone && (
            <p className="hint-text import-success" style={{ marginTop: '0.6rem' }}>
              Listo — tu progreso volvió a cero y el cambio quedó guardado en MongoDB. Recarga para refrescar todos los contadores visibles.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
