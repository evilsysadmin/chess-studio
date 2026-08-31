export default function StagingBanner() {
  if (String(import.meta.env.VITE_DEPLOY_ENV || '').toLowerCase() !== 'staging') return null;

  const sha = String(import.meta.env.VITE_DEPLOY_SHA || '').slice(0, 8) || 'unknown';
  return (
    <div
      role="status"
      aria-label="Entorno de staging"
      data-staging-banner="true"
      style={{
        position: 'fixed',
        top: 0,
        left: '50%',
        zIndex: 100000,
        transform: 'translateX(-50%)',
        padding: '4px 12px',
        borderRadius: '0 0 8px 8px',
        background: '#7c2d12',
        color: '#fff7ed',
        fontSize: '11px',
        fontWeight: 800,
        letterSpacing: '.08em',
        boxShadow: '0 3px 12px rgba(0,0,0,.35)',
        pointerEvents: 'none',
      }}
    >
      STAGING · {sha}
    </div>
  );
}
