# Roadmap — Dashcomercial LLMídia

## Sprint 1 — Fundação da camada BI ✅ concluída (2026-06-28)

- [x] Migration `bi_pipeline_areas` (dicionário pipeline → área de negócio)
- [x] `pipeline-areas.ts`: classificação automática via `group_name` da Clint
- [x] `syncPipelineAreas()` + `setPipelineArea()` (server functions)
- [x] Integração no cron diário (`runFullClintSync`) e no botão manual de sync
- [x] `bi.ts`: camada de agregação desacoplada (fetch, filtro por área, ranking, KPIs)
- [x] `/executivo`: Dashboard Executivo consolidado por área (sem seletor de pipeline)
- [x] `/areas`: tela de reclassificação manual
- [x] `/comercial`: seção "Detalhe por vendedor" passa a consolidar todos os funis
      (antes dependia de qual pipeline estava selecionado)
- [x] Correção: "Convertidos"/faturamento usam `won_at` no período (não `created_at`)
- [x] Agente IA restrito à área COMERCIAL + comparação mês atual vs anterior

## Vendedor × Produto — implementado fora de ordem (2026-06-28)

Entre a Sprint 2 e a Sprint 3, foi implementado o item de cruzamento Clint × Hotmart
que originalmente estava planejado para a Sprint 4 (ver checklist abaixo). Motivo:
era uma pergunta de negócio direta ("qual produto cada vendedor vende mais") que não
dependia de `bi_deal_events` nem de `bi_targets` — só precisava do `sales` (já
existente desde antes da Sprint 1) cruzado com `clint_deals` por e-mail.

- [x] `bi.ts::fetchAllSales`, `matchSellerProduct`
- [x] `/vendedor-produto`: produto mais vendido por vendedor, com taxa de
      identificação visível (matched vs unmatched)
- [x] Documentado em data-model.md (substitui o "gap conhecido" anterior)

## Sprint 2 — Documentação ✅ concluída (2026-06-28)

- [x] `docs/business-model.md`
- [x] `docs/architecture.md`
- [x] `docs/data-model.md`
- [x] `docs/kpis.md`
- [x] `docs/pipelines.md` (gerado a partir da Clint API)
- [x] `docs/ai-rules.md`
- [x] `docs/roadmap.md` (este arquivo)

A partir desta sprint, **toda informação nova deve passar pela camada BI
(`src/lib/bi.ts` + `bi_pipeline_areas`) antes de chegar a um dashboard ou ao Agente
IA.** Nenhum dashboard novo deve filtrar `clint_deals` direto por `origin_id`.

## Sprint 3 — `bi_deal_events`: o coração do sistema 🔜 próxima

> "Implementar a tabela bi_deal_events, responsável por registrar toda movimentação
> dos negócios entre etapas, incluindo tempo de permanência, timestamps, responsável
> e histórico completo. Todos os indicadores de SLA, conversão por etapa, gargalos e
> produtividade deverão ser calculados a partir dessa tabela."

Checklist técnico:

- [ ] Migration `bi_deal_events` (deal_id, pipeline_id, etapa, responsável, timestamp,
      tipo_evento, tempo_na_etapa)
- [ ] Mecanismo de captura: como a Clint não expõe um endpoint de histórico de etapas
      diretamente — avaliar entre (a) webhook da Clint por evento de mudança de etapa,
      ou (b) detectar mudança comparando `stage_id` a cada sync incremental e gerar o
      evento sintético no momento do sync.
- [ ] Backfill: gerar eventos retroativos a partir do estado atual de `clint_deals`
      (sem histórico completo, mas com pelo menos created→atual)
- [ ] Timeline por negócio (UI: ver histórico de um deal específico)
- [ ] KPIs novos habilitados por esta tabela: SLA de primeira resposta, tempo parado
      por etapa, conversão etapa-a-etapa, negócios esquecidos (sem atividade há N dias)
- [ ] Dashboard de Pipeline (`/pipeline`): entradas, saídas, tempo por etapa, etapas
      travadas
- [ ] Dashboard de Qualidade (`/qualidade`): leads esquecidos, negócios sem
      responsável, sem próxima tarefa, campos obrigatórios vazios

## Sprint 4 — Métricas diárias, metas e produtos

> Detalhamento completo desta sprint (modelo de negócio extraído da planilha, dicionário
> de entidades e ordem de implementação sugerida) em
> [business-model.md](./business-model.md), [data-dictionary.md](./data-dictionary.md)
> e [gap-analysis.md](./gap-analysis.md) (2026-06-28).

- [ ] `bi_daily_metrics`: snapshot diário consolidado por área/vendedor (permite
      gráfico de série histórica e projeção de fechamento de mês)
- [ ] `bi_targets`: metas por produto/vendedor/mês — **alimentada pela planilha**
      `docs/business/acompanhamento-metas-2026.xlsx` (hoje só referência estática)
- [ ] `bi_products`: catálogo formal de produtos (hoje só existe como mapa de
      keywords em `product-groups.ts`) — necessário para relacionar Clint × Hotmart
      por produto, não só por nome de texto
- [x] ~~Cruzamento Clint × Hotmart~~ — **implementado fora de ordem em 2026-06-28**
      (`bi.ts::matchSellerProduct`, página `/vendedor-produto`), via e-mail do
      cliente. Ver data-model.md para detalhes e taxa de cobertura.
- [ ] Dashboard Financeiro completo (`/financeiro`): receita Hotmart + Clint, lucro

## Sprint 5 — Agente IA proativo

Hoje o agente responde perguntas. Nesta sprint ele passa a fazer análises sem que
ninguém precise perguntar:

- [ ] Resumo executivo automático (cron — ex.: toda segunda-feira de manhã)
- [ ] Identificação de causa provável de queda de indicador (não só "caiu", mas "caiu
      por causa de X")
- [ ] Score Comercial: índice 0–100 por vendedor (resposta rápida, conversão,
      atividades, pipeline atualizado, receita — 20 pontos cada)
- [ ] Projeção de fechamento de mês com base no ritmo atual
- [ ] Exemplo de saída esperada:

  > "Bom dia. Na semana passada a equipe recebeu 486 leads, respondeu 91% dentro do
  > SLA e fechou 68 vendas. A conversão caiu de 24% para 19%, principalmente na etapa
  > de Proposta. O produto FGRS superou a meta em 8%, enquanto o IGT está 15% abaixo
  > do planejado. Existem 42 negócios sem atividade há mais de 3 dias e 11 propostas
  > aguardando retorno há mais de uma semana. Se nenhuma ação for tomada, a projeção é
  > encerrar o mês com 92% da meta de faturamento."

- [ ] Esta saída só é possível depois de Sprint 3 (`bi_deal_events` para SLA/gargalo)
      e Sprint 4 (`bi_targets`/`bi_daily_metrics` para meta/projeção) estarem prontas.

## Ordem de dependência

```
Sprint 1 (BI base) ──► Sprint 2 (docs) ──► Sprint 3 (bi_deal_events)
                                                    │
                                                    ▼
                                          Sprint 4 (daily_metrics,
                                            targets, products)
                                                    │
                                                    ▼
                                          Sprint 5 (Agente IA proativo)
```

Cada sprint depende da anterior ter dados reais — não adianta pedir "resumo executivo
proativo" (Sprint 5) antes de `bi_deal_events` (Sprint 3) existir, porque não há SLA
nem gargalo de etapa para reportar.
