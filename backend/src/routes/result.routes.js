import { Router } from 'express';
import {
  handleGetResult,
  handleShareResult,
  handleGetAnswerReview,
} from '../controllers/result.controller.js';

const router = Router();

// GET /api/v1/result/:session_id — Fetch saved result (no new LLM call)
router.get('/:session_id', handleGetResult);

// GET /api/v1/result/:session_id/review — Answer review (post usability test)
router.get('/:session_id/review', handleGetAnswerReview);

// POST /api/v1/result/:session_id/share — Toggle public publication
// Body: { is_public?: boolean } (default true)
router.post('/:session_id/share', handleShareResult);

export default router;
