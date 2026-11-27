import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { IncomingHttpHeaders } from 'node:http';
import { after, before, beforeEach } from 'node:test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.ts';

// Tests never call real outside services. Anything that forgets to use a fake
// finds nothing listening here, instead of the real Overpass server.
process.env.OVERPASS_URL ??= 'http://127.0.0.1:9/api/interpreter';
process.env.YOUTUBE_OEMBED_URL ??= 'http://127.0.0.1:9/oembed';
process.env.GOOGLE_TOKENINFO_URL ??= 'http://127.0.0.1:9/tokeninfo';
delete process.env.GOOGLE_CLIENT_ID;
// Rate limits are tested on their own (rateLimits.test.ts); elsewhere one test
// address signs up and logs in far more often than a person would.
process.env.RATE_LIMITS ??= 'off';
// And tests don't wait between Overpass requests or before retrying.
process.env.OVERPASS_SPACING_MS ??= '0';
process.env.OVERPASS_RETRY_DELAY_SEC ??= '0';

export const app = createApp();

// Each test file gets its own throwaway MongoDB, emptied before every test.
export function useTestDatabase(): void {
  let mongo: MongoMemoryServer;
  before(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri('trailcast-test'));
  });
  after(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });
  beforeEach(async () => {
    for (const collection of Object.values(mongoose.connection.collections)) await collection.deleteMany({});
  });
}

// A browser-like client that keeps cookies, signed up as a new user.
export type Agent = ReturnType<typeof request.agent>;

export async function signedUpAgent(name = 'alice'): Promise<Agent> {
  const agent = request.agent(app);
  const res = await agent
    .post('/api/auth/signup')
    .send({ email: `${name}@example.com`, username: name, password: 'correct horse' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return agent;
}

// A stand-in for an outside service (OpenRouteService, Nominatim, Gemini).
// `handle` gets each request and its parsed JSON body, and returns
// [status, body] or [status, body, headers].
// A request the fake service got. body: parsed JSON (anything), or { bytes } for a file.
export interface FakeRequest {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: any;
}
export type FakeReply = [number, unknown] | [number, unknown, Record<string, string>];

export interface FakeService {
  url: string;
  requests: FakeRequest[];
  close: () => Promise<void>;
}

export async function startFakeService(handle: (request: FakeRequest) => FakeReply | Promise<FakeReply>): Promise<FakeService> {
  const { createServer } = await import('node:http');
  const requests: FakeRequest[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks);
    let body = null;
    try {
      body = raw.length ? JSON.parse(raw.toString()) : null;
    } catch {
      body = { bytes: raw.length }; // an uploaded file, not JSON
    }
    const request: FakeRequest = { method: req.method ?? 'GET', url: req.url ?? '/', headers: req.headers, body };
    requests.push(request);
    const [status, reply, headers = {}] = await handle(request);
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers }).end(JSON.stringify(reply));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
