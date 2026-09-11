import { useEffect, useState } from 'react';
import { api, type Plan } from '../api';

/*
 * A plain comparison, not three competing sales panels. The reference
 * products use one accent on one button and let type carry the hierarchy,
 * so the discount flags, gradient fills and "BEST VALUE" badges are gone.
 */
export default function Pricing() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [annual, setAnnual] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .catalog()
      .then(c => setPlans(c.plans))
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load plans.'));
  }, []);

  return (
    <div className="mx-auto w-full max-w-[820px] px-5 py-8 pb-24 md:py-12">
      <header className="mb-7">
        <h1 className="h text-[22px]">Plans</h1>
        <p className="mt-1 text-[13px] text-muted">
          Credits renew monthly. A video costs 5, an image 1, speech 2.
        </p>
      </header>

      <div className="mb-7 inline-flex rounded-full border border-border p-0.5">
        {[
          { id: false, label: 'Monthly' },
          { id: true, label: 'Annual' },
        ].map(option => (
          <button
            key={String(option.id)}
            onClick={() => setAnnual(option.id)}
            className={`rounded-full px-3.5 py-1 text-[12px] transition ${
              annual === option.id ? 'bg-surface2 font-medium text-text' : 'text-muted hover:text-text'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {error && <p className="text-[13px] text-danger">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-3">
        {plans.map(plan => {
          const price = annual ? plan.annual : plan.monthly;
          const featured = plan.id === 'plus';

          return (
            <section
              key={plan.id}
              className={`rounded-[var(--radius-card)] border p-5 ${
                featured ? 'border-accent/40' : 'border-border'
              }`}
            >
              <h2 className="h text-[15px] capitalize">{plan.name.toLowerCase()}</h2>
              <p className="mt-0.5 text-[12px] text-muted">{plan.tagline}</p>

              <p className="mt-4">
                <span className="h text-[26px] tabular-nums">${price}</span>
                <span className="ml-1 text-[12px] text-muted">/mo</span>
              </p>
              <p className="mt-0.5 text-[12px] text-muted">
                {plan.credits.toLocaleString()} credits a month
              </p>

              <button
                className={`mt-5 w-full rounded-lg py-2 text-[13px] font-medium transition ${
                  featured
                    ? 'bg-accent text-accentink hover:bg-accenthover'
                    : 'border border-border hover:bg-surface2'
                }`}
              >
                {plan.cta}
              </button>

              <ul className="mt-5 space-y-1.5 border-t border-border pt-4">
                {plan.highlights.map(item => (
                  <li key={item} className="text-[12px] text-muted">
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <p className="mt-8 text-[12px] text-muted">
        Checkout is not wired up in this build — these are presentational.
      </p>
    </div>
  );
}
