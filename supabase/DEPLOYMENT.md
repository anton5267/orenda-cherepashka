# Orenda deployment runbook

The root [README](../README.md) records the current deployment and remaining owner actions.
For a dated distinction between implemented code, verified live behavior, and launch blockers, see [Project Status](../docs/PROJECT_STATUS.md).

## Production layout

- Storefront: Cloudflare Pages, [`https://orenda-cherepashka-live.pages.dev`](https://orenda-cherepashka-live.pages.dev/) (Free; Git-integrated). The current `main` build is still a preview deployment; set `main` as the Pages production branch before treating this hostname as up to date.
- Data/API: Orenda Supabase Free project, ref `suzmndaqwchayddrulzc` in Frankfurt.
- The `.shop` domain, the unused direct-upload project `orenda-cherepashka.pages.dev`, legacy Fly/Render deployments, and unrelated `german-ai-trainer` Supabase project are out of scope.

## Cloudflare Pages

The production bundle is built with:

- `PUBLIC_SITE_URL=https://orenda-cherepashka-live.pages.dev`
- `VITE_SUPABASE_URL=https://suzmndaqwchayddrulzc.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY=<project publishable key>`
- `npm run build:cloudflare` → `dist`

Cloudflare builds from the connected GitHub branch with `npm run build:cloudflare` → `dist`. The `main` preview contains the current product/news/legal routes, `robots.txt`, and sitemap. As of 2026-10-16, the production hostname still returned 404 for `/admin/login`, so preview success must not be reported as production success. Do not place a Supabase secret/service-role key or Telegram bot token in a `VITE_` variable.

The current Supabase Auth Site URL is `https://orenda-cherepashka-live.pages.dev`; the only allowed redirect is the exact password-recovery callback at `/admin/reset-password`. The storefront includes a generic, anti-enumeration password recovery flow. Public sign-up remains disabled.

## Supabase status

The schema and RLS migrations are applied. The database has 35 products, 62 price options, six categories, five FAQs, one manual news item, and no imported leads/reviews. Thirty products are active for the public catalog.

Deployed functions:

- `orenda-public`: public storefront routes; gateway JWT verification off, with function-level route validation, CORS, and rate limits.
- `orenda-admin`: gateway JWT verification on; only the configured owner email is authorized by the handler.
- `telegram-webhook`: gateway JWT verification off; the handler requires Telegram's secret header and the configured channel.

`APP_ORIGIN` and `ADMIN_EMAIL` are stored server-side. Supabase-managed `SUPABASE_SECRET_KEYS` and `SUPABASE_PUBLISHABLE_KEYS` are used by functions. The Telegram bot token, webhook secret, channel ID, and optional admin-chat ID are not configured. The public channel reader supplies news without a bot. The public Auth signup switch is off; there is no Auth user yet, so admin sign-in is unavailable until the owner account is created and its owner-managed password is set.

Live checks already run: public API health 200, products 30, news 7, unauthenticated admin 401, unconfigured webhook 503, Pages-origin preflight 204. No valid lead was submitted to production, so lead persistence needs an owner-approved end-to-end test. Do not claim the webhook is operational until its secrets and Telegram bot/channel setup are complete.

## Remaining owner actions

1. Set `main` as the Cloudflare Pages production branch and enable automatic production deployments; verify the direct production admin and content routes.
2. Create/accept the owner Auth invitation (if approved) and set the password through Supabase's email flow; then sign in at `/admin` and verify editing.
3. Provide the seller's legal identity/contact and review the privacy/terms wording before accepting real customer data.
4. After admin access is ready, submit and verify one end-to-end test lead only with the owner's approval; no production lead has been created as a test.
5. Recheck the Search Console sitemap report after the production branch fix. Ownership of `https://orenda-cherepashka-live.pages.dev/` was previously verified and `/sitemap.xml` submitted, but the report said it could not fetch the sitemap.
6. If instant Telegram webhook delivery is desired, add a bot as channel admin and set its token, webhook secret, and channel ID in Supabase only. Public-feed polling already works without a bot.

Do not commit secrets, upload them as frontend variables, or send them in chat. The Supabase Free project may pause after inactivity; see the [Free project pausing guide](https://supabase.com/docs/guides/platform/free-project-pausing).
