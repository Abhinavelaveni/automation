# Incoin Auto

## Deploy on Railway

This project is configured for Railway using [`railway.json`](./railway.json).

1. In Railway, create a project and deploy the `Abhinavelaveni/automation` GitHub repository from the `main` branch.
2. Add these variables to the service:
   - `MONGODB_URI`: MongoDB connection string.
   - `JWT_SECRET`: a long, random secret. Keep it stable across deployments; changing it invalidates login tokens and encrypted service sessions.
   - `INCOIN_BASE_URL`: `https://api.incoinpay.net` (optional; this is the default).
3. Railway uses `npm run build` to build the frontend and `npm start` to start the backend. It checks `/health` after deployment.
4. Deploy and verify `/health`, login, workspace connection, and task processing.

Referral image uploads are stored on the service filesystem. To preserve them across deploys and restarts, attach a Railway Volume mounted at `/app/backend/uploads`.

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
