import { createApp } from './app.ts';
import { connectDatabase, disconnectDatabase } from './db.ts';
import { startWorker } from './jobs/worker.ts';
import { startKeepAwake } from './keepAwake.ts';
import { requeueStuckServices } from './routeExtras/enrich.ts';
import { retimeDrawnRoutes } from './routeExtras/retime.ts';

const port = Number(process.env.PORT) || 4000;

try {
  await connectDatabase();
} catch (err) {
  console.error(`Could not connect to MongoDB: ${(err as Error).message}`);
  console.error('Check MONGODB_URI in server/.env (see server/.env.example).');
  process.exit(1);
}

// Drawn routes from before drone shots paused the rider get their times re-spread, once.
try {
  const retimed = await retimeDrawnRoutes();
  if (retimed) console.log(`Re-spread the times of ${retimed} drawn route(s) around their hidden parts.`);
} catch (err) {
  console.warn(`Couldn't re-spread the times of old drawn routes: ${(err as Error).message}`);
}

// Services searches that gave up or lost their retry get another go.
try {
  const queued = await requeueStuckServices();
  if (queued) console.log(`Queued the services search again for ${queued} trail(s).`);
} catch (err) {
  console.warn(`Couldn't check for stuck services searches: ${(err as Error).message}`);
}

// Runs AI route analyses in the background.
const stopWorker = startWorker();

// On Render's free plan: visit itself every 10 minutes so it never falls asleep.
const stopKeepAwake = startKeepAwake();

const server = createApp().listen(port, () => {
  console.log(`TrailCast API listening on http://localhost:${port}`);
});

async function shutDown() {
  stopWorker();
  stopKeepAwake();
  server.close();
  await disconnectDatabase();
  process.exit(0);
}
process.on('SIGINT', shutDown);
process.on('SIGTERM', shutDown);
