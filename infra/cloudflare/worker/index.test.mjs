import assert from 'node:assert/strict';
import { test } from 'node:test';

import worker, {
  ANALYSIS_MODEL,
  COMMENT_MODEL,
  PLAYER_PORTRAIT_MODEL,
} from './index.js';

const SECRET = 'worker-test-secret';

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

async function narrativeRequest(body, {
  secret = SECRET,
  timestamp = String(Date.now()),
  signature,
  contentType = 'application/json',
} = {}) {
  const raw = JSON.stringify(body);
  const digest = signature ?? `sha256=${await hmacHex(secret, `${timestamp}.${raw}`)}`;
  return new Request('https://worker.test/narrative', {
    method: 'POST',
    headers: {
      'content-type': contentType,
      'x-chess-ai-timestamp': timestamp,
      'x-chess-ai-signature': digest,
    },
    body: raw,
  });
}

function fakeEnv({ rateSuccess = true, aiResult, aiError } = {}) {
  const calls = { rates: [], ai: [] };
  return {
    calls,
    env: {
      CHESS_AI_SHARED_SECRET: SECRET,
      AI_RATE_LIMITER: {
        async limit(payload) {
          calls.rates.push(payload);
          return { success: rateSuccess };
        },
      },
      AI: {
        async run(model, options) {
          calls.ai.push({ model, options });
          if (aiError) throw aiError;
          return aiResult ?? {
            choices: [{ message: { content: 'Movimiento registrado.' } }],
            usage: { prompt_tokens: 11, completion_tokens: 4 },
          };
        },
      },
    },
  };
}

async function jsonBody(response) {
  return JSON.parse(await response.text());
}

test('health publica el routing real de los tres modelos sin tocar AI', async () => {
  const { env, calls } = fakeEnv();
  const response = await worker.fetch(new Request('https://worker.test/health'), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await jsonBody(response), {
    ok: true,
    service: 'chess-studio-narrative-ai',
    model: COMMENT_MODEL,
    models: {
      comments: COMMENT_MODEL,
      player_portrait: PLAYER_PORTRAIT_MODEL,
      analysis: ANALYSIS_MODEL,
    },
  });
  assert.equal(calls.ai.length, 0);
  assert.equal(calls.rates.length, 0);
});

test('narrative exige secreto y firma HMAC válidos antes de consumir rate limit o AI', async () => {
  const missing = fakeEnv();
  delete missing.env.CHESS_AI_SHARED_SECRET;
  const missingResponse = await worker.fetch(
    await narrativeRequest({ event_type: 'generic', facts: { move: 'e4' } }),
    missing.env,
  );
  assert.equal(missingResponse.status, 503);
  assert.equal((await jsonBody(missingResponse)).error, 'worker_not_configured');
  assert.equal(missing.calls.rates.length, 0);
  assert.equal(missing.calls.ai.length, 0);

  const invalid = fakeEnv();
  const invalidResponse = await worker.fetch(
    await narrativeRequest(
      { event_type: 'generic', facts: { move: 'e4' } },
      { signature: `sha256=${'0'.repeat(64)}` },
    ),
    invalid.env,
  );
  assert.equal(invalidResponse.status, 401);
  assert.equal((await jsonBody(invalidResponse)).error, 'unauthorized');
  assert.equal(invalid.calls.rates.length, 0);
  assert.equal(invalid.calls.ai.length, 0);
});

test('training_plan usa bucket/routing de análisis, sanitiza HECHOS y normaliza usage', async () => {
  const fake = fakeEnv({
    aiResult: {
      choices: [{ message: { content: 'Primero táctica. Después aperturas. Encadena ambas sesiones.' } }],
      usage: { input_tokens: 123.4, output_tokens: 45.6 },
    },
  });
  const request = await narrativeRequest({
    event_type: 'training_plan',
    request_id: 'req:training-1',
    facts: {
      priority: 'forks',
      password: 'NO-DEBE-SALIR',
      nested: { api_token: 'NO-DEBE-SALIR', safe: 'sí' },
    },
  });

  const response = await worker.fetch(request, fake.env);
  assert.equal(response.status, 200);
  const payload = await jsonBody(response);
  assert.equal(payload.ok, true);
  assert.equal(payload.model, ANALYSIS_MODEL);
  assert.deepEqual(payload.usage, { inputTokens: 123, outputTokens: 46 });

  assert.deepEqual(fake.calls.rates, [{ key: 'render-analysis' }]);
  assert.equal(fake.calls.ai.length, 1);
  const call = fake.calls.ai[0];
  assert.equal(call.model, ANALYSIS_MODEL);
  assert.equal(call.options.max_tokens, 448);
  const prompt = call.options.messages.at(-1).content;
  assert.match(prompt, /^\/no_think/m);
  assert.match(prompt, /TIPO_DE_EVENTO: training_plan/);
  assert.match(prompt, /"priority":"forks"/);
  assert.match(prompt, /"safe":"sí"/);
  assert.doesNotMatch(prompt, /NO-DEBE-SALIR/);
  assert.doesNotMatch(prompt, /password|api_token/);
});



test('personal_puzzle_batch usa una sola llamada rica, salida JSON amplia y bucket de análisis', async () => {
  const fake = fakeEnv({
    aiResult: {
      choices: [{ message: { content: '{"candidates":[{"fen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1","best_uci":"e2e4","title":"Centro","description":"Prueba","incident_keys":[]}]}' } }],
      usage: { prompt_tokens: 200, completion_tokens: 80 },
    },
  });
  const response = await worker.fetch(
    await narrativeRequest({
      event_type: 'personal_puzzle_batch',
      facts: { requested_candidates: 4, seeds: [{ fen: 'seed-fen', better_move: 'e4' }] },
    }),
    fake.env,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(fake.calls.rates, [{ key: 'render-analysis' }]);
  assert.equal(fake.calls.ai[0].model, ANALYSIS_MODEL);
  assert.equal(fake.calls.ai[0].options.max_tokens, 900);
  const messages = fake.calls.ai[0].options.messages;
  const prompt = messages.at(-1).content;
  const fullPrompt = messages.map((message) => message.content).join('\n');
  assert.match(prompt, /TIPO_DE_EVENTO: personal_puzzle_batch/);
  assert.match(prompt, /exclusivamente el JSON/i);
  assert.match(fullPrompt, /sacrificios[\s\S]*capturable[\s\S]*compensación/i);
});

test('comentarios de partida conservan memoria contextual factual dentro de HECHOS', async () => {
  const fake = fakeEnv();
  const response = await worker.fetch(
    await narrativeRequest({
      event_type: 'MISSED_MATE',
      facts: {
        san: 'Qe2',
        memory: {
          incident: { occurrenceNumber: 3, previousOccurrences: 2 },
          currentOpening: { name: 'Defensa Siciliana', games: 6, wins: 1, losses: 4 },
        },
      },
    }),
    fake.env,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(fake.calls.rates, [{ key: 'render-comments' }]);
  const prompt = fake.calls.ai[0].options.messages.at(-1).content;
  assert.match(prompt, /"memory"/);
  assert.match(prompt, /"occurrenceNumber":3/);
  assert.match(prompt, /"Defensa Siciliana"/);
});

test('player_portrait usa su bucket y generación específica', async () => {
  const fake = fakeEnv();
  const response = await worker.fetch(
    await narrativeRequest({ event_type: 'player_portrait', facts: { games: 8 } }),
    fake.env,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(fake.calls.rates, [{ key: 'render-player-portrait' }]);
  assert.equal(fake.calls.ai[0].model, PLAYER_PORTRAIT_MODEL);
  assert.equal(fake.calls.ai[0].options.max_tokens, 384);
});

test('unit_bio conserva identidad, exclusiones y límites en el prompt de Workers AI', async () => {
  const fake = fakeEnv({
    aiResult: {
      choices: [{ message: { content: 'Serrano creció entre talleres ferroviarios y escucha antes de hablar. Detesta la improvisación, aunque guarda siempre una ruta alternativa doblada en el bolsillo.' } }],
      usage: { prompt_tokens: 81, completion_tokens: 34 },
    },
  });
  const response = await worker.fetch(
    await narrativeRequest({
      event_type: 'unit_bio',
      request_id: 'req:unit-serrano',
      facts: {
        alias: 'Serrano',
        identity_seed: 'unit-l9-serrano',
        piece_type: 'n',
        level: 3,
        avoid_openings: ['Serrano nació'],
      },
    }),
    fake.env,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(fake.calls.rates, [{ key: 'render-comments' }]);
  assert.equal(fake.calls.ai[0].model, COMMENT_MODEL);
  assert.equal(fake.calls.ai[0].options.max_tokens, 120);
  const prompt = fake.calls.ai[0].options.messages.at(-1).content;
  assert.match(prompt, /TIPO_DE_EVENTO: unit_bio/);
  assert.match(prompt, /"identity_seed":"unit-l9-serrano"/);
  assert.match(prompt, /"avoid_openings":\["Serrano nació"\]/);
  assert.match(prompt, /biografía irrepetible y concreta/i);
});

test('rate limiter corta antes del binding AI', async () => {
  const fake = fakeEnv({ rateSuccess: false });
  const response = await worker.fetch(
    await narrativeRequest({ event_type: 'generic', facts: { move: 'e4' } }),
    fake.env,
  );
  assert.equal(response.status, 429);
  assert.equal((await jsonBody(response)).error, 'rate_limited');
  assert.deepEqual(fake.calls.rates, [{ key: 'render-comments' }]);
  assert.equal(fake.calls.ai.length, 0);
});

test('fallo del proveedor devuelve diagnóstico acotado y no filtra el mensaje interno', async () => {
  const error = new Error('token interno que no debe salir');
  error.name = 'AiProviderError';
  error.code = 'E_PROVIDER';
  const fake = fakeEnv({ aiError: error });
  const response = await worker.fetch(
    await narrativeRequest({ event_type: 'generic', request_id: 'req-provider', facts: {} }),
    fake.env,
  );
  assert.equal(response.status, 502);
  const payload = await jsonBody(response);
  assert.deepEqual(payload, {
    ok: false,
    error: 'provider_failure',
    error_name: 'AiProviderError',
    error_code: 'E_PROVIDER',
  });
  assert.doesNotMatch(JSON.stringify(payload), /token interno/);
});

test('rechaza content-type incorrecto y rutas desconocidas sin tocar bindings', async () => {
  const fake = fakeEnv();
  const badType = await worker.fetch(
    await narrativeRequest({ event_type: 'generic', facts: {} }, { contentType: 'text/plain' }),
    fake.env,
  );
  assert.equal(badType.status, 415);
  assert.equal((await jsonBody(badType)).error, 'content_type_required');

  const missing = await worker.fetch(new Request('https://worker.test/nope'), fake.env);
  assert.equal(missing.status, 404);
  assert.equal((await jsonBody(missing)).error, 'not_found');
  assert.equal(fake.calls.rates.length, 0);
  assert.equal(fake.calls.ai.length, 0);
});

test('matthias_daily usa audiencia guiada, hechos saneados y routing de análisis', async () => {
  const fake = fakeEnv({
    aiResult: {
      choices: [{ message: { content: 'Achtung: has jugado 8 partidas y ahí está la pista. En la próxima compara dos candidatas antes de cada decisión crítica.' } }],
      usage: { prompt_tokens: 90, completion_tokens: 30 },
    },
  });
  const response = await worker.fetch(
    await narrativeRequest({
      event_type: 'matthias_daily',
      facts: {
        question_kind: 'improve',
        total_games: 8,
        record: { wins: 3, losses: 5 },
        matthias_memory: { consultation_count: 2, prior_advice: [{ question_kind: 'tactics', text: 'Compara dos candidatas.' }], progress_since_last: { total_games: 3 } },
        password: 'NO-DEBE-SALIR',
      },
    }),
    fake.env,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(fake.calls.rates, [{ key: 'render-analysis' }]);
  assert.equal(fake.calls.ai[0].model, ANALYSIS_MODEL);
  const prompt = fake.calls.ai[0].options.messages.at(-1).content;
  assert.match(prompt, /TIPO_DE_EVENTO: matthias_daily/);
  assert.match(prompt, /"question_kind":"improve"/);
  assert.match(prompt, /"total_games":8/);
  assert.match(prompt, /"matthias_memory"/);
  assert.match(prompt, /"consultation_count":2/);
  assert.match(prompt, /"text":"Compara dos candidatas\."/);
  const fullPrompt = fake.calls.ai[0].options.messages.map((message) => message.content).join('\n');
  assert.match(fullPrompt, /Eres Matthias, la identidad fija/);
  assert.match(fullPrompt, /prior_advice son[\s\S]*NO son hechos/i);
  assert.match(fullPrompt, /progress_since_last[\s\S]*HECHOS actuales[\s\S]*medir[\s\S]*evolución/i);
  assert.match(fullPrompt, /prior_advice[\s\S]*recordar/i);
  assert.match(fullPrompt, /no[\s\S]{0,80}repet/i);
  assert.match(fullPrompt, /Achtung|bitte|sehr gut|germánica/i);
  assert.doesNotMatch(prompt, /NO-DEBE-SALIR|password/);
});

test('matthias_position usa routing de análisis y conserva grounding de motor', async () => {
  const fake = fakeEnv({
    aiResult: {
      choices: [{ message: { content: 'Qh5 pierde 430 puntos de evaluación frente a Re1. Compara la amenaza antes de sacar la dama otra vez.' } }],
      usage: { prompt_tokens: 80, completion_tokens: 24 },
    },
  });
  const response = await worker.fetch(
    await narrativeRequest({
      event_type: 'matthias_position',
      facts: {
        fen: '8/8/8/8/8/8/4K3/4k3 w - - 0 1',
        played: 'Qh5', suggested: 'Re1', loss_cp: 430,
        matthias_memory: {
          relationship: { tier: 'regular' },
          active_goals: [{ label: 'Seguridad de la dama' }],
          remembered_position: { fen: '8/8/8/8/8/8/4K3/4k3 w - - 0 1', label: 'Posición emblemática: Qh5' },
        },
      },
    }),
    fake.env,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(fake.calls.rates.at(-1), { key: 'render-analysis' });
  assert.equal(fake.calls.ai.at(-1).model, ANALYSIS_MODEL);
  const prompt = fake.calls.ai.at(-1).options.messages.map((message) => message.content).join('\n');
  assert.match(prompt, /TIPO_DE_EVENTO: matthias_position/);
  assert.match(prompt, /"loss_cp":430/);
  assert.match(prompt, /"remembered_position"/);
  assert.match(prompt, /FEN coincide exactamente|no hace reconocimiento difuso/i);
  assert.match(prompt, /No inventes variantes ni tácticas no presentes|no asegures por qué una jugada falla/i);
});
