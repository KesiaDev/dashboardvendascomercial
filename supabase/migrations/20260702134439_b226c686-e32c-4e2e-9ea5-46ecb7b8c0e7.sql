ALTER TABLE public.manual_sales
  ADD COLUMN IF NOT EXISTS confirmation_status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS confirmed_hotmart_sale_id text,
  ADD COLUMN IF NOT EXISTS confirmed_hotmart_valor_brl numeric,
  ADD COLUMN IF NOT EXISTS confirmed_wise_id bigint;