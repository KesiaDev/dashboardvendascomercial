ALTER TABLE public.bi_product_config
  ADD COLUMN categoria text NOT NULL DEFAULT 'outro',
  ADD COLUMN produto_pai_id text REFERENCES public.bi_product_config(product_id);

CREATE INDEX idx_bi_product_config_parent ON public.bi_product_config(produto_pai_id);

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

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_bi_channels_updated_at
  BEFORE UPDATE ON public.bi_channels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();