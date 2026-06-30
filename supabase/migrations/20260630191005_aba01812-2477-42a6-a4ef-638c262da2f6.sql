
CREATE TABLE public.manual_sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by_email TEXT NOT NULL,
  seller_name TEXT NOT NULL,
  product TEXT NOT NULL,
  funnel TEXT NOT NULL,
  value_eur NUMERIC(12,2) NOT NULL CHECK (value_eur >= 0),
  client_name TEXT,
  client_email TEXT,
  sale_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX manual_sales_sale_date_idx ON public.manual_sales (sale_date);
CREATE INDEX manual_sales_seller_idx ON public.manual_sales (seller_name);

GRANT SELECT, INSERT ON public.manual_sales TO authenticated;
GRANT ALL ON public.manual_sales TO service_role;

ALTER TABLE public.manual_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read all manual sales"
  ON public.manual_sales FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert their own sales"
  ON public.manual_sales FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by AND sale_date <= CURRENT_DATE);
