# Orenda deployment runbook

The root [README](../README.md) records the current deployment and remaining owner actions.

## Production layout

- Storefront: Cloudflare Pages, `https://orenda-cherepashka.pages.dev` (Free; direct-upload project created).
- Data/API: Orenda Supabase Free project, ref `suzmndaqwchayddrulzc` in Frankfurt.
- The `.shop` domain, GitHub Pages, legacy Fly/Render deployments, and unrelated `german-ai-trainer` Supabase project are out of scope.

## Cloudflare Pages

The production bundle is built with:

- `PUBLIC_SITE_URL=https://orenda-cherepashka.pages.dev`
- `VITE_SUPABASE_URL=https://suzmndaqwchayddrulzc.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY=<project publishable key>`
- `npm run build:cloudflare` → `dist`

The current bundle is ready for direct upload. Publishing it is pending Chrome's ChatGPT-extension `Allow access to file URLs` permission because browser file selection is blocked while that setting is disabled. Do not place a Supabase secret/service-role key or Telegram bot token in a `VITE_` variable.

## Supabase status

The schema and RLS migrations are applied. The database has 35 products, 62 price options, six categories, five FAQs, one manual news item, and no imported leads/reviews. Thirty products are active for the public catalog.

Deployed functions:

- `orenda-public`: public storefront routes; gateway JWT verification off, with function-level route validation, CORS, and rate limits.
- `orenda-admin`: gateway JWT verification on; only the configured owner email is authorized by the handler.
- `telegram-webhook`: gateway JWT verification off; the handler requires Telegram's secret header and the configured channel.

`APP_ORIGIN` and `ADMIN_EMAIL` are stored server-side. Supabase-managed `SUPABASE_SECRET_KEYS` and `SUPABASE_PUBLISHABLE_KEYS` are used by functions. The Telegram bot token, webhook secret, channel ID, and optional admin-chat ID are not configured. The public channel reader supplies news without a bot. The public Auth signup switch is off; the owner must create the matching Auth user and set their password themselves.

Live checks already run: public API health 200, products 30, news 7, unauthenticated admin 401, unconfigured webhook 503, Pages-origin preflight 204. No valid lead was submitted to production, so lead persistence needs an owner-approved end-to-end test. Do not claim the webhook is operational until its secrets and Telegram bot/channel setup are complete.

## Remaining owner actions

1. Allow the one-time local bundle upload to Cloudflare Pages, then verify the live storefront and product/news/legal routes.
2. Create the owner Auth user in Supabase without enabling public sign-up; sign in at `/admin` and verify editing.
3. If instant Telegram webhook delivery is desired, add a bot as channel admin and set its token, webhook secret, and channel ID in Supabase only.
4. Provide the seller's legal identity/contact and reviewed terms/privacy wording before accepting real customer data.
5. Verify ownership in Google Search Console and submit `/sitemap.xml` from the owner's Google account.

Do not commit secrets, upload them as frontend variables, or send them in chat. The Supabase Free project may pause after inactivity; see the [Free project pausing guide](https://supabase.com/docs/guides/platform/free-project-pausing).
