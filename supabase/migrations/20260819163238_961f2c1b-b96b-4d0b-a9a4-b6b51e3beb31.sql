CREATE TABLE IF NOT EXISTS public.lead_perfil_cache (
  conversation_id uuid PRIMARY KEY,
  text_hash text NOT NULL,
  perfil text,
  evidencia text,
  profissao text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lead_perfil_cache TO authenticated;
GRANT ALL ON public.lead_perfil_cache TO service_role;
ALTER TABLE public.lead_perfil_cache ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "admins read lead_perfil_cache" ON public.lead_perfil_cache FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;