
-- ============ COACH CONVERSATIONS ============
CREATE TABLE public.coach_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id text,
  seller_email text,
  seller_name text,
  contact_name text,
  contact_email text,
  origin_name text,
  stage text,
  deal_value numeric,
  source text NOT NULL DEFAULT 'manual_upload' CHECK (source IN ('clint','manual_upload','webhook')),
  first_message_at timestamptz,
  last_message_at timestamptz,
  message_count int NOT NULL DEFAULT 0,
  raw_transcript text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_coach_conv_deal ON public.coach_conversations(deal_id);
CREATE INDEX idx_coach_conv_seller ON public.coach_conversations(seller_email);
CREATE INDEX idx_coach_conv_last_msg ON public.coach_conversations(last_message_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_conversations TO authenticated;
GRANT ALL ON public.coach_conversations TO service_role;
ALTER TABLE public.coach_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_conv_auth_all" ON public.coach_conversations FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_coach_conv_updated BEFORE UPDATE ON public.coach_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ COACH MESSAGES ============
CREATE TABLE public.coach_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.coach_conversations(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  sender_name text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_coach_msg_conv ON public.coach_messages(conversation_id, sent_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_messages TO authenticated;
GRANT ALL ON public.coach_messages TO service_role;
ALTER TABLE public.coach_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_msg_auth_all" ON public.coach_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ COACH ANALYSES ============
CREATE TABLE public.coach_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL UNIQUE REFERENCES public.coach_conversations(id) ON DELETE CASCADE,
  score_geral numeric(3,1),
  prob_fecho int,
  sentimento text,
  nivel_interesse text,
  tempo_medio_resposta_min int,
  qualidade int,
  clareza int,
  empatia int,
  rapport int,
  descoberta int,
  conducao int,
  tentou_fechar boolean,
  respondeu_todas_duvidas boolean,
  objecoes jsonb DEFAULT '[]'::jsonb,
  oportunidades_perdidas jsonb DEFAULT '[]'::jsonb,
  sugestoes jsonb DEFAULT '[]'::jsonb,
  proxima_acao text,
  sugestao_resposta text,
  resumo text,
  status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','insufficient_data','error')),
  model text,
  analyzed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_coach_analyses_score ON public.coach_analyses(score_geral DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_analyses TO authenticated;
GRANT ALL ON public.coach_analyses TO service_role;
ALTER TABLE public.coach_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_analyses_auth_all" ON public.coach_analyses FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ COACH MEETINGS (Fase 3 placeholder) ============
CREATE TABLE public.coach_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id text,
  seller_email text,
  seller_name text,
  contact_name text,
  meeting_date timestamptz,
  duration_min int,
  source text DEFAULT 'manual_upload',
  transcript text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_meetings TO authenticated;
GRANT ALL ON public.coach_meetings TO service_role;
ALTER TABLE public.coach_meetings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_meet_auth_all" ON public.coach_meetings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_coach_meet_updated BEFORE UPDATE ON public.coach_meetings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.coach_meeting_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL UNIQUE REFERENCES public.coach_meetings(id) ON DELETE CASCADE,
  score_geral numeric(3,1),
  prob_conversao int,
  preparacao int,
  rapport int,
  descoberta int,
  perguntas int,
  escuta int,
  apresentacao int,
  objecoes int,
  argumentacao int,
  clareza int,
  seguranca int,
  tentou_fechar boolean,
  definiu_proximos_passos boolean,
  pontos_fortes jsonb DEFAULT '[]'::jsonb,
  pontos_melhoria jsonb DEFAULT '[]'::jsonb,
  feedback text,
  recomendacoes text,
  model text,
  analyzed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_meeting_analyses TO authenticated;
GRANT ALL ON public.coach_meeting_analyses TO service_role;
ALTER TABLE public.coach_meeting_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_meet_ana_auth_all" ON public.coach_meeting_analyses FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ COACH ALERTS ============
CREATE TABLE public.coach_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id text,
  conversation_id uuid REFERENCES public.coach_conversations(id) ON DELETE CASCADE,
  seller_email text,
  seller_name text,
  type text NOT NULL CHECK (type IN (
    'lead_quente_sem_resposta','follow_up_esquecido','intencao_compra',
    'conversa_parada','risco_perda','nota_baixa'
  )),
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high')),
  message text NOT NULL,
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_coach_alerts_open ON public.coach_alerts(resolved, created_at DESC);
CREATE INDEX idx_coach_alerts_seller ON public.coach_alerts(seller_email);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_alerts TO authenticated;
GRANT ALL ON public.coach_alerts TO service_role;
ALTER TABLE public.coach_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_alerts_auth_all" ON public.coach_alerts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ COACH CONFIG ============
CREATE TABLE public.coach_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  nota_minima int NOT NULL DEFAULT 6,
  horas_lead_quente int NOT NULL DEFAULT 4,
  dias_sem_resposta int NOT NULL DEFAULT 3,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.coach_config (id) VALUES (1) ON CONFLICT DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_config TO authenticated;
GRANT ALL ON public.coach_config TO service_role;
ALTER TABLE public.coach_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_config_auth_all" ON public.coach_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
