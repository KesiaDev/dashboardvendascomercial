
CREATE TABLE public.referrals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_name TEXT NOT NULL,
  seller_email TEXT,
  client_name TEXT NOT NULL,
  client_email TEXT,
  referred_name TEXT NOT NULL,
  referred_phone TEXT,
  referred_email TEXT,
  product_interest TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'novo',
  source_sale_id UUID REFERENCES public.manual_sales(id) ON DELETE SET NULL,
  contacted_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  converted_value_eur NUMERIC,
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view all referrals"
  ON public.referrals FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert referrals"
  ON public.referrals FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update referrals"
  ON public.referrals FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Admin can delete referrals"
  ON public.referrals FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_referrals_updated_at
  BEFORE UPDATE ON public.referrals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_referrals_seller ON public.referrals(seller_name);
CREATE INDEX idx_referrals_status ON public.referrals(status);
CREATE INDEX idx_referrals_created ON public.referrals(created_at DESC);
