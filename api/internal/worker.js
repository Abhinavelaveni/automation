const { app, ensureReady } = require('../../backend/server');

module.exports = async function handler(req, res) {
  try {
    await ensureReady();
    const queryIndex = (req.url || '').indexOf('?');
    const query = queryIndex < 0 ? '' : req.url.slice(queryIndex);
    req.url = `/api/internal/worker${query}`;
    return app(req, res);
  } catch (err) {
    console.error('Vercel worker initialization failed:', err);
    return res.status(503).json({
      error: 'Service is temporarily unavailable. Check the database configuration and try again.',
    });
  }
};
