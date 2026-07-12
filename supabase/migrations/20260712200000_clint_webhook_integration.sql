-- ============ Clint Webhook Integration ============
-- Adiciona suporte a conversas e mensagens recebidas via webhook da Clint CRM

-- Adiciona clint_conversation_id e clint_contact_id em coach_conversations
ALTER TABLE public.coach_conversations
  ADD COLUMN IF NOT EXISTS clint_conversation_id text,
  ADD COLUMN IF NOT EXISTS clint_contact_id text;

-- Índice único para evitar conversas duplicadas do Clint
CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_conv_clint_id
  ON public.coach_conversations(clint_conversation_id)
  WHERE clint_conversation_id IS NOT NULL;

-- Adiciona clint_message_id em coach_messages
ALTER TABLE public.coach_messages
  ADD COLUMN IF NOT EXISTS clint_message_id text;

-- Tabela de log de eventos do webhook
CREATE TABLE IF NOT EXISTS public.coach_integration_logs (
  id bigserial PRIMARY KEY,
  event_type text,
  payload jsonb,
  status text DEFAULT 'received',
  error_msg text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_logs_created
  ON public.coach_integration_logs(created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.coach_integration_logs TO authenticated;
GRANT ALL ON public.coach_integration_logs TO service_role;

ALTER TABLE public.coach_integration_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_logs_auth_all"
  ON public.coach_integration_logs FOR ALL
  TO authenticated USING (true) WITH CHECK (true);
