import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type Catalog, type Kind, type Model } from '../api';
import { fileToBase64, MAX_UPLOAD_BYTES } from '../fileToBase64';

/*
 * The whole creation surface: one box.
 *
 * Replaces three separate 360px form rails. Mode is a property of the input
 * (RESEARCH.md pattern 2) and the options row is progressive — duration only
 * exists for video, voice only for speech (pattern 3).
 */

const KINDS: { id: Kind; label: string }[] = [
  { id: 'video', label: 'Video' },
  { id: 'image', label: 'Image' },
  { id: 'audio', label: 'Voice' },
];

const PLACEHOLDER: Record<Kind, string> = {
  video: 'Describe a shot — subject, motion, light…',
  image: 'Describe an image…',
  audio: 'Write what the voice should say…',
};

/* A quiet inline control. Not a labelled form field. */
function Chip({
  children,
  active,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-full border px-2.5 py-1 text-[12px] transition disabled:opacity-40 ${
        active
          ? 'border-accent/40 bg-accentsoft text-accent'
          : 'border-border text-muted hover:text-text'
      }`}
    >
      {children}
    </button>
  );
}

function Select({
  value,
  onChange,
  children,
  title,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <select
      value={value}
      title={title}
      onChange={e => onChange(e.target.value)}
      className="cursor-pointer rounded-full border border-border bg-transparent py-1 pr-6 pl-2.5 text-[12px] text-muted outline-none transition hover:text-text focus:border-accent"
    >
      {children}
    </select>
  );
}

export default function Composer({
  kind,
  onKindChange,
  catalog,
  credits,
  signedIn,
  submitting,
  onSubmit,
  autoFocus = false,
}: {
  kind: Kind;
  onKindChange: (k: Kind) => void;
  catalog: Catalog | null;
  credits: number;
  /*
   * A signed-out visitor has no balance to check. Gating them on credits
   * disabled the send button, which made the "sign up to continue" path
   * unreachable and showed them a credit warning they could do nothing about.
   */
  signedIn: boolean;
  submitting: boolean;
  onSubmit: (payload: Record<string, unknown>) => void;
  autoFocus?: boolean;
}) {
  const [prompt, setPrompt] = useState('');
  const [originalPrompt, setOriginalPrompt] = useState<string | null>(null);
  const [model, setModel] = useState('');
  const [aspect, setAspect] = useState('16:9');
  const [duration, setDuration] = useState(6);
  const [voice, setVoice] = useState('Kore');
  const [image, setImage] = useState<{ base64: string; mime: string; name: string } | null>(null);
  const [enhancing, setEnhancing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const models = (catalog?.models ?? []).filter(m => m.kind === kind);
  const selected: Model | undefined = models.find(m => m.id === model);
  const cost = selected?.cost ?? catalog?.costs[kind] ?? 1;
  const affordable = !signedIn || credits >= cost;
  const ready = prompt.trim().length >= 2 && Boolean(selected?.available) && affordable;

  // Pick the first usable model whenever the kind changes.
  useEffect(() => {
    const usable = models.find(m => m.available) ?? models[0];
    if (usable && (!selected || selected.kind !== kind)) setModel(usable.id);
  }, [kind, models, selected]);

  /*
   * Grow with the content instead of scrolling inside it.
   *
   * overflow is toggled rather than left on `auto`: a permanently scrollable
   * field flickers a scrollbar on and off as each line wraps. It only becomes
   * scrollable once the content genuinely exceeds the cap.
   */
  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    const MAX = 260;
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, MAX);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > MAX ? 'auto' : 'hidden';
  }, [prompt]);

  async function enhance() {
    setEnhancing(true);
    setError(null);
    try {
      const { enhanced, original } = await api.enhance(kind, prompt.trim());
      setOriginalPrompt(original);
      setPrompt(enhanced);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not rewrite that.');
    } finally {
      setEnhancing(false);
    }
  }

  async function pickImage(file: File) {
    if (!file.type.startsWith('image/')) return setError('That file is not an image.');
    if (file.size > MAX_UPLOAD_BYTES) return setError('Images must be under 8MB.');
    try {
      setImage(await fileToBase64(file));
      setError(null);
    } catch {
      setError('Could not read that file.');
    }
  }

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!ready || submitting) return;
    onSubmit({
      prompt: prompt.trim(),
      originalPrompt,
      model,
      ...(kind === 'video' ? { aspectRatio: aspect, duration } : {}),
      ...(kind === 'image' ? { aspectRatio: aspect } : {}),
      ...(kind === 'audio' ? { voice } : {}),
      ...(kind === 'video' && image ? { imageBase64: image.base64, imageMimeType: image.mime } : {}),
    });
    setPrompt('');
    setOriginalPrompt(null);
    setImage(null);
  }

  return (
    <form onSubmit={submit}>
      <div className="rounded-[var(--radius-composer)] border border-border bg-surface transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15">
        <textarea
          ref={textarea}
          value={prompt}
          autoFocus={autoFocus}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => {
            // Enter sends, Shift+Enter breaks the line — the convention both
            // reference products use.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder={PLACEHOLDER[kind]}
          aria-label="Prompt"
          className="composer-field block w-full resize-none overflow-y-hidden bg-transparent px-4 pt-4 pb-2 text-[15px] leading-relaxed outline-none"
        />

        {image && (
          <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg bg-surface2 px-2.5 py-1.5 text-[12px]">
            <span className="truncate text-muted">{image.name}</span>
            <button
              type="button"
              onClick={() => setImage(null)}
              className="ml-auto text-muted hover:text-text"
              aria-label="Remove reference image"
            >
              ✕
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5 px-3 pb-3">
          {KINDS.map(k => (
            <Chip key={k.id} active={kind === k.id} onClick={() => onKindChange(k.id)}>
              {k.label}
            </Chip>
          ))}

          <span className="mx-0.5 h-4 w-px bg-border" />

          <Select value={model} onChange={setModel} title="Model">
            {models.map(m => (
              <option key={m.id} value={m.id} disabled={!m.available}>
                {m.label}
                {m.available ? '' : ' — unavailable'}
              </option>
            ))}
          </Select>

          {kind !== 'audio' && (
            <Select value={aspect} onChange={setAspect} title="Aspect ratio">
              {(catalog?.aspectRatios ?? ['16:9']).map(r => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          )}

          {kind === 'video' && (
            <Select value={String(duration)} onChange={v => setDuration(Number(v))} title="Duration">
              {[4, 6, 8, 10].map(d => (
                <option key={d} value={d}>
                  {d}s
                </option>
              ))}
            </Select>
          )}

          {kind === 'audio' && (
            <Select value={voice} onChange={setVoice} title="Voice">
              {(catalog?.voices ?? []).map(v => (
                <option key={v.id} value={v.name}>
                  {v.name}
                </option>
              ))}
            </Select>
          )}

          {kind === 'video' && (
            <label className="cursor-pointer rounded-full border border-border px-2.5 py-1 text-[12px] text-muted transition hover:text-text">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => e.target.files?.[0] && pickImage(e.target.files[0])}
              />
              {image ? 'Change image' : '+ Image'}
            </label>
          )}

          {catalog?.providerStatus.enhancer && (
            <Chip onClick={enhance} disabled={enhancing || prompt.trim().length < 2}>
              {enhancing ? 'Rewriting…' : 'Enhance'}
            </Chip>
          )}

          <div className="ml-auto flex items-center gap-2">
            {signedIn && <span className="text-[12px] text-muted tabular-nums">{cost}</span>}
            <button
              type="submit"
              disabled={!ready || submitting}
              aria-label="Generate"
              className="grid h-8 w-8 place-items-center rounded-full bg-accent text-accentink transition hover:bg-accenthover disabled:opacity-30"
            >
              {submitting ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                  <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {originalPrompt && (
        <p className="mt-2 px-1 text-[12px] text-muted">
          Rewritten from “{originalPrompt}”.{' '}
          <button
            type="button"
            onClick={() => {
              setPrompt(originalPrompt);
              setOriginalPrompt(null);
            }}
            className="underline underline-offset-2 hover:text-text"
          >
            Undo
          </button>
        </p>
      )}

      {selected && !selected.available && (
        <p className="mt-2 px-1 text-[12px] text-muted">{selected.reason}</p>
      )}

      {signedIn && !affordable && (
        <p className="mt-2 px-1 text-[12px] text-danger">
          Needs {cost} credits; you have {credits}.
        </p>
      )}

      {error && <p className="mt-2 px-1 text-[12px] text-danger">{error}</p>}
    </form>
  );
}
