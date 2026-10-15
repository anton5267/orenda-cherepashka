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
- typecheck, catalog price/date/currency checks, Telegram webhook configuration, and rate-limit cleanup checks
- frontend and backend production builds
- isolated SQLite backup/rotation and catalog-migration smoke tests
- local production-style API/browser self-QA, including Pages offline fallback and responsive checks

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
off-site disaster-recovery backup: loss of the host disk could remove both the live
database and its local copies. Periodically copy an encrypted backup to separately
managed storage and test restoration before relying on it.

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

## Supabase deployment status

The repository now contains a Supabase backend implementation (Postgres schema, public/admin Edge Functions, Telegram webhook and a guarded catalog importer), but no Orenda Supabase organization or project has been provisioned yet. The only organization currently visible to the connected account is `german-ai-trainer`; this project must not be used for Orenda.

Before any customer data is collected, create a separate Orenda organization and project, then:

1. Apply `supabase/migrations/20261015115335_orenda_core_schema.sql`.
2. Deploy `orenda-public`, `orenda-admin` and `telegram-webhook` from `supabase/functions/`.
3. Set function secrets: `SUPABASE_SECRET_KEY`, `ADMIN_EMAIL`, `RATE_LIMIT_HASH_SECRET`, `APP_ORIGIN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_CHANNEL_ID`, `TELEGRAM_AUTO_PUBLISH`, and optionally `TELEGRAM_ADMIN_CHAT_ID`.
4. Create the one administrator in Supabase Auth, keep public sign-up disabled, and configure its allowed redirect URL for the final website host.
5. Set frontend build variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. The publishable key is intended for the browser; never expose the Supabase secret/service-role key there.
6. Run `npm run supabase:import-content` first (dry run). Only run `npm run supabase:import-content -- --apply --project-ref=<new-orenda-project-ref>` after confirming that the URL/ref belong to the separate Orenda project. Customer leads and testimonials are deliberately not imported.

The Supabase Free plan is not an always-on hosting guarantee; low-activity projects can be paused. Check current limits and recovery behavior in the [Supabase Free project pausing guide](https://supabase.com/docs/guides/platform/free-project-pausing).

## Website hosting and launch

Cloudflare Pages is the selected free static host for the storefront (`*.pages.dev`); Supabase remains a separate database/API service. The `.shop` domain is intentionally not used. Cloudflare Pages supports GitHub-connected builds and allows up to 500 builds/month on Free; the optional news-refresh workflow below runs every four hours (about 180 scheduled builds/month, leaving some room for code deployments). See [Pages limits](https://developers.cloudflare.com/pages/platform/limits/) and [Git integration setup](https://developers.cloudflare.com/pages/get-started/git-integration/).

Create a Pages project in the owner's Cloudflare account and connect this repository. Set:

- Build command: `npm run build:cloudflare`
- Build output directory: `dist`
- `PUBLIC_SITE_URL`: the stable HTTPS `*.pages.dev` origin Cloudflare assigned to this project
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`: the public values from the separate Orenda Supabase project, once provisioned

The build explicitly uses `/` as its base path and generates product/legal pages, canonical URLs, `robots.txt`, and `sitemap.xml` for `PUBLIC_SITE_URL`. Do not set that URL to the `.shop` domain. The Supabase values are not available yet, so the site is not ready to accept production orders or admin logins: without them it only renders bundled sample/catalog content and disables the Supabase admin route. Do not treat a successful static build as a live, data-backed launch.

After the Pages project exists, create a Pages build hook and save it in the GitHub repository as Actions secret `CLOUDFLARE_PAGES_BUILD_HOOK`. The `Refresh Cloudflare storefront news` workflow calls it every four hours; the Pages build fetches the public Telegram channel and publishes the refreshed snapshot. This is a periodic fallback, not instant delivery. For immediate Telegram updates, configure and deploy the Supabase `telegram-webhook` function and its bot/channel secrets as documented above. Do not put the webhook token in Cloudflare frontend variables or Git.

GitHub Pages is not the production host for this storefront: [GitHub's Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) exclude online businesses, e-commerce sites and sites primarily facilitating commercial transactions. The legacy Pages workflow remains separate and must not be used as the shop's production deployment.

The Pages preview fetcher can read public posts from `@arenda_cherepashka` approximately every 30 minutes without a bot token. In production, the Telegram webhook can publish or edit posts promptly, while this public-feed snapshot is a fallback; repeated posts are deduplicated and archived Telegram items stay hidden. Telegram contact, news, and reviews remain separate: `@yts_nnn`, `@arenda_cherepashka`, and `@cherepashka_vidguk`.

Seed testimonials are intentionally empty. The storefront links to the reviews channel until genuine, moderated customer feedback is added.

The admin dashboard includes first-party, cookie-free counts for page and product views, Telegram clicks, leads, and UTM sources. It does not store IP addresses or device identifiers and honors browser Do Not Track / Global Privacy Control signals; raw analytics events are pruned after 90 days. The owner must fill in seller identity, retention/contact details and legally reviewed privacy/terms before accepting customer data. No Google Search Console property has been verified; verification requires an owner-controlled Google account, and submitting a sitemap does not guarantee indexing.
