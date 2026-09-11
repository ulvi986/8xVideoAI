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

  return (
    <div className="grid min-h-[calc(100vh-3.5rem)] place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="display text-center text-3xl">
          {mode === 'signup' ? 'Create your account' : 'Welcome back'}
        </h1>
        <p className="mt-2 text-center text-sm text-muted">
          {mode === 'signup' ? 'Start with 10 free credits.' : 'Sign in to keep creating.'}
        </p>

        <form onSubmit={submit} className="mt-8 space-y-3">
          {mode === 'signup' && (
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Display name"
              autoComplete="name"
              className="w-full rounded-lg border border-line bg-panel px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
          )}
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="w-full rounded-lg border border-line bg-panel px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
          <input
            type="password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password — at least 8 characters"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            className="w-full rounded-lg border border-line bg-panel px-3 py-2.5 text-sm outline-none focus:border-accent"
          />

          {error && (
            <p className="rounded-lg border border-hot/40 bg-hot/10 p-3 text-xs text-hot">{error}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-accent py-3 text-sm font-bold text-accentink hover:brightness-110 disabled:opacity-50"
          >
            {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-muted">
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
