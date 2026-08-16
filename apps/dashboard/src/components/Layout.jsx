import { useState, useEffect } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { UserButton } from '@clerk/clerk-react';
import { usePermissions } from '../hooks/usePermissions';
import { TimezonePicker } from '../lib/timezone';
import { useApi } from '../lib/api';

// Heroicons outline SVG paths (inline, no package needed)
const ICONS = {
  'calendar-days': (
    <svg className="w-4.5 h-4.5 w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-6h.008v.008H12v-.008ZM12 15h.008v.008H12V15Zm0 2.25h.008v.008H12v-.008ZM9.75 15h.008v.008H9.75V15Zm0 2.25h.008v.008H9.75v-.008ZM7.5 15h.008v.008H7.5V15Zm0 2.25h.008v.008H7.5v-.008Zm6.75-4.5h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V15Zm0 2.25h.008v.008h-.008v-.008Zm2.25-4.5h.008v.008H16.5v-.008Zm0 2.25h.008v.008H16.5V15Z" />
    </svg>
  ),
  'clipboard-document-list': (
    <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
    </svg>
  ),
  'users': (
    <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
    </svg>
  ),
  'arrows-right-left': (
    <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
    </svg>
  ),
  'lock-closed': (
    <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
    </svg>
  ),
  'cog-6-tooth': (
    <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  ),
  'exclamation-triangle': (
    <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
    </svg>
  ),
  'bell-alert': (
    <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0M3.124 7.5A8.969 8.969 0 0 1 5.292 3m13.416 0a8.969 8.969 0 0 1 2.168 4.5" />
    </svg>
  ),
};

const baseNav = [
  { to: '/', label: "Today's Board", icon: 'calendar-days', exact: true },
  { to: '/absences', label: 'Absence Log', icon: 'clipboard-document-list' },
  { to: '/employees', label: 'Roster', icon: 'users' },
];

export default function Layout({ children }) {
  const { canManagePermissions, isSuperAdmin, isAdmin } = usePermissions() || {};
  const [mobileOpen, setMobileOpen] = useState(false);
  const [smsAlertCount, setSmsAlertCount] = useState(0);
  const [exceptionCount, setExceptionCount] = useState(0);
  const api = useApi();

  // Poll for unresolved SMS delivery failures every 60 seconds (admins only)
  useEffect(() => {
    if (!isSuperAdmin && !isAdmin) return;
    let cancelled = false;
    async function fetchCount() {
      try {
        const { count } = await api.getSmsAlertCount();
        if (!cancelled) setSmsAlertCount(count);
      } catch {}
    }
    fetchCount();
    const timer = setInterval(fetchCount, 60_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [isSuperAdmin, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for roster exceptions every 60 seconds (super_admin only)
  useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;
    async function fetchCount() {
      try {
        const { count } = await api.getExceptionCount();
        if (!cancelled) setExceptionCount(count);
      } catch {}
    }
    fetchCount();
    const timer = setInterval(fetchCount, 60_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [isSuperAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  const nav = [
    ...baseNav,
    ...(isSuperAdmin || isAdmin ? [{ to: '/coverage', label: 'Coverage', icon: 'arrows-right-left' }] : []),
    ...(canManagePermissions ? [{ to: '/permissions', label: 'Permissions', icon: 'lock-closed' }] : []),
    ...(isSuperAdmin ? [{ to: '/settings', label: 'Settings', icon: 'cog-6-tooth' }] : []),
    ...(isSuperAdmin ? [{ to: '/exception-report', label: 'Exceptions', icon: 'exclamation-triangle', badge: exceptionCount }] : []),
    ...(isSuperAdmin || isAdmin ? [{ to: '/sms-alerts', label: 'SMS Alerts', icon: 'bell-alert', badge: smsAlertCount }] : []),
  ];

  const SidebarContent = () => (
    <>
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {nav.map(({ to, label, icon, exact, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors relative ${
                isActive
                  ? 'bg-white/10 text-white border-l-2 border-white pl-[10px]'
                  : 'text-white/80 hover:bg-white/10 hover:text-white border-l-2 border-transparent pl-[10px]'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={isActive ? 'opacity-100' : 'opacity-70'}>{ICONS[icon]}</span>
                <span className="flex-1">{label}</span>
                {badge > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold rounded-full min-w-[1.25rem] h-5 flex items-center justify-center px-1">
                    {badge}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-white/10 space-y-3">
        {/* Support info */}
        <div>
          <p className="text-xs text-white/40 mb-0.5">Text call-outs to</p>
          <p className="text-sm font-medium text-white/80">(404) 900-7771</p>
        </div>

        {/* Timezone — single compact line */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/40 flex-shrink-0">Time zone</span>
          <div className="flex-1 min-w-0">
            <TimezonePicker dark />
          </div>
        </div>

        {/* Account */}
        <div className="flex items-center gap-2 pt-1 border-t border-white/10">
          <UserButton afterSignOutUrl="/" />
          <span className="text-sm text-white/60">Account</span>
        </div>

        {/* Footer links */}
        <div className="flex gap-3 text-xs text-white/30">
          <Link to="/privacy" className="hover:text-white/60">Privacy</Link>
          <Link to="/terms" className="hover:text-white/60">Terms</Link>
        </div>
      </div>
    </>
  );

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
        <img src="/text.png" alt="TeamNotifi" className="h-6 object-contain" />
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
        {/* Logo header */}
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="TeamNotifi" className="md:hidden h-9 w-9 object-contain flex-shrink-0" />
            <img src="/text.png" alt="TeamNotifi" className="hidden md:block h-7 object-contain" />
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="md:hidden p-1 text-white/60 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <SidebarContent />
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto min-w-0">
        {children}
      </main>
    </div>
  );
}
