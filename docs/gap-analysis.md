# Gap Analysis — Planilha de Metas vs. Sistema Atual

Pergunta respondida neste documento: **o que ainda falta para que o sistema
represente completamente o planejamento estratégico da empresa?**

Baseado na análise completa de `docs/business/acompanhamento-metas-2026.xlsx` (ver
[business-model.md](./business-model.md) e [data-dictionary.md](./data-dictionary.md))
comparada com a camada BI atual (`src/lib/bi.ts`, `clint_deals`, `sales`,
`bi_pipeline_areas`).

## O que já existe

| Conceito da planilha | Equivalente no sistema | Observação |
|---|---|---|
| Funil (IGT, FGRS, Webinar...) | `bi_pipeline_areas` (área) + `clint_origins.group_name` | Mais grosso — agrupa em 6 áreas, a planilha quebra em ~12 funis |
| Produto (Mentoria, FGRS, ACC, TM, MAS) | `product-groups.ts::PRODUCT_GROUPS` | Mapeamento por texto, sem catálogo formal |
| Vendedor | `clint_deals.user_id`/`won_by_user_id`, `sales.nome_afiliado` | 3 fontes de atribuição coexistindo, sem unificação |
| Venda | `sales` (Hotmart) | Já exclui Reset Relacional e linhas não-aprovadas |
| Negócio/Lead | `clint_deals` | Completo para o que a Clint expõe |
| Renovação (Mentoria/ACC/TM) | `produto_grupo` `renov_mentoria`/`renov_acc`/`renov_tm` | Só categoriza a venda — não tem a taxa de conversão esperada (15%/35%/70%) que a planilha assume |
| Faturamento realizado | `clint_deals.value` (WON) e `sales.faturamento_liquido_brl` | Dois números, sem reconciliação — ver "duplicado" abaixo |

## O que está faltando

Tudo que envolve **planejamento** (meta, budget, OKR) está ausente — o sistema hoje só
sabe descrever o passado (`realizado`), nunca o que foi planejado:

1. **Metas** (mensal/trimestral/anual) — nenhuma tabela.
2. **Investimento em mídia** por categoria (Captação/RMKT/Mensageria/Distribuição) —
   não é capturado de lugar nenhum; nem Clint nem Hotmart sabem quanto foi gasto em
   anúncio.
3. **CPL, CAC, ROAS** — não calculados (dependem do item 2).
4. **OKR trimestral** com Meta/Realizado/Evolução — não existe.
5. **Split Marketing vs Comercial** da meta — não existe; hoje todo negócio de um
   pipeline COMERCIAL é tratado como 100% comercial.
6. **Budget de custos operacionais** (Tráfego, Impostos, Meios de Pagamento, Eventos,
   Equipe, Ferramentas, Analistas, Treinamentos) — não existe; o sistema não sabe
   nada sobre custo, só receita.
7. **Comissão por funil** — não existe (existe crédito por vendedor, que é outra
   coisa — ver duplicado).
8. **Margem/Lucro** — não calculado em lugar nenhum, nem na planilha nem no sistema
   (seria `Faturamento − soma das categorias de custo do Budget`).
9. **Catálogo formal de produtos** (`bi_products`) e **dicionário de funil/canal** —
   sem eles, é impossível ligar Meta (por funil/produto) a Realizado (que hoje só
   existe como pipeline da Clint ou produto-por-texto da Hotmart).
10. **ROI** — nem o sistema nem a planilha medem isso hoje (só ROAS). Se for um
    requisito real, precisa ser definido (qual custo entra: só tráfego, ou
    tráfego+equipe+comissão+imposto?) antes de implementar.

## O que está duplicado

- **"Vendedor" tem 3 definições convivendo sem hierarquia clara**: responsável
  (`user_id`), quem fechou na Clint (`won_by`), e afiliado Hotmart (`nome_afiliado`).
  Hoje `matchSellerProduct` prioriza afiliado → fallback Clint por e-mail;
  `rankSellers` usa só `won_by`. São critérios diferentes em telas diferentes — não é
  um bug, mas precisa estar documentado e ser uma decisão consciente (já está, ver
  data-dictionary.md), não uma inconsistência escondida.
- **"Faturamento" tem 2 números que não se conversam**: `clint_deals.value` (WON) e
  `sales.faturamento_liquido_brl` (Hotmart). Pode haver venda paga na Hotmart sem
  negócio WON correspondente na Clint (e vice-versa) — `findPhantomWonDeals` já
  detecta uma parte disso (WON cuja venda foi cancelada depois), mas não o inverso
  (venda aprovada sem nenhum negócio WON na Clint — hoje cai em `unmatched`).
- **"Comissão" significa duas coisas diferentes**: comissão por **funil** (planilha,
  usada no Budget) vs crédito de venda por **vendedor** (`won_by` no sistema). Não dá
  para somar um com o outro sem uma regra de conversão.
- **Conversão tem 2 definições**: `won/(won+lost)` (negócios fechados sobre fechados+
  perdidos, já implementado) vs `vendas/leads` (taxa de conversão de topo de funil, só
  na planilha). São perguntas de negócio diferentes — ambas válidas, mas com o mesmo
  nome "Conversão", o que confunde quem lê os dois lados.

## O que deveria virar tabela

Em ordem de valor/esforço (do que desbloqueia mais coisa com menos trabalho):

1. **`bi_products`** — catálogo formal (id, nome, categoria, produto-pai para
   upsell/renovação, ticket de referência). Baixo esforço, alto valor: hoje qualquer
   relação produto↔produto (MGT→ACC→TM) só existe na cabeça de quem lê a planilha.
2. **`bi_channels`** (ou expandir `bi_pipeline_areas`) — dicionário funil↔canal,
   normalizando `group_name` (Clint) + `sck` (Hotmart) + nome da planilha em um id
   único. Sem isso, é impossível juntar Meta (por funil) com Realizado.
3. **`bi_targets`** — meta por funil/produto/mês/trimestre/ano, carregada a partir da
   planilha (import manual ou parser de xlsx, como já existe para CSV em `/import`).
   Estrutura sugerida: `(periodo, granularidade, funil_id, produto_id, indicador,
   valor_meta, meta_marketing, meta_comercial)`.
4. **`bi_investments`** — investimento em mídia por funil/mês/categoria (Captação,
   RMKT, Mensageria, Distribuição). Sem isso, CPL/CAC/ROAS nunca podem ser calculados
   automaticamente — vão continuar sendo digitados na mão.
5. **`bi_budget`** — custo operacional por categoria/mês (Previsto vs Realizado).
   Acoplado a "Comissões" (que pode virar uma view sobre `bi_commissions` em vez de
   número fixo).
6. **`bi_commissions`** — comissão por funil/mês (separado de `won_by`, que já existe
   para crédito por pessoa).

## O que deveria permanecer apenas como documentação

- **A relação de upsell entre produtos** (MGT/FGRS → Accelerator → Traffic Master) —
  já está em business-model.md; só precisa virar dado (`produto_pai_id` em
  `bi_products`) se algum dashboard precisar navegar essa árvore automaticamente. Até
  lá, documentação é suficiente.
- **As taxas de conversão assumidas por etapa de Renovação** (15%/35%/70%) — são
  premissas de planejamento, não fatos observados; fica documentado em kpis.md, mas
  não deveria ser tratado como meta fixa em uma tabela sem revisão periódica.
- **As notas de contexto da planilha** (ex.: "4 webinários, datas a definir", "checar
  número com fulano") — são anotações de processo, não dados estruturados. Não virar
  tabela; se for relevante, vira um campo de observação livre em `bi_targets`.

## Ordem de implementação sugerida

```
1. bi_products            (catálogo de produto — base para tudo abaixo)
2. bi_channels            (dicionário funil — base para Meta x Realizado)
3. bi_targets             (importar a planilha: Meta mensal/trimestral/anual)
4. bi_investments         (investimento em mídia por funil/mês/categoria)
5. CPL / CAC / ROAS       (calculáveis automaticamente a partir de 1-4)
6. bi_budget + bi_commissions  (custo operacional, abre caminho para margem/lucro)
7. Realizado automático batendo contra bi_targets  (substitui a planilha "Realizado")
8. KPI Engine             (centraliza 1-7 num único serviço de indicadores —
                            ver visão do usuário; é o Sprint 4 do roadmap.md,
                            mas só fica completo depois de 1-6 existirem)
9. Dashboard de Metas (/metas)  (Meta vs Realizado vs Evolução, visual)
10. Agente IA respondendo "por que não batemos a meta" / "produto que compromete
    o resultado" / "projeção de fechamento"  (Sprint 5 do roadmap.md — só é possível
    depois do KPI Engine existir, senão a IA estaria especulando sem dado)
```

Esta ordem é compatível com o `roadmap.md` existente: os itens 1-7 acima **são** o
detalhamento de "Sprint 4 — Métricas diárias, metas e produtos", e o item 8 (KPI
Engine) é a forma de organizar o que a Sprint 4 entrega antes de avançar para a
Sprint 5 (Agente IA proativo). Recomendação: tratar este gap-analysis como o
detalhamento técnico da Sprint 4 já planejada, não como uma sprint nova.

## Risco de não fazer nada disso

Sem essas tabelas, todo "número de meta" citado por qualquer pessoa (incluindo o
Agente IA, se for perguntado) precisa vir de alguém abrindo a planilha manualmente —
e a própria planilha já está com "Realizado" desatualizado a partir de junho/2026 (ver
business-model.md). O sistema hoje é excelente em descrever o passado e péssimo em
dizer se esse passado está bom ou ruim, porque não sabe o que era esperado.
