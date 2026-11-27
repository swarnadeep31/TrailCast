// An error that carries the HTTP status the error handler should answer with,
// and sometimes a code the page can act on ('exists', 'far_places').
export type HttpError = Error & { status: number; code?: string };

export function httpError(status: number, message: string): HttpError {
  return Object.assign(new Error(message), { status });
}
