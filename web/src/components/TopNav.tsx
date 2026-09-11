import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

/*
 * The reference nav carries a dozen entries. Only the ones this build
 * actually implements are links; the rest render disabled with a tooltip
 * rather than pretending to work (shared/DESIGN.md, departure 1).
 */
const BUILT = [
  { to: '/', label: 'Explore', end: true },
  { to: '/image', label: 'Image' },
  { to: '/video', label: 'Video' },
  { to: '/audio', label: 'Audio' },
];

const NOT_BUILT = ['MCP', 'Genjutsu', 'Effects', 'Cinema Studio', 'Marketing Studio'];

function CreditDots({ credits }: { credits: number }) {
  const total = 20;
  const lit = Math.max(0, Math.min(total, Math.round((credits / 20) * total)));
  return (
    <div className="flex gap-[3px]">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-[7px] w-[7px] rounded-full ${i < lit ? 'bg-accent' : 'bg-line'}`}
        />
      ))}
    </div>
  );
}

function AccountMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="block h-8 w-8 rounded-full ring-2 ring-accent"
        style={{ background: 'radial-gradient(circle at 30% 30%, #e8ff7a, #98c400)' }}
      />
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-line bg-panel shadow-2xl"
        >
          <div className="flex items-center gap-3 border-b border-line p-4">
            <span
              className="h-9 w-9 shrink-0 rounded-full ring-2 ring-accent"
              style={{ background: 'radial-gradient(circle at 30% 30%, #e8ff7a, #98c400)' }}
            />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">@{user.handle}</div>
              <div className="text-xs text-muted capitalize">{user.plan} plan</div>
            </div>
          </div>

          <div className="border-b border-line p-4">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="text-muted">Credits</span>
              <span className="font-medium">{user.credits} left</span>
            </div>
            <CreditDots credits={user.credits} />
          </div>

          <Link
            to="/pricing"
            onClick={() => setOpen(false)}
            className="flex items-center justify-between px-4 py-3 text-sm hover:bg-panel2"
          >
            <span className="font-medium">Go Premium</span>
            <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accentink">
              Upgrade
            </span>
          </Link>

          <Link to="/profile" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-sm hover:bg-panel2">
            View profile
          </Link>

          <button
            onClick={async () => {
              setOpen(false);
              await logout();
              navigate('/');
            }}
            className="w-full border-t border-line px-4 py-3 text-left text-sm hover:bg-panel2"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function TopNav() {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink/95 backdrop-blur">
      <nav className="flex h-14 items-center gap-1 px-4">
        <Link to="/" className="mr-3 flex items-center gap-2 shrink-0" aria-label="8xBuildAI home">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-[13px] font-black text-accentink">
            8x
          </span>
        </Link>

        <div className="flex items-center gap-1 overflow-x-auto">
          {BUILT.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
                  isActive ? 'font-semibold text-accent' : 'text-body/80 hover:text-body'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}

          <span className="mx-1 h-4 w-px bg-line" />

          {NOT_BUILT.map(label => (
            <span
              key={label}
              title="Not in this build"
              className="cursor-not-allowed rounded-md px-3 py-1.5 text-sm whitespace-nowrap text-muted/45"
            >
              {label}
            </span>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <Link
            to="/pricing"
            className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-panel2"
          >
            Pricing
            <span className="rounded-full bg-hot px-1.5 py-0.5 text-[10px] font-bold">30% OFF</span>
          </Link>

          {user ? (
            <>
              <span className="hidden rounded-lg border border-line px-3 py-1.5 text-sm sm:block">
                <span className="text-accent">✦</span> {user.credits}
              </span>
              <AccountMenu />
            </>
          ) : (
            <Link
              to="/signin"
              className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-accentink hover:brightness-110"
            >
              Sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
