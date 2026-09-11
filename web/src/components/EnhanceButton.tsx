import { useState } from 'react';
import { api, ApiError, type Kind } from '../api';

/*
 * Rewrites the prompt with Azure OpenAI.
 *
 * The original is kept and offered back as "Undo" rather than being
 * overwritten silently — the user wrote it, and the rewrite is a suggestion.
 */
export default function EnhanceButton({
  kind,
  prompt,
  onChange,
  available,
  compact = false,
}: {
  kind: Kind;
  prompt: string;
  onChange: (next: string, original: string | null) => void;
  available: boolean;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previous, setPrevious] = useState<string | null>(null);

  const tooShort = prompt.trim().length < 2;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const { enhanced, original } = await api.enhance(kind, prompt.trim());
      setPrevious(original);
      onChange(enhanced, original);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not rewrite that prompt.');
    } finally {
      setBusy(false);
    }
  }

  function undo() {
    if (previous === null) return;
    onChange(previous, null);
    setPrevious(null);
  }

  if (!available) return null;

  return (
    <div className={compact ? '' : 'mt-2'}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={run}
          disabled={busy || tooShort}
          title={tooShort ? 'Write a prompt first' : 'Rewrite this prompt with AI'}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel2 px-3 py-1.5 text-xs font-medium transition hover:border-accent/60 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? (
            <>
              <span className="h-3 w-3 animate-spin rounded-full border border-muted border-t-accent" />
              Rewriting…
            </>
          ) : (
            <>✦ Enhance prompt</>
          )}
        </button>

        {previous !== null && !busy && (
          <button
            type="button"
            onClick={undo}
            className="rounded-lg px-2 py-1.5 text-xs text-muted underline-offset-2 hover:text-body hover:underline"
          >
            Undo
          </button>
        )}
      </div>

      {error && <p className="mt-1.5 text-[11px] text-hot">{error}</p>}
    </div>
  );
}
