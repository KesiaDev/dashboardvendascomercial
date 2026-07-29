CREATE TABLE public.arena_cases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'individual',
  theme TEXT NOT NULL,
  title TEXT NOT NULL,
  context TEXT NOT NULL,
  persona_hint TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'Ouro',
  product TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  completed_simulation_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.arena_cases TO authenticated;
GRANT ALL ON public.arena_cases TO service_role;
ALTER TABLE public.arena_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own cases" ON public.arena_cases FOR ALL TO authenticated
  USING (auth.uid() = seller_user_id OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (auth.uid() = seller_user_id OR public.has_role(auth.uid(),'admin'));
CREATE INDEX arena_cases_seller_idx ON public.arena_cases(seller_user_id, status, created_at DESC);

ALTER TABLE public.arena_simulations ADD COLUMN case_id UUID REFERENCES public.arena_cases(id) ON DELETE SET NULL;