import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { SignIn, SignedIn, SignedOut } from '@clerk/clerk-react';
import { PermissionsProvider } from './hooks/usePermissions';
import { TimezoneProvider } from './lib/timezone';
import Layout from './components/Layout';
import Today from './pages/Today';
import Absences from './pages/Absences';
import Employees from './pages/Employees';
import Coverage from './pages/Coverage';
import Permissions from './pages/Permissions';
import Settings from './pages/Settings';
import Preferences from './pages/Preferences';
import ExceptionReport from './pages/ExceptionReport';
import ReportFlow from './pages/report/ReportFlow';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import SmsAlerts from './pages/SmsAlerts';

function LoginPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
      <div className="w-full flex justify-center">
        <SignIn
          routing="hash"
          appearance={{
            variables: { fontSize: '16px' },
            elements: {
              rootBox: 'w-full flex justify-center',
              card: 'w-full max-w-md shadow-xl',
            },
          }}
        />
      </div>
      <footer className="mt-8 flex gap-5 text-sm text-slate-400">
        <Link to="/privacy" className="hover:text-slate-600 underline">Privacy Policy</Link>
        <Link to="/terms" className="hover:text-slate-600 underline">Terms &amp; Conditions</Link>
      </footer>
    </div>
  );
}

// The authenticated dashboard — unchanged, just moved behind a top-level route
// so the public report flow can render without any Clerk involvement.
function AuthedApp() {
  return (
    <>
      <SignedOut>
        <LoginPage />
      </SignedOut>
      <SignedIn>
        <TimezoneProvider>
        <PermissionsProvider>
          <Layout>
            <Routes>
              <Route path="/" element={<Today />} />
              <Route path="/absences" element={<Absences />} />
              <Route path="/employees" element={<Employees />} />
              <Route path="/coverage" element={<Coverage />} />
              <Route path="/permissions" element={<Permissions />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/preferences" element={<Preferences />} />
              <Route path="/exception-report" element={<ExceptionReport />} />
              <Route path="/sms-alerts" element={<SmsAlerts />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </PermissionsProvider>
        </TimezoneProvider>
      </SignedIn>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes — no Clerk session required */}
        <Route path="/r/:token" element={<ReportFlow />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="*" element={<AuthedApp />} />
      </Routes>
    </BrowserRouter>
  );
}
