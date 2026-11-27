import { useState, type FormEvent } from 'react';
import type { ApiError } from '../api.ts';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router';
import { useAuth } from '../auth.tsx';
import AuthShell from '../components/AuthShell.tsx';
import ErrorMessage from '../components/ErrorMessage.tsx';
import GoogleButton from '../components/GoogleButton.tsx';
import WayInField, { type WayIn } from '../components/WayInField.tsx';
import { safeNext } from '../lib/redirect.ts';
import { useToast } from '../notices.tsx';

const labelClass = 'field-label';

export default function LoginPage() {
  const { user, login, loginWithGoogle } = useAuth();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  // The email or phone number carried over from the sign-up page, if any (never in the address bar).
  const carried: { method?: WayIn; value?: string } = useLocation().state ?? {};
  const next = safeNext(searchParams.get('next'));
  const [method, setMethod] = useState<WayIn>(carried.method ?? 'email');
  const [identifier, setIdentifier] = useState(carried.value ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<Partial<ApiError> | null>(null);
  const [saving, setSaving] = useState(false);

  // Once logged in, move on. Someone who skipped the welcome questions answers them first.
  if (user) return <Navigate to={user.onboardedAt ? next : `/welcome?next=${encodeURIComponent(next)}`} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const loggedIn = await login({ [method]: identifier, password } as { email?: string; phone?: string; password: string });
      toast(`Welcome back${loggedIn.name ? `, ${loggedIn.name.split(' ')[0]}` : ''}!`);
    } catch (err) {
      setError(err as ApiError);
      setSaving(false);
    }
  }

  async function withGoogle(credential: string) {
    setError(null);
    try {
      const { user: loggedIn, existing, passwordRemoved } = await loginWithGoogle(credential);
      // The account was made with a password before: Google now replaces it.
      if (passwordRemoved) toast('Your Google account is now linked. From now on, log in with Google.');
      else toast(existing ? `Welcome back, ${loggedIn.name?.split(' ')[0] ?? 'rider'}!` : 'Your account is ready. Welcome to TrailCast!');
    } catch (err) {
      setError(err as ApiError);
    }
  }

  return (
    <AuthShell
      title="Log in to TrailCast"
      subtitle="Welcome back! Your trails are right where you left them."
      footer={
        <>
          New to TrailCast?{' '}
          <Link to={`/signup?next=${encodeURIComponent(next)}`} className="link font-semibold">
            Create an account
          </Link>
        </>
      }
    >
      <div className="mt-8 space-y-5">
        <GoogleButton text="signin_with" onCredential={withGoogle} onError={(message) => setError(new Error(message))} />
        <form onSubmit={submit} className="space-y-5">
          <WayInField
            method={method}
            onMethod={(value) => {
              setMethod(value);
              setIdentifier('');
              setError(null);
            }}
            value={identifier}
            onChange={setIdentifier}
          />
          <label className={labelClass}>
            Password
            <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
          </label>

          {error && (
            <ErrorMessage>
              {error.message}
              {error.code === 'not_found' && (
                <Link
                  to={`/signup?next=${encodeURIComponent(next)}`}
                  state={{ method, value: identifier }}
                  className="link mt-2 block font-semibold"
                >
                  Sign up instead →
                </Link>
              )}
            </ErrorMessage>
          )}
          <button type="submit" disabled={saving} className="btn-primary w-full">
            {saving ? 'Logging in...' : 'Log in'}
          </button>
        </form>
        {/* "Continue with Google" makes an account here too, for someone new. */}
        <p className="text-small text-ink-soft">
          New here? Continuing with Google makes you an account, and means you agree to the{' '}
          <Link to="/terms" className="link">
            terms of use
          </Link>{' '}
          and the{' '}
          <Link to="/privacy" className="link">
            privacy policy
          </Link>
          .
        </p>
      </div>
    </AuthShell>
  );
}
