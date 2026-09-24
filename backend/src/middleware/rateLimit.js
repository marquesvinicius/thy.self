import rateLimit from 'express-rate-limit';
import { env } from '../config/environment.js';

/**
 * Limitação de taxa das rotas públicas.
 *
 * Todo o produto é anônimo por decisão de projeto (RN001/RNF012): não há
 * cadastro, login ou qualquer credencial que identifique quem chama a API.
 * Isso é bom para o usuário e ruim para a defesa — sem nenhum limite, um
 * script consegue criar sessões e gravar respostas indefinidamente, inflando
 * o banco e, no caminho do `/analyze`, consumindo o orçamento diário de LLM
 * que os outros usuários dividem.
 *
 * O limite é por IP e deliberadamente generoso: uma avaliação completa são
 * ~60 requisições (30 itens objetivos + narrativas + análise), então o teto
 * padrão comporta várias sessões legítimas seguidas — inclusive de pessoas
 * atrás do mesmo NAT — e ainda assim corta automação.
 *
 * Em teste e desenvolvimento o limitador fica desligado: os testes
 * ponta-a-ponta (Playwright) percorrem a jornada inteira em segundos e
 * seriam barrados por um limite pensado para humanos.
 */
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 120;

const isProduction = env.nodeEnv === 'production';

export const publicRateLimit = rateLimit({
  windowMs: WINDOW_MS,
  limit: MAX_REQUESTS_PER_WINDOW,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => !isProduction,
  // Mesmo envelope de erro do resto da API (utils/apiResponse.js), para o
  // cliente não precisar de um caminho especial só para 429.
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        message: 'Muitas requisições em pouco tempo. Aguarde um instante e tente novamente.',
        code: 'RATE_LIMITED',
      },
    });
  },
});
