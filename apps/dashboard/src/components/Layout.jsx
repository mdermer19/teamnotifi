import { NavLink } from 'react-router-dom';
import { UserButton } from '@clerk/clerk-react';
import { usePermissions } from '../hooks/usePermissions';

const baseNav = [
  { to: '/', label: "Today's Board", icon: '📋', exact: true },
  { to: '/absences', label: 'Absence Log', icon: '📅' },
  { to: '/employees', label: 'Roster', icon: '🧑‍💼' },
  { to: '/coverage', label: 'Coverage', icon: '🔄' },
];

export default function Layout({ children }) {
  const { canManagePermissions } = usePermissions() || {};

  const nav = canManagePermissions
    ? [...baseNav, { to: '/permissions', label: 'Permissions', icon: '🔐' }]
    : baseNav;

  return (
    <div className="min-h-screen bg-white flex">
      {/* Sidebar */}
      <aside className="w-56 bg-forest text-white flex flex-col flex-shrink-0 h-screen sticky top-0">
        <div className="p-5 border-b border-forest-dark">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">T</span>
            </div>
            <span className="font-bold text-lg">TeamNotifi</span>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {nav.map(({ to, label, icon, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
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

        <div className="p-4 border-t border-forest-dark">
          <div className="flex items-center gap-2">
            <UserButton afterSignOutUrl="/" />
            <span className="text-sm text-white/70">Account</span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
