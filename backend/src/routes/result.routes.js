import { Router } from 'express';
import {
  handleGetResult,
  handleGetAnswerReview,
} from '../controllers/result.controller.js';

const router = Router();

// GET /api/v1/result/:session_id — Fetch saved result (no new LLM call)
router.get('/:session_id', handleGetResult);

// GET /api/v1/result/:session_id/review — Answer review with per-trait breakdown
router.get('/:session_id/review', handleGetAnswerReview);

export default router;
