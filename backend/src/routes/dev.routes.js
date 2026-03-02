import { Router } from 'express';
import { handleQuickAnalyze } from '../controllers/dev.controller.js';

const router = Router();

// POST /api/v1/dev/quick-analyze — Create session + random answers + analyze
router.post('/quick-analyze', handleQuickAnalyze);

export default router;
