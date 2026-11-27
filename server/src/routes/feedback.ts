import { Router } from 'express';
import { sendFeedback } from '../controllers/feedbackController.ts';
import { requireUser } from '../middleware/auth.ts';

export const feedbackRouter = Router();

feedbackRouter.post('/', requireUser, sendFeedback);
