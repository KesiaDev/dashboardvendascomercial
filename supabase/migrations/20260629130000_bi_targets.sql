CREATE TABLE public.bi_targets (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  granularidade text NOT NULL DEFAULT 'mensal',
  periodo date NOT NULL,
  channel_id text REFERENCES public.bi_channels(id),
  product_id text REFERENCES public.bi_product_config(product_id),
  indicador text NOT NULL,
  valor numeric NOT NULL,
  fonte text NOT NULL DEFAULT 'planilha_2026',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bi_targets_periodo ON public.bi_targets(periodo);
CREATE INDEX idx_bi_targets_channel ON public.bi_targets(channel_id);
CREATE INDEX idx_bi_targets_product ON public.bi_targets(product_id);
CREATE INDEX idx_bi_targets_indicador ON public.bi_targets(indicador);

REVOKE ALL ON public.bi_targets FROM anon, authenticated;
GRANT ALL ON public.bi_targets TO service_role;

ALTER TABLE public.bi_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bi_targets FORCE ROW LEVEL SECURITY;
