# Plano: Dashboard real por vendedor e produto

## 1. Corrigir o bug de moeda (USD → BRL) — bloqueador
Hoje ~99% das vendas API estão com `moeda_recebimento = USD` mas o dashboard soma como se fosse BRL, inflando ~5×.

- Reescrever `extractProducerBRL` em `src/lib/hotmart.functions.ts`:
  - Procurar dentro de `commissions[]` a linha do **producer** (source = PRODUCER) e usar `commission.value` quando `commission.currency_value = "BRL"`.
  - Quando só houver USD, converter usando `exchange_rate_currency_payout` do próprio payload da Hotmart (que já vem no sale).
  - Nunca mais somar valores em moedas diferentes como se fossem BRL.
- Rodar re-sync de julho/2026 para regravar `valor_recebido_convertido` e `faturamento_liquido_brl` corretos.

## 2. Categorização por produto (regra única no backend)
Criar função `categorizarProduto(nome)` usada em toda parte:

```text
contém "- Renovação"                     → categoria=RENOVACAO,       conta_meta=false
"Mentoria Gestor Tráfego"                → GESTOR_TRAFEGO,            conta_meta=true
"Formação Gestor de Redes Sociais"       → REDES_SOCIAIS,             conta_meta=false
"Master and Scale"                       → MASTER_SCALE,              conta_meta=false
"Programa Accelerator"                   → ACCELERATOR,               conta_meta=false
"Reset Relacional"                       → RESET_RELACIONAL,          conta_meta=false
outros                                    → OUTROS,                    conta_meta=false
```

Adicionar coluna gerada `categoria_produto` + `conta_meta` em `sales` e `manual_sales` (via migration com trigger, já que precisa parsear string).

## 3. Regra de status para faturamento
- **Faturamento realizado**: status `approved` **menos** vendas com chargeback/refund efetivado.
- **Cancelamentos**: aba própria mostrando vendas com status `chargeback`, `refunded`, `dispute`, `refund_requested` (pendentes de resolução) — separados em "efetivados" vs "aguardando resultado".

## 4. Novas abas / seções do dashboard

### 4.1 Vendas por Vendedor (revisar existente)
- Coluna "Faturamento Meta" = soma BRL de vendas `conta_meta=true` e status aprovado.
- Coluna "Faturamento Total" = todas categorias (menos Renovação e Cancelamentos).
- Ranking por Faturamento Meta.

### 4.2 Faturamento por Produto (nova)
- Tabela: Categoria | Qtd Vendas | Faturamento BRL | % do total.
- Gráfico de barras.

### 4.3 Renovações (nova aba)
- Lista de vendas com "- Renovação" no nome.
- Colunas: Data | Vendedor | Produto | Valor BRL.
- Total do mês em destaque. **Não entra em nenhuma meta**.

### 4.4 Cancelamentos (nova aba)
- Dois blocos:
  - **Efetivados**: chargeback + refunded já resolvidos → subtraem do faturamento.
  - **Aguardando resultado**: dispute, refund_requested → mostrar como "em risco", NÃO subtrair ainda.

## 5. Ordem de execução
1. Migration: colunas `categoria_produto`, `conta_meta` + trigger de categorização.
2. Fix do `extractProducerBRL` + re-sync julho/2026.
3. Backfill: rodar categorização em todas as vendas existentes.
4. Server functions novas: `getFaturamentoPorProduto`, `getRenovacoes`, `getCancelamentos`, ajuste do `getVendasPorVendedor`.
5. UI: novas abas + coluna "Meta" no ranking de vendedores.
6. Validar com dados reais de julho/2026.

## Detalhes técnicos
- Categorização por trigger em vez de coluna gerada, porque precisa `LOWER()`/`LIKE` (não é imutável para generated column em algumas versões).
- `has_role`-style function não é necessária aqui — usa RLS existente.
- Preservar dados do CSV (7 vendas com BRL correto) — categorização roda em cima do `nome_produto` que já existe.
- Nenhuma quebra de schema em `weekly_imports` / `bi_*` (não são tocados).

Confirma? Ao aprovar, começo pelo passo 1 (migration).