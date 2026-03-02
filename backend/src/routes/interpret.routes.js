import { Router } from 'express';
import { handleInterpret } from '../controllers/interpret.controller.js';

const router = Router();

// POST /api/v1/interpret — Re-generate LLM interpretation
router.post('/', handleInterpret);

export default router;
