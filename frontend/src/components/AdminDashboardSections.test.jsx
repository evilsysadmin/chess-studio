import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../cpuIdentity.js', () => ({
  CPU_IDENTITY: { name: 'Matthias', avatar: '/matthias-test.webp' },
}));
vi.mock('./Board.jsx', () => ({ default: () => <div data-board="true" /> }));
vi.mock('./GlossaryTerm.jsx', () => ({ default: ({ children }) => <>{children}</> }));

import AdminFeedbackSection from './AdminFeedbackSection.jsx';
import AdminMatthiasStatusSection from './AdminMatthiasStatusSection.jsx';
import AdminUserDirectory from './AdminUserDirectory.jsx';

const noop = () => {};
const FIXED_NOW = Date.UTC(2026, 8, 3, 10, 0, 0);

describe('admin dashboard extracted sections', () => {
  it('keeps the feedback inbox actions and status vocabulary', () => {
    const html = renderToStaticMarkup(
      <AdminFeedbackSection
        feedback={[{ id: 'f1', username: 'alice', category: 'bug', context: 'War Room', message: 'Algo arde.', status: 'new', attachments: [] }]}
        error={null}
        updating={null}
        testCreating={false}
        replies={{ f1: 'Recibido.' }}
        onReplyChange={noop}
        onReply={noop}
        onStatus={noop}
        onDelete={noop}
        onCreateTest={noop}
      />,
    );

    expect(html).toContain('Lo que están diciendo los usuarios');
    expect(html).toContain('1 nuevos');
    expect(html).toContain('Algo arde.');
    expect(html).toContain('Responder + resolver');
    expect(html).toContain('Marcar leído');
    expect(html).toContain('Borrar feedback');
  });

  it('keeps Matthias operational status and synthetic personality sandbox', () => {
    const html = renderToStaticMarkup(
      <AdminMatthiasStatusSection
        status={{
          consultations: 7,
          usersWithMemory: 3,
          storage: 'mongo',
          aiToday: { calls: 4, cloudflarePercent: 75, fallbackPercent: 25, p50Ms: 120, timeouts: 0 },
          moodCounts: { annoyed: 2 },
          questionCounts: { opening: 3 },
          dominantAdvice: { label: 'Deja de regalar damas', consultations: 2, usersAffected: 1 },
          memorySchemaVersion: 4,
        }}
        error={null}
        previewPreset="veteran"
        preview={{ text: 'Aceptable. No te emociones.', provider: 'cloudflare' }}
        previewLoading={false}
        previewError={null}
        onPreviewPresetChange={noop}
        onPreview={noop}
      />,
    );

    expect(html).toContain('/matthias-test.webp');
    expect(html).toContain('Estado del entrenador residente');
    expect(html).toContain('MongoDB');
    expect(html).toContain('Cabreado: 2');
    expect(html).toContain('Probar a Matthias');
    expect(html).toContain('Aceptable. No te emociones.');
  });

  it('keeps the user directory, presence and expanded chess dossier', () => {
    const user = {
      username: 'alice',
      rating: 1210,
      totalGames: 2,
      gamesPlayed: 2,
      wins: 1,
      draws: 0,
      losses: 1,
      contractsCompleted: 1,
      contractsOffered: 2,
      recentForm: ['win', 'loss'],
      recentActivity: [],
      currentActivity: 'Combat Chess',
      foreground: true,
      presenceStatus: 'online',
      presenceAgeSeconds: 10,
      clientRelease: null,
    };
    const html = renderToStaticMarkup(
      <AdminUserDirectory
        users={[user]}
        error={null}
        deleteError={null}
        deletingUser={null}
        currentAdmin="admin"
        activityFilter="all"
        onActivityFilterChange={noop}
        lastAdminRefreshAt={FIXED_NOW}
        adminNow={FIXED_NOW}
        expanded="alice"
        onExpandedChange={noop}
        onDeleteUser={noop}
        insightsByUser={{ alice: { insights: { totalGames: 0 } } }}
        insightsLoading={{}}
        insightsErrors={{}}
        onRetryInsights={noop}
        matthiasMemoryByUser={{}}
        matthiasMemoryLoading={{}}
        aiPortraitByUser={{}}
        aiPortraitLoading={{}}
        aiPortraitError={{}}
        onReanalyzePlayer={noop}
        matthiasResettingUser={null}
        matthiasResetError={null}
        onResetMatthiasMemory={noop}
      />,
    );

    expect(html).toContain('Usuarios registrados');
    expect(html).toContain('alice');
    expect(html).toContain('Combat Chess');
    expect(html).toContain('1210');
    expect(html).toContain('<span>Retos</span><strong>1/2</strong>');
    expect(html).toContain('Así juega alice');
    expect(html).toContain('Sospechosamente limpio');
  });
});
