-- Cotação EUR→BRL por período (usada para converter vendas EUR não confirmadas no Hotmart)
ALTER TABLE public.bi_commission_periods
  ADD COLUMN IF NOT EXISTS cotacao_eur numeric NOT NULL DEFAULT 5.85;
