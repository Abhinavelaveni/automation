# Incoin Auto

## Deploy on Vercel

The frontend and API are deployed together. MongoDB Atlas stores application data, referral uploads, and durable task-run state. A Vercel Cron job resumes queued task runs in short slices so work does not depend on a long-lived server process.

1. Import this repository into Vercel and use the repository root as the project root.
2. Add these environment variables for Production (and Preview if needed):
   - `MONGODB_URI` — the MongoDB connection string.
   - `JWT_SECRET` — use the same value as the current deployment to preserve existing login tokens and decrypt saved service sessions.
   - `CRON_SECRET` — a long random secret used to authenticate the scheduled worker.
   - `INCOIN_BASE_URL` and `PAKKAGO_BASE_URL` are optional; defaults are used when omitted.
3. Deploy with the settings in `vercel.json`: build command `npm run build`, output directory `frontend/dist`.
4. Use a Vercel plan that supports the configured once-per-minute Cron schedule. A run is queued immediately and is normally picked up by the next scheduled invocation. Each invocation processes a bounded slice and saves progress in MongoDB for the next invocation.
5. Verify `/api/health`, register/login, workspace connection, referral uploads, and a complete task run before retiring the old deployment.

Referral images are stored in MongoDB rather than the function's temporary filesystem. Uploads are limited to 4 MiB per image to fit within the serverless request-body limit.
Previously uploaded files that exist only on Render's local disk are not copied automatically; export them before retiring the old service if they need to be retained.

## Local development

Create a root `.env` with `MONGODB_URI` and `JWT_SECRET`. Run the backend and frontend in separate terminals:

```bash
npm install
npm start
```

```bash
npm run dev --workspace frontend
```

The Vite dev server proxies `/api` to `http://localhost:5000` by default. Set `VITE_API_TARGET` to override the backend URL.
