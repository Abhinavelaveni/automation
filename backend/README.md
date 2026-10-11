# Incoin Mongo Backend

## Install

```bash
npm install
```

## Configure

Copy `.env.example` to `.env` and set:

```env
PORT=5000
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-url>/<database>?retryWrites=true&w=majority
JWT_SECRET=change_this_secret
```

## Run

```bash
npm run dev
```

## API Notes

The Flutter app expects these endpoints:

- POST /api/auth/register
- POST /api/auth/login
- GET /api/credits
- POST /api/credits/add
- GET /api/logs
- POST /api/logs
- GET /api/referrals/status
- POST /api/referrals/apply
- POST /api/uploads/referral
- GET /api/devices/registered/:deviceId
- POST /api/devices/register
