import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useStudio } from '../useStudio';
import { useAuth } from '../auth';
import { HistoryStrip, ResultView } from '../components/Studio';
import EnhanceButton from '../components/EnhanceButton';

/*
 * Image generation docks its prompt bar to the bottom of the canvas instead
 * of using a left rail, matching imagegeneration.png.
 */
export default function ImageStudio() {
  const { user, loading: authLoading } = useAuth();
  const studio = useStudio('image');

  const [prompt, setPrompt] = useState('');
  const [originalPrompt, setOriginalPrompt] = useState<string | null>(null);
  const [model, setModel] = useState('');
  const [aspect, setAspect] = useState('1:1');

  useEffect(() => {
    if (!model && studio.catalog) {
      setModel(studio.catalog.models.find(m => m.available)?.id ?? studio.catalog.models[0]?.id ?? '');
    }
  }, [studio.catalog, model]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/signin?next=/image" replace />;

  const models = studio.catalog?.models ?? [];
  const selected = models.find(m => m.id === model);
  const cost = selected?.cost ?? 1;
  const canSubmit = prompt.trim().length >= 2 && Boolean(selected?.available) && user.credits >= cost;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const created = await studio.generate({ prompt, originalPrompt, model, aspectRatio: aspect });
    if (created) {
      setPrompt('');
      setOriginalPrompt(null);
    }
  }

  const hasWork = studio.generations.length > 0;

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {hasWork ? (
          <ResultView generation={studio.active} onDelete={studio.remove} />
        ) : (
          <div className="px-6 text-center">
            <h1 className="display text-4xl sm:text-5xl">
              Start creating with
              <br />
              <span className="text-accent">8xBuildAI stills</span>
            </h1>
            <p className="mt-4 text-sm text-muted">
              Describe a scene, character, mood or style — and watch it come to life
            </p>
          </div>
        )}
      </div>

      {hasWork && (
        <div className="border-t border-line">
          <HistoryStrip
            generations={studio.generations}
            activeId={studio.activeId}
            onSelect={studio.setActiveId}
          />
        </div>
      )}

      <div className="border-t border-line p-4">
        {studio.error && (
          <p className="mx-auto mb-3 max-w-4xl rounded-lg border border-hot/40 bg-hot/10 p-3 text-xs text-hot">
            {studio.error}
          </p>
        )}

        <form
          onSubmit={submit}
          className="mx-auto flex max-w-4xl flex-col gap-3 rounded-2xl border border-line bg-panel p-3 sm:flex-row sm:items-end"
        >
          <div className="min-w-0 flex-1">
            <input
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Describe the scene you imagine"
              className="w-full bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted/60"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <select
                value={model}
                onChange={e => setModel(e.target.value)}
                className="rounded-lg border border-line bg-panel2 px-3 py-1.5 text-xs outline-none focus:border-accent"
              >
                {models.map(m => (
                  <option key={m.id} value={m.id} disabled={!m.available}>
                    {m.label}
                    {m.available ? '' : ' — unavailable'}
                  </option>
                ))}
              </select>

              <EnhanceButton
                kind="image"
                prompt={prompt}
                compact
                available={Boolean(studio.catalog?.providerStatus.enhancer)}
                onChange={(next, original) => {
                  setPrompt(next);
                  setOriginalPrompt(original);
                }}
              />

              {(studio.catalog?.aspectRatios ?? ['1:1']).map(r => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setAspect(r)}
                  className={`rounded-lg border px-3 py-1.5 text-xs ${
                    aspect === r ? 'border-accent text-accent' : 'border-line text-muted hover:text-body'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={!canSubmit || studio.submitting}
            className="shrink-0 rounded-xl bg-accent px-8 py-4 text-sm font-bold text-accentink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {studio.submitting ? 'Starting…' : `Generate ✦ ${cost}`}
          </button>
        </form>

        {selected && !selected.available && (
          <p className="mx-auto mt-2 max-w-4xl text-center text-[11px] text-muted">{selected.reason}</p>
        )}
      </div>
    </div>
  );
}
