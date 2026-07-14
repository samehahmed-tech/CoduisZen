function assessApiHealth(probe) {
  if (!probe?.reachable) return { reachable: false, databaseConnected: false, ready: false };
  let health = {};
  try { health = JSON.parse(probe.body || '{}'); } catch {}
  const services = health.health?.services || health.services;
  const databaseConnected = services?.database?.status === 'CONNECTED';
  return {
    reachable: true,
    databaseConnected,
    ready: probe.statusCode < 500 && databaseConnected,
  };
}

module.exports = { assessApiHealth };
