import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useStudio } from '../useStudio';
import { useAuth } from '../auth';
import { Field, GenerateButton, HistoryStrip, ModelPicker, ResultView } from '../components/Studio';
import EnhanceButton from '../components/EnhanceButton';

export default function AudioStudio() {
  const { user, loading: authLoading } = useAuth();
  const studio = useStudio('audio');

  const [script, setScript] = useState('');
  const [originalPrompt, setOriginalPrompt] = useState<string | null>(null);
  const [model, setModel] = useState('');
  const [voice, setVoice] = useState('kore');
  const [tab, setTab] = useState<'history' | 'how'>('history');

  useEffect(() => {
    if (!model && studio.catalog) {
      setModel(studio.catalog.models.find(m => m.available)?.id ?? studio.catalog.models[0]?.id ?? '');
    }
  }, [studio.catalog, model]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/signin?next=/audio" replace />;

  const models = studio.catalog?.models ?? [];
  const selected = models.find(m => m.id === model);
  const cost = selected?.cost ?? 2;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await studio.generate({ prompt: script, originalPrompt, model, voice });
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      <aside className="flex w-[360px] shrink-0 flex-col border-r border-line bg-panel">
        <div className="border-b border-line px-4 py-3">
          <span className="border-b-2 border-accent pb-3 text-sm font-semibold">Text to Speech</span>
        </div>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <Field label="Script" hint="Write exactly what the voice will read out loud.">
            <textarea
              value={script}
              onChange={e => setScript(e.target.value)}
              rows={7}
              placeholder="Write your script…"
              className="w-full resize-none rounded-lg border border-line bg-panel2 p-3 text-sm outline-none placeholder:text-muted/60 focus:border-accent"
            />
          </Field>

          <EnhanceButton
            kind="audio"
            prompt={script}
            available={Boolean(studio.catalog?.providerStatus.enhancer)}
            onChange={(next, original) => {
              setScript(next);
              setOriginalPrompt(original);
            }}
          />

          <ModelPicker models={models} value={model} onChange={setModel} />

          <Field label="Voice">
            <div className="grid gap-2">
              {(studio.catalog?.voices ?? []).map(v => (
                <button
                  type="button"
                  key={v.id}
                  onClick={() => setVoice(v.id)}
                  className={`flex items-center gap-3 rounded-lg border p-2.5 text-left ${
                    voice === v.id ? 'border-accent bg-accent/5' : 'border-line hover:bg-panel2'
                  }`}
                >
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold text-accentink"
                    style={{ background: 'linear-gradient(135deg,#e8ff7a,#98c400)' }}
                  >
                    {v.name.slice(0, 2)}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{v.name}</span>
                    <span className="block truncate text-[11px] text-muted">{v.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </Field>

          {studio.error && (
            <p className="rounded-lg border border-hot/40 bg-hot/10 p-3 text-xs text-hot">{studio.error}</p>
          )}

          <div className="mt-auto pt-2">
            <GenerateButton
              cost={cost}
              balance={user.credits}
              submitting={studio.submitting}
              disabled={script.trim().length < 2 || !selected?.available}
            />
          </div>
        </form>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex gap-1 border-b border-line px-4 py-2">
          {(['history', 'how'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                tab === t ? 'bg-panel2 font-medium' : 'text-muted hover:text-body'
              }`}
            >
              {t === 'history' ? 'History' : 'How it works'}
            </button>
          ))}
        </div>

        {tab === 'how' ? (
          <div className="mx-auto max-w-2xl p-10 text-center">
            <h2 className="display text-4xl">Turn text into speech</h2>
            <p className="mt-3 text-sm text-muted">
              Lifelike speech from any script — ready for your projects. Pick a voice, write the
              script, and generate.
            </p>
            {selected?.simulated && (
              <p className="mt-6 rounded-lg border border-line bg-panel p-4 text-xs text-muted">
                The local model produces a placeholder tone bed rather than speech — there is no
                offline TTS engine here. Add a <code className="text-accent">GEMINI_API_KEY</code> for
                real voice.
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1">
              <ResultView generation={studio.active} onDelete={studio.remove} />
            </div>
            <div className="border-t border-line">
              <HistoryStrip
                generations={studio.generations}
                activeId={studio.activeId}
                onSelect={studio.setActiveId}
              />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
