import { Router } from 'express';
import { handleCreateSession } from '../controllers/session.controller.js';

const router = Router();

// POST /api/v1/session — cria uma sessão anônima.
//
// Sem `validateRequest`: a rota não aceita NENHUM campo no corpo. Até a
// migration_011 havia um `nickname` opcional aqui — removido junto com a
// coluna, para que a anonimidade do RNF012 valha também no contrato da API
// e não só na intenção do frontend.
router.post('/', handleCreateSession);

export default router;
