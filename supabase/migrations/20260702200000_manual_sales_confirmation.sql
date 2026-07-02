-- Adiciona campos de confirmação cruzada em manual_sales
-- confirmation_status: 'pendente' | 'confirmado_hotmart' | 'confirmado_wise' | 'nao_encontrado'
-- confirmed_hotmart_sale_id: ID da venda em sales (Hotmart) que bateu pelo email
-- confirmed_wise_id: ID em bi_wise_payments que bateu pelo email

ALTER TABLE public.manual_sales
  ADD COLUMN IF NOT EXISTS confirmation_status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS confirmed_hotmart_sale_id text,
  ADD COLUMN IF NOT EXISTS confirmed_hotmart_valor_brl numeric,
  ADD COLUMN IF NOT EXISTS confirmed_wise_id bigint;

CREATE INDEX IF NOT EXISTS idx_manual_sales_client_email ON public.manual_sales(client_email);
CREATE INDEX IF NOT EXISTS idx_manual_sales_confirmation ON public.manual_sales(confirmation_status);
