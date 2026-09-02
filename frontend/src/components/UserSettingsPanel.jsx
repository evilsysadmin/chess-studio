import React from 'react';

const UserSettingsPanelContent = React.lazy(() => import('./UserSettingsPanelContent.jsx'));

function SettingsFallback() {
  return (
    <div className="modal-backdrop settings-backdrop" role="presentation">
      <section className="settings-panel" role="status" aria-live="polite" aria-label="Cargando ajustes">
        <div className="settings-panel-heading">
          <div><span className="section-label">Preferencias</span><h2>Preparando ajustes…</h2></div>
        </div>
      </section>
    </div>
  );
}

export default function UserSettingsPanel(props) {
  return (
    <React.Suspense fallback={<SettingsFallback />}>
      <UserSettingsPanelContent {...props} />
    </React.Suspense>
  );
}
