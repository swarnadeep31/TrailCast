import type { NextFunction, Request, Response } from 'express';

// What a thrown error may carry: Mongoose's validation details, MongoDB's
// duplicate key, body-parser's type, or our own status and code (httpError).
interface ServerError {
  name?: string;
  message?: string;
  path?: string;
  errors?: Record<string, { name: string; path: string; message: string }>;
  code?: number | string;
  keyPattern?: Record<string, unknown>;
  type?: string;
  status?: number;
}

// Turns any error thrown by a route into a JSON answer: { error: "message" }.
// Express 5 sends errors from async route handlers here automatically.
export function errorHandler(err: ServerError, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) return next(err);

  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors ?? {})
      .map((e) => (e.name === 'CastError' ? `"${e.path}" has the wrong type.` : e.message))
      .join(' ');
    res.status(400).json({ error: message });
    return;
  }
  if (err.name === 'CastError') {
    res.status(400).json({ error: `"${err.path}" has the wrong type.` });
    return;
  }
  // MongoDB refused a duplicate of a unique field (e.g. two sign-ups with one email at the same moment).
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern ?? {})[0] ?? 'value';
    res.status(409).json({ error: `That ${field} is already taken.` });
    return;
  }
  if (err.type === 'entity.too.large') {
    res.status(413).json({ error: 'That upload is too big.' });
    return;
  }
  if (err.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'The request body is not valid JSON.' });
    return;
  }
  // code: something the page can act on, like 'exists' (offer to log in instead).
  if (err.status) {
    res.status(err.status).json({ error: err.message, ...(typeof err.code === 'string' && { code: err.code }) });
    return;
  }

  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
}

export function notFound(req: Request, res: Response): void {
  res.status(404).json({ error: `No API route for ${req.method} ${req.path}` });
}
