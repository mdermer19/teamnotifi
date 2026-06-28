import { useAuth } from '@clerk/clerk-react';

const BASE = '/api';

export function useApi() {
  const { getToken } = useAuth();

  async function request(path, options = {}) {
    const token = await getToken();
    const res = await fetch(`${BASE}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
      ...options,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Request failed');
    }
    return res.json();
  }

  function buildQs(params) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''))
    ).toString();
    return qs ? `?${qs}` : '';
  }

  return {
    // Absences
    getTodaysAbsences: () => request('/absences/today'),
    getAbsences: (params = {}) => request(`/absences${buildQs(params)}`),
    ackAbsence:         (id)       => request(`/absences/${id}/ack`, { method: 'POST' }),
    updateAbsence:      (id, data) => request(`/absences/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    getAbsenceMessages: (id)       => request(`/absences/${id}/messages`),

    // Employees
    getEmployees:          (params = {}) => request(`/employees${buildQs(params)}`),
    getEmployee:           (id)          => request(`/employees/${id}`),
    getEmployeeAbsences:   (id)          => request(`/employees/${id}/absences`),
    createEmployee:        (data)        => request('/employees', { method: 'POST', body: JSON.stringify(data) }),
    updateEmployee:        (id, data)    => request(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deactivateEmployee:    (id)          => request(`/employees/${id}`, { method: 'DELETE' }),
    patchEmployeeManager:  (id, isManager) => request(`/employees/${id}/manager`, { method: 'PATCH', body: JSON.stringify({ isManager }) }),

    // Locations
    getLocations: () => request('/locations'),

    // Users / permissions
    getMe:      ()          => request('/users/me'),
    getUsers:   ()          => request('/users'),
    updateUser: (id, data)  => request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  };
}
