## O que muda na tela /resultados

Reconstrução em 4 blocos empilhados, do topo pra base, na mesma URL. Toggle BRL/EUR do topbar continua valendo em tudo.

### Bloco 1 — Dashboard YTD (topo)
4 cards grandes com Realizado YTD vs Meta anual e % de atingimento:
- **Leads** (total de leads captados)
- **Front End (novas vendas)** — só FGRS, sem renovação
- **High Ticket (novas + renovações)** — MGT (IGT+MSE+WGT) + Accelerator/LDP
- **Bilhetes M&S** — Master and Scale

Logo abaixo, funil de conversão YTD: Leads → Front End → High Ticket com as duas taxas (Lead→FE e FE→HT) mostrando realizado vs meta.

### Bloco 2 — Vendas Front End (MGT + FGRS · novas sem renovação)
Tabela mensal Jan→Dez + Total Ano + Meta anual, com linhas:
- Distribuição % (peso do mês na meta anual, editável)
- Projetado (calculado = Meta × Distribuição %)
- Realizado (auto do Clint, editável para override)
- Atingimento mês (%)
- Acum. Projetado
- Acum. Realizado
- Atingimento acum. (%)

Ao lado: 2 mini-gráficos (mês a mês projetado vs realizado, e acumulado).

### Bloco 3 — Vendas High Ticket (Accelerator + Traffic Master + All Blacks · novas + renovações)
Mesma estrutura do Bloco 2, mas somando MGT (IGT+MSE+WGT), Accelerator/LDP e incluindo renovações.

### Bloco 4 — Tabela semanal por produto
Uma linha-cabeçalho por produto (FGRS, IGT, MSE, WGT, WFGRS, LDP, Accelerator) e sub-linhas:
- Faturamento Total (manual, você digita)
- Faturamento Comercial (auto do Clint — vendas com afiliado/origem)
- Vendas Total (manual)
- Vendas Comercial (auto)
- Conversão (calculada = Vendas / Leads da semana)

Colunas: semanas do ano (segunda-feira de cada semana), com Total à direita. Células manuais têm ícone de lápis; salvamento inline (Enter salva, Esc cancela).

### Edição
- **Metas anuais e Distribuição %**: editáveis inline nos blocos 2 e 3 (só usuários autenticados).
- **Realizado manual (override e Total semanal)**: editável inline. Cada célula manual mostra badge "manual" pra você lembrar que sobrepõe o auto.
- **Cotação EUR**: já vem de `bi_commission_periods.cotacao_eur`. Toggle BRL/EUR converte tudo.

## O que muda no banco

Duas tabelas novas (via migration):

- **`bi_weekly_results`** — 1 linha por (produto, semana, indicador manual):
  - `product_id` (fgrs, igt, mse, wgt, wfgrs, ldp, accelerator)
  - `week_start` (segunda-feira, date)
  - `indicador` (faturamento_total, vendas_total)
  - `valor_brl` (numeric)
  - `updated_by`, `updated_at`

- **`bi_monthly_overrides`** — override manual do Realizado mensal Front End / High Ticket:
  - `bloco` ('front_end' | 'high_ticket')
  - `periodo` (primeiro dia do mês)
  - `indicador` ('vendas' | 'faturamento')
  - `valor_brl` (numeric)

`bi_targets` continua servindo para metas anuais/mensais e Distribuição %. Um novo indicador `distribuicao_pct` guarda o % do mês por bloco.

Todas com FORCE RLS, gravação só por server functions autenticadas (usam `requireSupabaseAuth` + service_role via edge quando necessário).

## Cálculo Realizado (comercial auto do Clint)

Server function `fetchResultadosDashboard({ year })` retorna, agregado do `clint_deals`:
- Por mês × bloco (Front End = FGRS novas; High Ticket = MGT+Accelerator novas+renov)
- Por semana × produto: faturamento_comercial e vendas_comercial (`nome_afiliado IS NOT NULL OR origem_checkout IS NOT NULL`)
- Leads YTD (de `bi_targets.indicador='leads'` realizado? — se não existir fonte de leads real, campo Leads YTD fica manual com input no card do topo)

## Detalhes técnicos

- Novo arquivo `src/routes/_app.resultados.tsx` (reescrito) usando `useSuspenseQuery` com `ensureQueryData`.
- 3 server functions em `src/lib/resultados.functions.ts`:
  - `fetchResultadosDashboardFn` (agrega Clint por bloco/produto/mês/semana)
  - `saveWeeklyResultFn` (upsert em `bi_weekly_results`)
  - `saveMonthlyOverrideFn` (upsert em `bi_monthly_overrides`)
  - `saveTargetFn` (upsert em `bi_targets` — metas e distribuição %)
- Componentes novos:
  - `<YtdKpiCard />`, `<FunnelBlock />`
  - `<MonthlyBlock title bloco />` (Front End / High Ticket)
  - `<WeeklyProductGrid />` com célula editável (`<EditableCell />`)
- Charts com Recharts (BarChart mensal, LineChart acumulado).
- Currency: usa `useCurrency()` que já existe — tudo armazenado em BRL, convertido no render.

## Ordem de implementação (1 turno)

1. Migration: `bi_weekly_results` + `bi_monthly_overrides` + índice `distribuicao_pct` no `bi_targets`.
2. Server functions.
3. Componentes + rota reescrita.
4. Verificação visual via Playwright.

Ao aprovar o plano, executo a migration (você aprova) e sigo direto para o código.