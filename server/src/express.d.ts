// What the login middleware (middleware/auth.ts) adds to every request.
import type { UserDoc } from './models/User.ts';

declare global {
  namespace Express {
    interface Request {
      // The logged-in user, if a valid session cookie came with the request.
      user?: UserDoc;
      // This device's login, for logging it out.
      sessionId?: string | null;
    }
  }
}

export {};
