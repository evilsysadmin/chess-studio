import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./AdminDashboardContent.jsx', () => ({ default: () => <div data-admin-dashboard="true">dashboard</div> }));
vi.mock('./ObservabilityPanel.jsx', () => ({ default: () => <div data-observability="true">observability</div> }));
vi.mock('../admin.js', () => ({ fetchAdminUsers: vi.fn(async () => []) }));
vi.mock('../auth.js', () => ({ getToken: () => 'token', getUsername: () => 'admin' }));
vi.mock('../useEscapeToClose.js', () => ({ useEscapeToClose: () => {} }));

import AdminScreen from './AdminScreen.jsx';

describe('AdminScreen workspace', () => {
  it('presenta una navegación compacta por áreas con Resumen como vista inicial', () => {
    const html = renderToStaticMarkup(<AdminScreen onExit={() => {}} />);

    expect(html).toContain('Centro de control');
    expect(html).toContain('Resumen');
    expect(html).toContain('Observabilidad');
    expect(html).toContain('Usuarios');
    expect(html).toContain('Feedback');
    expect(html).toContain('Matthias');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('id="admin-tab-overview"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('id="admin-panel-overview"');
    expect(html).toContain('data-admin-dashboard="true"');
  });
});
