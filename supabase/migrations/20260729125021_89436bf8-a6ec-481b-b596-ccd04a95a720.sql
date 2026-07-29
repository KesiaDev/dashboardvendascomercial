CREATE TABLE public.bi_roleta_spins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id bigint REFERENCES public.bi_commission_periods(id) ON DELETE SET NULL,
  seller_name text NOT NULL,
  spin_date date NOT NULL,
  wheel text NOT NULL DEFAULT 'mentoria',
  source text NOT NULL DEFAULT 'manual',
  source_sale_id text,
  client_name text,
  product text,
  prize_label text,
  prize_value_eur numeric NOT NULL DEFAULT 0,
  prize_value_brl numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendente',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX bi_roleta_spins_source_sale_uidx
  ON public.bi_roleta_spins (source_sale_id) WHERE source_sale_id IS NOT NULL;
CREATE INDEX bi_roleta_spins_period_idx ON public.bi_roleta_spins (period_id);
CREATE INDEX bi_roleta_spins_date_idx ON public.bi_roleta_spins (spin_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bi_roleta_spins TO authenticated;
GRANT ALL ON public.bi_roleta_spins TO service_role;

ALTER TABLE public.bi_roleta_spins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage bi_roleta_spins" ON public.bi_roleta_spins
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_bi_roleta_spins_updated_at
  BEFORE UPDATE ON public.bi_roleta_spins
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();