import { Router } from 'express';
import { env } from '../config/environment.js';
import sessionRoutes from './session.routes.js';
import questionRoutes from './question.routes.js';
import answerRoutes from './answer.routes.js';
import analyzeRoutes from './analyze.routes.js';
import interpretRoutes from './interpret.routes.js';
import resultRoutes from './result.routes.js';
import devRoutes from './dev.routes.js';

const router = Router();

router.use('/session', sessionRoutes);
router.use('/questions', questionRoutes);
router.use('/answer', answerRoutes);
router.use('/analyze', analyzeRoutes);
router.use('/interpret', interpretRoutes);
router.use('/result', resultRoutes);

// Development-only routes (quick-analyze, test tools)
if (env.nodeEnv === 'development') {
  router.use('/dev', devRoutes);
}

export default router;
