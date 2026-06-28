# Arquitetura — Dashcomercial LLMídia

## Visão geral

```
┌─────────────┐   ┌─────────────┐   ┌──────────────────────┐
│  Clint API  │   │  Hotmart    │   │  Planilha de metas    │
│  (deals,    │   │  (CSV       │   │  (docs/business/      │
│  users,     │   │  export     │   │  *.xlsx — referência, │
│  origins)   │   │  semanal)   │   │  ainda não integrada) │
└──────┬──────┘   └──────┬──────┘   └───────────┬───────────┘
       │ sync diário      │ upload manual         │ consulta manual
       │ (cron n8n 6h +   │ em /import             │ (Claude/docs)
       │  botão manual)   │                        │
       ▼                  ▼                        ▼
┌─────────────────────────────────────────────────────────────┐
│                      Supabase (Postgres)                     │
│  clint_deals, clint_users, clint_origins, clint_origin_stages│
│  clint_lost_statuses, clint_sync_log, sales, weekly_imports  │
│  bi_pipeline_areas  ←── dicionário pipeline → área de negócio│
└───────────────────────────┬───────────────────────────────────┘
                            │
                            ▼
              ┌──────────────────────────┐
              │   Camada BI (src/lib/)    │
              │   bi.ts — agregação       │
              │   pipeline-areas.ts       │
              │   clint.functions.ts      │
              │   (server functions       │
              │    TanStack Start)        │
              └─────────────┬────────────┘
                            │
            ┌───────────────┼────────────────┐
            ▼               ▼                ▼
     ┌────────────┐  ┌────────────┐  ┌──────────────┐
     │ Dashboards │  │ Agente IA  │  │  Tela /areas │
     │ (React +   │  │ (Claude    │  │  (config     │
     │  TanStack  │  │  via SDK,  │  │  manual do   │
     │  Router)   │  │  Anthropic)│  │  dicionário) │
     └────────────┘  └────────────┘  └──────────────┘
```

## Princípio arquitetural

**Nenhum dashboard ou o Agente IA deve ler `clint_deals` filtrando por `origin_id`
diretamente.** Eles devem passar pela camada BI (`src/lib/bi.ts`), que resolve
`origin_id → área de negócio` via `bi_pipeline_areas` antes de agregar. Isso é o que
elimina a necessidade de qualquer usuário "escolher o pipeline certo" para ver um
número confiável.

Exceção: `/comercial` ainda permite escolher um pipeline específico para o gráfico de
funil (`Mudança de etapa`) e motivos de perda — isso é uma visão de **drill-down**
dentro de uma área, não a fonte da verdade para metas/ranking. A seção "Detalhe por
vendedor" dessa mesma página já usa a camada BI (todos os funis, sem seleção manual).

## Frontend

- **Stack**: React + TanStack Start (SSR) + TanStack Router (roteamento por arquivo,
  `src/routes/`) + TanStack Query (cache de dados) + Tailwind + shadcn/ui + Recharts.
- **Rotas principais**:
  | Rota | Conteúdo | Fonte de dados |
  |------|----------|-----------------|
  | `/` (`_app.index.tsx`) | Dashboard financeiro: faturamento, ticket médio, chargeback/reembolso, por produto e mês | `sales` (Hotmart CSV) |
  | `/comercial` | Performance por funil Clint: KPIs, funil de etapas, motivos de perda, ranking e detalhe por vendedor (consolidado, todos os funis) | `clint_deals` + `bi_pipeline_areas` |
  | `/executivo` | Dashboard executivo por área de negócio (sem seleção de pipeline) | `bi.ts` (camada BI) |
  | `/vendedor-produto` | Produto mais vendido por vendedor (cruzamento Clint × Hotmart) | `bi.ts::matchSellerProduct` |
  | `/areas` | Configuração manual do dicionário de pipelines | `bi_pipeline_areas` + `clint_origins` |
  | `/agente` | Chat com o Agente IA | `askAgent` (server function) |
  | `/import` | Upload semanal de CSV de vendas Hotmart | `sales`, `weekly_imports` |

## Camada BI (`src/lib/`)

- **`bi.ts`** — agregação desacoplada da interface: `fetchAllDeals`, `fetchPipelineAreas`,
  `buildAreaMap`, `filterDealsByArea`, `rankSellers`, `computeAreaKpis`, `periodRange`.
  Qualquer dashboard novo deve importar daqui, não reimplementar filtros.
- **`pipeline-areas.ts`** — tipos (`BusinessArea`) e a função pura
  `classifyByGroupName()` que mapeia o `group_name` da Clint para uma área.
- **`clint.functions.ts`** — server functions (`createServerFn`, rodam no servidor via
  TanStack Start): sync de usuários, origins/stages, deals, e o dicionário de áreas
  (`syncPipelineAreas`, `setPipelineArea`). Também expõe `runFullClintSync()`, usado
  pelo endpoint público de cron.
- **`agente.functions.ts`** — server function `askAgent`, restrita à área COMERCIAL,
  com comparação mês atual vs anterior antes de chamar o Claude.

## Integrações externas

### Clint
- Autenticação: header `api-token` (não é Bearer — ver `clintFetch()` em
  `clint.functions.ts`).
- Endpoints usados: `/v1/users`, `/v1/origins`, `/v1/deals`.
- Sync incremental: `syncClintDeals({ sinceDays })` filtra por `updated_at_start`,
  paginando até 50.000 linhas por execução.

### Hotmart
- Hoje: **sem webhook nesta aplicação** — entra via export CSV manual semanal.
  (O outro projeto da LLMídia, `sales-copilot-os`/leadwise-pulse, tem webhooks Hotmart
  configurados; ainda não foram replicados aqui — ver roadmap.)

### n8n (automação)
- Workflow `12 - Dashcomercial: Sync Clint Diário` (Railway, `n8n-railway-production-f85d`):
  roda `runFullClintSync()` via POST em `/api/public/sync/trigger` todo dia, 6h BRT.
- Autenticação do endpoint: header `x-sync-secret`.

### Agente IA
- `@anthropic-ai/sdk`, modelo `claude-sonnet-4-6`.
- Chave: `ANTHROPIC_API_KEY` (variável de ambiente do projeto Lovable).
- Ver regras completas em [ai-rules.md](./ai-rules.md).

## Banco de dados

Supabase (Postgres), projeto `spnmnxbglztrtgtjyvyz`. RLS habilitado em todas as
tabelas com policy `USING (true)` (acesso aberto via chave anon — aceitável neste
estágio porque não há dados de terceiros/PII sensível exposto publicamente além do
necessário para o dashboard interno). Ver detalhes em [data-model.md](./data-model.md).

## Deploy

- Lovable (gpt-engineer) — qualquer push para `main` no GitHub
  (`KesiaDev/dashboardvendascomercial`) é refletido automaticamente em
  `dashboardvendascomercial.lovable.app`.
- **Importante**: migrations em `supabase/migrations/*.sql` enviadas via `git push`
  **não são aplicadas automaticamente** no banco. Migrations só são aplicadas quando
  criadas pelo próprio Lovable (via chat in-app, que tem acesso direto ao Supabase) —
  ver memória do projeto sobre isso.
