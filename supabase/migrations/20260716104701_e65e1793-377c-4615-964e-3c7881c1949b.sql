
-- Agenda do Vendedor
CREATE TABLE public.seller_agenda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_email text NOT NULL,
  seller_name text,
  lead_name text NOT NULL,
  lead_phone text,
  lead_email text,
  scheduled_at timestamptz NOT NULL,
  duration_min int NOT NULL DEFAULT 60,
  meeting_type text NOT NULL DEFAULT 'consultoria',
  meeting_link text,
  source text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'agendado',
  clint_deal_id text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX seller_agenda_seller_idx ON public.seller_agenda (seller_email, scheduled_at DESC);
CREATE INDEX seller_agenda_scheduled_idx ON public.seller_agenda (scheduled_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_agenda TO authenticated;
GRANT ALL ON public.seller_agenda TO service_role;

ALTER TABLE public.seller_agenda ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam agenda"
  ON public.seller_agenda FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Vendedor vê sua agenda"
  ON public.seller_agenda FOR SELECT TO authenticated
  USING (lower(seller_email) = lower(coalesce((auth.jwt() ->> 'email'), '')));

CREATE POLICY "Vendedor atualiza sua agenda"
  ON public.seller_agenda FOR UPDATE TO authenticated
  USING (lower(seller_email) = lower(coalesce((auth.jwt() ->> 'email'), '')))
  WITH CHECK (lower(seller_email) = lower(coalesce((auth.jwt() ->> 'email'), '')));

CREATE TRIGGER seller_agenda_updated_at
  BEFORE UPDATE ON public.seller_agenda
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Prompts do agente IA por vendedor
CREATE TABLE public.seller_ai_agent_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_email text NOT NULL UNIQUE,
  seller_name text,
  agent_name text NOT NULL DEFAULT 'Agente Comercial',
  prompt text NOT NULL,
  active boolean NOT NULL DEFAULT false,
  clint_pipeline_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_ai_agent_prompts TO authenticated;
GRANT ALL ON public.seller_ai_agent_prompts TO service_role;

ALTER TABLE public.seller_ai_agent_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam prompts"
  ON public.seller_ai_agent_prompts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Vendedor vê seu prompt"
  ON public.seller_ai_agent_prompts FOR SELECT TO authenticated
  USING (lower(seller_email) = lower(coalesce((auth.jwt() ->> 'email'), '')));

CREATE TRIGGER seller_ai_agent_prompts_updated_at
  BEFORE UPDATE ON public.seller_ai_agent_prompts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
