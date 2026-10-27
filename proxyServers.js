export const MAX_PROXY_SERVERS = 10;

export const DEFAULT_PROXY_SERVERS = [
  {
    id: 'proxy1',
    label: 'Сервер 1',
    host: '',
    port: '',
    scheme: 'http',
    username: '',
    password: ''
  }
];

export function normalizeProxyHost(host) {
  const raw = String(host || '').trim();
  const h = raw.toLowerCase();
  if (
    h === 'localhost' ||
    h === '::1' ||
    h === '[::1]' ||
    h === '0:0:0:0:0:0:0:1'
  ) {
    return '127.0.0.1';
  }
  return raw;
}

export function normalizeProxyScheme(scheme) {
  const s = String(scheme || 'http').toLowerCase().trim();
  if (s === 'socks5' || s === 'socks') return 'socks5';
  if (s === 'socks4') return 'socks4';
  return 'http';
}

export function getPacProxyToken(host, port, scheme) {
  const normalized = normalizeProxyScheme(scheme);
  if (normalized === 'socks5') return `SOCKS5 ${host}:${port}`;
  if (normalized === 'socks4') return `SOCKS ${host}:${port}`;
  return `PROXY ${host}:${port}`;
}

export function getFixedProxyScheme(scheme) {
  const normalized = normalizeProxyScheme(scheme);
  if (normalized === 'socks5') return 'socks5';
  if (normalized === 'socks4') return 'socks4';
  return 'http';
}

export function isLoopbackProxyHost(host) {
  const h = normalizeProxyHost(host).toLowerCase();
  return h === '127.0.0.1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h);
}

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
  return filled.map(s => ({
    ...s,
    host: normalizeProxyHost(s.host),
    scheme: normalizeProxyScheme(s.scheme)
  }));
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
    proxyHost: normalizeProxyHost(server.host),
    proxyPort: String(server.port),
    proxyScheme: normalizeProxyScheme(server.scheme),
    proxyUsername: server.username || '',
    proxyPassword: server.password || ''
  });
  return server;
}
