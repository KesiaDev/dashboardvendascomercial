CREATE TABLE IF NOT EXISTS public.lead_objecao_cache (
  conversation_id uuid PRIMARY KEY,
  text_hash text NOT NULL,
  objecoes jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.lead_objecao_cache TO service_role;
ALTER TABLE public.lead_objecao_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "objecao_cache_admin_read" ON public.lead_objecao_cache FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));