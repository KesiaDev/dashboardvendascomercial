-- ─────────────────────────────────────────────────────────────────────────────
-- Índices para as colunas mais filtradas do projeto + contenção de bloat.
--
-- Auditoria de 2026-09-03: seis colunas usadas em .eq()/.in()/.gte()/.order() não
-- tinham índice nenhum, incluindo clint_deals.origin_id — a coluna mais filtrada do
-- projeto inteiro. Cada consulta virava sequential scan.
--
-- CONCURRENTLY para não travar escrita durante a criação. Isso exige que cada
-- comando rode FORA de bloco de transação; se o runner de migration usar
-- transação, rode este arquivo manualmente no SQL Editor do Supabase.
-- ─────────────────────────────────────────────────────────────────────────────

-- clint_deals: origin_id é filtrado em data.functions.ts (4x), agente.functions.ts
-- e sync.coach-v3.ts. O índice composto cobre o padrão real (origem + janela de data).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clint_deals_origin_id
  ON public.clint_deals (origin_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clint_deals_origin_created
  ON public.clint_deals (origin_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clint_deals_stage
  ON public.clint_deals (stage);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clint_deals_updated_stage_at
  ON public.clint_deals (updated_stage_at DESC)
  WHERE updated_stage_at IS NOT NULL;

-- coach_*: colunas do N+1 aninhado em performance.functions.ts:388-411, que hoje
-- faz até 40 iterações externas x N internas, cada uma em sequential scan.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_coach_conv_contact
  ON public.coach_conversations (clint_contact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_coach_msg_outbound
  ON public.coach_messages (conversation_id)
  WHERE direction = 'outbound';

-- idx_coach_conv_ai é parcial em `WHERE is_ai_conversation = true`, mas a query de
-- coach.functions.ts:631 filtra `= false` — o índice existente é inútil para ela.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_coach_conv_humanas
  ON public.coach_conversations (last_message_at DESC)
  WHERE is_ai_conversation = false;

-- Idempotência do sync de mensagens: sem esta constraint, o tratamento de erro
-- 23505 em sync.coach-v3.ts e clint/webhook.ts é código morto e as duplicatas
-- entram em silêncio, inflando coach_messages.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uniq_coach_msg_clint_id
  ON public.coach_messages (clint_message_id)
  WHERE clint_message_id IS NOT NULL;

-- sales / manual_sales: compostos que casam com o padrão real das queries.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_data_status
  ON public.sales (data_venda DESC, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_manual_sales_date_parcela
  ON public.manual_sales (sale_date DESC)
  WHERE installment_number = 1;

-- ─────────────────────────────────────────────────────────────────────────────
-- Bloat: o cron de sync reescrevia 90 dias de clint_deals a cada 30 min (48x/dia).
-- Cada UPDATE cria uma tupla morta e cada linha carrega `raw` JSONB (TOAST). Sem
-- tuning, o autovacuum padrão (scale_factor 0.2) só age quando 20% da tabela já
-- está morta — e é exatamente a tabela que as rotas de BI varrem inteira.
-- (A janela do cron também caiu de 90 para 2 dias; ver a migration seguinte.)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.clint_deals SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_analyze_scale_factor = 0.01,
  fillfactor = 85
);
ALTER TABLE public.coach_messages SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

VACUUM (ANALYZE) public.clint_deals;
