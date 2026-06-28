
-- Lock down all data tables: only service_role (server functions) can access.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['sales','weekly_imports','clint_deals','clint_users','clint_origins','clint_origin_stages','clint_lost_statuses','clint_sync_log','bi_pipeline_areas'];
  pol record;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- drop ALL existing policies on the table
    FOR pol IN
      SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;

    -- revoke anon/authenticated grants
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    -- no permissive policies created → anon/authenticated have no access
  END LOOP;
END $$;
