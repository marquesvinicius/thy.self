import { Router } from 'express';
import { handleAnswer, handleUndoAnswer } from '../controllers/answer.controller.js';
import { sessionGuard } from '../middleware/sessionGuard.js';
import { validateRequest } from '../middleware/validateRequest.js';

const router = Router();

router.post(
  '/',
  validateRequest({
    session_id: { required: true, type: 'string' },
    question_id: { required: true, type: 'number', integer: true },
    alternative_id: { required: false, type: 'number', integer: true },
    // Texto livre das perguntas de reflexão: vai para o prompt da IA, então
    // tem teto (RNF011). O site aplica o mesmo limite no campo.
    user_observation: { required: false, type: 'string', maxLength: 1000 },
  }),
  sessionGuard,
  handleAnswer
);

router.post(
  '/undo',
  validateRequest({
    session_id: { required: true, type: 'string' },
  }),
  sessionGuard,
  handleUndoAnswer
);

export default router;
