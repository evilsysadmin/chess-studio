import { useEffect, useRef, useState } from 'react';
import { fetchAdminUsers } from '../admin.js';
import { getToken, getUsername } from '../auth.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import AdminDashboardContent from './AdminDashboardContent.jsx';
import AdminRatingEditor from './AdminRatingEditor.jsx';
import ObservabilityPanel from './ObservabilityPanel.jsx';
import './AdminWorkspace.css';

const ADMIN_SECTIONS = Object.freeze([
  { id: 'overview', label: 'Resumen', hint: 'Estado esencial' },
  { id: 'observability', label: 'Observabilidad', hint: 'SRE y servicio' },
  { id: 'users', label: 'Usuarios', hint: 'Presencia y cuentas' },
  { id: 'feedback', label: 'Feedback', hint: 'Voz del usuario' },
  { id: 'matthias', label: 'Matthias', hint: 'IA y memoria' },
]);

function AdminWorkspaceHeader({ section, onExit }) {
  const active = ADMIN_SECTIONS.find((item) => item.id === section) || ADMIN_SECTIONS[0];
  return (
    <header className="admin-workspace-header">
      <div>
        <span className="section-label">Admin</span>
        <h1>Centro de control</h1>
        <p>{active.hint}. Lo importante delante; el detalle, sólo cuando lo necesitas.</p>
      </div>
      <button type="button" className="secondary-btn admin-workspace-exit" onClick={onExit}>Salir al menú</button>
    </header>
  );
}

function AdminWorkspaceTabs({ section, onChange }) {
  const tabRefs = useRef([]);

  function moveFocus(event, index) {
    let target = null;
    if (event.key === 'ArrowRight') target = (index + 1) % ADMIN_SECTIONS.length;
    if (event.key === 'ArrowLeft') target = (index - 1 + ADMIN_SECTIONS.length) % ADMIN_SECTIONS.length;
    if (event.key === 'Home') target = 0;
    if (event.key === 'End') target = ADMIN_SECTIONS.length - 1;
    if (target == null) return;
    event.preventDefault();
    const next = ADMIN_SECTIONS[target];
    onChange(next.id);
    tabRefs.current[target]?.focus();
  }

  return (
    <nav className="admin-workspace-tabs" role="tablist" aria-label="Secciones de administración">
      {ADMIN_SECTIONS.map((item, index) => (
        <button
          key={item.id}
          ref={(node) => { tabRefs.current[index] = node; }}
          type="button"
          role="tab"
          id={`admin-tab-${item.id}`}
          aria-controls={`admin-panel-${item.id}`}
          aria-selected={section === item.id}
          tabIndex={section === item.id ? 0 : -1}
          className={`admin-workspace-tab${section === item.id ? ' is-active' : ''}`}
          onClick={() => onChange(item.id)}
          onKeyDown={(event) => moveFocus(event, index)}
        >
          <span>{item.label}</span>
          <small>{item.hint}</small>
        </button>
      ))}
    </nav>
  );
}

function AdminObservabilityWorkspace({ onExit }) {
  useEscapeToClose(onExit);
  const [users, setUsers] = useState([]);
  const [usersError, setUsersError] = useState(null);

  useEffect(() => {
    let mounted = true;
    fetchAdminUsers()
      .then((result) => {
        if (mounted) setUsers(Array.isArray(result) ? result : []);
      })
      .catch((error) => {
        if (mounted) setUsersError(error?.message || 'No se pudo cargar la presencia de usuarios.');
      });
    return () => { mounted = false; };
  }, []);

  return (
    <section
      className="admin-workspace-observability"
      id="admin-panel-observability"
      role="tabpanel"
      aria-labelledby="admin-tab-observability"
    >
      <div className="admin-workspace-section-heading">
        <div>
          <span className="section-label">Operaciones</span>
          <h2>Observabilidad</h2>
        </div>
        <p>Salud, SLO, logs, métricas y trazas en una vista propia; sin atravesar el censo de usuarios para llegar aquí.</p>
      </div>
      {usersError && <p className="error-text">{usersError}</p>}
      <ObservabilityPanel token={getToken()} users={users} currentAdmin={getUsername()} />
    </section>
  );
}

export default function AdminScreen({ onExit }) {
  const [section, setSection] = useState('overview');

  return (
    <div className="admin-workspace-shell" data-admin-section={section}>
      <AdminWorkspaceHeader section={section} onExit={onExit} />
      <AdminWorkspaceTabs section={section} onChange={setSection} />

      {section === 'observability' ? (
        <AdminObservabilityWorkspace onExit={onExit} />
      ) : (
        <div
          className="admin-workspace-content-slot"
          id={`admin-panel-${section}`}
          role="tabpanel"
          aria-labelledby={`admin-tab-${section}`}
        >
          {section === 'users' && <AdminRatingEditor />}
          <AdminDashboardContent onExit={onExit} />
        </div>
      )}
    </div>
  );
}
