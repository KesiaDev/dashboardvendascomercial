-- ─────────────────────────────────────────────────────────────────────────────
-- Késia vendedora sob o cadastro CANÔNICO já existente ("Kesia Nandi"),
-- em vez de criar um segundo vendedor "Késia" (evita duplicação no resumo).
-- Roda depois de 20260901180000_pamela_kesia_sellers.sql e limpa o que ela
-- tiver criado como 'Késia'.
-- ─────────────────────────────────────────────────────────────────────────────

-- Garante o cadastro canônico ativo, vendendo em BRL (padrão da planilha ago/26)
INSERT INTO public.bi_seller_config (seller_name, hotmart_affiliate_name, clint_user_name, moeda_padrao, is_active)
VALUES ('Kesia Nandi', NULL, 'Kesia Nandi', 'BRL', true)
ON CONFLICT (seller_name) DO UPDATE SET moeda_padrao = 'BRL', is_active = true;

-- Taxas da Késia (planilha ago/26): 17,5% mentoria/formação/estrategista,
-- 11% ACC/MAS/TM, 6% renovações; sem manager_rate sobre as próprias vendas.
INSERT INTO public.bi_commission_rates (seller_name, produto_grupo, rate_pct, manager_rate_pct) VALUES
  ('Kesia Nandi','gtp_au',         17.5, 0.0),
  ('Kesia Nandi','formacao_rs',    17.5, 0.0),
  ('Kesia Nandi','accelerator',    11.0, 0.0),
  ('Kesia Nandi','master_scale',   11.0, 0.0),
  ('Kesia Nandi','estrategista',   17.5, 0.0),
  ('Kesia Nandi','traffic_master', 11.0, 0.0),
  ('Kesia Nandi','renov_mentoria',  6.0, 0.0),
  ('Kesia Nandi','renov_tm',        6.0, 0.0),
  ('Kesia Nandi','renov_acc',       6.0, 0.0),
  ('Kesia Nandi','outros',          0.0, 0.0)
ON CONFLICT (seller_name, produto_grupo, effective_from)
DO UPDATE SET rate_pct = EXCLUDED.rate_pct, manager_rate_pct = EXCLUDED.manager_rate_pct;

-- Remove o duplicado 'Késia' se a migração anterior o tiver criado,
-- reapontando antes qualquer registro que o referencie.
UPDATE public.bi_wise_payments      SET seller_name = 'Kesia Nandi' WHERE seller_name = 'Késia';
UPDATE public.bi_commission_bonuses SET seller_name = 'Kesia Nandi' WHERE seller_name = 'Késia';
DELETE FROM public.bi_commission_rates WHERE seller_name = 'Késia';
DELETE FROM public.bi_seller_config    WHERE seller_name = 'Késia';

-- Luana saiu da equipa comercial
UPDATE public.bi_seller_config SET is_active = false WHERE seller_name ILIKE 'luana%';