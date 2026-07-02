-- ── Weekly manual results per product ──────────────────────────────────────
CREATE TABLE public.bi_weekly_results (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id text NOT NULL,
  week_start date NOT NULL,
  indicador text NOT NULL,
  valor_brl numeric NOT NULL DEFAULT 0,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, week_start, indicador)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bi_weekly_results TO authenticated;
GRANT ALL ON public.bi_weekly_results TO service_role;
ALTER TABLE public.bi_weekly_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bi_weekly_results FORCE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read weekly_results"
  ON public.bi_weekly_results FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write weekly_results"
  ON public.bi_weekly_results FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_bi_weekly_results_week ON public.bi_weekly_results(week_start);
CREATE INDEX idx_bi_weekly_results_product ON public.bi_weekly_results(product_id);


-- ── Monthly overrides per bloco (Front End / High Ticket) ──────────────────
CREATE TABLE public.bi_monthly_overrides (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bloco text NOT NULL,
  periodo date NOT NULL,
  indicador text NOT NULL,
  valor_brl numeric NOT NULL DEFAULT 0,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bloco, periodo, indicador)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bi_monthly_overrides TO authenticated;
GRANT ALL ON public.bi_monthly_overrides TO service_role;
ALTER TABLE public.bi_monthly_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bi_monthly_overrides FORCE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read monthly_overrides"
  ON public.bi_monthly_overrides FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write monthly_overrides"
  ON public.bi_monthly_overrides FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_bi_monthly_overrides_periodo ON public.bi_monthly_overrides(periodo);


-- ── Distribuição % lives in bi_targets with indicador='distribuicao_pct'
-- and channel_id = 'front_end' | 'high_ticket'. No schema change needed.
-- Add explicit unique to allow upsert:
CREATE UNIQUE INDEX IF NOT EXISTS uniq_bi_targets_key
  ON public.bi_targets (granularidade, periodo, COALESCE(channel_id,''), COALESCE(product_id,''), indicador);