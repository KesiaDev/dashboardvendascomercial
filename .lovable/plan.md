# Coach Comercial com IA

Módulo novo, nativo ao Dashcomercial, para avaliar conversas de vendas com IA e devolver insights à liderança.

## ⚠️ Ponto crítico a validar antes do código

A API pública da Clint (`/v1` — usada hoje) expõe `users`, `origins`, `stages` e `deals`. **Não confirmei endpoint de mensagens/conversas de WhatsApp** — testes rápidos em `/v1/messages` e `/v1/conversations` deram 404. Antes de codar a Fase 2, preciso de uma destas duas coisas:

- **Opção A (preferida):** você me confirma se no painel Clint existe **API de mensagens** ou **Webhook de nova mensagem** (Configurações → Integrações → API/Webhooks). Se sim, uso.
- **Opção B (fallback):** se a Clint não expõe mensagens externamente, ativamos o webhook Clint→nosso endpoint por deal (evento "novo lead", "estágio mudou") + campo manual para colar/anexar a conversa quando a liderança pedir análise pontual.

Sigo com a Fase 1 (fundação + análise IA) enquanto isso — ela não depende dessa resposta.

## Fases

### Fase 1 — Fundação (esta entrega)

**Schema (via `supabase--migration`):**

```text
coach_conversations
  id uuid pk, deal_id text (fk clint_deals), seller_email text,
  seller_name text, contact_name text, contact_email text,
  origin_name text, stage text, deal_value numeric,
  source text ('clint'|'manual_upload'|'webhook'),
  first_message_at timestamptz, last_message_at timestamptz,
  message_count int, raw_transcript text, created_at, updated_at

coach_messages
  id uuid pk, conversation_id uuid fk, sent_at timestamptz,
  direction text ('inbound'|'outbound'), sender_name text, body text

coach_analyses
  id uuid pk, conversation_id uuid fk unique,
  score_geral numeric(3,1), prob_fecho int, sentimento text,
  nivel_interesse text, tempo_medio_resposta_min int,
  qualidade int, clareza int, empatia int, rapport int,
  descoberta int, conducao int, tentou_fechar boolean,
  objecoes jsonb, oportunidades_perdidas jsonb,
  sugestoes jsonb, proxima_acao text, sugestao_resposta text,
  resumo text, model text, analyzed_at timestamptz

coach_meetings         -- placeholder para Fase 3 (Meet/Fireflies)
coach_meeting_analyses -- idem

coach_alerts
  id uuid pk, deal_id text, conversation_id uuid, seller_email text,
  type text ('lead_quente_sem_resposta'|'follow_up_esquecido'|
            'intencao_compra'|'conversa_parada'|'risco_perda'|
            'nota_baixa'), severity text, message text,
  resolved boolean default false, created_at

coach_config
  id uuid pk, nota_minima int default 6,
  horas_lead_quente int default 4, dias_sem_resposta int default 3
```

Todas com RLS: `authenticated` vê tudo (uso interno da liderança), `service_role` full.

**Pipeline de análise (server functions):**

- `src/lib/coach.functions.ts`
  - `analyzeConversation({ conversationId })` — monta transcript, chama Lovable AI (`google/gemini-3.5-flash`) com JSON schema estrito das 17 métricas, grava em `coach_analyses`.
  - `runAlertsScan()` — cron leve que aplica as regras de `coach_config` e insere `coach_alerts`.
  - `uploadConversation({ dealId, transcript })` — permite colar conversa manualmente (útil enquanto Fase 2 não está pronta).

**UI (`src/routes/_app.coach.tsx` + sub-rotas):**

- Aba lateral nova "Coach IA" (mesmo padrão dos outros itens do menu).
- Home do módulo: cards KPI (nota média equipa, % conversas com tentativa de fecho, tempo médio resposta, conversas em risco), ranking vendedores por qualidade, top objeções, top motivos de perda, gráfico evolução da nota semanal.
- Filtros: período (mesmo componente do funil), vendedor, origem, faixa de nota.
- Lista de conversas com nota, sentimento, prob. fecho, última msg, status alerta.
- Detalhe (`/coach/$conversationId`): resumo IA, radar de competências, timeline mensagens, objeções, próxima ação, sugestão de resposta.
- Painel "Alertas" com filtros por tipo/severidade e ação "marcar como tratado".
- Config (só admin `kesia@llmidia.com`): nota mínima, thresholds de alerta.

### Fase 2 — Ingestão automática da Clint (depende da resposta acima)

- Se Clint expõe API de mensagens → sync horário em `src/routes/api/public/sync.clint-messages.ts` popula `coach_conversations`/`coach_messages` e dispara `analyzeConversation` para conversas novas ou com msgs novas.
- Se só tiver webhook → endpoint `src/routes/api/public/webhook.clint.ts` com verificação de assinatura, mesmo destino.
- Deduplicação por `(deal_id, sent_at, body_hash)`.

### Fase 3 — Reuniões (depois)

- Placeholder de upload de transcrição (colar texto ou .txt).
- Quando você definir Meet/Fireflies, ligo o conector.

## Regras de qualidade

- IA nunca inventa: se a conversa tem <3 mensagens, análise devolve `insufficient_data` em vez de nota chutada.
- Toda análise guarda o `model` usado + `analyzed_at` para auditoria.
- Reanálise só roda se `last_message_at > analyzed_at`.
- Todo texto de UI em PT-PT/PT-BR consistente com o resto do app.

## Não escopo (para não inflar)

- Reunião via Meet/Zoom automática (Fase 3).
- Envio automático de resposta ao cliente (só sugere, nunca envia).
- Treino personalizado do modelo — usamos prompt engineering + Lovable AI.

## Entregável desta rodada

Fase 1 completa: schema + `coach.functions.ts` + rota `/coach` com home, lista, detalhe, alertas e config. Upload manual funcionando. Deixo Fase 2 destravada assim que você me confirmar A ou B lá em cima.
