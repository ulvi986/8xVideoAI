import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, type Generation, type Model } from '../api';

/* ---------------------------------------------------------------- pieces */

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted/70">{hint}</span>}
    </label>
  );
}

export function ModelPicker({
  models,
  value,
  onChange,
}: {
  models: Model[];
  value: string;
  onChange: (id: string) => void;
}) {
  const selected = models.find(m => m.id === value);

  return (
    <Field label="Model">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-lg border border-line bg-panel2 px-3 py-2.5 text-sm outline-none focus:border-accent"
      >
        {models.map(model => (
          <option key={model.id} value={model.id} disabled={!model.available}>
            {model.label} · {model.cost} credits{model.available ? '' : ' — unavailable'}
          </option>
        ))}
      </select>
      {selected && (
        <span className="mt-1.5 block text-[11px] text-muted/80">
          {selected.available ? selected.blurb : selected.reason}
        </span>
      )}
    </Field>
  );
}

export function GenerateButton({
  cost,
  disabled,
  submitting,
  label = 'Generate',
  balance,
}: {
  cost: number;
  disabled: boolean;
  submitting: boolean;
  label?: string;
  balance: number;
}) {
  const broke = balance < cost;
  return (
    <div>
      <button
        type="submit"
        disabled={disabled || submitting || broke}
        className="w-full rounded-xl bg-accent py-3.5 text-[15px] font-bold text-accentink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? 'Starting…' : `${label} ✦ ${cost}`}
      </button>
      {broke && (
        <p className="mt-2 text-center text-[11px] text-hot">
          You need {cost - balance} more credit{cost - balance === 1 ? '' : 's'}.{' '}
          <Link to="/pricing" className="underline">
            Upgrade
          </Link>
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ result view */

function elapsed(from: string) {
  return Math.max(0, Math.round((Date.now() - new Date(from).getTime()) / 1000));
}

function Progress({ generation }: { generation: Generation }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const seconds = elapsed(generation.startedAt ?? generation.createdAt);

  return (
    <div className="grid h-full place-items-center p-8 text-center">
      <div>
        <div className="mx-auto mb-5 h-10 w-10 animate-spin rounded-full border-2 border-line border-t-accent" />
        <p className="text-sm font-medium">
          {generation.status === 'QUEUED' ? 'Queued' : 'Generating'}
        </p>
        <p className="mt-1 text-xs text-muted">
          {seconds}s elapsed · {generation.model}
        </p>
        <p className="mx-auto mt-4 max-w-md text-xs text-muted/70">“{generation.prompt}”</p>
      </div>
    </div>
  );
}

/*
 * Share to the community feed. Audio is excluded deliberately — the feed is a
 * visual grid, and the server rejects it too, so the control is not offered.
 */
function ShareControl({ generation }: { generation: Generation }) {
  const [published, setPublished] = useState(generation.published);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A different generation selected in History must reset the toggle.
  useEffect(() => {
    setPublished(generation.published);
    setError(null);
  }, [generation.id, generation.published]);

  if (generation.kind === 'audio') return null;

  async function toggle() {
    setBusy(true);
    setError(null);
    const next = !published;
    try {
      const { generation: updated } = await api.publish(generation.id, next);
      setPublished(updated.published);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update sharing.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={toggle}
        disabled={busy}
        className={`rounded-lg px-4 py-2 text-xs font-semibold transition disabled:opacity-50 ${
          published
            ? 'border border-accent/50 bg-accent/10 text-accent'
            : 'border border-line hover:bg-panel2'
        }`}
      >
        {busy ? '…' : published ? '✓ In community' : 'Share to community'}
      </button>
      {error && <span className="text-[11px] text-hot">{error}</span>}
    </div>
  );
}

export function ResultView({ generation, onDelete }: { generation: Generation | null; onDelete?: (id: string) => void }) {
  if (!generation) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div>
          <h2 className="display text-3xl text-body/90">Nothing here yet</h2>
          <p className="mt-2 text-sm text-muted">Write a prompt and generate your first result.</p>
        </div>
      </div>
    );
  }

  if (generation.status === 'QUEUED' || generation.status === 'PROCESSING') {
    return <Progress generation={generation} />;
  }

  if (generation.status === 'FAILED') {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div className="max-w-md">
          <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-full bg-hot/15 text-hot">!</div>
          <p className="text-sm font-medium text-hot">Generation failed</p>
          <p className="mt-2 text-xs text-muted">{generation.error}</p>
          <p className="mt-3 text-[11px] text-muted/70">
            Your {generation.creditsCost} credits were refunded.
          </p>
        </div>
      </div>
    );
  }

  const url = generation.outputUrl!;

  return (
    <div className="flex h-full flex-col p-4 sm:p-6">
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {generation.kind === 'video' && (
          <video
            key={url}
            src={url}
            poster={generation.thumbnailUrl ?? undefined}
            controls
            autoPlay
            loop
            className="max-h-full max-w-full rounded-xl border border-line"
          />
        )}
        {generation.kind === 'image' && (
          <img
            key={url}
            src={url}
            alt={generation.prompt}
            className="max-h-full max-w-full rounded-xl border border-line"
          />
        )}
        {generation.kind === 'audio' && (
          <div className="w-full max-w-xl rounded-xl border border-line bg-panel p-6">
            <p className="mb-4 text-sm text-muted">“{generation.prompt}”</p>
            <audio key={url} src={url} controls className="w-full" />
          </div>
        )}
      </div>

      {generation.originalPrompt && (
        <p className="mt-3 text-[11px] text-muted/70">
          Rewritten from: “{generation.originalPrompt}”
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <span className="text-xs text-muted">{generation.model}</span>
        {generation.simulated && (
          <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-semibold text-muted">
            SIMULATED
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ShareControl generation={generation} />
          <a
            href={url}
            download
            className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-accentink hover:brightness-110"
          >
            Download
          </a>
          {onDelete && (
            <button
              onClick={() => onDelete(generation.id)}
              className="rounded-lg border border-line px-4 py-2 text-xs hover:bg-panel2"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- history */

export function HistoryStrip({
  generations,
  activeId,
  onSelect,
}: {
  generations: Generation[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  if (generations.length === 0) {
    return <p className="px-4 py-6 text-center text-xs text-muted">No generations yet.</p>;
  }

  return (
    <div className="flex gap-3 overflow-x-auto p-4">
      {generations.map(g => {
        const busy = g.status === 'QUEUED' || g.status === 'PROCESSING';
        return (
          <button
            key={g.id}
            onClick={() => onSelect(g.id)}
            title={g.prompt}
            className={`relative h-20 w-32 shrink-0 overflow-hidden rounded-lg border text-left ${
              activeId === g.id ? 'border-accent' : 'border-line'
            }`}
          >
            {g.thumbnailUrl ? (
              <img src={g.thumbnailUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span
                className={`relative block h-full w-full overflow-hidden bg-panel2 ${busy ? 'shimmer' : ''}`}
              />
            )}
            <span className="absolute inset-x-0 bottom-0 truncate bg-black/70 px-1.5 py-1 text-[10px]">
              {busy ? g.status.toLowerCase() : g.status === 'FAILED' ? 'failed' : g.prompt}
            </span>
          </button>
        );
      })}
    </div>
  );
}
