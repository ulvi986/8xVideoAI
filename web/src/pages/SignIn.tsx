import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { ApiError } from '../api';

export default function SignIn() {
  const { user, login, signup, loading } = useAuth();
  const [params] = useSearchParams();
  const next = params.get('next') || '/video';

  const [mode, setMode] = useState<'signin' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to={next} replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signup') await signup(email, password, displayName);
      else await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const input =
    'w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[14px] outline-none transition focus:border-accent';

  return (
    <div className="mx-auto grid min-h-[80vh] w-full max-w-[380px] place-items-center px-5 pb-24">
      <div className="w-full">
        <h1 className="h text-center text-[22px]">
          {mode === 'signup' ? 'Create an account' : 'Welcome back'}
        </h1>
        <p className="mt-1.5 text-center text-[13px] text-muted">
          {mode === 'signup' ? '10 free credits, no card.' : 'Sign in to keep creating.'}
        </p>

        <form onSubmit={submit} className="mt-7 space-y-2.5">
          {mode === 'signup' && (
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Name"
              autoComplete="name"
              className={input}
            />
          )}
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="email"
            className={input}
          />
          <input
            type="password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password — at least 8 characters"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            className={input}
          />

          {error && <p className="text-[12px] text-danger">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-accent py-2.5 text-[14px] font-medium text-accentink transition hover:bg-accenthover disabled:opacity-50"
          >
            {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="mt-5 text-center text-[13px] text-muted">
          {mode === 'signup' ? 'Already have an account?' : 'No account yet?'}{' '}
          <button
            onClick={() => {
              setMode(m => (m === 'signup' ? 'signin' : 'signup'));
              setError(null);
            }}
            className="text-accent hover:underline"
          >
            {mode === 'signup' ? 'Sign in' : 'Create one'}
          </button>
        </p>
      </div>
    </div>
  );
}
