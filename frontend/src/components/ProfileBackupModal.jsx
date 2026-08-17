import React, { useRef, useState } from 'react';
import { downloadProfile, importProfile } from '../profileBackup.js';
import { resetAllProgress } from '../resetProgress.js';
import { useEscapeToClose } from '../useEscapeToClose.js';

export default function ProfileBackupModal({ onClose }) {
  useEscapeToClose(onClose);
  const fileInputRef = useRef(null);
  const [importMessage, setImportMessage] = useState(null); // { text, tone }
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  function handleExport() {
    downloadProfile();
  }

  function handleResetConfirmed() {
    resetAllProgress();
    setConfirmingReset(false);
    setResetDone(true);
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const restored = importProfile(reader.result);
        setImportMessage({
          text: `Listo — se restauraron ${restored} sección${restored === 1 ? '' : 'es'} de progreso. Recarga la página para verlo reflejado en todos lados.`,
          tone: 'good',
        });
      } catch (err) {
        setImportMessage({ text: err.message, tone: 'bad' });
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // permite volver a elegir el mismo archivo si hace falta
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="army-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <button className="piece-info-close" onClick={onClose} aria-label="Cerrar">×</button>
        <h3>Exportar / importar progreso</h3>
        <p className="hint-text" style={{ marginBottom: '1rem' }}>
          Todo tu progreso (torneo, ejército de combate, rating, historial de partidas) vive en este navegador.
          Si lo limpias o cambias de dispositivo, se pierde sin aviso — esta es tu copia de seguridad.
        </p>

        <div className="menu-section">
          <h2>Exportar</h2>
          <p className="hint-text">Descarga un archivo con todo tu progreso actual.</p>
          <button type="button" className="primary-btn" style={{ width: '100%', marginTop: '0.5rem' }} onClick={handleExport}>
            Descargar mi progreso
          </button>
        </div>

        <div className="menu-section">
          <h2>Importar</h2>
          <p className="hint-text">
            Restaura el progreso desde un archivo exportado antes. <b>Esto sobreescribe</b> lo que tengas ahora
            mismo en este navegador.
          </p>
          <input
            type="file"
            accept="application/json,.json"
            ref={fileInputRef}
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <button type="button" className="secondary-btn" style={{ width: '100%', marginTop: '0.5rem' }} onClick={handleImportClick}>
            Elegir archivo para importar
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
            Borra todo tu progreso de este navegador (torneo, rating, logros, historial, ejército de
            combate, títulos y skins elegidos) — vuelve todo a como estaba la primera vez que abriste la app.
            <b> Esto no se puede deshacer.</b> No toca tu sesión (seguís con la misma cuenta).
          </p>
          {!confirmingReset && !resetDone && (
            <button
              type="button"
              className="secondary-btn danger-btn"
              style={{ width: '100%', marginTop: '0.5rem' }}
              onClick={() => setConfirmingReset(true)}
            >
              Borrar todo mi progreso
            </button>
          )}
          {confirmingReset && (
            <div className="game-controls" style={{ marginTop: '0.5rem' }}>
              <button type="button" className="danger-btn" onClick={handleResetConfirmed}>
                Sí, borrar todo — no hay vuelta atrás
              </button>
              <button type="button" className="secondary-btn" onClick={() => setConfirmingReset(false)}>
                No, dejarlo como está
              </button>
            </div>
          )}
          {resetDone && (
            <p className="hint-text import-success" style={{ marginTop: '0.6rem' }}>
              Listo — tu progreso volvió a cero. Recarga la página para verlo reflejado en todos lados.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
