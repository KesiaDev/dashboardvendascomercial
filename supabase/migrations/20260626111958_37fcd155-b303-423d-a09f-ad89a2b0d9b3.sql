
CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transacao text UNIQUE NOT NULL,
  produto_original text NOT NULL,
  produto_grupo text NOT NULL,
  status text NOT NULL,
  data_venda timestamptz,
  data_confirmacao timestamptz,
  moeda_original text,
  preco_oferta numeric,
  preco_total numeric,
  faturamento_liquido_brl numeric,
  valor_recebido_convertido numeric,
  moeda_recebimento text,
  meio_pagamento text,
  nome_cliente text,
  email_cliente text,
  pais text,
  estado text,
  cidade text,
  numero_parcela integer,
  tem_coproducao text,
  cupom text,
  origem_checkout text,
  raw jsonb,
  imported_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sales_data_venda ON public.sales(data_venda);
CREATE INDEX idx_sales_grupo ON public.sales(produto_grupo);
CREATE INDEX idx_sales_status ON public.sales(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO anon, authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_read_sales" ON public.sales FOR SELECT USING (true);
CREATE POLICY "open_write_sales" ON public.sales FOR INSERT WITH CHECK (true);
CREATE POLICY "open_update_sales" ON public.sales FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "open_delete_sales" ON public.sales FOR DELETE USING (true);

CREATE TABLE public.weekly_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text,
  total_rows integer NOT NULL DEFAULT 0,
  new_rows integer NOT NULL DEFAULT 0,
  updated_rows integer NOT NULL DEFAULT 0,
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_imports TO anon, authenticated;
GRANT ALL ON public.weekly_imports TO service_role;
ALTER TABLE public.weekly_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_all_imports" ON public.weekly_imports FOR ALL USING (true) WITH CHECK (true);
