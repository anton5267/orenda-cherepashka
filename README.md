# Orenda Cherepashka

Full-stack product with:
- `React + Vite + TypeScript` frontend
- `Express + SQLite` backend
- Cloudflare Pages storefront + Supabase-backed admin panel
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
copies, and removes expired copies.

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

The separate Free organization `Orenda Cherepashka` and project `orenda-cherepashka` are in use (project ref `suzmndaqwchayddrulzc`, Frankfurt). The core schema and RLS migrations are applied. The database contains 35 products / 62 price options, six categories, five FAQs, and one manually managed starter news item. Thirty products are public; five intentionally inactive offers and customer testimonials were not published.

All three Edge Functions are deployed. `orenda-public` serves the storefront API; `orenda-admin` keeps gateway JWT verification enabled and checks the configured owner email; `telegram-webhook` verifies its own Telegram secret and channel. Gateway JWT verification is disabled only for the public function and webhook, as the handlers apply their own request validation/rate limits and the webhook secret check. Public sign-ups remain disabled. `ADMIN_EMAIL` and `APP_ORIGIN` are set as server-side secrets; Supabase's project-managed key maps supply backend keys. No secrets are stored in the repository.

Live checks performed: public health returned HTTP 200; the public API returned 30 active products and seven news items (six Telegram posts plus the manual item); unauthenticated admin access returned 401; the unconfigured webhook returned 503; Pages-origin CORS preflight returned 204. A valid production lead was not submitted, so lead persistence through the live storefront still needs an owner-approved end-to-end test. The webhook is intentionally not operational until a bot is added to the channel and its token, webhook secret, and channel ID are configured. The public channel scraper provides the site's automatic news feed without those bot credentials.

The ChatGPT Supabase connector still cannot access this new organization; the project was configured through its authenticated dashboard. Do not use the unrelated `german-ai-trainer` project. The Supabase Free plan can pause inactive projects; see the [Free project pausing guide](https://supabase.com/docs/guides/platform/free-project-pausing).

## Website hosting and launch

The production storefront is live on Cloudflare Pages at [`https://orenda-cherepashka-live.pages.dev`](https://orenda-cherepashka-live.pages.dev/), connected to the GitHub repository's `codex/supabase-platform` branch. Supabase is the separate database/API. The `.shop` domain is intentionally out of scope; the older direct-upload Pages project at `orenda-cherepashka.pages.dev` is unused. The live bundle contains 30 product pages, seven news pages, four legal pages, `robots.txt`, and `sitemap.xml`, built against live Supabase data without server credentials in the client bundle.

Production build configuration: `PUBLIC_SITE_URL=https://orenda-cherepashka-live.pages.dev`, `VITE_SUPABASE_URL` for the Orenda project, and the project's publishable key as `VITE_SUPABASE_PUBLISHABLE_KEY`. Build command: `npm run build:cloudflare`, output directory: `dist`. The build uses `/` as its base path and generates active-product/news/legal SEO pages, canonical and Open Graph metadata, Product/NewsArticle/Breadcrumb structured data, `robots.txt`, and sitemap. It refuses to publish stale metadata if the configured API cannot be read.

The public Telegram page is fetched automatically by the public Supabase API and cached briefly; a build also bundles the latest six posts as an offline snapshot. Last verified fetch: 2026-10-15; the newest channel post was dated 2026-09-17, so the site correctly warns that the channel has not posted recently. No scheduled Cloudflare deploy token or Pages build hook is configured. The instant webhook remains optional and requires an owner-managed bot, channel admin access, and server-side Telegram secrets. Never put those values in frontend variables or Git.

The old GitHub Pages/Render URLs are legacy demos, not the production source of truth. The `.shop` domain is not used. Telegram destinations are intentionally separate: contact `@yts_nnn`, news `@arenda_cherepashka`, and reviews `@cherepashka_vidguk`.

Seed testimonials are intentionally empty. The storefront links to the reviews channel until genuine, moderated customer feedback is added.

The admin dashboard includes first-party, cookie-free counts for page and product views, Telegram clicks, leads, and UTM sources. It does not store IP addresses or device identifiers and honors browser Do Not Track / Global Privacy Control signals; raw analytics events are pruned after 90 days. The admin email allow-list is configured. A password-recovery flow is available, but the owner Auth user still needs to be created before sign-in can work. Seller legal identity/contact details and legally reviewed privacy/terms are still required before accepting real customer data. Google Search Console ownership for the Pages property is verified, and the homepage is indexed. The sitemap was submitted, but its report still says "Couldn't fetch" even though the live URL test can access the sitemap; allow time for processing and recheck the report.
