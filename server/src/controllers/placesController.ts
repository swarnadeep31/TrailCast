import type { Request, Response } from 'express';
import { searchPlaces } from '../services/places.ts';
import { httpError } from '../utils/httpError.ts';

export async function findPlaces(req: Request, res: Response): Promise<void> {
  const query = String(req.query.q ?? '').trim();
  if (query.length < 2) throw httpError(400, 'Type the name of a place to search for.');
  if (query.length > 200) throw httpError(400, 'That search is too long.');
  res.json(await searchPlaces(query));
}
