CREATE TABLE public.commission_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.manual_sales(id) ON DELETE CASCADE,
  type text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  message text NOT NULL,
  seller_name text,
  client_name text,
  client_email text,
  sale_date date,
  value_eur numeric,
  hotmart_nome_afiliado text,
  hours_pending integer,
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sale_id, type)
);

CREATE INDEX idx_commission_alerts_open ON public.commission_alerts (resolved, created_at DESC);

GRANT SELECT, UPDATE ON public.commission_alerts TO authenticated;
GRANT ALL ON public.commission_alerts TO service_role;

ALTER TABLE public.commission_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem ver alertas de comissao"
ON public.commission_alerts FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins podem resolver alertas de comissao"
ON public.commission_alerts FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER commission_alerts_updated_at
BEFORE UPDATE ON public.commission_alerts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();