const { app, ensureReady } = require('../backend/server');

module.exports = async function handler(req, res) {
  try {
    await ensureReady();
    const requestUrl = req.url || '/';
    const queryIndex = requestUrl.indexOf('?');
    const pathname = queryIndex < 0 ? requestUrl : requestUrl.slice(0, queryIndex);
    const routeParam = req.query?.path;
    if (pathname === '/' && routeParam) {
      const route = Array.isArray(routeParam) ? routeParam.join('/') : String(routeParam);
      const query = new URLSearchParams(queryIndex < 0 ? '' : requestUrl.slice(queryIndex + 1));
      query.delete('path');
      const search = query.toString();
      req.url = `/api/${route}${search ? `?${search}` : ''}`;
    } else if (pathname !== '/api' && !pathname.startsWith('/api/')) {
      req.url = `/api${pathname.startsWith('/') ? pathname : `/${pathname}`}`
        + (queryIndex < 0 ? '' : requestUrl.slice(queryIndex));
    }
    return app(req, res);
  } catch (err) {
    console.error('Vercel API initialization failed:', err);
    return res.status(503).json({
      error: 'Service is temporarily unavailable. Check the database configuration and try again.',
    });
  }
};
