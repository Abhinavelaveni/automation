# Incoin Auto

## Deploy on Render

This project is configured for Render using [`render.yaml`](./render.yaml).

1. In Render, create a new Blueprint and connect your GitHub repository.
2. Render will detect the `render.yaml` file automatically.
3. Set the required environment variables in the Render dashboard:
   - `MONGODB_URI`: MongoDB connection string.
   - `JWT_SECRET`: a long, random secret (can be auto-generated). Keep it stable across deployments; changing it invalidates login tokens and encrypted service sessions.
   - `INCOIN_BASE_URL`: `https://api.incoinpay.net` (optional; this is the default).
4. Render uses `npm run build` to build the frontend and `npm start` to start the backend. It checks `/health` after deployment.
5. Deploy and verify `/health`, login, workspace connection, and task processing.

Referral image uploads are stored on the service filesystem. To preserve them across deploys and restarts, attach a Render Disk mounted at `/app/backend/uploads`.

## Local development

Create a root `.env` with `MONGODB_URI` and `JWT_SECRET`, then run the backend and frontend in separate terminals:

```bash
npm install
npm start
```

```bash
npm run dev --workspace frontend
```

The Vite dev server proxies `/api` to `http://localhost:5000` by default. Set `VITE_API_TARGET` to override the backend URL.

## Troubleshooting

### CAPTCHA Not Loading

If the CAPTCHA image fails to load after deployment:

1. **Check browser console** (F12) for detailed error messages
2. **Verify CORS headers** - ensure backend exposes `captchaToken` header
3. **Check network tab** - verify `https://api.incoinpay.net/anon/test/getCaptcha` returns HTTP 200
4. **Confirm `INCOIN_BASE_URL`** - ensure environment variable is set correctly

Common error messages:
- `Could not load CAPTCHA: [error]` - Check browser console for details
- `CAPTCHA response did not include token header` - Backend CORS may not be configured correctly

### Login Fails with Valid Credentials

1. **Verify CAPTCHA** - ensure the code was entered correctly
2. **Check logs** - review browser console for HMAC signing and login request details
3. **Review Incoin API response** - check Network tab for the `/anon/login` response

### Deployment Issues

- **Build fails**: Run `npm run build` locally to diagnose issues
- **Health check fails**: Ensure `/health` endpoint returns 200 OK
- **Database connection**: Verify `MONGODB_URI` is correct and accessible from Render
