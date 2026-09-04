import { Router } from 'express';
import { handleQuickAnalyze } from '../controllers/dev.controller.js';
import { getUsageStats } from '../services/llm-limiter.js';
import { success } from '../utils/apiResponse.js';

const router = Router();

// POST /api/v1/dev/quick-analyze — Create session + random answers + analyze
router.post('/quick-analyze', handleQuickAnalyze);

// GET /api/v1/dev/stats — Orçamento LLM do dia (contadores persistidos)
router.get('/stats', async (req, res, next) => {
  try {
    return success(res, await getUsageStats());
  } catch (err) {
    next(err);
  }
});

export default router;
