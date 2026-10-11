# Incoin Auto

## Deploy on Render

This project is configured to deploy as a Render Node web service using [`render.yaml`](./render.yaml).

1. Import the repository in Render and create the Blueprint service.
2. Set `MONGODB_URI` to the MongoDB connection string in the Render service environment.
3. Render generates `JWT_SECRET` automatically from the Blueprint configuration. Keep the existing secret when restoring an existing deployment so login tokens and encrypted service sessions continue to work.
4. Deploy and verify `/health`, login, workspace connection, and task processing.

The Blueprint builds with `npm run render-build` and starts with `npm start`.

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
