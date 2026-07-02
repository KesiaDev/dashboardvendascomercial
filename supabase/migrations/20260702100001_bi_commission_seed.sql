-- ─── Períodos ────────────────────────────────────────────────────────────────
INSERT INTO public.bi_commission_periods (nome, data_inicio, data_fim, roleta_pool_brl, roleta_pool_eur)
VALUES ('Junho 2026', '2026-05-27', '2026-06-30', 0, 0)
ON CONFLICT (data_inicio) DO NOTHING;

INSERT INTO public.bi_commission_periods (nome, data_inicio, data_fim, roleta_pool_brl, roleta_pool_eur)
VALUES ('Julho 2026', '2026-07-01', '2026-08-04', 0, 0)
ON CONFLICT (data_inicio) DO NOTHING;

-- ─── Vendedores ───────────────────────────────────────────────────────────────
INSERT INTO public.bi_seller_config (seller_name, hotmart_affiliate_name, clint_user_name, moeda_padrao, is_active) VALUES
  ('Gisele', 'Gisele Pimentel', 'Gisele Pimentel', 'BRL', true),
  ('Luana',  'Luana Guimarães', 'Luana Guimarães',  'BRL', true),
  ('Rita',   'Rita Bandeira',   'Rita Bandeira',    'EUR', true),
  ('João',   'João Pessoa',     'João Pessoa',      'EUR', true),
  ('Nadal',  'Fabio Nadal',     'Fabio Nadal',      'BRL', true)
ON CONFLICT (seller_name) DO NOTHING;

-- ─── Taxas de comissão ────────────────────────────────────────────────────────

-- GISELE
INSERT INTO public.bi_commission_rates (seller_name, produto_grupo, rate_pct, manager_rate_pct) VALUES
  ('Gisele','gtp_au',         16.5, 1.0),
  ('Gisele','formacao_rs',    16.5, 1.0),
  ('Gisele','accelerator',    10.0, 1.0),
  ('Gisele','master_scale',   10.0, 1.0),
  ('Gisele','estrategista',   10.0, 1.0),
  ('Gisele','traffic_master', 10.0, 1.0),
  ('Gisele','renov_mentoria',  5.0, 0.0),
  ('Gisele','renov_tm',        5.0, 0.0),
  ('Gisele','renov_acc',       5.0, 0.0),
  ('Gisele','outros',          0.0, 0.0)
ON CONFLICT (seller_name, produto_grupo, effective_from) DO NOTHING;

-- LUANA
INSERT INTO public.bi_commission_rates (seller_name, produto_grupo, rate_pct, manager_rate_pct) VALUES
  ('Luana','gtp_au',         10.0, 7.5),
  ('Luana','formacao_rs',    10.0, 7.5),
  ('Luana','accelerator',     6.0, 4.0),
  ('Luana','master_scale',   10.0, 7.5),
  ('Luana','estrategista',   10.0, 7.5),
  ('Luana','traffic_master', 10.0, 7.5),
  ('Luana','renov_mentoria',  5.0, 0.0),
  ('Luana','renov_tm',        5.0, 0.0),
  ('Luana','renov_acc',       5.0, 0.0),
  ('Luana','outros',          0.0, 0.0)
ON CONFLICT (seller_name, produto_grupo, effective_from) DO NOTHING;

-- RITA (EUR)
INSERT INTO public.bi_commission_rates (seller_name, produto_grupo, rate_pct, manager_rate_pct) VALUES
  ('Rita','gtp_au',         16.5, 1.0),
  ('Rita','formacao_rs',    16.5, 1.0),
  ('Rita','accelerator',    10.0, 1.0),
  ('Rita','master_scale',   10.0, 1.0),
  ('Rita','estrategista',   16.5, 1.0),
  ('Rita','traffic_master', 10.0, 1.0),
  ('Rita','renov_mentoria',  5.0, 0.0),
  ('Rita','renov_tm',        5.0, 0.0),
  ('Rita','renov_acc',       5.0, 0.0),
  ('Rita','outros',          0.0, 0.0)
ON CONFLICT (seller_name, produto_grupo, effective_from) DO NOTHING;

-- JOÃO (EUR)
INSERT INTO public.bi_commission_rates (seller_name, produto_grupo, rate_pct, manager_rate_pct) VALUES
  ('João','gtp_au',         16.5, 1.0),
  ('João','formacao_rs',    16.5, 1.0),
  ('João','accelerator',    10.0, 1.0),
  ('João','master_scale',   10.0, 1.0),
  ('João','estrategista',   16.5, 1.0),
  ('João','traffic_master', 10.0, 1.0),
  ('João','renov_mentoria',  5.0, 0.0),
  ('João','renov_tm',        5.0, 0.0),
  ('João','renov_acc',       5.0, 0.0),
  ('João','outros',          0.0, 0.0)
ON CONFLICT (seller_name, produto_grupo, effective_from) DO NOTHING;

-- NADAL (mesmas taxas da Gisele, conforme instrução)
INSERT INTO public.bi_commission_rates (seller_name, produto_grupo, rate_pct, manager_rate_pct) VALUES
  ('Nadal','gtp_au',         16.5, 1.0),
  ('Nadal','formacao_rs',    16.5, 1.0),
  ('Nadal','accelerator',    10.0, 1.0),
  ('Nadal','master_scale',   10.0, 1.0),
  ('Nadal','estrategista',   10.0, 1.0),
  ('Nadal','traffic_master', 10.0, 1.0),
  ('Nadal','renov_mentoria',  5.0, 0.0),
  ('Nadal','renov_tm',        5.0, 0.0),
  ('Nadal','renov_acc',       5.0, 0.0),
  ('Nadal','outros',          0.0, 0.0)
ON CONFLICT (seller_name, produto_grupo, effective_from) DO NOTHING;
