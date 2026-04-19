import { Router } from 'express';
import { handleInterpret, handleReferenceDetail } from '../controllers/interpret.controller.js';

const router = Router();

// POST /api/v1/interpret — Re-generate LLM interpretation
router.post('/', handleInterpret);
// POST /api/v1/interpret/reference-detail — Detailed comparison for selected reference
router.post('/reference-detail', handleReferenceDetail);

export default router;
