CREATE TABLE public.bi_product_config (
  product_id text PRIMARY KEY,
  label text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.bi_product_config FROM anon, authenticated;
GRANT ALL ON public.bi_product_config TO service_role;

ALTER TABLE public.bi_product_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bi_product_config FORCE ROW LEVEL SECURITY;