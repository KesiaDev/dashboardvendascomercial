ALTER TABLE public.bi_product_config
  ADD COLUMN categoria text NOT NULL DEFAULT 'outro',
  ADD COLUMN produto_pai_id text REFERENCES public.bi_product_config(product_id);

CREATE INDEX idx_bi_product_config_parent ON public.bi_product_config(produto_pai_id);
