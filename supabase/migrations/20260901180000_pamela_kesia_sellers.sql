-- ─────────────────────────────────────────────────────────────────────────────
-- Agosto/26: equipa comercial atualizada
--   • Pamela entra como vendedora (mesma tabela de taxas da Luana / nível N1)
--   • Késia passa a vender também (além do papel de gerente) — taxas próprias,
--     +1 p.p. sobre a tabela padrão (17,5% mentoria/formação, 11% ACC/MAS/TM,
--     6% renovações), sem manager_rate sobre as próprias vendas
-- Percentuais extraídos da "Planilha Comissão" (Planilhas Master, agosto/26).
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.bi_seller_config (seller_name, hotmart_affiliate_name, clint_user_name, moeda_padrao, is_active) VALUES
  ('Pamela', NULL, 'Pamela', 'BRL', true),
  ('Késia',  NULL, 'Kesia Nandi', 'BRL', true)
ON CONFLICT (seller_name) DO UPDATE SET is_active = true;

-- PAMELA (tabela N1, igual à Luana)
INSERT INTO public.bi_commission_rates (seller_name, produto_grupo, rate_pct, manager_rate_pct) VALUES
  ('Pamela','gtp_au',         10.0, 7.5),
  ('Pamela','formacao_rs',    10.0, 7.5),
  ('Pamela','accelerator',     6.0, 4.0),
  ('Pamela','master_scale',   10.0, 7.5),
  ('Pamela','estrategista',   10.0, 7.5),
  ('Pamela','traffic_master', 10.0, 7.5),
  ('Pamela','renov_mentoria',  5.0, 0.0),
  ('Pamela','renov_tm',        5.0, 0.0),
  ('Pamela','renov_acc',       5.0, 0.0),
  ('Pamela','outros',          0.0, 0.0)
ON CONFLICT (seller_name, produto_grupo, effective_from) DO NOTHING;

-- KÉSIA (vendedora; ela é a gerente, então manager_rate = 0 nas próprias vendas)
INSERT INTO public.bi_commission_rates (seller_name, produto_grupo, rate_pct, manager_rate_pct) VALUES
  ('Késia','gtp_au',         17.5, 0.0),
  ('Késia','formacao_rs',    17.5, 0.0),
  ('Késia','accelerator',    11.0, 0.0),
  ('Késia','master_scale',   11.0, 0.0),
  ('Késia','estrategista',   17.5, 0.0),
  ('Késia','traffic_master', 11.0, 0.0),
  ('Késia','renov_mentoria',  6.0, 0.0),
  ('Késia','renov_tm',        6.0, 0.0),
  ('Késia','renov_acc',       6.0, 0.0),
  ('Késia','outros',          0.0, 0.0)
ON CONFLICT (seller_name, produto_grupo, effective_from) DO NOTHING;
