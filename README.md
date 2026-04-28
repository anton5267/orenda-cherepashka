# Orenda Cherepashka

Full-stack product with:
- `React + Vite + TypeScript` frontend
- `Express + SQLite` backend
- working public site + admin panel
- local/dev, CI, and self-host Docker flows

## Quick Start

Install dependencies:

```bash
npm install
```

Run local dev stack:

```bash
npm run local:start
npm run local:status
npm run local:stop
```

Useful local URLs:
- frontend: `http://127.0.0.1:4173`
- API: `http://127.0.0.1:4174`

## Verification

Type/build/local production smoke:

```bash
npm run ci:verify
```

This runs:
- typecheck
- production build
- local production-style self-QA

## Admin Password

Generate a bcrypt hash manually:

```bash
npm run admin:hash -- your-password
```

## Self-Host Docker

Create `.env.docker`:

```bash
npm run docker:init-env -- your-admin-password
npm run docker:doctor
```

If you omit the password, the script generates a strong one and prints it once.

Start stack:

```bash
npm run docker:up
npm run docker:status
npm run docker:status:json
npm run docker:doctor:json
```

Options:
- `npm run docker:up:nobuild`
- `npm run docker:down:volumes`
- `npm run docker:logs:follow`

Docker app URL:
- site/admin/API via `http://127.0.0.1:8080`

Logs and stop:

```bash
npm run docker:logs
npm run docker:down
```

Run full containerized smoke:

```bash
npm run docker:self-qa
```

## SQLite Backup / Restore

Create backup from running Docker stack:

```bash
npm run docker:backup
```

Or to a custom file:

```bash
npm run docker:backup -- ./backups/manual-site.db
```

Restore:

```bash
npm run docker:restore -- ./backups/manual-site.db
```

Notes:
- restore restarts the app container after replacing `site.db`
- before restore, the current DB is copied inside the container as `/app/data/site.db.before-restore`

## CI

GitHub Actions workflow:
- typecheck
- build
- local production self-QA
- uploads self-QA artifacts and local logs

## Deployment Note

The old Fly deployment path is currently blocked by Fly billing/trial state. The Docker self-host path is the supported fallback and has been verified locally end-to-end.
