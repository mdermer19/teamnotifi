import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';

const BASE = '/api';
const PermissionsContext = createContext(null);

export function PermissionsProvider({ children }) {
  const { getToken } = useAuth();
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMe() {
      try {
        const token = await getToken();
        const res = await fetch(`${BASE}/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setMe(await res.json());
      } catch {}
      setLoading(false);
    }
    fetchMe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isSuperAdmin = me?.role === 'super_admin';
  const isAdmin = me?.role === 'admin';
  const isManager = me?.role === 'manager';
  const canToggleManager = isSuperAdmin;
  const canManagePermissions = isSuperAdmin;

  return (
    <PermissionsContext.Provider value={{ me, loading, isSuperAdmin, isAdmin, isManager, canToggleManager, canManagePermissions }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext);
}

