import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import express from 'express';

// Requer `--experimental-test-module-mocks` (já incluso no npm test).
//
// Contraparte de rateLimit.test.js: fora de produção o limitador precisa
// ficar desligado, senão a suíte e os testes ponta a ponta (que percorrem a
// jornada inteira em segundos) seriam barrados. Arquivo separado porque o
// ambiente é lido na importação do módulo.

mock.module('../src/config/environment.js', {
  namedExports: { env: { nodeEnv: 'development' } },
});

const { publicRateLimit } = await import('../src/middleware/rateLimit.js');

test('limitação de taxa: fora de produção o limitador não barra nem anuncia limite', async () => {
  const app = express();
  app.use(publicRateLimit);
  app.get('/ping', (req, res) => res.json({ success: true }));
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    // Acima do teto de produção (120/min): nenhuma deve ser recusada.
    for (let i = 1; i <= 130; i += 1) {
      const res = await fetch(`${baseUrl}/ping`);
      assert.equal(res.status, 200, `requisição ${i}`);
      assert.equal(res.headers.get('ratelimit'), null, 'não deve anunciar limite fora de produção');
      await res.body?.cancel();
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
