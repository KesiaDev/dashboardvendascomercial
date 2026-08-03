-- Flag para identificar conversas atendidas pela IA (SDR COMERCIAL IA)
-- Identificação exata via source="AI_CONVERSATION" do Clint (não regex)
ALTER TABLE coach_conversations
  ADD COLUMN IF NOT EXISTS is_ai_conversation BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_coach_conv_ai
  ON coach_conversations (is_ai_conversation)
  WHERE is_ai_conversation = true;

-- Fonte original da mensagem no Clint: AI_CONVERSATION | CHAT | AUTOMATION
ALTER TABLE coach_messages
  ADD COLUMN IF NOT EXISTS clint_source VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_coach_msg_source
  ON coach_messages (clint_source)
  WHERE clint_source IS NOT NULL;
