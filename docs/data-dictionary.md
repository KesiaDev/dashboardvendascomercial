# Dicionário de Dados — Entidades de Negócio

Este documento lista as entidades de negócio da LLMídia, não as tabelas técnicas
(essas estão em [data-model.md](./data-model.md)). Para cada entidade: definição,
onde ela existe **hoje** (se existe), e em qual fonte (Clint, Hotmart, Planilha de
Metas, ou nenhuma ainda).

| Status | Significado |
|--------|--------------|
| ✅ Implementado | existe como coluna/tabela real, consultável pela camada BI |
| 🟡 Parcial | existe em alguma fonte, mas não consolidado/consumido pela camada BI |
| ❌ Não existe | só existe na planilha de metas ou na cabeça de quem opera, sem registro no sistema |

## Produto

**Definição**: curso/programa vendido pela LLMídia. Existem 2 produtos de entrada
(Mentoria Gestor de Tráfego, Formação Gestor de Redes Sociais), 2 produtos de upsell
(Accelerator, Traffic Master), 1 produto paralelo (Master and Scale) e renovações de
cada um dos três principais.

- **Status**: 🟡 Parcial.
- **Onde existe**: `mapProductToGroup()` em `src/lib/product-groups.ts` — mapa de
  palavras-chave do nome bruto do produto (Hotmart) para um `produto_grupo` (`gtp_au`,
  `formacao_rs`, `accelerator`, `traffic_master`, `master_scale`, `estrategista`,
  `renov_*`, `outros`).
- **O que falta**: um catálogo formal (`bi_products`, já previsto no roadmap.md
  Sprint 4) — hoje é só inferência por texto, sem id estável, sem preço de tabela, sem
  relação produto → funil de venda.

## Funil / Canal de Aquisição

**Definição**: caminho pelo qual um lead chega até a compra (ex.: IGT, FGRS, Webinar
Mentoria, Perpétuo Mentoria, LDP, Renovação). Um funil pode vender mais de um produto
ao longo da jornada (ex.: IGT vende Mentoria; Renovação vende Mentoria, ACC e TM).

- **Status**: 🟡 Parcial — existe em duas fontes que não se conversam:
  - **Clint**: como `group_name` do pipeline (`IGT`, `FGRS`, `MASTER AND SCALE`,
    `FUNIS PERPETUOS`, `INFOEDITORA`...) — ver `docs/pipelines.md`.
  - **Hotmart**: como o campo `Origem de Checkout` (`sck`) — código de rastreio tipo
    `igt20.joao`, `mse.gisele`, `fgrs5.rita` — capturado em `sales.origem_checkout`,
    mas **não normalizado** (cada campanha gera um valor novo, sem dicionário).
  - **Planilha de Metas**: como a unidade de planejamento em si (uma seção por funil).
- **O que falta**: um dicionário `funil` que normalize `group_name` (Clint) +
  `sck` (Hotmart) + nome da planilha em um único id, igual ao que `bi_pipeline_areas`
  já faz para Área de Negócio.

## Área de Negócio

**Definição**: agrupamento amplo da operação — Comercial, Implantação, Pós-venda,
Financeiro, Marketing/Lead Gen, Testes.

- **Status**: ✅ Implementado.
- **Onde existe**: `bi_pipeline_areas` (pipeline_id → area), derivado do `group_name`
  da Clint via `classifyByGroupName()` em `src/lib/pipeline-areas.ts`.

## Pipeline (Funil de CRM)

**Definição**: o funil de etapas dentro da Clint (ex.: "IGT 20", "PIPELINE_COMERCIAL-V3") —
não confundir com "Funil/Canal de Aquisição" acima: um Funil de Aquisição pode ter
vários Pipelines (ex.: o canal IGT tem os pipelines IGT18, IGT19, IGT20...IGT23).

- **Status**: ✅ Implementado.
- **Onde existe**: `clint_origins` (id, name, group_name) + `clint_origin_stages`
  (etapas de cada pipeline).

## Negócio / Deal

**Definição**: a unidade de trabalho comercial — um lead avançando por etapas até
ganhar (WON) ou perder (LOST) um pipeline.

- **Status**: ✅ Implementado.
- **Onde existe**: `clint_deals` — ver schema completo em data-model.md.

## Vendedor

**Definição**: pessoa do time comercial responsável por trabalhar e/ou fechar negócios.

- **Status**: 🟡 Parcial — dois conceitos de "vendedor" coexistem hoje:
  - **Responsável pelo negócio** (`clint_deals.user_id/user_name`) — quem está
    atribuído ao lead.
  - **Quem fechou** (`clint_deals.won_by_user_id/won_by_name`, sincronizado a partir
    de 2026-06-28) — quem efetivamente marcou o negócio como ganho na Clint. Usado
    como critério de crédito em `bi.ts::rankSellers`/`matchSellerProduct` porque é o
    mesmo critério do relatório nativo "Vendas por Vendedor" da própria Clint.
  - Só preenchido em ~1/3 dos negócios ganhos hoje (a maioria não tem `won_by`).
- **Também existe** uma terceira fonte de atribuição, mais confiável para vendas
  Hotmart: o **Nome do Afiliado** (`sales.nome_afiliado`, desde 2026-06-28) — o link de
  afiliado pessoal de cada vendedor na Hotmart, casado por nome (token match) em
  `bi.ts::matchAffiliateToSeller`.
- **Exclusão de negócio**: Camila Faria, Aline Gonçalves e Késia Nandi têm negócios
  reais na Clint mas são excluídas de todo ranking por vendedor
  (`bi.ts::isExcludedSeller`) — não são força de vendas para fins de relatório.

## Lead / Contato

**Definição**: pessoa física interessada/cliente — origem de um Negócio (Clint) e/ou
de uma Venda (Hotmart).

- **Status**: ✅ Implementado, mas **sem id único cross-sistema**.
- **Onde existe**: `clint_deals.contact_*` (Clint) e `sales.email_cliente`/
  `nome_cliente` (Hotmart). O vínculo entre os dois é feito em tempo de consulta por
  e-mail (`bi.ts::matchSellerProduct`/`findPhantomWonDeals`), não por uma FK real.

## Venda

**Definição**: uma transação efetivamente cobrada — fonte de verdade financeira.

- **Status**: ✅ Implementado.
- **Onde existe**: `sales` (uma linha por `transacao` Hotmart). **Não inclui** linhas
  "Reset Relacional" (evento de CRM da Hotmart, não é produto vendido — excluído
  explicitamente em `bi.ts::isResetRelacional`).
- **Diferença importante** vs "Negócio ganho" (Clint `WON`): um negócio pode estar
  `WON` na Clint sem ter sido pago de fato na Hotmart, ou pode ter sido pago e depois
  cancelado/reembolsado sem que a Clint seja atualizada — ver `findPhantomWonDeals`.

## Receita / Faturamento

**Definição**: valor monetário gerado pelas vendas.

- **Status**: 🟡 Parcial — duas fontes, dois números diferentes, sem reconciliação
  formal:
  - **Clint**: `clint_deals.value` somado sobre negócios `WON` no período (`won_at`).
  - **Hotmart**: `sales.faturamento_liquido_brl`, já líquido de taxas.
- A planilha de metas trata "Faturamento" como um terceiro número (a meta), que hoje
  não é comparado contra nenhum dos dois.

## Investimento

**Definição**: gasto em aquisição de leads, dividido em 4 categorias: Captação, RMKT
(remarketing), Mensageria, Distribuição — mais 12% de imposto sobre tráfego.

- **Status**: ❌ Não existe no sistema. Só na Planilha de Metas, por funil/mês.

## CAC (Custo de Aquisição de Cliente)

**Definição**: `Investimento Total + Imposto ÷ Vendas`, por funil/mês.

- **Status**: ❌ Não existe no sistema. Calculado manualmente na planilha.

## ROI

**Definição esperada**: retorno sobre investimento, geralmente `(Receita − Custo) ÷
Custo`.

- **Status**: ❌ **Não existe em lugar nenhum** — nem no sistema, nem na planilha. A
  palavra "ROI" não aparece em nenhuma célula do arquivo `acompanhamento-metas-2026.xlsx`.
  O que a empresa mede hoje é **ROAS** (ver abaixo), que é uma métrica diferente (não
  desconta custo de produto/equipe/impostos sobre venda, só o investimento em
  tráfego). Se "ROI" é um indicador que a operação quer de fato acompanhar, ele
  precisa ser definido e modelado do zero — não é uma simples renomeação do ROAS.

## ROAS (Return on Ad Spend)

**Definição**: `Faturamento ÷ (Investimento Total + Imposto)`, por funil/mês.

- **Status**: ❌ Não existe no sistema. Calculado manualmente na planilha.

## Budget

**Definição**: orçamento trimestral por categoria de custo (Tráfego, Impostos, Meios
de Pagamento, Comissões, Eventos, Equipe, Ferramentas, Analistas, Treinamentos e
Consultorias), comparando Previsto vs Realizado.

- **Status**: ❌ Não existe no sistema. Aba "Budget Trimestre" da planilha.

## Comissão

**Definição**: valor de comissão de vendas, hoje rastreado **por funil** (não por
pessoa) na planilha — conceito diferente do `won_by`/crédito-por-vendedor implementado
no sistema.

- **Status**: 🟡 Parcial / conflitante. Existem dois conceitos de "comissão" que não
  se relacionam ainda:
  - Planilha: comissão agregada por funil/mês (aba "Comissões"), input do Budget
    Trimestre.
  - Sistema: nenhuma tabela de comissão — só o crédito de venda por vendedor
    (`won_by`), sem valor de comissão calculado.

## OKR

**Definição**: meta trimestral por indicador (Leads, Faturamento, Vendas Únicas,
Conversão), por funil, com Meta/Realizado/Evolução — e, a partir do T2, split entre
Meta Marketing e Meta Comercial.

- **Status**: ❌ Não existe no sistema. Abas "OKR T1"/"OKR T2" da planilha.

## Meta

**Definição**: valor-alvo definido para um indicador em um período (mês, trimestre ou
ano) — existe em 3 granularidades na planilha (mensal por funil, trimestral via OKR,
anual via Backlog). Ver [business-model.md](./business-model.md#como-o-planejamento-está-organizado).

- **Status**: ❌ Não existe no sistema (nenhuma tabela de meta hoje).

## Realizado

**Definição**: o valor real de um indicador, para comparar contra a Meta.

- **Status**: 🟡 Parcial. Existe nos dados brutos (`clint_deals`, `sales`), mas nunca
  é **calculado e comparado contra uma Meta automaticamente** — na planilha, "Realizado"
  é digitado manualmente todo mês, e está incompleto a partir de junho/2026 (ver
  business-model.md, seção "Observação importante sobre defasagem").
