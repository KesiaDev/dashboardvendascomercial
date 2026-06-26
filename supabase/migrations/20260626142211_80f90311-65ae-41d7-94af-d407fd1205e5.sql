
CREATE TABLE public.clint_origins (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  group_name text,
  archived boolean NOT NULL DEFAULT false,
  synced_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clint_origins TO anon, authenticated;
GRANT ALL ON public.clint_origins TO service_role;
ALTER TABLE public.clint_origins ENABLE ROW LEVEL SECURITY;
CREATE POLICY open_all_clint_origins ON public.clint_origins FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.clint_origin_stages (
  id uuid PRIMARY KEY,
  origin_id uuid NOT NULL REFERENCES public.clint_origins(id) ON DELETE CASCADE,
  label text NOT NULL,
  stage_order int NOT NULL,
  type text NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX clint_origin_stages_origin_idx ON public.clint_origin_stages(origin_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clint_origin_stages TO anon, authenticated;
GRANT ALL ON public.clint_origin_stages TO service_role;
ALTER TABLE public.clint_origin_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY open_all_clint_origin_stages ON public.clint_origin_stages FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.clint_lost_statuses (
  id uuid PRIMARY KEY,
  origin_id uuid,
  label text,
  occurrences int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX clint_lost_statuses_origin_idx ON public.clint_lost_statuses(origin_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clint_lost_statuses TO anon, authenticated;
GRANT ALL ON public.clint_lost_statuses TO service_role;
ALTER TABLE public.clint_lost_statuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY open_all_clint_lost_statuses ON public.clint_lost_statuses FOR ALL USING (true) WITH CHECK (true);
