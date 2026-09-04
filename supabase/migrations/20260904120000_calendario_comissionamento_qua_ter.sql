-- ─────────────────────────────────────────────────────────────────────────────
-- Calendário de comissionamento: semanas de quarta a terça
--
-- Regra confirmada pela Kesia em 04/09/2026:
--   • A semana de comissionamento vai SEMPRE de quarta-feira a terça-feira.
--   • O "mês" é um bloco de 4 ou 5 semanas inteiras, não o mês de calendário.
--   • As vendas de 01 a 04/08/2026 pertencem a AGOSTO (e não a julho, como
--     dizia a versão anterior do documento de regras). Por isso julho fecha em
--     31/07 e agosto começa com uma semana curta, de sábado 01/08 a terça 04/08.
--
-- Períodos resultantes:
--   Julho     2026-07-01 → 2026-07-31   (fecha antes, para liberar 01–04/08)
--   Agosto    2026-08-01 → 2026-09-01   5 semanas (01–04 curta + 4 qua→ter)
--   Setembro  2026-09-02 → 2026-09-29   4 semanas
--   Outubro   2026-09-30 → 2026-11-03   5 semanas
--   Novembro  2026-11-04 → 2026-12-01   4 semanas
--   Dezembro  2026-12-02 → 2027-01-05   5 semanas
--
-- ⚠️ A cotação (cotacao_eur) NÃO é definida aqui. A regra nova proíbe cotação
-- fixa no código, e um valor chutado na migration seria a mesma coisa. Os
-- períodos que ainda não têm cotação aparecem como "não cadastrada" na tela, e
-- é lá que a Kesia informa a do mês.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Ajusta ou cria cada período pelo NOME, preservando id, cotação e pools de
--    roleta já cadastrados. Fazer por nome (e não apagar/recriar) evita quebrar
--    as referências de bi_roleta_spins.period_id e bi_commission_bonuses.
DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN
    SELECT * FROM (VALUES
      ('Julho 2026',    DATE '2026-07-01', DATE '2026-07-31'),
      ('Agosto 2026',   DATE '2026-08-01', DATE '2026-09-01'),
      ('Setembro 2026', DATE '2026-09-02', DATE '2026-09-29'),
      ('Outubro 2026',  DATE '2026-09-30', DATE '2026-11-03'),
      ('Novembro 2026', DATE '2026-11-04', DATE '2026-12-01'),
      ('Dezembro 2026', DATE '2026-12-02', DATE '2027-01-05')
    ) AS t(nome, data_inicio, data_fim)
  LOOP
    -- Casa por nome OU por sobreposição de datas, para pegar registros que
    -- foram cadastrados com nome diferente ("Ago/26", "agosto"…).
    UPDATE public.bi_commission_periods
       SET nome = p.nome,
           data_inicio = p.data_inicio,
           data_fim = p.data_fim
     WHERE id = (
       SELECT id FROM public.bi_commission_periods
        WHERE lower(nome) = lower(p.nome)
           OR (data_inicio <= p.data_fim AND data_fim >= p.data_inicio)
        ORDER BY (lower(nome) = lower(p.nome)) DESC, data_inicio
        LIMIT 1
     );

    IF NOT FOUND THEN
      INSERT INTO public.bi_commission_periods (nome, data_inicio, data_fim)
      VALUES (p.nome, p.data_inicio, p.data_fim);
    END IF;
  END LOOP;
END $$;

-- 2. Remove períodos duplicados que sobreponham a grade acima.
--    Só apaga os que NÃO têm nada apontando para eles — um período com giros de
--    roleta ou bônus lançados é preservado e reportado, para revisão manual.
WITH grade AS (
  SELECT * FROM (VALUES
    (DATE '2026-07-01', DATE '2026-07-31'),
    (DATE '2026-08-01', DATE '2026-09-01'),
    (DATE '2026-09-02', DATE '2026-09-29'),
    (DATE '2026-09-30', DATE '2026-11-03'),
    (DATE '2026-11-04', DATE '2026-12-01'),
    (DATE '2026-12-02', DATE '2027-01-05')
  ) AS t(ini, fim)
),
oficiais AS (
  SELECT p.id
    FROM public.bi_commission_periods p
    JOIN grade g ON p.data_inicio = g.ini AND p.data_fim = g.fim
),
duplicados AS (
  SELECT p.id
    FROM public.bi_commission_periods p
    JOIN grade g ON p.data_inicio <= g.fim AND p.data_fim >= g.ini
   WHERE p.id NOT IN (SELECT id FROM oficiais)
     AND NOT EXISTS (SELECT 1 FROM public.bi_roleta_spins s WHERE s.period_id = p.id)
     AND NOT EXISTS (SELECT 1 FROM public.bi_commission_bonuses b WHERE b.period_id = p.id)
)
DELETE FROM public.bi_commission_periods
 WHERE id IN (SELECT id FROM duplicados);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- CONFERÊNCIA — rode depois de aplicar:
--
--   select id, nome, data_inicio, data_fim, cotacao_eur,
--          (data_fim - data_inicio + 1) as dias,
--          to_char(data_inicio, 'Dy') as comeca,
--          to_char(data_fim,    'Dy') as termina
--     from public.bi_commission_periods
--    order by data_inicio;
--
-- Esperado para 2026: todo período termina numa terça (Tue); Agosto começa num
-- sábado (é a exceção combinada) e Julho termina numa sexta (idem).
--
-- Sobreposições remanescentes (deve vir vazio):
--
--   select a.id, a.nome, b.id, b.nome
--     from public.bi_commission_periods a
--     join public.bi_commission_periods b
--       on a.id < b.id
--      and a.data_inicio <= b.data_fim
--      and a.data_fim    >= b.data_inicio;
--
-- Períodos sem cotação (precisam ser preenchidos na tela):
--
--   select id, nome from public.bi_commission_periods
--    where cotacao_eur is null or cotacao_eur <= 0
--    order by data_inicio;
-- ─────────────────────────────────────────────────────────────────────────────
