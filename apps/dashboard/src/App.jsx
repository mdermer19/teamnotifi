import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import ExceptionReport from './pages/ExceptionReport';

function LoginPage() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
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
  );
}

export default function App() {
  return (
    <BrowserRouter>
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
              <Route path="/exception-report" element={<ExceptionReport />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </PermissionsProvider>
        </TimezoneProvider>
      </SignedIn>
    </BrowserRouter>
  );
}
