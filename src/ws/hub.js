function createWsHub(server, clientTracker) {
  const { WebSocketServer } = require('ws');
  const wss = new WebSocketServer({ server, path: '/ws' });

  function broadcast(type, payload = {}) {
    const message = JSON.stringify({ type, ...payload });
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(message);
    }
  }

  wss.on('connection', (socket, req) => {
    clientTracker?.recordWs?.(req);
    socket.send(JSON.stringify({ type: 'connected' }));
  });

  return { wss, broadcast };
}

module.exports = { createWsHub };
