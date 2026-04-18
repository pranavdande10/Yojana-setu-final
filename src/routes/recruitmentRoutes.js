import express from 'express';
import { getRecruitments, getRecruitmentById } from '../controllers/recruitmentController.js';

const router = express.Router();

router.get('/', getRecruitments);
router.get('/:id', getRecruitmentById);

export default router;
