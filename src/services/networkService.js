const os = require('node:os');

function listServerIpv4Addresses() {
  const interfaces = os.networkInterfaces();
  const rows = [];

  for (const [name, infos] of Object.entries(interfaces)) {
    for (const info of infos || []) {
      const family = typeof info.family === 'string' ? info.family : String(info.family);
      if (family !== 'IPv4' || info.internal) continue;
      rows.push({
        name,
        address: info.address,
        cidr: info.cidr || '',
      });
    }
  }

  rows.sort((a, b) => {
    if (a.name === b.name) return String(a.address).localeCompare(String(b.address));
    return String(a.name).localeCompare(String(b.name));
  });
  return rows;
}

module.exports = { listServerIpv4Addresses };
