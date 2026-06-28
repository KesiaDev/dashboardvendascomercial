# KPIs — Dashcomercial LLMídia

Convenção desta tabela: **Origem** indica a tabela/campo exato usado hoje no código
(para auditoria), não uma fonte conceitual.

## Comercial

### Leads recebidos
- **Descrição**: negócios atribuídos a um vendedor, criados no período, em qualquer
  pipeline da área COMERCIAL.
- **Fórmula**: `COUNT(clint_deals WHERE created_at IN período AND area = COMERCIAL)`
- **Origem**: `clint_deals.created_at`, agrupado via `bi_pipeline_areas`.
- **Periodicidade**: semana / mês / trimestre / semestre / ano / tudo (seletor no dashboard).
- **Objetivo**: medir volume de entrada por vendedor e por área, independente de pipeline.

### Vendas / Ganhos (won_at)
- **Descrição**: negócios fechados (status `WON`) **no período**, com valor real
  (`value > 0`) — independentemente de quando o lead entrou ou em qual pipeline da
  área estava.
- **Fórmula**: `COUNT(clint_deals WHERE status='WON' AND won_at IN período AND value > 0)`
- **Origem**: `clint_deals.won_at`, `clint_deals.value`. Implementado em `bi.ts::rankSellers`.
- **Periodicidade**: mesma do filtro de período ativo.
- **Objetivo**: número real de vendas fechadas no mês — o indicador que resolve o caso
  "Gisele vendeu 41 em junho", não a contagem por `created_at` que sub-representa
  vendas de leads antigos.

### Faturamento (ganho)
- **Descrição**: soma do valor das vendas fechadas no período, convertido para a moeda
  de exibição (BRL/EUR) à taxa configurada.
- **Fórmula**: `SUM(value convertido) WHERE status='WON' AND won_at IN período`
- **Origem**: `clint_deals.value`, `clint_deals.currency`; taxa em `currency-context.tsx`.
- **Periodicidade**: idem.
- **Objetivo**: receita gerada pela área comercial, comparável entre vendedores e meses.

### Taxa de conversão
- **Descrição**: proporção de negócios fechados sobre negócios fechados+perdidos.
- **Fórmula**: `won / (won + lost)`
- **Origem**: calculado em `computeAreaKpis` / por vendedor em `rankSellers`.
- **Periodicidade**: por período selecionado.
- **Objetivo**: eficiência de fechamento — comparar vendedores e detectar queda mês a mês.

### Em aberto
- **Descrição**: negócios criados no período que ainda estão com status `OPEN`.
- **Fórmula**: `COUNT(status='OPEN' AND created_at IN período)`
- **Origem**: `clint_deals.status`, `clint_deals.created_at`.
- **Objetivo**: tamanho do pipeline ativo — quanto ainda pode virar venda ou perda.

### Motivo de perda
- **Descrição**: distribuição dos negócios perdidos por motivo.
- **Fórmula**: `COUNT(*) GROUP BY lost_status_id WHERE status='LOST'`
- **Origem**: `clint_deals.lost_status_id` + label manual em `clint_lost_statuses`
  (a Clint não devolve o nome do motivo via API).
- **Objetivo**: identificar o principal motivo de perda para agir (preço, timing, fit).

### Mudança de etapa / funil
- **Descrição**: quantos negócios alcançaram cada etapa do pipeline selecionado
  (acumulado: alcançar a etapa N implica ter passado por todas as anteriores).
- **Fórmula**: contagem acumulada por `stage_order`, dentro de um único pipeline.
- **Origem**: `clint_deals.stage_id` + `clint_origin_stages.stage_order`.
- **Objetivo**: achar em qual etapa o funil "afina" mais — drill-down dentro de um
  pipeline específico (não é uma métrica consolidada por área).

### Ciclo médio de venda
- **Descrição**: tempo médio entre criação e fechamento dos negócios ganhos.
- **Fórmula**: `AVG(won_at - created_at)` para deals com `status='WON'`.
- **Origem**: `clint_deals.created_at`, `clint_deals.won_at`.
- **Objetivo**: medir velocidade do funil comercial.

### % No-show
- **Descrição**: proporção de reuniões agendadas que não foram realizadas, dentro do
  pipeline selecionado.
- **Fórmula**: `(reunião_agendada - reunião_realizada) / reunião_agendada`
- **Origem**: contagem por `stage_order` correspondente a etapas com nome
  "Reunião Agendada"/"Reunião Realizada" (heurística por regex no nome da etapa).
- **Objetivo**: medir qualidade de agendamento — drill-down por pipeline.

## Vendedor × Produto (cruzamento Clint × Hotmart)

### Produto mais vendido por vendedor
- **Descrição**: para cada vendedor, quantidade e faturamento de cada grupo de
  produto vendido — respondendo "quem vende mais o quê".
- **Fórmula**: vendas Hotmart aprovadas, atribuídas ao `user_name` do negócio Clint
  cujo `contact_email` bate com o `email_cliente` da venda (mais próximo por data
  quando há ambiguidade), agrupado por `produto_grupo`.
- **Origem**: `clint_deals` (status, user_name, contact_email, won_at) × `sales`
  (email_cliente, produto_grupo, faturamento_liquido_brl, data_venda). Implementado em
  `bi.ts::matchSellerProduct`.
- **Periodicidade**: todo o histórico (sem filtro de período na v1 — ver roadmap.md).
- **Objetivo**: orientar especialização de vendedor por produto e detectar quem
  converte melhor em qual oferta.
- **Limitação conhecida**: cobre só as vendas Hotmart cujo e-mail também aparece em
  algum negócio ganho na Clint. Vendas sem correspondência aparecem como
  `unmatched` (contabilizadas no total, sem vendedor atribuído) — a página
  `/vendedor-produto` mostra essa taxa de identificação explicitamente.

## Financeiro (Hotmart / `sales`)

### Faturamento líquido
- **Descrição**: soma do faturamento líquido (já descontadas taxas) das vendas aprovadas.
- **Fórmula**: `SUM(faturamento_liquido_brl) WHERE status='aprovado'`
- **Origem**: `sales.faturamento_liquido_brl`.
- **Periodicidade**: mês a mês (gráfico em `/`).

### Ticket médio
- **Descrição**: faturamento ÷ número de vendas aprovadas.
- **Fórmula**: `SUM(faturamento) / COUNT(vendas aprovadas)`
- **Origem**: `sales`.

### Taxa de chargeback / reembolso
- **Descrição**: proporção de transações que viraram chargeback ou reembolso.
- **Fórmula**: `COUNT(status IN ('chargeback','reembolso')) / COUNT(*)`
- **Origem**: `sales.status` normalizado via `categorizeStatus()`.
- **Objetivo**: saúde financeira — alerta se subir mês a mês.

## KPIs ainda não implementados (ver roadmap.md)

Os itens abaixo fazem parte da visão completa de BI pedida, mas **dependem de
`bi_deal_events`** (Sprint 3) e não existem hoje:

- SLA de primeira resposta / primeira ligação
- Tempo parado por etapa (negócios sem atividade há N dias)
- Conversão etapa-a-etapa (não apenas "alcançou", mas "taxa de avanço entre A e B")
- Score Comercial (índice 0–100 por vendedor)
- Receita por origem/campanha (depende de rastrear a origem do lead, não só o pipeline)
- Comparação contra meta (depende de `bi_targets`, Sprint 4, alimentado pela planilha
  `docs/business/acompanhamento-metas-2026.xlsx`)
