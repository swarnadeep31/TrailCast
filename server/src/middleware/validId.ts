import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { httpError } from '../utils/httpError.ts';

// For router.param(): a malformed ID can't belong to anything, so answer 404.
export function checkObjectId(req: Request, res: Response, next: NextFunction, id: string): void {
  next(mongoose.isValidObjectId(id) ? undefined : httpError(404, 'Not found.'));
}
