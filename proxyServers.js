export const MAX_PROXY_SERVERS = 4;

export const DEFAULT_PROXY_SERVERS = [
  {
    id: 'proxy1',
    label: 'Сервер 1',
    host: '',
    port: '',
    username: '',
    password: ''
  }
];

export function isBlankServer(server) {
  if (!server) return true;
  const host = String(server.host || '').trim();
  const port = String(server.port || '').trim();
  if (host || port) return false;
  const username = String(server.username || '').trim();
  const password = String(server.password || '').trim();
  return !username && !password;
}

export function sanitizeProxyServers(servers) {
  if (!Array.isArray(servers) || servers.length === 0) {
    return DEFAULT_PROXY_SERVERS.map(s => ({ ...s }));
  }
  const filled = servers.filter(s => !isBlankServer(s));
  if (filled.length === 0) {
    return [{ ...servers[0] }];
  }
  return filled.map(s => ({ ...s }));
}

export function generateServerId() {
  return `proxy_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function getProxyServers() {
  const { proxyServers } = await chrome.storage.local.get('proxyServers');
  if (!proxyServers || !Array.isArray(proxyServers) || proxyServers.length === 0) {
    return DEFAULT_PROXY_SERVERS.map(s => ({ ...s }));
  }
  return proxyServers.map(s => ({ ...s }));
}

export async function saveProxyServers(servers) {
  const trimmed = sanitizeProxyServers(servers).slice(0, MAX_PROXY_SERVERS);
  await chrome.storage.local.set({ proxyServers: trimmed });
  return trimmed;
}

export async function initializeProxyServersIfNeeded() {
  const stored = await chrome.storage.local.get([
    'proxyServers',
    'activeProxyId',
    'proxyHost',
    'proxyPort',
    'proxyUsername',
    'proxyPassword'
  ]);

  if (!stored.proxyServers || !Array.isArray(stored.proxyServers) || stored.proxyServers.length === 0) {
    const servers = DEFAULT_PROXY_SERVERS.map(s => ({ ...s }));
    const activeId = stored.activeProxyId || servers[0].id;
    const activeIndex = servers.findIndex(s => s.id === activeId);

    if (stored.proxyHost && activeIndex >= 0) {
      servers[activeIndex] = {
        ...servers[activeIndex],
        host: stored.proxyHost,
        port: String(stored.proxyPort || servers[activeIndex].port),
        username: stored.proxyUsername ?? servers[activeIndex].username,
        password: stored.proxyPassword ?? servers[activeIndex].password
      };
    }

    await chrome.storage.local.set({
      proxyServers: servers,
      activeProxyId: activeId
    });
    return servers;
  }

  const sanitized = sanitizeProxyServers(stored.proxyServers);
  let activeId = stored.activeProxyId || sanitized[0]?.id;
  if (!sanitized.some(s => s.id === activeId)) {
    activeId = sanitized[0].id;
  }

  if (sanitized.length !== stored.proxyServers.length) {
    await chrome.storage.local.set({
      proxyServers: sanitized,
      activeProxyId: activeId
    });
  }

  return sanitized;
}

export function getServerById(servers, id) {
  return servers.find(s => s.id === id) || servers[0] || null;
}

export async function applyActiveServerToStorage(activeProxyId) {
  const servers = await getProxyServers();
  const server = getServerById(servers, activeProxyId);
  if (!server) {
    return null;
  }
  await chrome.storage.local.set({
    activeProxyId: server.id,
    proxyHost: server.host,
    proxyPort: String(server.port),
    proxyUsername: server.username || '',
    proxyPassword: server.password || ''
  });
  return server;
}
