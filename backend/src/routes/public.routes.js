import { Router } from 'express';
import { handleGetPublicResult } from '../controllers/result.controller.js';

const router = Router();

// GET /api/v1/public/result/:token — Read-only public share
router.get('/result/:token', handleGetPublicResult);

export default router;
