-- Read-only, consistent snapshot of all six application tables. Run in the
-- Orenda SQL Editor only. Save the application_backup cell as JSON, never to Git.
-- Excludes Auth users, Storage objects, managed schemas, and server secrets.
select jsonb_build_object(
  'format', 'orenda-application-backup-v1',
  'project_ref', 'suzmndaqwchayddrulzc',
  'created_at', now(),
  'restore_schema_migrations', jsonb_build_array('20261015115335', '20261015134209'),
  'tables', jsonb_build_object(
    'site_settings', (select coalesce(jsonb_agg(to_jsonb(t) order by singleton), '[]'::jsonb) from public.site_settings t),
    'site_content', (select coalesce(jsonb_agg(to_jsonb(t) order by kind, id), '[]'::jsonb) from public.site_content t),
    'lead_requests', (select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb) from public.lead_requests t),
    'lead_rate_limits', (select coalesce(jsonb_agg(to_jsonb(t) order by key_hash), '[]'::jsonb) from public.lead_rate_limits t),
    'telegram_webhook_events', (select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb) from public.telegram_webhook_events t),
    'analytics_events', (select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb) from public.analytics_events t)
  )
) as application_backup;
