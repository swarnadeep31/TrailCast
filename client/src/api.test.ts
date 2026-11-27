import { afterEach, describe, expect, test } from 'bun:test';
import { api, type ApiError } from './api.ts';
import { errorCodeFor, serverWords } from './pages/ErrorPage.tsx';

// What a failed call throws decides which error page shows (see ErrorPage.tsx).
describe('a failed API call', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  // A stand-in for the browser's fetch.
  const fakeFetch = (reply: () => Promise<Response>) => {
    globalThis.fetch = reply as unknown as typeof fetch;
  };
  const answer = (status: number, body: string, type = 'application/json') =>
    fakeFetch(async () => new Response(body, { status, headers: { 'Content-Type': type } }));
  const failure = (call: Promise<unknown>): Promise<ApiError> =>
    call.then(
      () => {
        throw new Error('it should have failed');
      },
      (err: ApiError) => err,
    );

  test("the hosting's own page instead of the server's words (a sleeping server): status kept, plain words", async () => {
    answer(504, '<html>Gateway Timeout</html>', 'text/html');
    const err = await failure(api.getTrail('abc'));
    expect(err.status).toBe(504);
    expect(err.message).toMatch(/took too long to answer/);
    expect(errorCodeFor(err)).toBe(504);
    expect(serverWords(err)).toBeNull();
  });

  test("the server's own words come through with the status", async () => {
    answer(403, JSON.stringify({ error: 'Only the person who added this trail can change it.' }));
    const err = await failure(api.getTrail('abc'));
    expect(err.status).toBe(403);
    expect(serverWords(err)).toBe('Only the person who added this trail can change it.');
  });

  test('no answer at all: status 0, the page for no connection', async () => {
    fakeFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    const err = await failure(api.getTrail('abc'));
    expect(err.status).toBe(0);
    expect(err.message).toMatch(/Couldn't reach TrailCast|offline/);
    expect(errorCodeFor(err)).toBe('network');
  });
});
