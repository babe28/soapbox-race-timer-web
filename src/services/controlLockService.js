function createControlLockService() {
  const LOCK_TTL_MS = 15000;
  let activeLock = null;

  function pruneExpired() {
    if (!activeLock) return;
    if (activeLock.expiresAt <= Date.now()) {
      activeLock = null;
    }
  }

  function createSnapshot() {
    pruneExpired();
    return activeLock ? {
      locked: true,
      sessionId: activeLock.sessionId,
      acquiredAt: new Date(activeLock.acquiredAt).toISOString(),
      expiresAt: new Date(activeLock.expiresAt).toISOString(),
    } : {
      locked: false,
      sessionId: null,
      acquiredAt: null,
      expiresAt: null,
    };
  }

  function acquire(sessionId) {
    const normalizedSessionId = String(sessionId || '').trim();
    if (!normalizedSessionId) {
      return { ok: false, status: createSnapshot() };
    }

    pruneExpired();
    if (!activeLock || activeLock.sessionId === normalizedSessionId) {
      const now = Date.now();
      activeLock = {
        sessionId: normalizedSessionId,
        acquiredAt: activeLock?.sessionId === normalizedSessionId ? activeLock.acquiredAt : now,
        expiresAt: now + LOCK_TTL_MS,
      };
      return { ok: true, status: createSnapshot() };
    }

    return { ok: false, status: createSnapshot() };
  }

  function heartbeat(sessionId) {
    const normalizedSessionId = String(sessionId || '').trim();
    pruneExpired();
    if (!activeLock || activeLock.sessionId !== normalizedSessionId) {
      return { ok: false, status: createSnapshot() };
    }

    activeLock.expiresAt = Date.now() + LOCK_TTL_MS;
    return { ok: true, status: createSnapshot() };
  }

  function release(sessionId) {
    const normalizedSessionId = String(sessionId || '').trim();
    pruneExpired();
    if (activeLock && activeLock.sessionId === normalizedSessionId) {
      activeLock = null;
      return { ok: true, status: createSnapshot() };
    }
    return { ok: false, status: createSnapshot() };
  }

  function forceRelease() {
    pruneExpired();
    const wasLocked = Boolean(activeLock);
    activeLock = null;
    return { ok: true, released: wasLocked, status: createSnapshot() };
  }

  function status() {
    return createSnapshot();
  }

  return {
    acquire,
    heartbeat,
    release,
    forceRelease,
    status,
  };
}

module.exports = { createControlLockService };
