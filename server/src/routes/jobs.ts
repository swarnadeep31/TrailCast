import { Router } from 'express';
import { cancelJob, getJob } from '../controllers/jobsController.ts';
import { requireUser } from '../middleware/auth.ts';
import { checkObjectId } from '../middleware/validId.ts';

export const jobsRouter = Router();

jobsRouter.param('id', checkObjectId);
jobsRouter.get('/:id', requireUser, getJob);
jobsRouter.post('/:id/cancel', requireUser, cancelJob);
