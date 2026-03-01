import { Router } from 'express';
import { handleCreateSession } from '../controllers/session.controller.js';
import { validateRequest } from '../middleware/validateRequest.js';

const router = Router();

router.post(
  '/',
  validateRequest({
    nickname: { required: false, type: 'string', maxLength: 100 },
  }),
  handleCreateSession
);

export default router;
