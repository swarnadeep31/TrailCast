// Services along a trail's route (fuel, mechanics, medical help, ATMs), and
// re-running the route tools' work for a trail.
import type { Request, Response } from 'express';
import { routeConfig } from '../config.ts';
import { Job } from '../models/Job.ts';
import { RouteServices } from '../models/RouteServices.ts';
import { Trail } from '../models/Trail.ts';
import { httpError } from '../utils/httpError.ts';
import { findOwnTrail } from './trailsController.ts';

// How often an owner can ask for the work to be redone, per trail per day.
const ENRICH_PER_TRAIL_PER_DAY = 3;
const startOfTodayUtc = () => new Date(new Date().setUTCHours(0, 0, 0, 0));

// Anyone can read these. Viewing a trail never calls Overpass: only the
// background job does, once per route version.
export async function getServices(req: Request, res: Response): Promise<void> {
  const trail = await Trail.findById(req.params.id).select('track routeVersion');
  if (!trail) throw httpError(404, 'Trail not found.');
  if (!routeConfig().services) {
    res.json({ status: 'unavailable', reason: 'off' });
    return;
  }
  if (trail.track.length < 2) {
    res.json({ status: 'unavailable', reason: 'no_route' });
    return;
  }

  const found = await RouteServices.findOne({ trail: trail._id, routeVersion: trail.routeVersion });
  if (!found) {
    // Still being worked on, or not yet: a trail saved before the route tools
    // (until the backfill runs), or work that stopped without an answer.
    const working = await Job.exists({ type: 'route-enrich', trail: trail._id, routeVersion: trail.routeVersion, state: { $in: ['queued', 'running'] } });
    res.json(working ? { status: 'pending' } : { status: 'unavailable', reason: 'not_ready' });
    return;
  }
  const { status, routeVersion, items, fuelGaps, computedAt, error, retryAt, reason } = found;
  if (status === 'ready') res.json({ status, routeVersion, items, fuelGaps, computedAt });
  else if (status === 'failed') res.json({ status, error, retryAt: retryAt ?? null });
  else res.json({ status, reason });
}

// Works out the heights, services and stats for the route again, now.
export async function enrichNow(req: Request, res: Response): Promise<void> {
  const trail = await findOwnTrail(req);
  if (trail.track.length < 2) throw httpError(400, 'This trail has no route yet.');
  const today = await Job.countDocuments({ type: 'route-enrich', trail: trail._id, manual: true, createdAt: { $gte: startOfTodayUtc() } });
  if (today >= ENRICH_PER_TRAIL_PER_DAY) {
    throw httpError(429, `The route can be worked out again ${ENRICH_PER_TRAIL_PER_DAY} times a day. Please try again tomorrow.`);
  }
  // Waiting jobs for this trail are replaced by this one.
  await Job.updateMany({ type: 'route-enrich', trail: trail._id, state: 'queued' }, { state: 'cancelled', lockedUntil: new Date(0) });
  const job = await Job.create({ type: 'route-enrich', trail: trail._id, user: req.user!._id, routeVersion: trail.routeVersion, stage: 'elevation', manual: true });
  res.status(202).json({ _id: job._id, state: job.state, stage: job.stage, routeVersion: job.routeVersion });
}
