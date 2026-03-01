import { Router } from 'express';
import { handleGetQuestions } from '../controllers/question.controller.js';
import { sessionGuard } from '../middleware/sessionGuard.js';

const router = Router();

router.get('/', sessionGuard, handleGetQuestions);

export default router;
