-- ─────────────────────────────────────────────────────────────────────────────
-- Comissionamento comercial
-- Késia = gerente (recebe % adicional sobre vendas de cada vendedor)
-- Vendedores = recebem % base por produto
-- Período = 5 semanas fixas (não mês calendário)
-- ─────────────────────────────────────────────────────────────────────────────

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
  seller_name      text NOT NULL REFERENCES bi_seller_config(seller_name) ON DELETE CASCADE,
  produto_grupo    text NOT NULL,
  rate_pct         numeric NOT NULL DEFAULT 0,
  manager_rate_pct numeric NOT NULL DEFAULT 0,
  effective_from   date NOT NULL DEFAULT '2026-01-01',
  UNIQUE(seller_name, produto_grupo, effective_from)
);

CREATE INDEX idx_bi_commission_rates_seller ON public.bi_commission_rates(seller_name);

CREATE TABLE public.bi_wise_payments (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  data_pagamento date NOT NULL,
  cliente        text NOT NULL,
  valor_eur      numeric NOT NULL,
  cotacao_eur    numeric NOT NULL DEFAULT 5.85,
  valor_brl      numeric,
  descricao      text,
  seller_name    text REFERENCES bi_seller_config(seller_name),
  produto_grupo  text,
  period_id      bigint REFERENCES bi_commission_periods(id),
  importado_em   timestamptz DEFAULT now()
);

CREATE INDEX idx_bi_wise_payments_period ON public.bi_wise_payments(period_id);
CREATE INDEX idx_bi_wise_payments_seller ON public.bi_wise_payments(seller_name);

CREATE TABLE public.bi_commission_bonuses (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  period_id   bigint NOT NULL REFERENCES bi_commission_periods(id) ON DELETE CASCADE,
  seller_name text NOT NULL REFERENCES bi_seller_config(seller_name),
  tipo        text NOT NULL DEFAULT 'manual',
  valor       numeric NOT NULL,
  moeda       text NOT NULL DEFAULT 'BRL',
  notas       text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_bi_commission_bonuses_period ON public.bi_commission_bonuses(period_id);

-- RLS lockdown (mesmo padrão das demais tabelas bi_*)
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
