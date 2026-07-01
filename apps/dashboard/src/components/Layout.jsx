import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { UserButton } from '@clerk/clerk-react';
import { usePermissions } from '../hooks/usePermissions';
import { TimezonePicker } from '../lib/timezone';

const baseNav = [
  { to: '/', label: "Today's Board", icon: '📋', exact: true },
  { to: '/absences', label: 'Absence Log', icon: '📅' },
  { to: '/employees', label: 'Roster', icon: '🧑‍💼' },
];

export default function Layout({ children }) {
  const { canManagePermissions, isSuperAdmin, isAdmin } = usePermissions() || {};
  const [mobileOpen, setMobileOpen] = useState(false);

  const nav = [
    ...baseNav,
    ...(isSuperAdmin || isAdmin ? [{ to: '/coverage', label: 'Coverage', icon: '🔄' }] : []),
    ...(canManagePermissions ? [{ to: '/permissions', label: 'Permissions', icon: '🔐' }] : []),
    ...(isSuperAdmin ? [{ to: '/settings', label: 'Settings', icon: '⚙️' }] : []),
    ...(isSuperAdmin ? [{ to: '/exception-report', label: 'Exceptions', icon: '⚠️' }] : []),
  ];

  return (
    <div className="min-h-screen bg-white md:flex">
      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 flex items-center gap-3 bg-forest text-white px-4 h-14">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="p-1 -ml-1"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <img src="/logo.png" alt="TeamNotifi" className="h-9 w-9 rounded-lg object-cover" />
        <span className="font-semibold">TeamNotifi</span>
      </header>

      {/* Backdrop (mobile only, when drawer open) */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — drawer on mobile, permanent on desktop */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-56 bg-forest text-white flex flex-col transform transition-transform duration-200 ease-in-out
          md:static md:h-screen md:sticky md:top-0 md:translate-x-0 md:z-auto md:flex-shrink-0
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="p-3 border-b border-forest-dark flex items-center justify-center relative">
          <img src="/logo.png" alt="TeamNotifi" className="h-20 w-20 rounded-xl object-cover" />
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="md:hidden absolute right-3 top-3 p-1 text-white/80 hover:text-white"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {nav.map(({ to, label, icon, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'text-white hover:bg-white/10'
                }`
              }
            >
              <span className="opacity-100">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-forest-dark space-y-3">
          <div>
            <label className="block text-xs text-white/60 mb-1">🕐 Display time zone</label>
            <TimezonePicker dark />
          </div>
          <div className="flex items-center gap-2">
            <UserButton afterSignOutUrl="/" />
            <span className="text-sm text-white/70">Account</span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto min-w-0">
        {children}
      </main>
    </div>
  );
}
