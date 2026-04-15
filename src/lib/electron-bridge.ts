/**
 * Electron Bridge
 * Client-side utility to communicate with the local Electron app via Oracle Cloud proxy
 * Used by the Oracle Cloud UI to read/write data from the local SQLite database
 */

// Client ID is stored in localStorage — unique per browser/user
function getClientId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem('pms_electron_client_id');
  if (!id) {
    id = 'client_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('pms_electron_client_id', id);
  }
  return id;
}

// Check if Electron app is connected
export async function isElectronConnected(): Promise<boolean> {
  try {
    const clientId = getClientId();
    const res = await fetch(`/api/electron/register?clientId=${clientId}`);
    const data = await res.json();
    return data.connected === true;
  } catch {
    return false;
  }
}

// Proxy a request to the local Electron app
async function proxyRequest(
  path: string,
  method: string = 'GET',
  data?: any
): Promise<any> {
  const clientId = getClientId();
  const res = await fetch('/api/electron/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, path, method, data }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

// Database operations via Electron
export const electronDb = {
  getAll: async (collection: string): Promise<any[]> => {
    const result = await proxyRequest(`/api/db/${collection}`);
    return result.data || [];
  },

  create: async (collection: string, item: any): Promise<any> => {
    const result = await proxyRequest(`/api/db/${collection}`, 'POST', item);
    return result.data;
  },

  update: async (collection: string, id: string, item: any): Promise<any> => {
    const result = await proxyRequest(`/api/db/${collection}/${id}`, 'PUT', item);
    return result.data;
  },

  delete: async (collection: string, id: string): Promise<void> => {
    await proxyRequest(`/api/db/${collection}/${id}`, 'DELETE');
  },

  bulkGet: async (collections: string[]): Promise<Record<string, any[]>> => {
    const result = await proxyRequest('/api/db/bulk', 'POST', { collections });
    return result.data || {};
  },
};
