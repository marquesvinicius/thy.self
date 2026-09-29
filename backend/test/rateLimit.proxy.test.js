import assert from 'node:assert/strict';
import test, { mock, after, before } from 'node:test';
import express from 'express';

// Em produção o servidor roda atrás do proxy da hospedagem. Com
// `trust proxy` = 1 (o que app.js faz em produção), cada visitante é contado
// pelo seu próprio IP, lido do X-Forwarded-For. Sem isso, todos cairiam no
// IP do proxy e dividiriam o mesmo limite de 120 por minuto.

mock.module('../src/config/environment.js', {
  namedExports: { env: { nodeEnv: 'production', trustProxyHops: 1 } },
});

const { publicRateLimit } = await import('../src/middleware/rateLimit.js');

let server;
let baseUrl;

before(async () => {
  const app = express();
  app.set('trust proxy', 1);
  app.use(publicRateLimit);
  app.get('/ping', (req, res) => res.json({ success: true, data: 'pong' }));
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise(resolve => server.close(resolve)));

const from = ip => ({ headers: { 'X-Forwarded-For': ip } });

test('limitação de taxa atrás de proxy: cada visitante tem o seu próprio limite', async () => {
  for (let i = 1; i <= 120; i += 1) {
    const res = await fetch(`${baseUrl}/ping`, from('203.0.113.1'));
    assert.equal(res.status, 200, `requisição ${i} do primeiro visitante`);
    await res.body?.cancel();
  }
  const blocked = await fetch(`${baseUrl}/ping`, from('203.0.113.1'));
  assert.equal(blocked.status, 429, 'o primeiro visitante passou do limite');
  await blocked.body?.cancel();

  const other = await fetch(`${baseUrl}/ping`, from('203.0.113.2'));
  assert.equal(other.status, 200, 'o segundo visitante não é afetado pelo primeiro');
  await other.body?.cancel();
});
