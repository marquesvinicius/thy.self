import { Router } from 'express';
import sessionRoutes from './session.routes.js';
import questionRoutes from './question.routes.js';
import answerRoutes from './answer.routes.js';
import analyzeRoutes from './analyze.routes.js';

const router = Router();

router.use('/session', sessionRoutes);
router.use('/questions', questionRoutes);
router.use('/answer', answerRoutes);
router.use('/analyze', analyzeRoutes);

export default router;
