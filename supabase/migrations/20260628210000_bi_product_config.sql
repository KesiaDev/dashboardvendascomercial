CREATE TABLE public.bi_product_config (
  product_id text PRIMARY KEY,
  label text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bi_product_config TO anon, authenticated;
GRANT ALL ON public.bi_product_config TO service_role;

ALTER TABLE public.bi_product_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY open_all_bi_product_config ON public.bi_product_config FOR ALL USING (true) WITH CHECK (true);