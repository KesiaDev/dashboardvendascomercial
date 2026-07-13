ALTER TABLE public.coach_conversations ADD COLUMN IF NOT EXISTS clint_conversation_id text;
ALTER TABLE public.coach_conversations ADD COLUMN IF NOT EXISTS clint_contact_id text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_conv_clint_id ON public.coach_conversations(clint_conversation_id) WHERE clint_conversation_id IS NOT NULL;
ALTER TABLE public.coach_messages ADD COLUMN IF NOT EXISTS clint_message_id text;
CREATE TABLE IF NOT EXISTS public.coach_integration_logs (
  id bigserial PRIMARY KEY,
  event_type text,
  payload jsonb,
  status text DEFAULT 'received',
  error_msg text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coach_logs_created ON public.coach_integration_logs(created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.coach_integration_logs TO authenticated;
GRANT ALL ON public.coach_integration_logs TO service_role;
ALTER TABLE public.coach_integration_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_logs_auth_all" ON public.coach_integration_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);