-- Browser clients never access these tables directly. Edge Functions use the
-- server-only secret key after applying validation, rate limits and auth checks.
create table public.site_settings (
  singleton boolean primary key default true check (singleton),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.site_settings (singleton, data)
values (
  true,
  '{
    "siteName":"Orenda Cherepashka",
    "telegramContactUrl":"https://t.me/yts_nnn",
    "telegramNewsChannelUrl":"https://t.me/arenda_cherepashka",
    "telegramReviewsChannelUrl":"https://t.me/cherepashka_vidguk",
    "telegramAutoPublish":true,
    "heroTitle":"Оренда підписок на топові сервіси без переплат",
    "heroSubtitle":"ChatGPT, Netflix, Spotify, VPN та інші сервіси з швидким підключенням і зрозумілими тарифами",
    "footerDescription":"Оренда популярних підписок з вигідними тарифами, швидкою видачею доступу та підтримкою через Telegram.",
    "leadTitle":"Залишити заявку",
    "leadSubtitle":"Обери сервіс і тариф, залиш контакт, а ми швидко зв''яжемося з тобою для підтвердження замовлення."
  }'::jsonb
)
on conflict (singleton) do nothing;

create table public.site_content (
  kind text not null check (kind in ('category', 'product', 'faq', 'news', 'review')),
  id text not null,
  payload jsonb not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_moderated boolean not null default true,
  updated_at timestamptz not null default now(),
  source_type text,
  source_url text,
  source_chat_id text,
  source_message_id bigint,
  published_at timestamptz,
  primary key (kind, id),
  constraint site_content_telegram_source_unique unique (source_chat_id, source_message_id)
);

create index site_content_public_order_idx
  on public.site_content (kind, is_active, sort_order);
create index site_content_news_published_idx
  on public.site_content (published_at desc)
  where kind = 'news' and is_active;

create table public.lead_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  contact text not null check (char_length(contact) between 3 and 120),
  items jsonb not null default '[]'::jsonb,
  message text not null default '' check (char_length(message) <= 1000),
  status text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  needed_by date,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  created_at timestamptz not null default now()
);
create index lead_requests_created_idx on public.lead_requests (created_at desc);
create index lead_requests_utm_source_idx on public.lead_requests (utm_source, created_at desc)
  where utm_source is not null;

create table public.lead_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0)
);
create index lead_rate_limits_window_idx on public.lead_rate_limits (window_started_at);

create table public.telegram_webhook_events (
  id bigint generated always as identity primary key,
  update_id bigint unique,
  chat_id text,
  message_id bigint,
  event_type text not null,
  status text not null check (status in ('processed', 'ignored', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);
create index telegram_webhook_events_created_idx
  on public.telegram_webhook_events (created_at desc);

create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null check (event_name in ('page_view', 'product_view', 'telegram_click')),
  path text not null check (char_length(path) <= 200),
  product_slug text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  created_at timestamptz not null default now()
);
create index analytics_events_created_idx on public.analytics_events (created_at desc);
create index analytics_events_product_idx
  on public.analytics_events (product_slug, event_name, created_at desc);
create index analytics_events_source_idx on public.analytics_events (utm_source, created_at desc)
  where event_name = 'page_view' and utm_source is not null;

alter table public.site_settings enable row level security;
alter table public.site_content enable row level security;
alter table public.lead_requests enable row level security;
alter table public.lead_rate_limits enable row level security;
alter table public.telegram_webhook_events enable row level security;
alter table public.analytics_events enable row level security;

revoke all on table public.site_settings, public.site_content, public.lead_requests,
  public.lead_rate_limits, public.telegram_webhook_events, public.analytics_events
  from anon, authenticated;
grant select, insert, update, delete on table public.site_settings, public.site_content,
  public.lead_requests, public.lead_rate_limits, public.telegram_webhook_events,
  public.analytics_events to service_role;
grant usage, select on sequence public.telegram_webhook_events_id_seq to service_role;

create or replace function public.consume_lead_rate_limit(
  p_key_hash text,
  p_max_requests integer default 10,
  p_window_seconds integer default 600
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count integer;
begin
  if p_key_hash is null or length(p_key_hash) < 32
     or p_max_requests < 1 or p_max_requests > 100
     or p_window_seconds < 1 or p_window_seconds > 3600 then
    raise exception 'Invalid rate-limit parameters';
  end if;

  insert into public.lead_rate_limits (key_hash, window_started_at, request_count)
  values (p_key_hash, now(), 1)
  on conflict (key_hash) do update
    set request_count = case
          when public.lead_rate_limits.window_started_at
               <= now() - make_interval(secs => p_window_seconds) then 1
          else public.lead_rate_limits.request_count + 1
        end,
        window_started_at = case
          when public.lead_rate_limits.window_started_at
               <= now() - make_interval(secs => p_window_seconds) then now()
          else public.lead_rate_limits.window_started_at
        end
  returning request_count into current_count;

  delete from public.lead_rate_limits
    where window_started_at < now() - interval '1 day';

  return current_count <= p_max_requests;
end;
$$;

revoke all on function public.consume_lead_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_lead_rate_limit(text, integer, integer)
  to service_role;

create or replace function public.get_analytics_summary(p_period_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_days integer := greatest(1, least(coalesce(p_period_days, 30), 90));
  since_at timestamptz;
  page_views bigint;
  product_views bigint;
  telegram_clicks bigint;
  lead_count bigint;
  popular jsonb;
  sources jsonb;
begin
  since_at := now() - make_interval(days => safe_days);

  select count(*) filter (where event_name = 'page_view'),
         count(*) filter (where event_name = 'product_view'),
         count(*) filter (where event_name = 'telegram_click')
    into page_views, product_views, telegram_clicks
    from public.analytics_events
   where created_at >= since_at;

  select count(*) into lead_count from public.lead_requests where created_at >= since_at;

  select coalesce(jsonb_agg(jsonb_build_object(
      'slug', ranked.slug, 'name', ranked.name, 'views', ranked.views, 'leads', ranked.leads
    ) order by ranked.views desc, ranked.leads desc, ranked.sort_order asc), '[]'::jsonb)
    into popular
    from (
      select c.payload ->> 'slug' as slug,
             c.payload ->> 'name' as name,
             c.sort_order,
             (select count(*) from public.analytics_events e
               where e.event_name = 'product_view'
                 and e.product_slug = c.payload ->> 'slug' and e.created_at >= since_at) as views,
             (select count(distinct l.id)
                from public.lead_requests l
                cross join lateral jsonb_array_elements(l.items) item
               where item ->> 'productId' = c.id and l.created_at >= since_at) as leads
        from public.site_content c
       where c.kind = 'product'
    ) ranked
   where ranked.views > 0 or ranked.leads > 0
   limit 8;

  select coalesce(jsonb_agg(jsonb_build_object(
      'source', merged.source, 'visits', merged.visits, 'leads', merged.leads
    ) order by merged.leads desc, merged.visits desc), '[]'::jsonb)
    into sources
    from (
      select coalesce(v.source, l.source) as source,
             coalesce(v.visits, 0) as visits,
             coalesce(l.leads, 0) as leads
        from (
          select utm_source as source, count(*) as visits
            from public.analytics_events
           where event_name = 'page_view' and created_at >= since_at and utm_source is not null
           group by utm_source
        ) v
        full outer join (
          select utm_source as source, count(*) as leads
            from public.lead_requests
           where created_at >= since_at and utm_source is not null
           group by utm_source
        ) l using (source)
    ) merged;

  return jsonb_build_object(
    'periodDays', safe_days,
    'pageViews', page_views,
    'productViews', product_views,
    'telegramClicks', telegram_clicks,
    'leads', lead_count,
    'leadPerPageViewPercent', case when page_views > 0
      then round((lead_count::numeric / page_views::numeric) * 10000) / 100
      else 0 end,
    'popularProducts', popular,
    'campaignSources', sources
  );
end;
$$;

revoke all on function public.get_analytics_summary(integer) from public, anon, authenticated;
grant execute on function public.get_analytics_summary(integer) to service_role;
