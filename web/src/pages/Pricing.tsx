import { useEffect, useState } from 'react';
import { api, type Plan } from '../api';

export default function Pricing() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [annual, setAnnual] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .catalog()
      .then(c => setPlans(c.plans))
      .catch(err => setError(err.message));
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <header className="text-center">
        <h1 className="display text-4xl sm:text-5xl">Find the right fit</h1>
        <p className="mt-3 text-sm text-muted">From individuals to enterprise teams</p>
      </header>

      <div className="mt-8 flex items-center justify-center gap-3">
        <span className={`text-sm ${annual ? 'text-muted' : 'font-medium'}`}>Monthly</span>
        <button
          role="switch"
          aria-checked={annual}
          aria-label="Bill annually"
          onClick={() => setAnnual(v => !v)}
          className={`relative h-6 w-11 rounded-full transition ${annual ? 'bg-accent' : 'bg-line'}`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
              annual ? 'left-[22px]' : 'left-0.5'
            }`}
          />
        </button>
        <span className={`text-sm ${annual ? 'font-medium' : 'text-muted'}`}>Annual</span>
      </div>

      {error && <p className="mt-8 text-center text-sm text-hot">{error}</p>}

      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {plans.map(plan => {
          const price = annual ? plan.annual : plan.monthly;
          const showWas = annual && plan.was && plan.was !== plan.annual;

          return (
            <div
              key={plan.id}
              className={`flex flex-col rounded-2xl border p-6 ${
                plan.style === 'hot'
                  ? 'border-hot/50 bg-gradient-to-b from-hot/10 to-transparent'
                  : plan.style === 'accent'
                    ? 'border-accent/40 bg-gradient-to-b from-accent/8 to-transparent'
                    : 'border-line bg-panel'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="display text-2xl">{plan.name}</h2>
                {plan.discount && annual && (
                  <span className="rounded-md bg-hot px-2 py-0.5 text-[10px] font-bold">{plan.discount}</span>
                )}
                {plan.badge && (
                  <span className="rounded-md bg-accent px-2 py-0.5 text-[10px] font-bold text-accentink">
                    {plan.badge}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted">{plan.tagline}</p>

              <div className="mt-5 rounded-xl border border-line bg-panel2 p-4">
                <p className="text-sm font-semibold">
                  <span className="text-accent">✦</span> {plan.credits.toLocaleString()} credits/mo.
                </p>
                <ul className="mt-2 space-y-1">
                  {plan.highlights.map(h => (
                    <li key={h} className="text-xs text-muted">
                      {h}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-5">
                {showWas && <span className="mr-2 text-xl text-hot line-through">${plan.was}</span>}
                <span className="text-3xl font-bold">${price}</span>
                <span className="ml-1 text-xs text-muted">
                  per month{annual ? ', billed annually' : ''}
                </span>
              </div>

              <button
                className={`mt-5 rounded-xl py-3 text-sm font-bold transition hover:brightness-110 ${
                  plan.style === 'hot'
                    ? 'bg-hot text-white'
                    : plan.style === 'accent'
                      ? 'bg-accent text-accentink'
                      : 'bg-white text-ink'
                }`}
              >
                {plan.cta}
              </button>
              <p className="mt-2 text-center text-[11px] text-muted">{annual ? plan.note : '—'}</p>

              <div className="mt-6 border-t border-line pt-4">
                <p className="mb-3 text-[11px] font-bold tracking-wide text-muted">UNLIMITED &amp; FREE GENS</p>
                <ul className="space-y-2">
                  {plan.unlimited.map(item => (
                    <li key={item.name} className="flex items-center gap-2 text-xs">
                      <span className={item.included ? 'text-accent' : 'text-muted/50'}>
                        {item.included ? '✓' : '✕'}
                      </span>
                      <span className={item.included ? '' : 'text-muted/50'}>{item.name}</span>
                      {item.tag && (
                        <span className="ml-auto rounded bg-accent px-1.5 py-0.5 text-[9px] font-bold text-accentink">
                          {item.tag}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-10 text-center text-xs text-muted">
        Checkout is not wired up in this build — plans are presentational.
      </p>
    </div>
  );
}
