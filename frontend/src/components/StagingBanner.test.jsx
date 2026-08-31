import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StagingBanner from './StagingBanner.jsx';

describe('StagingBanner', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('no aparece fuera de staging', () => {
    vi.stubEnv('VITE_DEPLOY_ENV', 'production');
    expect(renderToStaticMarkup(<StagingBanner />)).toBe('');
  });

  it('identifica staging y el SHA desplegado', () => {
    vi.stubEnv('VITE_DEPLOY_ENV', 'staging');
    vi.stubEnv('VITE_DEPLOY_SHA', '1234567890abcdef');
    const html = renderToStaticMarkup(<StagingBanner />);
    expect(html).toContain('data-staging-banner="true"');
    expect(html).toContain('STAGING · 12345678');
  });
});
