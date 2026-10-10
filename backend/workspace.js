const incoin = require('./incoinClient');
const pakkago = require('./pakkagoClient');

const PROVIDERS = {
  incoin: {
    id: 'incoin',
    name: 'Incoin',
    label: 'Incoin Auto',
    client: incoin,
  },
  pakkago: {
    id: 'pakkago',
    name: 'PakkaGo',
    label: 'PakkaGo',
    client: pakkago,
  },
};

function normalizeProvider(value) {
  return value === 'pakkago' ? 'pakkago' : value === 'incoin' ? 'incoin' : null;
}

function getClient(provider) {
  const id = normalizeProvider(provider);
  return id ? PROVIDERS[id].client : incoin;
}

function getMeta(provider) {
  const id = normalizeProvider(provider) || 'incoin';
  return PROVIDERS[id];
}

function readWorkspace(user, provider) {
  const id = normalizeProvider(provider);
  if (id === 'pakkago') {
    return {
      provider: 'pakkago',
      username: user.pakkagoUsername || null,
      token: user.pakkagoToken || null,
      iv: user.pakkagoTokenIv || null,
      tag: user.pakkagoTokenTag || null,
      connectedAt: user.pakkagoConnectedAt || null,
      phone: user.pakkagoPhone || null,
      locked: !!user.pakkagoAccountLocked,
      connected: !!(user.pakkagoToken && user.pakkagoTokenIv && user.pakkagoTokenTag),
    };
  }
  return {
    provider: 'incoin',
    username: user.incoinUsername || null,
    token: user.incoinToken || null,
    iv: user.incoinTokenIv || null,
    tag: user.incoinTokenTag || null,
    connectedAt: user.incoinConnectedAt || null,
    phone: user.incoinPhone || null,
    locked: !!user.incoinAccountLocked,
    connected: !!(user.incoinToken && user.incoinTokenIv && user.incoinTokenTag),
  };
}

function writeWorkspace(user, provider, fields) {
  const id = normalizeProvider(provider) || 'incoin';
  if (id === 'pakkago') {
    if ('username' in fields) user.pakkagoUsername = fields.username;
    if ('token' in fields) user.pakkagoToken = fields.token;
    if ('iv' in fields) user.pakkagoTokenIv = fields.iv;
    if ('tag' in fields) user.pakkagoTokenTag = fields.tag;
    if ('connectedAt' in fields) user.pakkagoConnectedAt = fields.connectedAt;
    if ('phone' in fields) user.pakkagoPhone = fields.phone;
    if ('locked' in fields) user.pakkagoAccountLocked = fields.locked;
    return;
  }
  if ('username' in fields) user.incoinUsername = fields.username;
  if ('token' in fields) user.incoinToken = fields.token;
  if ('iv' in fields) user.incoinTokenIv = fields.iv;
  if ('tag' in fields) user.incoinTokenTag = fields.tag;
  if ('connectedAt' in fields) user.incoinConnectedAt = fields.connectedAt;
  if ('phone' in fields) user.incoinPhone = fields.phone;
  if ('locked' in fields) user.incoinAccountLocked = fields.locked;
}

function findByUsername(User, provider, username, excludeId) {
  const query = { _id: { $ne: excludeId } };
  if (provider === 'pakkago') query.pakkagoUsername = username;
  else query.incoinUsername = username;
  return User.findOne(query);
}

function summarizeServices(user) {
  return Object.values(PROVIDERS).map((meta) => {
    const ws = readWorkspace(user, meta.id);
    return {
      id: meta.id,
      name: meta.name,
      label: meta.label,
      connected: ws.connected,
      username: ws.username,
      phone: ws.phone,
      locked: ws.locked,
    };
  });
}

module.exports = {
  PROVIDERS,
  normalizeProvider,
  getClient,
  getMeta,
  readWorkspace,
  writeWorkspace,
  findByUsername,
  summarizeServices,
};
