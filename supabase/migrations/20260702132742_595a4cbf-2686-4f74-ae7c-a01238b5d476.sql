CREATE TABLE public.bi_commission_periods (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome        text NOT NULL,
  data_inicio date NOT NULL UNIQUE,
  data_fim    date NOT NULL,
  roleta_pool_brl numeric DEFAULT 0,
  roleta_pool_eur numeric DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE public.bi_seller_config (
  seller_name            text PRIMARY KEY,
  hotmart_affiliate_name text,
  clint_user_name        text,
  moeda_padrao           text NOT NULL DEFAULT 'BRL',
  is_active              boolean DEFAULT true
);

CREATE TABLE public.bi_commission_rates (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  seller_name      text NOT NULL REFERENCES public.bi_seller_config(seller_name) ON DELETE CASCADE,
  produto_grupo    text NOT NULL,
  rate_pct         numeric NOT NULL DEFAULT 0,
  manager_rate_pct numeric NOT NULL DEFAULT 0,
  effective_from   date NOT NULL DEFAULT '2026-01-01',
  UNIQUE(seller_name, produto_grupo, effective_from)
);

CREATE TABLE public.bi_wise_payments (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  data_pagamento date NOT NULL,
  cliente        text NOT NULL,
  valor_eur      numeric NOT NULL,
  cotacao_eur    numeric NOT NULL DEFAULT 5.85,
  valor_brl      numeric,
  descricao      text,
  seller_name    text REFERENCES public.bi_seller_config(seller_name),
  produto_grupo  text,
  period_id      bigint REFERENCES public.bi_commission_periods(id),
  importado_em   timestamptz DEFAULT now()
);

CREATE TABLE public.bi_commission_bonuses (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  period_id   bigint NOT NULL REFERENCES public.bi_commission_periods(id) ON DELETE CASCADE,
  seller_name text NOT NULL REFERENCES public.bi_seller_config(seller_name),
  tipo        text NOT NULL DEFAULT 'manual',
  valor       numeric NOT NULL,
  moeda       text NOT NULL DEFAULT 'BRL',
  notas       text,
  created_at  timestamptz DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bi_commission_periods','bi_seller_config','bi_commission_rates',
    'bi_wise_payments','bi_commission_bonuses'
  ] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

INSERT INTO public.bi_commission_periods (nome, data_inicio, data_fim) VALUES
  ('Junho 2026', '2026-05-27', '2026-06-30'),
  ('Julho 2026', '2026-07-01', '2026-08-04')
ON CONFLICT (data_inicio) DO NOTHING;

INSERT INTO public.bi_seller_config (seller_name, hotmart_affiliate_name, clint_user_name, moeda_padrao) VALUES
  ('Gisele', 'Gisele Pimentel', 'Gisele Pimentel', 'BRL'),
  ('Luana',  'Luana Guimarães', 'Luana Guimarães',  'BRL'),
  ('Rita',   'Rita Bandeira',   'Rita Bandeira',    'EUR'),
  ('João',   'João Pessoa',     'João Pessoa',      'EUR'),
  ('Nadal',  'Fabio Nadal',     'Fabio Nadal',      'BRL')
ON CONFLICT (seller_name) DO NOTHING;

INSERT INTO public.bi_commission_rates (seller_name, produto_grupo, rate_pct, manager_rate_pct) VALUES
  ('Gisele','gtp_au',16.5,1.0),('Gisele','formacao_rs',16.5,1.0),('Gisele','accelerator',10.0,1.0),('Gisele','master_scale',10.0,1.0),('Gisele','estrategista',10.0,1.0),('Gisele','traffic_master',10.0,1.0),('Gisele','renov_mentoria',5.0,0.0),('Gisele','renov_tm',5.0,0.0),('Gisele','renov_acc',5.0,0.0),('Gisele','outros',0.0,0.0),
  ('Luana','gtp_au',10.0,7.5),('Luana','formacao_rs',10.0,7.5),('Luana','accelerator',6.0,4.0),('Luana','master_scale',10.0,7.5),('Luana','estrategista',10.0,7.5),('Luana','traffic_master',10.0,7.5),('Luana','renov_mentoria',5.0,0.0),('Luana','renov_tm',5.0,0.0),('Luana','renov_acc',5.0,0.0),('Luana','outros',0.0,0.0),
  ('Rita','gtp_au',16.5,1.0),('Rita','formacao_rs',16.5,1.0),('Rita','accelerator',10.0,1.0),('Rita','master_scale',10.0,1.0),('Rita','estrategista',16.5,1.0),('Rita','traffic_master',10.0,1.0),('Rita','renov_mentoria',5.0,0.0),('Rita','renov_tm',5.0,0.0),('Rita','renov_acc',5.0,0.0),('Rita','outros',0.0,0.0),
  ('João','gtp_au',16.5,1.0),('João','formacao_rs',16.5,1.0),('João','accelerator',10.0,1.0),('João','master_scale',10.0,1.0),('João','estrategista',16.5,1.0),('João','traffic_master',10.0,1.0),('João','renov_mentoria',5.0,0.0),('João','renov_tm',5.0,0.0),('João','renov_acc',5.0,0.0),('João','outros',0.0,0.0),
  ('Nadal','gtp_au',16.5,1.0),('Nadal','formacao_rs',16.5,1.0),('Nadal','accelerator',10.0,1.0),('Nadal','master_scale',10.0,1.0),('Nadal','estrategista',10.0,1.0),('Nadal','traffic_master',10.0,1.0),('Nadal','renov_mentoria',5.0,0.0),('Nadal','renov_tm',5.0,0.0),('Nadal','renov_acc',5.0,0.0),('Nadal','outros',0.0,0.0)
ON CONFLICT (seller_name, produto_grupo, effective_from) DO NOTHING;