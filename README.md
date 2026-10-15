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

The separate Free organization `Orenda Cherepashka` and project `orenda-cherepashka` have been created (project ref `suzmndaqwchayddrulzc`, Frankfurt). The core migration `supabase/migrations/20261015115335_orenda_core_schema.sql` is applied; the six expected tables are visible in Table Editor: `site_settings`, `site_content`, `lead_requests`, `lead_rate_limits`, `telegram_webhook_events`, and `analytics_events`.

The production backend is **not ready yet**: catalog content has not been imported, the three Edge Functions have not been deployed, runtime secrets and the owner admin account have not been configured, and the ChatGPT Supabase connector is still authenticated to a different organization (`german-ai-trainer`). Do not use that older project for Orenda or accept customer orders until the remaining setup and live checks are complete.

GitHub's repository settings currently report the legacy public Pages URL as `https://anton5267.github.io/orenda-cherepashka/`, with workflow publishing from `main`; the most recent Pages workflow listed by GitHub completed successfully. Direct HTTPS retrieval from this environment failed during TLS negotiation, so the page's current HTTP response was not independently verified here. The `main` workflow still targets `https://orenda-cherepashka.onrender.com`; a live check of `/api/health` returned `503 Service Suspended`. Therefore the current setup does **not** prove that leads persist or admin login works. Do not treat that legacy deployment as the final storefront.

The project Security Advisor was checked after applying `supabase/migrations/20261015134209_secure_auto_rls_function.sql`: it reports 0 errors and 0 warnings (the `anon`, `authenticated`, and `service_role` execute grants on the `SECURITY DEFINER` auto-RLS event function were revoked and verified absent).

Remaining Supabase launch steps:

1. Reconnect the Supabase app in ChatGPT to the Supabase account that owns `Orenda Cherepashka`, then verify that the connector lists project ref `suzmndaqwchayddrulzc`.
2. Import the 35 products / 62 price options and the bundled categories, FAQs, and starter news with `npm run supabase:import-content -- --apply --project-ref=suzmndaqwchayddrulzc`. The importer checks the exact HTTPS project URL and refuses to overwrite non-empty content by default. Customer leads and testimonials are deliberately not imported.
3. Deploy `orenda-public`, `orenda-admin`, and `telegram-webhook` from `supabase/functions/`.
4. Configure function secrets in the Supabase project (never in Git or frontend variables): `SUPABASE_SECRET_KEY`, `ADMIN_EMAIL`, `RATE_LIMIT_HASH_SECRET`, `APP_ORIGIN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_CHANNEL_ID`, `TELEGRAM_AUTO_PUBLISH`, and optionally `TELEGRAM_ADMIN_CHAT_ID`. The owner must provide/select the admin email and Telegram bot/channel credentials.
5. Create the single owner admin user in Supabase Auth, keep public sign-up disabled, and configure its allowed redirect URL for the final `pages.dev` origin.
6. Configure the frontend build with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. The publishable key is intended for the browser; never expose the Supabase secret/service-role key there.
7. Run the production smoke checks against the deployed public/admin functions and confirm a test lead appears in the database before opening the site to customers.

The Supabase Free plan is not an always-on hosting guarantee; low-activity projects can be paused. Check current limits and recovery behavior in the [Supabase Free project pausing guide](https://supabase.com/docs/guides/platform/free-project-pausing).

## Website hosting and launch

Cloudflare Pages is the selected free static host for the storefront (`*.pages.dev`); Supabase remains a separate database/API service. The `.shop` domain is intentionally not used. Cloudflare Pages supports GitHub-connected builds and allows up to 500 builds/month on Free; the optional news-refresh workflow below runs every four hours (about 180 scheduled builds/month, leaving some room for code deployments). See [Pages limits](https://developers.cloudflare.com/pages/platform/limits/) and [Git integration setup](https://developers.cloudflare.com/pages/get-started/git-integration/).

The Cloudflare Pages deployment is not configured in this repository yet: there is no recorded Pages project/deployment or stable `pages.dev` origin. Once a project is created and its final origin is known, connect this repository and set:

- Build command: `npm run build:cloudflare`
- Build output directory: `dist`
- `PUBLIC_SITE_URL`: the stable HTTPS `*.pages.dev` origin Cloudflare assigned to this project
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`: the public values from the existing separate Orenda Supabase project

The build explicitly uses `/` as its base path and generates product, published-news and legal detail pages, canonical/OG metadata, Product/NewsArticle/Breadcrumb structured data, `robots.txt`, and a sitemap for `PUBLIC_SITE_URL`. When the Supabase frontend URL and publishable key are configured, build-time product and news pages are generated from active database records plus the current Telegram snapshot; excluded and inactive posts are omitted. If a configured API fails or returns invalid content, the build stops instead of publishing stale metadata. Without Supabase frontend settings, local QA uses the seed catalog and bundled Telegram snapshot. The old `.shop` domain is intentionally out of scope. Until the Supabase functions, frontend configuration, and admin account are verified, a static build only proves that assets compile; it does not prove that the site can persist orders or support admin logins. Do not treat a successful build as a live, data-backed launch.

After the Pages project exists, create a Pages build hook and save it in the GitHub repository as Actions secret `CLOUDFLARE_PAGES_BUILD_HOOK`. The `Refresh Cloudflare storefront news` workflow currently has no hook configured; once configured, it calls the hook every four hours and the Pages build fetches the public Telegram channel. This is a periodic fallback, not instant delivery. For prompt Telegram updates, configure and deploy the Supabase `telegram-webhook` function and its bot/channel secrets as documented above. Do not put the webhook token in Cloudflare frontend variables or Git.

GitHub Pages must not be used to publish this commercial storefront: [GitHub's Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) prohibit free hosting for online businesses and e-commerce sites. The migration branch removes the legacy Pages workflow, but the repository's `main` branch still has that old workflow and may keep publishing its stale artifact until the replacement is live. Do not treat the legacy `github.io` URL as the production source of truth.

The Pages preview fetcher can read public posts from `@arenda_cherepashka` approximately every 30 minutes without a bot token. In production, the Telegram webhook can publish or edit posts promptly, while this public-feed snapshot is a fallback; repeated posts are deduplicated and archived Telegram items stay hidden. Telegram contact, news, and reviews remain separate: `@yts_nnn`, `@arenda_cherepashka`, and `@cherepashka_vidguk`.

Seed testimonials are intentionally empty. The storefront links to the reviews channel until genuine, moderated customer feedback is added.

The admin dashboard includes first-party, cookie-free counts for page and product views, Telegram clicks, leads, and UTM sources. It does not store IP addresses or device identifiers and honors browser Do Not Track / Global Privacy Control signals; raw analytics events are pruned after 90 days. The owner must fill in seller identity, retention/contact details and legally reviewed privacy/terms before accepting customer data. No Google Search Console property has been verified; verification requires an owner-controlled Google account, and submitting a sitemap does not guarantee indexing.
