ALTER TABLE public.bi_commission_periods
  ADD COLUMN IF NOT EXISTS cotacao_eur numeric NOT NULL DEFAULT 5.85;