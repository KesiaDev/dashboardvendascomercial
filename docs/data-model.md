# Data Model — Dashcomercial LLMídia

Banco: Supabase (Postgres), projeto `spnmnxbglztrtgtjyvyz`. Todas as tabelas têm RLS
habilitado com policy aberta (`USING (true)`) — aceitável neste estágio interno, sem
dados sensíveis de terceiros expostos além do necessário ao dashboard.

## Diagrama de relacionamento (textual)

```
clint_origins (pipelines/funis)
  │  id (PK)
  ├──< clint_origin_stages.origin_id      (1 origin tem N etapas)
  ├──< clint_lost_statuses.origin_id       (motivos de perda por origin)
  ├──< clint_deals.origin_id               (1 origin tem N deals)
  └──1 bi_pipeline_areas.pipeline_id       (1 origin → 1 área de negócio)

clint_users (vendedores)
  │  id (PK)
  └──< clint_deals.user_id                (1 user tem N deals)

clint_deals (negócios — tabela central da camada Clint)
  │  id (PK)
  ├── user_id      → clint_users.id        (nullable — pode não ter responsável)
  ├── origin_id     → clint_origins.id      (nullable)
  ├── stage_id      → clint_origin_stages.id
  └── lost_status_id → clint_lost_statuses.id

clint_sync_log
  (sem FK — log avulso de cada execução de sync)

bi_pipeline_areas (dicionário — camada BI)
  │  pipeline_id (PK, FK → clint_origins.id)
  └── area (texto livre: COMERCIAL | IMPLANTACAO | POS_VENDA | FINANCEIRO | MKT | TESTES | OUTROS)

sales (vendas Hotmart — fonte financeira, independente da Clint)
  │  transacao (UNIQUE — chave de idempotência do import)
  (sem FK para clint_* — ainda não há vínculo Clint ↔ Hotmart por negócio)

weekly_imports
  (log avulso de cada upload de CSV em /import)
```

**Cruzamento Clint × Hotmart (implementado em `bi.ts::matchSellerProduct`)**: não
existe FK formal entre `clint_deals.id` e `sales.transacao`, mas o vínculo é feito em
tempo de consulta por `contact_email` (Clint) = `email_cliente` (Hotmart), escolhendo
— quando o mesmo e-mail tem mais de um negócio ganho — o que tiver `won_at` mais
próximo de `data_venda`. Cobertura típica: a função expõe `matched`/`unmatched` para
acompanhar a taxa de identificação (vendas Hotmart sem e-mail correspondente na Clint
ficam em `unmatched`, contabilizadas mas sem vendedor atribuído). Ver `/vendedor-produto`.

Achado relevante: a Clint guarda em `clint_deals.raw->fields->sck` um código que já
identifica o vendedor em boa parte dos negócios ganhos (ex.: `mse.gisele`,
`igt20.joao`) — o mesmo tipo de parâmetro de rastreio que a Hotmart usa internamente.
Não é usado como chave principal (e-mail é mais confiável/universal), mas é uma fonte
alternativa de validação se a taxa de match por e-mail cair.

## Tabelas

### `clint_deals` — negócios (tabela central)
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | id do deal na Clint |
| user_id, user_email, user_name | uuid, text, text | vendedor responsável (denormalizado para evitar join) |
| contact_id, contact_name, contact_email, contact_phone, contact_ddi | — | lead/contato |
| origin_id, origin_name | uuid, text | pipeline (denormalizado) |
| stage, stage_id | text, uuid | etapa atual |
| status | text NOT NULL | `OPEN` \| `WON` \| `LOST` |
| value, currency | numeric, text | valor do negócio — **só é venda real se `status=WON` e `value>0`** |
| created_at | timestamptz | quando o lead entrou |
| won_at | timestamptz | quando fechou — **fonte de verdade para "vendeu em [mês]"**, não `created_at` |
| lost_at, lost_status_id | timestamptz, uuid | quando/por que perdeu |
| updated_at, updated_stage_at | timestamptz | última atividade / última troca de etapa |
| raw | jsonb | payload bruto da Clint, para campos não modelados |
| synced_at | timestamptz | quando esta linha foi sincronizada |

Índices: `user_id`, `status`, `created_at`, `won_at`, `updated_at`.

> **Regra de agregação crítica** (ver `bi.ts::rankSellers`): "leads recebidos" conta por
> `created_at` no período; "ganhos"/faturamento conta por `won_at` no período E
> `value > 0`. Um deal criado em maio e vendido em junho conta como ganho de junho,
> não de maio.

### `clint_users`
| Coluna | Tipo |
|--------|------|
| id | uuid PK |
| email, first_name, last_name | text |
| active | boolean |
| synced_at | timestamptz |

### `clint_origins` — pipelines/funis
| Coluna | Tipo |
|--------|------|
| id | uuid PK |
| name | text |
| group_name | text — grupo que a própria Clint atribui (base da classificação de área) |
| archived | boolean |
| synced_at | timestamptz |

### `clint_origin_stages` — etapas de cada funil
| Coluna | Tipo |
|--------|------|
| id | uuid PK |
| origin_id | uuid → clint_origins.id (CASCADE on delete) |
| label | text |
| stage_order | int |
| type | text |
| synced_at | timestamptz |

### `clint_lost_statuses` — motivos de perda
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | id do motivo na Clint |
| origin_id | uuid | nullable |
| label | text | **a API da Clint não devolve o nome do motivo** — é preenchido manualmente em `/comercial` (botão de editar no card "Motivo de perda") |
| occurrences | int | |
| updated_at | timestamptz | |

### `clint_sync_log` — auditoria de sincronizações
| Coluna | Tipo |
|--------|------|
| id | uuid PK |
| kind | text — hoje só `"deals"` |
| started_at, finished_at | timestamptz |
| rows_synced | int |
| since | timestamptz — desde quando este sync buscou |
| status | text — `running` \| `success` \| `error` |
| error | text |

### `bi_pipeline_areas` — dicionário de áreas (camada BI, Sprint 1)
| Coluna | Tipo | Notas |
|--------|------|-------|
| pipeline_id | uuid PK, FK → clint_origins.id | |
| area | text NOT NULL | `COMERCIAL` \| `IMPLANTACAO` \| `POS_VENDA` \| `FINANCEIRO` \| `MKT` \| `TESTES` \| `OUTROS` |
| ativo | boolean default true | falso = não entra em nenhuma agregação |
| auto_classified | boolean default true | `false` = foi editado manualmente em `/areas`, nunca mais sobrescrito pelo sync |
| updated_at | timestamptz | |

Índice: `area`.

### `sales` — vendas Hotmart (CSV)
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | |
| transacao | text UNIQUE NOT NULL | chave de idempotência — upsert por aqui |
| produto_original, produto_grupo | text | `produto_grupo` vem de `mapProductToGroup()` |
| status | text | normalizado via `categorizeStatus()`: aprovado/cancelado/chargeback/reembolso/outro |
| data_venda, data_confirmacao | timestamptz | |
| moeda_original, preco_oferta, preco_total | text, numeric, numeric | |
| faturamento_liquido_brl, valor_recebido_convertido, moeda_recebimento | numeric, numeric, text | |
| meio_pagamento | text | |
| nome_cliente, email_cliente, pais, estado, cidade | text | |
| numero_parcela | int | |
| tem_coproducao, cupom, origem_checkout | text | |
| raw | jsonb | linha bruta do CSV |
| imported_at, updated_at | timestamptz | |

Índices: `data_venda`, `produto_grupo`, `status`.

### `weekly_imports` — log de uploads de CSV
| Coluna | Tipo |
|--------|------|
| id | uuid PK |
| filename | text |
| total_rows, new_rows, updated_rows | int |
| period_start, period_end | timestamptz |
| created_at | timestamptz |
