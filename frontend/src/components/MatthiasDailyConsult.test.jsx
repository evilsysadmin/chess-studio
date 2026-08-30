import { describe, expect, it } from 'vitest';
import { isRealMatthiasDailyAnswer } from './MatthiasDailyConsult.jsx';

describe('isRealMatthiasDailyAnswer', () => {
  it('acepta respuestas reales de Workers AI para cuota normal y admin', () => {
    expect(isRealMatthiasDailyAnswer({ used: true, provider: 'cloudflare', text: 'Consejo real.' })).toBe(true);
    expect(isRealMatthiasDailyAnswer({ unlimited: true, provider: 'cloudflare', text: 'Consejo admin real.' })).toBe(true);
  });

  it('rechaza fallbacks locales aunque admin tenga consultas ilimitadas', () => {
    expect(isRealMatthiasDailyAnswer({ unlimited: true, provider: 'local', retryable: true, text: 'Workers AI está de huelga.' })).toBe(false);
    expect(isRealMatthiasDailyAnswer({ used: false, provider: 'local', retryable: true, text: 'Fallback local.' })).toBe(false);
  });

  it('rechaza respuestas vacías o sin proveedor probado', () => {
    expect(isRealMatthiasDailyAnswer({ unlimited: true, provider: 'cloudflare', text: '' })).toBe(false);
    expect(isRealMatthiasDailyAnswer({ unlimited: true, text: 'Texto sin proveedor.' })).toBe(false);
    expect(isRealMatthiasDailyAnswer(null)).toBe(false);
  });
});
