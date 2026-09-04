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
--
-- ── SOBRE OS NOMES ──────────────────────────────────────────────────────────
--
-- Nada aqui depende do nome estar grafado de um jeito específico. O casamento é
-- por PADRÃO, sobre o nome com acentos removidos e em minúsculas — então pega
-- "Kesia Nandi", "Késia", "Késia W. Nandi", "PAMELA", "Pâmela Silva" etc.
--
-- E se mesmo assim não encontrar as duas pessoas, a migration FALHA com uma
-- mensagem dizendo quais nomes existem no cadastro. Uma migration de dinheiro
-- que não acha ninguém e termina "com sucesso" é o pior desfecho possível.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Remove acentos sem depender da extensão `unaccent`, que pode não estar
-- habilitada no projeto.
CREATE OR REPLACE FUNCTION pg_temp.sem_acento(txt text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(translate(
    coalesce(txt, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
  ));
$$;

-- ── 1. Quem é a gestora fica no cadastro, não como nome fixo no código ───────
ALTER TABLE public.bi_seller_config
  ADD COLUMN IF NOT EXISTS is_manager boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.bi_seller_config.is_manager IS
  'Recebe a comissão de gestora sobre o faturamento da equipe (1%, 0% em renovação).';

-- Zera antes de marcar, para a migration ser idempotente e não deixar duas
-- gestoras se o nome mudar no futuro.
UPDATE public.bi_seller_config SET is_manager = false WHERE is_manager;

-- Marca UMA pessoa. Se houver duas linhas casando (cadastro duplicado), a
-- primeira em ordem alfabética leva o papel, em vez de a migration falhar no
-- índice único. A conferência no rodapé mostra se há duplicata.
UPDATE public.bi_seller_config
   SET is_manager = true
 WHERE seller_name = (
   SELECT seller_name FROM public.bi_seller_config
    WHERE pg_temp.sem_acento(seller_name) LIKE '%kesia%'
       OR pg_temp.sem_acento(seller_name) LIKE '%nandi%'
    ORDER BY seller_name
    LIMIT 1
 );

-- Só uma pessoa ocupa o papel — o cálculo pega a primeira que encontrar.
-- Índice parcial sobre a própria coluna: entre as linhas com is_manager = true,
-- o valor tem de ser único, logo só pode existir uma.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_bi_seller_config_manager
  ON public.bi_seller_config (is_manager)
  WHERE is_manager;

-- ── 2. Percentuais iguais para todos, a partir do período de setembro ────────
--
-- 02/09/2026 é o primeiro dia do período de setembro. O cálculo escolhe a linha
-- com o maior effective_from que seja <= ao início do período, então:
--
--   período de agosto   (início 01/08) → linha antiga  (Kesia 17,5/11/6 · Pamela 10/6/5)
--   período de setembro (início 02/09) → linha nova    (16,5/10/5, igual ao time)
--
-- O nome gravado é o que estiver no cadastro, seja qual for a grafia — a FK
-- para bi_seller_config exige que ele exista.
INSERT INTO public.bi_commission_rates
  (seller_name, produto_grupo, rate_pct, manager_rate_pct, effective_from)
SELECT c.seller_name, g.produto_grupo, g.rate_pct, 0, DATE '2026-09-02'
  FROM public.bi_seller_config c
 CROSS JOIN (VALUES
    ('gtp_au',          16.5),
    ('formacao_rs',     16.5),
    ('estrategista',    16.5),
    ('accelerator',     10.0),
    ('master_scale',    10.0),
    ('traffic_master',  10.0),
    ('renov_mentoria',   5.0),
    ('renov_acc',        5.0),
    ('renov_tm',         5.0)
 ) AS g(produto_grupo, rate_pct)
 WHERE pg_temp.sem_acento(c.seller_name) LIKE '%kesia%'
    OR pg_temp.sem_acento(c.seller_name) LIKE '%nandi%'
    OR pg_temp.sem_acento(c.seller_name) LIKE '%pamela%'
ON CONFLICT (seller_name, produto_grupo, effective_from) DO UPDATE
  SET rate_pct = EXCLUDED.rate_pct;

-- ── 3. Falha alta se não encontrou as duas pessoas ───────────────────────────
DO $$
DECLARE
  achou_gestora int;
  achou_pamela  int;
  cadastrados   text;
BEGIN
  SELECT count(*) INTO achou_gestora
    FROM public.bi_seller_config
   WHERE pg_temp.sem_acento(seller_name) LIKE '%kesia%'
      OR pg_temp.sem_acento(seller_name) LIKE '%nandi%';

  SELECT count(*) INTO achou_pamela
    FROM public.bi_seller_config
   WHERE pg_temp.sem_acento(seller_name) LIKE '%pamela%';

  IF achou_gestora = 0 OR achou_pamela = 0 THEN
    SELECT string_agg(seller_name, ', ' ORDER BY seller_name)
      INTO cadastrados FROM public.bi_seller_config;
    RAISE EXCEPTION
      'Migration abortada: não encontrei % no cadastro de vendedores. Nomes existentes: [%]. Ajuste os padrões desta migration para os nomes reais e rode de novo.',
      CASE
        WHEN achou_gestora = 0 AND achou_pamela = 0 THEN 'a gestora nem a Pamela'
        WHEN achou_gestora = 0 THEN 'a gestora (Kesia)'
        ELSE 'a Pamela'
      END,
      coalesce(cadastrados, 'cadastro vazio');
  END IF;
END $$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- CONFERÊNCIA — rode depois de aplicar:
--
-- 1) A gestora está marcada, e só ela:
--
--   select seller_name, is_manager from public.bi_seller_config
--    where is_manager order by seller_name;
--
-- 2) Histórico de percentual das duas — deve haver DUAS linhas por produto,
--    a antiga e a de 02/09/2026:
--
--   select seller_name, produto_grupo, rate_pct, effective_from
--     from public.bi_commission_rates
--    where lower(seller_name) like '%kesia%'
--       or lower(seller_name) like '%nandi%'
--       or lower(seller_name) like '%pamela%'
--    order by seller_name, produto_grupo, effective_from;
--
-- 3) O time inteiro, para conferir que setembro ficou uniforme:
--
--   select produto_grupo, seller_name, rate_pct
--     from public.bi_commission_rates
--    where effective_from <= date '2026-09-02'
--    order by produto_grupo, seller_name, effective_from desc;
-- ─────────────────────────────────────────────────────────────────────────────
