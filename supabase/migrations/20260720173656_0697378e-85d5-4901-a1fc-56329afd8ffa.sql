
CREATE TABLE public.seller_vacations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_email TEXT NOT NULL,
  seller_name TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  vacation_type TEXT NOT NULL DEFAULT 'ferias',
  status TEXT NOT NULL DEFAULT 'aprovado',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_vacations TO authenticated;
GRANT ALL ON public.seller_vacations TO service_role;

ALTER TABLE public.seller_vacations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read vacations"
  ON public.seller_vacations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins manage vacations insert"
  ON public.seller_vacations FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR (auth.jwt() ->> 'email') IN ('kesiawnandi@gmail.com', 'kesia@llmidiaco.com')
  );

CREATE POLICY "Admins manage vacations update"
  ON public.seller_vacations FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (auth.jwt() ->> 'email') IN ('kesiawnandi@gmail.com', 'kesia@llmidiaco.com')
  );

CREATE POLICY "Admins manage vacations delete"
  ON public.seller_vacations FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (auth.jwt() ->> 'email') IN ('kesiawnandi@gmail.com', 'kesia@llmidiaco.com')
  );

CREATE TRIGGER update_seller_vacations_updated_at
  BEFORE UPDATE ON public.seller_vacations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
