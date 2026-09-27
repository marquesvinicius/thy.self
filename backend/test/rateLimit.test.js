import assert from 'node:assert/strict';
import test, { mock, after, before } from 'node:test';
import express from 'express';

// Requer `--experimental-test-module-mocks` (já incluso no npm test).
//
// A limitação de taxa (protege a cota diária da IA, RNF019) só liga em produção — em teste e
// desenvolvimento ela fica desligada para não barrar a suíte e os testes
// ponta a ponta. Por isso nenhum outro teste chegava a exercitá-la. Aqui o
// ambiente é simulado como produção, e cada arquivo de teste roda num
// processo próprio, então isso não vaza para os demais.

const envFixture = { nodeEnv: 'production' };
mock.module('../src/config/environment.js', {
  namedExports: { env: envFixture },
});

const { publicRateLimit } = await import('../src/middleware/rateLimit.js');

const LIMIT = 120;

let server;
let baseUrl;

before(async () => {
  const app = express();
  app.use(publicRateLimit);
  app.get('/ping', (req, res) => res.json({ success: true, data: 'pong' }));
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise(resolve => server.close(resolve)));

test('limitação de taxa: aceita até 120 requisições por minuto do mesmo endereço', async () => {
  // Todas do mesmo IP (127.0.0.1): é o teto que uma avaliação legítima
  // (~60 requisições) nunca atinge.
  for (let i = 1; i <= LIMIT; i += 1) {
    const res = await fetch(`${baseUrl}/ping`);
    assert.equal(res.status, 200, `requisição ${i}`);
    await res.body?.cancel();
  }
});

test('limitação de taxa: a 121.ª requisição no minuto é recusada com 429 no envelope da API', async () => {
  const res = await fetch(`${baseUrl}/ping`);
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), {
    success: false,
    error: {
      message: 'Muitas requisições em pouco tempo. Aguarde um instante e tente novamente.',
      code: 'RATE_LIMITED',
    },
  });
});

test('limitação de taxa: informa o limite nos cabeçalhos padronizados, sem os legados', async () => {
  const res = await fetch(`${baseUrl}/ping`);
  await res.body?.cancel();
  // draft-7: um cabeçalho combinado "RateLimit" com limite, restante e janela.
  const combined = res.headers.get('ratelimit');
  assert.ok(combined, 'cabeçalho RateLimit ausente');
  assert.match(combined, /limit=120/);
  assert.match(combined, /reset=\d+/);
  assert.equal(res.headers.get('ratelimit-policy'), '120;w=60');
  assert.equal(res.headers.get('x-ratelimit-limit'), null, 'cabeçalhos legados não devem ser enviados');
});
