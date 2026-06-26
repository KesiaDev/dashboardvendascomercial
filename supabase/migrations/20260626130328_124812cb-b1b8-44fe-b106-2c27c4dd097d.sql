
CREATE TABLE public.clint_users (
  id UUID PRIMARY KEY,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clint_users TO authenticated, anon;
GRANT ALL ON public.clint_users TO service_role;
ALTER TABLE public.clint_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY open_all_clint_users ON public.clint_users FOR ALL TO public USING (true) WITH CHECK (true);

CREATE TABLE public.clint_deals (
  id UUID PRIMARY KEY,
  user_id UUID,
  user_email TEXT,
  user_name TEXT,
  contact_id UUID,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  contact_ddi TEXT,
  origin_id UUID,
  origin_name TEXT,
  stage TEXT,
  stage_id UUID,
  status TEXT NOT NULL,
  value NUMERIC,
  currency TEXT,
  created_at TIMESTAMPTZ,
  won_at TIMESTAMPTZ,
  lost_at TIMESTAMPTZ,
  lost_status_id UUID,
  lost_status_name TEXT,
  updated_at TIMESTAMPTZ,
  updated_stage_at TIMESTAMPTZ,
  raw JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_clint_deals_user_id ON public.clint_deals(user_id);
CREATE INDEX idx_clint_deals_status ON public.clint_deals(status);
CREATE INDEX idx_clint_deals_created_at ON public.clint_deals(created_at);
CREATE INDEX idx_clint_deals_won_at ON public.clint_deals(won_at);
CREATE INDEX idx_clint_deals_updated_at ON public.clint_deals(updated_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clint_deals TO authenticated, anon;
GRANT ALL ON public.clint_deals TO service_role;
ALTER TABLE public.clint_deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY open_all_clint_deals ON public.clint_deals FOR ALL TO public USING (true) WITH CHECK (true);

CREATE TABLE public.clint_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  rows_synced INTEGER NOT NULL DEFAULT 0,
  since TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  error TEXT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clint_sync_log TO authenticated, anon;
GRANT ALL ON public.clint_sync_log TO service_role;
ALTER TABLE public.clint_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY open_all_clint_sync_log ON public.clint_sync_log FOR ALL TO public USING (true) WITH CHECK (true);
