import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SignIn, SignedIn, SignedOut } from '@clerk/clerk-react';
import { PermissionsProvider } from './hooks/usePermissions';
import Layout from './components/Layout';
import Today from './pages/Today';
import Absences from './pages/Absences';
import Employees from './pages/Employees';
import Coverage from './pages/Coverage';
import Permissions from './pages/Permissions';
import Settings from './pages/Settings';

function LoginPage() {
  return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 bg-forest rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">T</span>
          </div>
          <span className="text-2xl font-bold text-forest">TeamNotifi</span>
        </div>
        <SignIn routing="hash" />
      </div>
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
        <PermissionsProvider>
          <Layout>
            <Routes>
              <Route path="/" element={<Today />} />
              <Route path="/absences" element={<Absences />} />
              <Route path="/employees" element={<Employees />} />
              <Route path="/coverage" element={<Coverage />} />
              <Route path="/permissions" element={<Permissions />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </PermissionsProvider>
      </SignedIn>
    </BrowserRouter>
  );
}
