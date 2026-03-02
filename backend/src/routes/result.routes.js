import { Router } from 'express';
import { handleGetResult } from '../controllers/result.controller.js';

const router = Router();

// GET /api/v1/result/:session_id — Fetch saved result (no new LLM call)
router.get('/:session_id', handleGetResult);

export default router;
