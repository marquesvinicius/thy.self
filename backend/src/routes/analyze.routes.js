import { Router } from 'express';
import { handleAnalyze } from '../controllers/analyze.controller.js';
import { sessionGuard } from '../middleware/sessionGuard.js';
import { validateRequest } from '../middleware/validateRequest.js';

const router = Router();

router.post(
  '/',
  validateRequest({
    session_id: { required: true, type: 'string' },
  }),
  sessionGuard,
  handleAnalyze
);

export default router;
