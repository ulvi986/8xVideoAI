import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

/*
 * A slim persistent rail on desktop, a bottom bar on mobile.
 *
 * The old top nav carried five disabled decoy links (MCP, Genjutsu, Effects…)
 * that existed only because the old reference had them. They are gone: a nav
 * should only contain places you can actually go.
 */

type IconName = 'home' | 'sparkle' | 'people' | 'library';

function Icon({ name, className = 'h-[18px] w-[18px]' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    home: <path d="M3 10.2 12 3l9 7.2V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />,
    sparkle: <path d="M12 3l1.9 5.4L19 10l-5.1 1.6L12 17l-1.9-5.4L5 10l5.1-1.6z" />,
    people: (
      <>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
        <path d="M16 5.5a3.2 3.2 0 0 1 0 5M17 20a5.5 5.5 0 0 0-2-4.3" />
      </>
    ),
    library: (
      <>
        <rect x="3" y="4" width="7" height="16" rx="1.2" />
        <rect x="13" y="4" width="8" height="9" rx="1.2" />
        <path d="M13 17h8" />
      </>
    ),
  };

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

const LINKS: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/video', label: 'Create', icon: 'sparkle' },
  { to: '/community', label: 'Community', icon: 'people' },
  { to: '/library', label: 'Library', icon: 'library' },
];

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

  if (!user) {
    return (
      <Link
        to="/signin"
        className="block rounded-lg bg-accent px-3 py-2 text-center text-sm font-medium text-accentink transition hover:bg-accenthover"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition hover:bg-surface2"
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-semibold text-accentink">
          {user.displayName.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{user.displayName}</span>
          <span className="block text-[11px] text-muted">{user.credits} credits</span>
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-50 mb-1 w-full min-w-52 overflow-hidden rounded-xl border border-border bg-surface py-1"
        >
          <Link
            to="/library"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-[13px] hover:bg-surface2"
          >
            Library
          </Link>
          <Link
            to="/pricing"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-[13px] hover:bg-surface2"
          >
            Plans
          </Link>
          <button
            onClick={async () => {
              setOpen(false);
              await logout();
              navigate('/');
            }}
            className="mt-1 w-full border-t border-border px-3 py-2 text-left text-[13px] hover:bg-surface2"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function Nav() {
  return (
    <>
      {/* desktop rail */}
      <nav className="fixed inset-y-0 left-0 z-30 hidden w-[228px] flex-col border-r border-border px-3 py-4 md:flex">
        <Link to="/" className="mb-6 flex items-center gap-2 px-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-text text-[12px] font-semibold text-bg">
            8x
          </span>
          <span className="h text-[15px]">8xBuildAI</span>
        </Link>

        <div className="flex flex-col gap-0.5">
          {LINKS.map(link => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] transition ${
                  isActive ? 'bg-surface2 font-medium text-accent' : 'text-muted hover:bg-surface2 hover:text-text'
                }`
              }
            >
              <Icon name={link.icon} />
              {link.label}
            </NavLink>
          ))}
        </div>

        <div className="mt-auto">
          <AccountMenu />
        </div>
      </nav>

      {/* mobile bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-bg md:hidden">
        {LINKS.map(link => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] ${
                isActive ? 'text-accent' : 'text-muted'
              }`
            }
          >
            <Icon name={link.icon} className="h-5 w-5" />
            {link.label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
