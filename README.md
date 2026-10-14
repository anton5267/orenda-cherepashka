# Orenda Cherepashka

Full-stack product with:
- `React + Vite + TypeScript` frontend
- `Express + SQLite` backend
- working public site + admin panel
- local/dev, CI, and self-host Docker flows
- product landing pages, SEO metadata, sitemap and legal information pages
- Telegram contact CTA, channel news webhook and lead notifications

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
- isolated SQLite backup/rotation smoke test
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

The server automatically creates one SQLite backup per day in `DATABASE_BACKUP_DIR`
(by default, a `backups` directory beside the database), keeps the newest 14 daily
copies, and removes expired copies. On Render, the Blueprint places these files on
the persistent disk at `/app/data/backups`.

These on-disk copies help recover from accidental changes, but they are not an
off-site disaster-recovery backup: loss of the persistent disk could remove both
the live database and its local copies. Periodically copy an encrypted backup to a
separately managed storage account and test restoration before relying on it.

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

## Public deployment from GitHub

GitHub Pages is the public storefront and does not require a custom domain. The Render Blueprint hosts the Express API and admin panel on the generated `onrender.com` URL. Set the `ADMIN_PASSWORD` secret in Render; do not commit it or send it in chat. The service uses:

- `/api/health` as its health check
- a persistent disk mounted at `/app/data` for SQLite
- `SECURE_COOKIES=true` and a generated `SESSION_SECRET` in production

The Pages build uses `VITE_API_BASE_URL` to call the Render API for live public data and saved leads. The server only permits browser API calls from the GitHub Pages origin; admin requests remain same-origin on Render. GitHub Actions runs the typecheck, both production builds, and local self-QA on every push and pull request.

The public catalog remains available on GitHub Pages when the API is offline. In that state, live admin data and saved leads are unavailable; the form explicitly offers a Telegram draft instead of claiming the lead was saved. The Render service was last observed as owner-suspended, so the owner must resume it in the Render dashboard before expecting `/api/health` to return `200`. Keep the service's persistent disk attached and set a strong `ADMIN_PASSWORD` (12+ characters) in Render environment settings; never put credentials in this repository.

GitHub Pages reads the latest public posts from `@arenda_cherepashka`: its workflow fetches the channel before each build and runs every 30 minutes. Use **Actions → Deploy GitHub Pages → Run workflow** to refresh it immediately. This feed needs no bot token. When Render is available, Pages submits leads to its API and they appear in the admin panel. If the API is unavailable, the form clearly says the lead was not saved and offers a prepared Telegram message to `@yts_nnn` as a fallback.

Seed testimonials are intentionally empty. The public page links to the seller's Telegram reviews channel until genuine, moderated customer feedback is added in the admin panel.

## Production environment

Required production values:

- `RENDER_EXTERNAL_URL` is provided by Render and used for server-generated canonical URLs and Telegram webhook registration.
- `PUBLIC_API_ALLOWED_ORIGINS=https://anton5267.github.io` allows only the Pages origin to read public API data and submit leads.
- `PUBLIC_SITE_URL=https://anton5267.github.io/orenda-cherepashka` keeps server-generated canonical URLs on the public storefront.
- `SESSION_SECRET` generated by Render
- `ADMIN_PASSWORD` or `ADMIN_PASSWORD_HASH`; a plain production password must be at least 12 characters

Telegram automation values:

- `TELEGRAM_BOT_TOKEN` from BotFather
- `TELEGRAM_WEBHOOK_SECRET` with a random value
- `TELEGRAM_CHANNEL_ID=@arenda_cherepashka`
- `TELEGRAM_AUTO_PUBLISH=true`
- optional `TELEGRAM_ADMIN_CHAT_ID` for new-lead notifications

Add the bot as an administrator of `@arenda_cherepashka`. Once the service starts with the production URL and Telegram secrets, it registers:

- `POST /api/telegram/webhook`
- `GET /sitemap.xml`
- `GET /robots.txt`

Telegram contact buttons intentionally point to `https://t.me/yts_nnn`; the channel link is kept separate so customers do not confuse support with news.

The admin dashboard includes first-party, cookie-free counts for page and product views, Telegram clicks, leads, and UTM sources. It does not store IP addresses or device identifiers and honors browser Do Not Track / Global Privacy Control signals; raw analytics events are pruned after 90 days. This design does not itself establish legal compliance: the owner should confirm the privacy notice and any applicable consent requirements for the markets served.

## Search Console

The public canonical site is `https://anton5267.github.io/orenda-cherepashka/` (the `.shop` domain is not configured as the primary site). After verifying this URL-prefix property in Google Search Console using a verification file or meta tag, submit `https://anton5267.github.io/orenda-cherepashka/sitemap.xml` and monitor indexing and security reports. Verification requires a token from the owner's Google account; no placeholder token is committed here, and sitemap submission does not guarantee indexing.
