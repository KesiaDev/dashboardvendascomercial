-- ─────────────────────────────────────────────────────────────────────────────
-- Comissão de gestora + percentuais iguais para todo o time, a partir de
-- setembro/2026
--
-- Confirmado com a Kesia em 04/09/2026.
--
-- DUAS COISAS, e as duas dependem de o `effective_from` finalmente ser
-- respeitado pelo cálculo (feito no mesmo commit):
--
--   1. Kesia passa a ser a GESTORA no cadastro. A comissão de gestora (1% sobre
--      o faturamento de cada vendedor, 0% em renovação) não estava sendo
--      calculada: a coluna manager_rate_pct existia, o formulário gravava 0 e o
--      motor nunca lia. O total dela vinha MENOR do que o devido.
--
--   2. Kesia e Pamela passam a ter os mesmos percentuais do resto do time.
--      As linhas antigas NÃO são apagadas: julho e agosto continuam calculando
--      com o percentual da época, que é o que já foi pago.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Quem é a gestora fica no cadastro, não como nome fixo no código ───────
ALTER TABLE public.bi_seller_config
  ADD COLUMN IF NOT EXISTS is_manager boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.bi_seller_config.is_manager IS
  'Recebe a comissão de gestora sobre o faturamento da equipe (1%, 0% em renovação).';

UPDATE public.bi_seller_config
   SET is_manager = true
 WHERE lower(seller_name) LIKE '%kesia%'
    OR lower(seller_name) LIKE '%késia%';

-- Só uma pessoa pode ser a gestora — o cálculo pega a primeira que encontrar.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_bi_seller_config_manager
  ON public.bi_seller_config ((true))
  WHERE is_manager;

-- ── 2. Percentuais iguais para todos, a partir do período de setembro ────────
--
-- 02/09/2026 é o primeiro dia do período de setembro. O cálculo escolhe a linha
-- com o maior effective_from que seja <= ao início do período, então:
--
--   período de agosto  (início 01/08) → pega a linha antiga  (17,5 / 11 / 6)
--   período de setembro (início 02/09) → pega a linha nova   (16,5 / 10 / 5)
--
-- Os percentuais novos são os mesmos de Gisele, Rita, João e Nadal.
INSERT INTO public.bi_commission_rates
  (seller_name, produto_grupo, rate_pct, manager_rate_pct, effective_from)
SELECT v.seller_name, v.produto_grupo, v.rate_pct, 0, DATE '2026-09-02'
  FROM (VALUES
    -- Kesia: era 17,5 / 11 / 6
    ('Kesia Nandi',  'gtp_au',          16.5),
    ('Kesia Nandi',  'formacao_rs',     16.5),
    ('Kesia Nandi',  'estrategista',    16.5),
    ('Kesia Nandi',  'accelerator',     10.0),
    ('Kesia Nandi',  'master_scale',    10.0),
    ('Kesia Nandi',  'traffic_master',  10.0),
    ('Kesia Nandi',  'renov_mentoria',   5.0),
    ('Kesia Nandi',  'renov_acc',        5.0),
    ('Kesia Nandi',  'renov_tm',         5.0),
    -- Pamela: era 10 / 6 / 5 — sobe bastante
    ('Pamela',       'gtp_au',          16.5),
    ('Pamela',       'formacao_rs',     16.5),
    ('Pamela',       'estrategista',    16.5),
    ('Pamela',       'accelerator',     10.0),
    ('Pamela',       'master_scale',    10.0),
    ('Pamela',       'traffic_master',  10.0),
    ('Pamela',       'renov_mentoria',   5.0),
    ('Pamela',       'renov_acc',        5.0),
    ('Pamela',       'renov_tm',         5.0)
  ) AS v(seller_name, produto_grupo, rate_pct)
 WHERE EXISTS (
   SELECT 1 FROM public.bi_seller_config c WHERE c.seller_name = v.seller_name
 )
ON CONFLICT (seller_name, produto_grupo, effective_from) DO UPDATE
  SET rate_pct = EXCLUDED.rate_pct;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- CONFERÊNCIA — rode depois de aplicar:
--
-- 1) A gestora está marcada, e só ela:
--
--   select seller_name, is_manager from public.bi_seller_config
--    where is_manager order by seller_name;
--
-- 2) O histórico de percentual da Kesia e da Pamela (deve ter DUAS linhas por
--    produto: a antiga e a de 02/09):
--
--   select seller_name, produto_grupo, rate_pct, effective_from
--     from public.bi_commission_rates
--    where seller_name in ('Kesia Nandi','Pamela')
--    order by seller_name, produto_grupo, effective_from;
--
-- 3) Se o nome cadastrado for diferente de 'Kesia Nandi' ou 'Pamela', o INSERT
--    acima não inseriu nada para essa pessoa (o WHERE EXISTS protege contra
--    criar vendedor que não existe). Confira com:
--
--   select seller_name from public.bi_seller_config order by seller_name;
--
--    e, se preciso, rode o mesmo INSERT trocando o nome.
-- ─────────────────────────────────────────────────────────────────────────────
