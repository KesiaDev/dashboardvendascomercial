CREATE TABLE public.bi_channels (
  id text PRIMARY KEY,
  label text NOT NULL,
  tipo text NOT NULL DEFAULT 'outro',
  clint_group_names text[] NOT NULL DEFAULT '{}',
  sck_prefixes text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.bi_channels FROM anon, authenticated;
GRANT ALL ON public.bi_channels TO service_role;

ALTER TABLE public.bi_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bi_channels FORCE ROW LEVEL SECURITY;
