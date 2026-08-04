-- 1. Overrides de venda (observações, correção de SCK/vendedor, exclusão)
CREATE TABLE public.bi_sale_overrides (
  transacao text PRIMARY KEY,
  seller_name text,
  produto_grupo text,
  excluir boolean NOT NULL DEFAULT false,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bi_sale_overrides TO authenticated;
GRANT ALL ON public.bi_sale_overrides TO service_role;

ALTER TABLE public.bi_sale_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam overrides de venda"
ON public.bi_sale_overrides FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER bi_sale_overrides_updated_at
BEFORE UPDATE ON public.bi_sale_overrides
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Késia sai do comissionamento
DELETE FROM public.bi_commission_bonuses WHERE seller_name ILIKE '%esia%';
DELETE FROM public.bi_commission_rates WHERE seller_name ILIKE '%esia%';
DELETE FROM public.bi_seller_config WHERE seller_name ILIKE '%esia%';
UPDATE public.bi_commission_rates SET manager_rate_pct = 0;

-- 3. Períodos mensais fechados (julho corrigido + meses seguintes prontos)
UPDATE public.bi_commission_periods
SET nome = 'Julho 2026', data_inicio = '2026-07-01', data_fim = '2026-07-31'
WHERE id = 2;

INSERT INTO public.bi_commission_periods (nome, data_inicio, data_fim, roleta_pool_brl, roleta_pool_eur, cotacao_eur)
SELECT v.nome, v.di::date, v.df::date, 0, 0, 6.4
FROM (VALUES
  ('Agosto 2026',   '2026-08-01','2026-08-31'),
  ('Setembro 2026', '2026-09-01','2026-09-30'),
  ('Outubro 2026',  '2026-10-01','2026-10-31'),
  ('Novembro 2026', '2026-11-01','2026-11-30'),
  ('Dezembro 2026', '2026-12-01','2026-12-31')
) AS v(nome, di, df)
WHERE NOT EXISTS (
  SELECT 1 FROM public.bi_commission_periods p WHERE p.data_inicio = v.di::date
);