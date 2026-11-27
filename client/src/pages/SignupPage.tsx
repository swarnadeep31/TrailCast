import { useState, type ChangeEvent, type FormEvent } from 'react';
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

export default function SignupPage() {
  const { user, signup, loginWithGoogle } = useAuth();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  // The email or phone number carried over from the log-in page, if any (never in the address bar).
  const carried: { method?: WayIn; value?: string } = useLocation().state ?? {};
  const next = safeNext(searchParams.get('next'));
  const [method, setMethod] = useState<WayIn>(carried.method ?? 'email');
  const [form, setForm] = useState({ name: '', identifier: carried.value ?? '', password: '' });
  const [error, setError] = useState<Partial<ApiError> | null>(null);
  const [saving, setSaving] = useState(false);

  // Once signed up (or if already logged in), move on. New accounts answer the welcome questions first.
  if (user) return <Navigate to={user.onboardedAt ? next : `/welcome?next=${encodeURIComponent(next)}`} replace />;

  const update = (field: keyof typeof form) => (event: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [field]: event.target.value });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await signup({ name: form.name, [method]: form.identifier, password: form.password });
      toast('Your account is ready. Welcome to TrailCast!');
    } catch (err) {
      setError(err as ApiError);
      setSaving(false);
    }
  }

  // With Google there's nothing to type: an account that's already there just logs in, and says so.
  async function withGoogle(credential: string) {
    setError(null);
    try {
      const { user: loggedIn, existing, passwordRemoved } = await loginWithGoogle(credential);
      // The account was made with a password before: Google now replaces it.
      if (passwordRemoved) toast('Your Google account is now linked. From now on, log in with Google.');
      else
        toast(
          existing
            ? `You already have an account, ${loggedIn.name?.split(' ')[0] ?? 'rider'}, so we logged you in.`
            : 'Your account is ready. Welcome to TrailCast!',
        );
    } catch (err) {
      setError(err as ApiError);
    }
  }

  return (
    <AuthShell
      title="Create your TrailCast account"
      subtitle="Share your rides and treks with the map beside them. It's free."
      footer={
        <>
          Already have an account?{' '}
          <Link to={`/login?next=${encodeURIComponent(next)}`} className="link font-semibold">
            Log in
          </Link>
        </>
      }
    >
      <div className="mt-8 space-y-5">
        <GoogleButton text="signup_with" onCredential={withGoogle} onError={(message) => setError(new Error(message))} />
        <form onSubmit={submit} className="space-y-5">
          <label className={labelClass}>
            Your name
            <input required maxLength={60} autoComplete="name" value={form.name} onChange={update('name')} placeholder="Your full name" className="input" />
            <span className="hint">Shown on your profile.</span>
          </label>
          <WayInField
            method={method}
            onMethod={(value) => {
              setMethod(value);
              setForm({ ...form, identifier: '' });
              setError(null);
            }}
            value={form.identifier}
            onChange={(value) => setForm({ ...form, identifier: value })}
            newAccount
          />
          <label className={labelClass}>
            Password
            <input type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={update('password')} className="input" />
            <span className="hint">At least 8 characters.</span>
          </label>

          {error && (
            <ErrorMessage>
              {error.message}
              {error.code === 'exists' && (
                <Link
                  to={`/login?next=${encodeURIComponent(next)}`}
                  state={{ method, value: form.identifier }}
                  className="link mt-2 block font-semibold"
                >
                  Log in instead →
                </Link>
              )}
            </ErrorMessage>
          )}
          <button type="submit" disabled={saving} className="btn-primary w-full">
            {saving ? 'Creating your account...' : 'Sign up'}
          </button>
        </form>
        <p className="text-small text-ink-soft">
          By signing up, with Google or a password, you agree to the{' '}
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
