import { createHmac } from 'node:crypto';

const SOURCE = 'staging-browser-smoke';
const CI_USER_RE = /^ci_smoke_[0-9a-f]{16}$/;

export function stagingSyntheticHeaders(username) {
  const identity = String(username || '').trim().toLowerCase();
  const secret = String(process.env.STAGING_SYNTHETIC_SECRET || '').trim();
  if (!CI_USER_RE.test(identity)) throw new Error('staging synthetic identity must match ci_smoke_<16hex>');
  if (!secret) throw new Error('Falta STAGING_SYNTHETIC_SECRET para firmar el browser smoke');
  const signature = createHmac('sha256', secret)
    .update(`chess-studio:synthetic:${SOURCE}\0${identity}`, 'utf8')
    .digest('hex');
  return {
    'X-Chess-Synthetic-Source': SOURCE,
    'X-Chess-Synthetic-Identity': identity,
    'X-Chess-Synthetic-Signature': signature,
  };
}
