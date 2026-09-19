import assert from 'node:assert/strict';
import { test } from 'node:test';

import worker, { ANALYSIS_MODEL } from './index.js';

const SECRET = 'chronicles-planner-test-secret';

async function hmacHex(secret, message) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function requestFor(body) {
  const raw = JSON.stringify(body);
  const timestamp = String(Date.now());
  const digest = await hmacHex(SECRET, timestamp + '.' + raw);
  return new Request('https://worker.test/narrative', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-chess-ai-timestamp': timestamp,
      'x-chess-ai-signature': 'sha256=' + digest,
    },
    body: raw,
  });
}

function envFor(aiText) {
  const calls = { rates: [], ai: [] };
  return {
    calls,
    env: {
      CHESS_AI_SHARED_SECRET: SECRET,
      AI_RATE_LIMITER: {
        async limit(payload) {
          calls.rates.push(payload);
          return { success: true };
        },
      },
      AI: {
        async run(model, options) {
          calls.ai.push({ model, options });
          return {
            choices: [{ message: { content: aiText } }],
            usage: { prompt_tokens: 140, completion_tokens: 70 },
          };
        },
      },
    },
  };
}

test('chronicles_planner usa análisis de baja entropía y exige JSON topológico estricto', async () => {
  const text = JSON.stringify({
    version: 1,
    areas: {
      'echo-cistern': {
        version: 1,
        source: 'workers-ai',
        verbs: ['sluice', 'guardian'],
        difficulty: 4,
      },
    },
  });
  const fake = envFor(text);
  const response = await worker.fetch(
    await requestFor({
      event_type: 'chronicles_planner',
      request_id: 'chronicles:run:seed417',
      facts: {
        requested_areas: 1,
        areas: [{
          map_id: 'echo-cistern',
          theme: 'water',
          current_verbs: ['sluice', 'guardian'],
          difficulty: 3,
          allowed_verbs: ['sluice', 'traps', 'secret', 'guardian'],
        }],
        password: 'NO-DEBE-SALIR',
      },
    }),
    fake.env,
  );

  assert.equal(response.status, 200);
  const payload = JSON.parse(await response.text());
  assert.equal(payload.ok, true);
  assert.equal(payload.text, text);
  assert.equal(payload.model, ANALYSIS_MODEL);
  assert.deepEqual(fake.calls.rates, [{ key: 'render-analysis' }]);
  assert.equal(fake.calls.ai.length, 1);
  assert.equal(fake.calls.ai[0].model, ANALYSIS_MODEL);
  assert.equal(fake.calls.ai[0].options.temperature, 0.35);
  assert.equal(fake.calls.ai[0].options.top_p, 0.70);
  assert.equal(fake.calls.ai[0].options.max_tokens, 700);

  const messages = fake.calls.ai[0].options.messages;
  const system = messages[0].content;
  const prompt = messages.at(-1).content;
  assert.match(prompt, /TIPO_DE_EVENTO: chronicles_planner/);
  assert.match(prompt, /"map_id":"echo-cistern"/);
  assert.match(prompt, /"allowed_verbs":\["sluice","traps","secret","guardian"\]/);
  assert.match(prompt, /exclusivamente el JSON del contrato chronicles_planner/i);
  assert.match(system, /TOPOLOGÍA, no como autor del juego/i);
  assert.match(system, /"version":1,"areas"/);
  assert.match(system, /Nunca escribas campos adicionales/i);
  assert.doesNotMatch(prompt, /NO-DEBE-SALIR|password/);
});
