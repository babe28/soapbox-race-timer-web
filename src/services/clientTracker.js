function normalizeIp(value) {
  const text = String(value || '').trim();
  if (!text) return 'unknown';
  return text.replace(/^::ffff:/, '');
}

function normalizeUserAgent(value) {
  const text = String(value || '').trim();
  return text || '-';
}

function createClientTracker() {
  const clients = new Map();

  function getKey(ip, userAgent) {
    return `${ip}__${userAgent}`;
  }

  function touch({
    ip,
    userAgent,
    protocol,
    path,
    method,
    transport,
  }) {
    const normalizedIp = normalizeIp(ip);
    const normalizedUa = normalizeUserAgent(userAgent);
    const key = getKey(normalizedIp, normalizedUa);
    const now = new Date().toISOString();
    const current = clients.get(key) || {
      ip: normalizedIp,
      userAgent: normalizedUa,
      firstSeenAt: now,
      lastSeenAt: now,
      requestCount: 0,
      transports: new Set(),
      methods: new Set(),
      lastPath: '',
      protocol: protocol || 'http',
    };

    current.lastSeenAt = now;
    current.protocol = protocol || current.protocol;
    current.lastPath = path || current.lastPath;
    if (method) current.methods.add(String(method).toUpperCase());
    if (transport) current.transports.add(transport);
    if (transport === 'http') current.requestCount += 1;

    clients.set(key, current);
    trimClients();
  }

  function trimClients() {
    const rows = [...clients.values()].sort((a, b) => String(b.lastSeenAt).localeCompare(String(a.lastSeenAt)));
    const keep = rows.slice(0, 100);
    const allowed = new Set(keep.map((row) => getKey(row.ip, row.userAgent)));
    for (const key of clients.keys()) {
      if (!allowed.has(key)) clients.delete(key);
    }
  }

  function recordHttp(req) {
    touch({
      ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || req.ip,
      userAgent: req.headers['user-agent'],
      protocol: req.protocol,
      path: req.originalUrl || req.url,
      method: req.method,
      transport: 'http',
    });
  }

  function recordWs(req) {
    touch({
      ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress,
      userAgent: req.headers['user-agent'],
      protocol: req.headers['x-forwarded-proto'] || 'ws',
      path: req.url,
      method: 'WS',
      transport: 'ws',
    });
  }

  function listClients() {
    return [...clients.values()]
      .sort((a, b) => String(b.lastSeenAt).localeCompare(String(a.lastSeenAt)))
      .map((row) => ({
        ip: row.ip,
        userAgent: row.userAgent,
        firstSeenAt: row.firstSeenAt,
        lastSeenAt: row.lastSeenAt,
        requestCount: row.requestCount,
        lastPath: row.lastPath,
        protocol: row.protocol,
        transports: [...row.transports],
        methods: [...row.methods],
      }));
  }

  return {
    recordHttp,
    recordWs,
    listClients,
  };
}

module.exports = { createClientTracker };
