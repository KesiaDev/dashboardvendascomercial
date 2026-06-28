-- Business Intelligence Layer: dicionário de pipelines → área de negócio.
-- Resolve o problema de "qual pipeline escolher": cada origin da Clint é
-- classificada uma vez aqui, e os dashboards passam a agrupar por área
-- em vez de depender de seleção manual de funil.
CREATE TABLE public.bi_pipeline_areas (
  pipeline_id uuid PRIMARY KEY REFERENCES public.clint_origins(id) ON DELETE CASCADE,
  area text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  auto_classified boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bi_pipeline_areas_area ON public.bi_pipeline_areas(area);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bi_pipeline_areas TO anon, authenticated;
GRANT ALL ON public.bi_pipeline_areas TO service_role;
ALTER TABLE public.bi_pipeline_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY open_all_bi_pipeline_areas ON public.bi_pipeline_areas FOR ALL USING (true) WITH CHECK (true);