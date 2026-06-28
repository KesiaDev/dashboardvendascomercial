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
| **Planilha de metas** | Plano estratégico 2026: metas por funil/produto/mês, OKRs trimestrais, budget, comissões | `docs/business/acompanhamento-metas-2026.xlsx` — modelo extraído na íntegra em [Camada de Planejamento Estratégico](#camada-de-planejamento-estratégico-planilha-de-metas-2026) abaixo. Ainda não consumida pela camada BI (ver [roadmap.md](./roadmap.md) Sprint 4 e [gap-analysis.md](./gap-analysis.md)) |

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

## Camada de Planejamento Estratégico (Planilha de Metas 2026)

Análise completa de `docs/business/acompanhamento-metas-2026.xlsx` (8 abas: Planilha
de Metas, OKR T1, OKR T2, Planilha de Realizado, Comissões, Backlog, Budget
Trimestre, Gráfico). Esta planilha é a fonte oficial do **planejamento** da empresa —
o que falta hoje no sistema é só o lado "realizado" automático batendo contra ela
(ver [gap-analysis.md](./gap-analysis.md)).

### Como a empresa ganha dinheiro

A receita não vem de "um produto", vem de **canais de aquisição (funis) que vendem um
conjunto pequeno de produtos**. Cada funil tem sua própria economia de unidade
(investimento → lead → conversão → venda → ticket médio → CAC → ROAS), mas vários
funis vendem o mesmo produto por portas diferentes. É por isso que "IGT" aparece tanto
como grupo de pipeline na Clint (`docs/pipelines.md`) quanto como linha de funil na
planilha: é o mesmo canal visto pelos dois sistemas.

| Funil (planilha) | Produto vendido | Tipo de canal | Mapeia para (Clint / Hotmart) |
|---|---|---|---|
| **IGT** | Mentoria Gestor de Tráfego (MGT) | Automação paga (anúncios) + venda por sessão estratégica | Grupo Clint `IGT` (IGT18-23, Lista de Espera) · `sck` `igt*.<vendedor>` |
| **FGRS** | Formação Gestor de Redes Sociais | Automação paga + venda direta | Grupo Clint `FGRS` · `sck` `fgrs*.<vendedor>` |
| **Webinar Mentoria / Perpétuo Mentoria** | Mentoria Gestor de Tráfego | Webinário/aula ao vivo recorrente | Grupo Clint `FUNIS PERPETUOS` (`WGT`, `MGT`) · `sck` `mse.<vendedor>` |
| **Webinar FGRS** | Formação Gestor de Redes Sociais | Webinário recorrente | Grupo Clint `FUNIS PERPETUOS` |
| **LDP** (Live Direto ao Ponto) | Oferta de ticket alto (ticket médio ≈ R$19.200 — muito acima dos demais) | Evento ao vivo / lista de pré-venda | Grupo Clint `INFOEDITORA` (LDP 05-09, LDP MM) |
| **Perpétuo ACC** | Programa Accelerator | Funil perpétuo (linha existe na planilha, sem dados preenchidos ainda) | Grupo Clint `Accelerator` |
| **Perpétuo IA** | (placeholder — sem dados, funil futuro) | — | — |
| **MAS** | Master and Scale 2025 | Funil próprio (linha sem dados preenchidos) | Grupo Clint `MASTER AND SCALE` |
| **Evento Presencial** | (placeholder — sem dados) | — | — |
| **Renovação** | Continuidade de Mentoria, Accelerator (ACC) e Traffic Master (TM) para quem já é cliente | Pós-venda / upsell, não aquisição nova | Grupo Clint `SUCESSO DO CLIENTE` · `produto_grupo` `renov_mentoria`/`renov_acc`/`renov_tm` |

Cada funil de aquisição nova tem sua própria estrutura de **investimento em 4
categorias**: Captação, RMKT (remarketing), Mensageria e Distribuição — somadas e
acrescidas de 12% de imposto sobre tráfego para chegar ao "Investimento Total +
Imposto", que é o número usado para calcular CAC e ROAS.

### Produtos e como se relacionam

```
Mentoria Gestor de Tráfego (MGT)          Formação Gestor de Redes Sociais (FGRS)
  vendido por: IGT, Webinar Mentoria,        vendido por: FGRS, Webinar FGRS
  Perpétuo Mentoria                          ticket médio ≈ R$2.234 (entrada)
  ticket médio ≈ R$1.674–3.194 (entrada)
        │                                          │
        ▼                                          ▼
   Renovação Mentoria  ◄──────── aluno ativo ────► (sem renovação própria na
   (pós-venda, ticket ≈ R$1.674)                    planilha — FGRS não some
        │                                            em "Renovação")
        ▼
   upsell para Programa Accelerator (ACC)
        │                                ticket médio ≈ R$11.970–19.200
        ▼
   Renovação Accelerator (ACC)
        │
        ▼
   upsell para Traffic Master (TM)
        │                                ticket médio ≈ R$16.200–16.713
        ▼
   Renovação Traffic Master (TM)

Master and Scale 2025 (MAS) e LDP (oferta de ticket alto) e Evento Presencial /
Perpétuo IA: produtos/funis paralelos, sem ligação de upsell mapeada na planilha.
```

Esse desenho confirma uma escada de valor: **MGT/FGRS são produtos de entrada →
Accelerator é o upsell natural → Traffic Master é o upsell do upsell → Renovação
existe para os três** (Mentoria, ACC, TM). É exatamente a lógica que já está
parcialmente capturada em `src/lib/product-groups.ts` (`renov_mentoria`, `renov_acc`,
`renov_tm` como categorias derivadas dos produtos principais), mas a planilha vai além:
ela já modela a **taxa de conversão esperada de cada etapa do upsell** (15% de leads de
Mentoria→venda de Mentoria, 35% de leads de ACC→venda de ACC, 70% de leads de TM→venda
de TM), algo que o sistema hoje não calcula em lugar nenhum.

### Quais metas existem

A planilha define metas em **3 granularidades diferentes que precisam bater entre
si**:

1. **Mensal por funil** (aba "Planilha de Metas"): investimento, leads, vendas,
   faturamento, conversão, CPL, ticket médio, CAC, ROAS — 12 colunas (Jan–Dez), uma
   seção por funil. Tem uma aba espelho, "Planilha de Realizado", com a mesma
   estrutura exata para o número real.
2. **Trimestral por OKR** (abas "OKR T1", "OKR T2"): agrega os funis em 4 indicadores
   (Leads pagas+orgânicas, Faturamento, Vendas Únicas, Conversão), cada um com
   Meta/Realizado/Evolução por funil e Total. A partir do T2, a meta passa a ser
   dividida explicitamente entre **Meta Marketing** e **Meta Comercial** (ex.: IGT é
   50% Marketing / 50% Comercial; Webinar é 70% Marketing / 30% Comercial — ver
   comentários da planilha) — uma atribuição de responsabilidade que o sistema atual
   não tem (hoje todo resultado de um pipeline COMERCIAL é "comercial", sem split).
3. **Anual consolidado** (aba "Backlog"): Orçamento total (R$ 4.759.000), gasto por
   funil, "Valor Final" atingível, % "Alcançado", e a meta anual de Leads (150.000),
   Vendas FE (3.000), Investimento Tráfego (R$ 4.740.000) e Faturamento
   (R$ 14.694.000) com o % que falta para alcançar ("Para Alcançar").

### Como o planejamento está organizado

```
Backlog (meta do ANO)
   │  Orçamento total, Faturamento meta, Leads meta, Vendas meta
   ▼
Budget Trimestre (custo do TRIMESTRE)
   │  Tráfego, Impostos, Meios de Pagamento, Comissões, Eventos, Equipe,
   │  Ferramentas, Analistas, Treinamentos — Previsto vs Realizado por mês
   ▼
OKR T1 / OKR T2 (meta do TRIMESTRE por indicador)
   │  Leads, Faturamento, Vendas Únicas, Conversão — Meta vs Realizado vs Evolução,
   │  por funil, com split Marketing/Comercial a partir do T2
   ▼
Planilha de Metas / Planilha de Realizado (meta do MÊS por funil)
   │  Investimento → Leads → Conversão → Vendas → Faturamento → CPL/CAC/ROAS,
   │  uma seção por funil (IGT, FGRS, Webinar, Perpétuo, LDP, Renovação...)
   ▼
Comissões (mês, por funil)
      Valor de comissão pago, usado como input na linha "Comissões" do Budget Trimestre
```

Ou seja: a meta do ano se desdobra em budget trimestral de custo, que se desdobra em
OKR trimestral de resultado, que se desdobra em meta mensal por funil — e tudo isso é
hoje **preenchido e comparado manualmente**, célula a célula, por quem mantém a
planilha. Nenhuma dessas camadas existe no banco de dados do sistema atual.

### Indicadores estratégicos usados no planejamento

Ver detalhamento completo (fórmula, origem, objetivo, frequência) em
[kpis.md](./kpis.md#planejamento-estratégico-planilha-de-metas). Resumo dos que **não
existem hoje na camada BI**: CPL, CAC, ROAS, Conversão-meta (vs realizado),
Investimento por categoria (Captação/RMKT/Mensageria/Distribuição), Comissão por funil,
Budget Previsto vs Realizado, % Alcançado/Para Alcançar, split Marketing vs Comercial.

### Observação importante sobre defasagem

A aba "Planilha de Realizado" está preenchida de forma desigual: Janeiro–Maio têm
dados reais na maioria dos funis, mas Junho em diante está majoritariamente vazio (a
mesma defasagem se repete em "OKR T2", todo zerado). Isso confirma que **hoje o
"realizado" da planilha é digitado manualmente e fica atrasado** — é exatamente o
problema que a integração com a camada BI (Sprint 4) resolveria, calculando o
realizado automaticamente a partir de `clint_deals` + `sales` em vez de depender de
alguém copiar números todo mês.
