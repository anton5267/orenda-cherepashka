-- This Supabase-managed event-trigger function is SECURITY DEFINER and lives
-- in the exposed public schema. Keep it usable by its owner/event-trigger
-- machinery, but do not grant direct execution to API-facing roles.
do $migration$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end
$migration$;
