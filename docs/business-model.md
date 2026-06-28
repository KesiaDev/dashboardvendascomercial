# Business Model — Dashcomercial LLMídia

## Objetivo do sistema

Consolidar em um único lugar os dados de vendas, marketing, implantação e
pós-venda da LLMídia, hoje espalhados em três sistemas que não se conversam (Clint
CRM, Hotmart, planilhas de metas), e transformá-los em indicadores confiáveis de
performance comercial — sem depender de alguém saber qual dos 78 pipelines da Clint
escolher para ver o número certo.

O sistema NÃO substitui a Clint nem a Hotmart como ferramentas operacionais. Ele é a
camada de inteligência que se senta em cima delas.

## Como funciona a operação comercial hoje

A LLMídia vende formação/mentoria em tráfego pago e infoprodutos. A jornada típica de
um lead:

1. Entra por uma campanha (Instagram, anúncio, indicação, evento, webinar) em um dos
   pipelines de **Marketing/Comercial** da Clint (ex.: IGT, WGT, FGRS, "Funil - Sessão
   Estratégica").
2. Passa por etapas de qualificação (Base → Contactado → Conexão → Reunião → Proposta)
   conduzidas por um time de vendedores (hoje: Gisele Pimentel, João Pessoa, Rita
   Bandeira, Fabio Nadal, Luana Guimarães).
3. Se fecha, o negócio é marcado **WON** na Clint com valor e data (`won_at`). A cobrança
   real acontece na **Hotmart**.
4. Pós-venda, o aluno pode ser direcionado a pipelines de **Implantação** (Accelerator,
   Imersão) e depois **Sucesso do Cliente** (acompanhamento, renovação, indicação).
5. Cancelamentos/reembolsos/chargebacks aparecem na Hotmart e impactam a receita líquida
   reportada no dashboard `/` (financeiro).

## Áreas de negócio

O sistema organiza toda a operação em 6 áreas (ver [pipelines.md](./pipelines.md) para
o mapeamento completo pipeline → área):

| Área | O que cobre | Pipelines típicos |
|------|-------------|--------------------|
| **Comercial** | Captação e fechamento de vendas novas | IGT, WGT, FGRS, Sessão Estratégica, Pipeline Comercial V3, Master and Scale |
| **Implantação** | Onboarding de quem comprou | Accelerator, Imersão Implementação |
| **Pós-venda** | Retenção, renovação, indicação | Sucesso do Cliente |
| **Financeiro** | Cobrança e cancelamentos | Cobranças (Clint) + vendas/reembolsos/chargebacks (Hotmart) |
| **Marketing / Lead gen** | Geração de lista sem fechamento direto | Infoeditora (LDPs) |
| **Testes** | Sandbox interno da equipe | excluído de todo dashboard |

## Produtos

Os produtos vendidos (mapeados em `src/lib/product-groups.ts` a partir do nome bruto
do produto na Hotmart):

- Gestor de Tráfego Pago 2.0 (AU)
- Formação Gestor de Redes Sociais 2.0
- Programa Accelerator
- Estrategista de Infoprodutos
- Master and Scale 2025
- Traffic Master
- Renovações de cada um dos produtos acima

## Fontes de dados

| Fonte | O que fornece | Como entra no sistema |
|-------|----------------|------------------------|
| **Clint API** | Negócios (deals), vendedores, pipelines/etapas, motivos de perda | Sync automático diário (cron n8n, 6h BRT) + botão manual em `/comercial` |
| **Hotmart** | Vendas efetivadas, valor líquido, status (aprovado/cancelado/chargeback/reembolso), produto | Upload manual semanal de CSV em `/import` — ainda não é webhook nesta aplicação |
| **Planilha de metas** | Metas mensais por produto/vendedor para 2026 | `docs/business/acompanhamento-metas-2026.xlsx`, hoje apenas como referência — ainda não consumida pela camada BI (ver [roadmap.md](./roadmap.md) Sprint 4, `bi_targets`) |

## Fluxo Comercial

```
Lead entra em um pipeline COMERCIAL (Clint)
  → passa pelas etapas (qualificação, conexão, reunião, proposta)
  → vendedor responsável é atribuído (user_id)
  → fecha (status = WON, won_at preenchido, value preenchido)
     ou perde (status = LOST, lost_at + lost_status_id preenchidos)
  → cobrança real acontece na Hotmart (fonte separada)
```

Indicador-chave: conversão por vendedor = `WON / (WON + LOST)` no período, contando
**todos os pipelines da área COMERCIAL** (não um pipeline isolado) — ver
[kpis.md](./kpis.md).

## Fluxo Financeiro

```
Venda na Hotmart (aprovada/cancelada/chargeback/reembolso)
  → exportada como CSV semanalmente
  → upload manual em /import
  → parseada (csv-parser.ts), produto mapeado para grupo (product-groups.ts)
  → upsert em `sales` por `transacao` (idempotente — reimportar não duplica)
  → dashboard `/` calcula faturamento líquido, ticket médio, taxa de chargeback/reembolso
```

## Fluxo Implantação

```
Negócio fechado (WON) em pipeline COMERCIAL
  → aluno é direcionado a pipeline de IMPLANTACAO (Accelerator / Imersão)
  → hoje: mesma estrutura de deals da Clint, sem etapa de "handoff" formal rastreada
  → (gap conhecido — ver roadmap.md Sprint 3: bi_deal_events vai permitir rastrear
    a transição entre áreas)
```

## Fluxo Pós-venda

```
Aluno em pipeline de SUCESSO DO CLIENTE
  → acompanhamento, follow-up, renovação, indicação
  → métricas hoje limitadas (poucos pipelines, baixo volume comparado a Comercial)
```
