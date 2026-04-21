import { Router } from 'express';
import { handleAnswer, handleUndoAnswer } from '../controllers/answer.controller.js';
import { sessionGuard } from '../middleware/sessionGuard.js';
import { validateRequest } from '../middleware/validateRequest.js';

const router = Router();

router.post(
  '/',
  validateRequest({
    session_id: { required: true, type: 'string' },
    question_id: { required: true, type: 'number' },
    alternative_id: { required: false, type: 'number' },
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
