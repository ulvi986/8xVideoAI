import { useEffect, useState } from 'react';
import { api, ApiError, asset, type Generation } from '../api';

/*
 * One generation, as a row in the feed below the composer.
 *
 * Replaces the canvas + thumbnail-strip arrangement: results now appear
 * directly under the box that made them, newest first (RESEARCH.md pattern 6).
 */

function Elapsed({ from }: { from: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return <>{Math.max(0, Math.round((Date.now() - new Date(from).getTime()) / 1000))}s</>;
}

function Action({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="rounded-lg px-2 py-1 text-[12px] text-muted transition hover:bg-surface2 hover:text-text disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export default function Result({
  generation,
  onDelete,
  timeoutSeconds,
}: {
  generation: Generation;
  onDelete?: (id: string) => void;
  /* Shown while running, so the wait is visibly bounded rather than open-ended. */
  timeoutSeconds?: number;
}) {
  const [published, setPublished] = useState(generation.published);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPublished(generation.published);
  }, [generation.id, generation.published]);

  const pending = generation.status === 'QUEUED' || generation.status === 'PROCESSING';

  async function togglePublish() {
    setBusy(true);
    setError(null);
    try {
      const { generation: updated } = await api.publish(generation.id, !published);
      setPublished(updated.published);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update sharing.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="fade-up border-t border-border py-6 first:border-t-0">
      <p className="text-[15px] leading-relaxed">{generation.prompt}</p>

      <p className="mt-1 text-[12px] text-muted">
        {generation.model}
        {generation.simulated && ' · simulated'}
        {generation.originalPrompt && ` · rewritten from “${generation.originalPrompt}”`}
      </p>

      <div className="mt-4">
        {pending && (
          <div className="flex items-center gap-2.5 text-[13px] text-muted">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-border border-t-accent" />
            <span className="pulse-soft">
              {generation.status === 'QUEUED' ? 'Queued' : 'Generating'}
            </span>
            <span className="tabular-nums">
              <Elapsed from={generation.startedAt ?? generation.createdAt} />
              {timeoutSeconds ? <span className="text-muted/70"> / {timeoutSeconds}s max</span> : null}
            </span>
          </div>
        )}

        {generation.status === 'FAILED' && (
          <div className="rounded-[var(--radius-card)] bg-surface2 px-4 py-3">
            <p className="text-[13px] text-danger">{generation.error}</p>
            <p className="mt-1 text-[12px] text-muted">
              {generation.creditsCost} credits refunded.
            </p>
          </div>
        )}

        {generation.status === 'COMPLETED' && generation.outputUrl && (
          <>
            {generation.kind === 'video' && (
              <video
                src={asset(generation.outputUrl)}
                poster={generation.thumbnailUrl ? asset(generation.thumbnailUrl) : undefined}
                controls
                loop
                playsInline
                className="w-full rounded-[var(--radius-card)] border border-border"
              />
            )}
            {generation.kind === 'image' && (
              <img
                src={asset(generation.outputUrl)}
                alt={generation.prompt}
                className="w-full rounded-[var(--radius-card)] border border-border"
              />
            )}
            {generation.kind === 'audio' && (
              <audio src={asset(generation.outputUrl)} controls className="w-full" />
            )}

            <div className="mt-2 flex flex-wrap items-center gap-1">
              <a
                href={asset(generation.outputUrl)}
                download
                className="rounded-lg px-2 py-1 text-[12px] text-muted transition hover:bg-surface2 hover:text-text"
              >
                Download
              </a>

              {generation.kind !== 'audio' && (
                <Action onClick={togglePublish} disabled={busy}>
                  {published ? 'Shared ✓' : 'Share'}
                </Action>
              )}

              {onDelete && <Action onClick={() => onDelete(generation.id)}>Delete</Action>}

              {error && <span className="px-2 text-[12px] text-danger">{error}</span>}
            </div>
          </>
        )}
      </div>
    </article>
  );
}
