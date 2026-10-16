# Orenda deployment runbook

The root [README](../README.md) records the current deployment and remaining owner actions.
For a dated distinction between implemented code, verified live behavior, and launch blockers, see [Project Status](../docs/PROJECT_STATUS.md).

## Production layout

- Storefront: Cloudflare Pages, [`https://orenda-cherepashka-live.pages.dev`](https://orenda-cherepashka-live.pages.dev/) (Free; Git-integrated). `main` is the production branch and automatic production deployments are enabled.
- Data/API: Orenda Supabase Free project, ref `suzmndaqwchayddrulzc` in Frankfurt.
- The `.shop` domain, the unused direct-upload project `orenda-cherepashka.pages.dev`, legacy Fly/Render deployments, and unrelated `german-ai-trainer` Supabase project are out of scope.

## Cloudflare Pages

The production bundle is built with:

- `PUBLIC_SITE_URL=https://orenda-cherepashka-live.pages.dev`
- `VITE_SUPABASE_URL=https://suzmndaqwchayddrulzc.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY=<project publishable key>`
- `npm run build:cloudflare` → `dist`

Cloudflare builds from `main` with `npm run build:cloudflare` → `dist`. On 2026-10-16 the production root, login, recovery, product, news, privacy, robots and sitemap URLs all returned HTTP 200. The former admin-route 404 is resolved. Do not place a Supabase secret/service-role key or Telegram bot token in a `VITE_` variable.

The `github-news-refresh` Deploy Hook builds `main`. Its URL is stored only as the repository's `CLOUDFLARE_PAGES_BUILD_HOOK` Actions secret. The refresh workflow runs every four hours; its manual run on 2026-10-16 successfully called Cloudflare and received `success: true`.

The current Supabase Auth Site URL is `https://orenda-cherepashka-live.pages.dev`; the only allowed redirect is the exact password-recovery callback at `/admin/reset-password`. The storefront includes a generic, anti-enumeration password recovery flow. Public sign-up remains disabled.

## Supabase status

The schema and RLS are present. A read-only audit confirmed 35 products, six categories, five FAQs, one manual news item, and zero leads; thirty products are public. All six application tables have RLS and deny direct CRUD to `anon`/`authenticated`. The empty migration history caused the previous `site_settings already exists` check failure. On 2026-10-16 the live schema was compared with migrations in isolated PostgreSQL; both applied versions were recorded through guarded history-only SQL equivalent to migration repair. No application DDL or data was replayed. Verify the next main check separately.

Deployed functions:

- `orenda-public`: public storefront routes; gateway JWT verification off, with function-level route validation, CORS, and rate limits.
- `orenda-admin`: gateway JWT verification on; only the configured owner email is authorized by the handler.
- `telegram-webhook`: gateway JWT verification off; the handler requires Telegram's secret header and the configured channel.

`APP_ORIGIN` and `ADMIN_EMAIL` are stored server-side. The configured email digest matches the confirmed owner. Supabase-managed `SUPABASE_SECRET_KEYS` and `SUPABASE_PUBLISHABLE_KEYS` are used by functions. The Telegram bot token, webhook secret, channel ID, and optional admin-chat ID are not configured. The public channel reader supplies news without a bot. Public signup is off. The owner reported signing in; the authenticated dashboard and a reversible settings edit were verified in production. Password entry remains with the owner; logout and a normal form login succeeded; real email recovery is not yet claimed.

Repeated live checks: public API health 200, products 30, news 7, unauthenticated admin 401, Pages-origin preflight 204. The owner declined a production test lead; none was created and persistence is unverified. The previously observed unconfigured webhook 503 was not reverified in this acceptance pass. Do not claim the webhook is operational until its secrets and Telegram bot/channel setup are complete.

A snapshot of all six application tables was restored and compared in isolated PostgreSQL 17. Read [BACKUP.md](BACKUP.md) for its scope and repeatable drill. It excludes Auth, Storage, managed schemas and secrets; full CLI backup and separately managed encrypted storage remain pending.

## Remaining owner actions

1. Complete real email recovery if required by the owner; login/logout/relogin and saving/restoring a harmless settings edit already passed.
2. Recheck production routes after each new deployment; `main` and automatic production deployment are already configured.
3. Provide the seller's legal identity/contact and review the privacy/terms wording before accepting real customer data.
4. Do not create a production test lead without a new owner instruction; the owner declined this test on 2026-10-16.
5. Recheck the Search Console sitemap report. The production XML contains 42 correct URLs. Submission and Google's Live Test succeeded on 2026-10-16, but the sitemap report still said it could not fetch the file. Live Test success does not establish indexing.
6. If instant Telegram webhook delivery is desired, add a bot as channel admin and set its token, webhook secret, and channel ID in Supabase only. Public-feed polling already works without a bot.

Do not commit secrets, upload them as frontend variables, or send them in chat. The Supabase Free project may pause after inactivity; see the [Free project pausing guide](https://supabase.com/docs/guides/platform/free-project-pausing).
