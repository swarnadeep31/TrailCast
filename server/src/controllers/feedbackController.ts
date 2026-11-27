import type { Request, Response } from 'express';
import { Feedback } from '../models/Feedback.ts';

export async function sendFeedback(req: Request, res: Response): Promise<void> {
  await Feedback.create({ user: req.user!._id, message: req.body?.message });
  res.status(201).json({ ok: true });
}
