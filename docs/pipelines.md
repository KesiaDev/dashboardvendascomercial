# Pipelines — Dicionário de Áreas de Negócio

> Gerado automaticamente a partir da Clint API em 2026-06-28. Para reclassificar
> qualquer pipeline manualmente, use a tela `/areas` no app — a edição lá grava em
> `bi_pipeline_areas` e nunca é sobrescrita pelo sync automático
> (`auto_classified` passa a `false`).

## Como funciona a classificação

A Clint já agrupa seus 78 pipelines (`origins`) em ~15 grupos (campo `group_name`,
visível na própria interface da Clint em "Origens"). Em vez de criar uma taxonomia do
zero, a camada BI reaproveita esse agrupamento e o comprime em 6 áreas de negócio:

| Grupo Clint | Área BI |
|-------------|---------|
| FUNIS PERPETUOS, FGRS, IGT, WGT, MGT, MASTER AND SCALE, WEI | **COMERCIAL** |
| Accelerator, IMERSÃO IMPLEMENTACAO | **IMPLANTAÇÃO** |
| SUCESSO DO CLIENTE | **PÓS-VENDA** |
| COBRANÇAS, Hotmart | **FINANCEIRO** |
| INFOEDITORA, MKT | **MARKETING / LEAD GEN** |
| TESTES | **TESTES** (excluído de todos os dashboards) |
| (sem grupo / grupo desconhecido) | OUTROS |

A função `syncPipelineAreas()` (`src/lib/clint.functions.ts`) roda no sync diário
(cron n8n, 6h) e no botão manual "Sincronizar Clint", classificando qualquer pipeline
novo automaticamente — nenhum dashboard precisa de alteração de código quando a Clint
ganha um pipeline novo.

## Pipelines por área (snapshot de 2026-06-28, 78 pipelines)

### COMERCIAL

| Pipeline | Grupo Clint | Etapas | Status |
|----------|-------------|--------|--------|
| FGRS 3 | FGRS | 8 | Ativo |
| FGRS 4 | FGRS | 10 | Ativo |
| FGRS 5 | FGRS | 9 | Ativo |
| FGRS 6 | FGRS | 10 | Ativo |
| FGRS 7 | FGRS | 9 | Ativo |
| Funil - FGRS / Lista de Espera | FGRS | 8 | Ativo |
| PERPETUO FGRS | FGRS | 8 | Ativo |
| CONVIDAR PARA IMERSAO | FUNIS PERPETUOS | 3 | Ativo |
| Funil - Sessão Estratégica | FUNIS PERPETUOS | 10 | Ativo |
| Funil de Indicações | FUNIS PERPETUOS | 3 | Ativo |
| MGM - Teste | FUNIS PERPETUOS | 7 | Ativo |
| PIPELINE_COMERCIAL-V3 | FUNIS PERPETUOS | 2 | Ativo |
| PIPELINE_COMERCIAL-V3 | FUNIS PERPETUOS | 10 | Ativo |
| Renovação  | FUNIS PERPETUOS | 8 | Ativo |
| Renovação Mariana | FUNIS PERPETUOS | 9 | Ativo |
| Retrabalho Leads | FUNIS PERPETUOS | 6 | Ativo |
| SESSAO ESTRATEGICA | FUNIS PERPETUOS | 11 | Ativo |
| TESTE | FUNIS PERPETUOS | 4 | Ativo |
| WGRS 1 | FUNIS PERPETUOS | 6 | Ativo |
| WGT - Perpétuo | FUNIS PERPETUOS | 11 | Ativo |
| WGT-2 | FUNIS PERPETUOS | 6 | Ativo |
| Funil - IGT / Lista de Espera | IGT | 8 | Ativo |
| IGT 20 | IGT | 11 | Ativo |
| IGT 21 | IGT | 11 | Ativo |
| IGT 22 | IGT | 11 | Ativo |
| IGT 23 | IGT | 10 | Ativo |
| IGT18 | IGT | 11 | Ativo |
| IGT19 | IGT | 13 | Ativo |
| UPSELL ACC | IGT | 4 | Ativo |
| WEBINAR  2025 - Mentoria | IGT | 7 | Ativo |
| Funil de Nutrição | MASTER AND SCALE | 6 | Ativo |
| LDP_01_MAS_ATIVAÇÃO | MASTER AND SCALE | 5 | Ativo |
| LDP_02_MAS_ACC | MASTER AND SCALE | 5 | Ativo |
| LDP_03_MAS_MGT | MASTER AND SCALE | 5 | Ativo |
| MAS 2025 | MASTER AND SCALE | 7 | Ativo |
| TEste | MASTER AND SCALE | 7 | Ativo |
| 0 - ABANDONO DE CHECKOUT | MGT | 5 | Ativo |
| WEI 1 | WEI | 4 | Ativo |
| Funil Webinar Vendas | WGT | 7 | Ativo |
| WGT 1.0 | WGT | 4 | Ativo |

### FINANCEIRO

| Pipeline | Grupo Clint | Etapas | Status |
|----------|-------------|--------|--------|
| Automações Cobrança | COBRANÇAS | 10 | Ativo |
| Mentoria - Últimos 12 meses | COBRANÇAS | 10 | Ativo |
| Processo Cobrança 1.0 | COBRANÇAS | 7 | Ativo |
| Compras - IPI 2.0 | Hotmart | 4 | Ativo |

### IMPLANTAÇÃO

| Pipeline | Grupo Clint | Etapas | Status |
|----------|-------------|--------|--------|
| Accelerator - Imersão Implementacao | Accelerator | 6 | Ativo |
| Funil de Lista de Espera | Accelerator | 7 | Ativo |
| Leads Accelerator - LP | Accelerator | 7 | Ativo |
| Lista de Espera | Accelerator | 2 | Ativo |
| 0 - FALAR COM ESPECIALISTA | IMERSÃO IMPLEMENTACAO | 4 | Ativo |
| 06 - Disparo via API OFICIAL ManyChat | IMERSÃO IMPLEMENTACAO | 2 | Ativo |
| 06 - Disparos via API OFICIAL ManyChat | IMERSÃO IMPLEMENTACAO | 12 | Ativo |
| 1 - QUEM FOI NO EVENTO DE MARÇO | IMERSÃO IMPLEMENTACAO | 15 | Ativo |
| 2 - QUEM GANHOU O EVENTO DE MARÇO MAS NÃO FOI | IMERSÃO IMPLEMENTACAO | 14 | Ativo |
| 3 - ALUNOS ATIVOS DA MENTORIA | IMERSÃO IMPLEMENTACAO | 15 | Ativo |
| 4 - EX-ALUNOS MENTORIA | IMERSÃO IMPLEMENTACAO | 14 | Ativo |
| 5 - ABANDONO DE CHECKOUT | IMERSÃO IMPLEMENTACAO | 5 | Ativo |

### MARKETING / LEAD GEN

| Pipeline | Grupo Clint | Etapas | Status |
|----------|-------------|--------|--------|
| Convite LDP | INFOEDITORA | 4 | Ativo |
| LDP 05 - 24/07 | INFOEDITORA | 5 | Ativo |
| LDP 06 - 08/10 | INFOEDITORA | 7 | Ativo |
| LDP 07 - 04/12 | INFOEDITORA | 8 | Ativo |
| LDP 08 - 26/02 | INFOEDITORA | 9 | Ativo |
| LDP 09 - 16/04 | INFOEDITORA | 9 | Ativo |
| LDP MM 01 - 31/03 | INFOEDITORA | 8 | Ativo |
| LDP MM 02 - 18/05 | INFOEDITORA | 7 | Ativo |
| MINICURSO-V3 | MKT | 10 | Ativo |

### PÓS-VENDA

| Pipeline | Grupo Clint | Etapas | Status |
|----------|-------------|--------|--------|
| Alunos Accelerator | SUCESSO DO CLIENTE | 13 | Ativo |
| DESENGAJADOS | SUCESSO DO CLIENTE | 3 | Ativo |
| FOLLOW-UP FGRS | SUCESSO DO CLIENTE | 5 | Ativo |
| FOLLOW-UP MENTORIA | SUCESSO DO CLIENTE | 5 | Ativo |
| Live de Renovação | SUCESSO DO CLIENTE | 5 | Ativo |
| RENOVAÇÃO MGT | SUCESSO DO CLIENTE | 7 | Ativo |
| Renovação MGT Outubro | SUCESSO DO CLIENTE | 2 | Ativo |
| Renovação Mentoria | SUCESSO DO CLIENTE | 9 | Ativo |

### TESTES (excluído)

| Pipeline | Grupo Clint | Etapas | Status |
|----------|-------------|--------|--------|
| PERPETUOS-MKT | TESTES | 2 | Excluído (testes) |
| Teste Automação 01 | TESTES | 2 | Excluído (testes) |
| Teste Funil CS pós compra | TESTES | 5 | Excluído (testes) |
| Teste Hotwebinar | TESTES | 9 | Excluído (testes) |
| Teste Pamela | TESTES | 8 | Excluído (testes) |

## Observações sobre os pipelines

- **PIPELINE_COMERCIAL-V3 aparece duas vezes** na Clint: uma versão com 2 etapas
  (legado/abandonada) e outra com 10 etapas (a ativa, 829 deals, usada como funil
  padrão em `/comercial`). Ambas caem em COMERCIAL — o dashboard `/comercial` escolhe
  automaticamente a versão com mais etapas via fallback no código.
- **IGT, WGT, FGRS, Master and Scale** são funis de automação de marketing com volume
  altíssimo (centenas a milhares de leads cada) e taxa de "open" próxima de 100% — mas
  também fecham vendas reais (mentoria, upsell, renovação). Por isso entram em
  COMERCIAL e não em MKT: o critério de classificação é "pode gerar uma venda
  fechada com valor", não "é automação ou não".
- **INFOEDITORA** (LDPs — Lista De Pré-venda) é puramente geração de lista para
  eventos/lançamentos, sem fechamento de venda direto — fica em MKT.
- **TESTES** (5 pipelines: "TESTE", "Teste Automação 01" etc.) são ambientes de
  sandbox da equipe e são excluídos de toda agregação por padrão
  (`filterDealsByArea` com `area: null` já pula TESTES automaticamente em `bi.ts`).

## Reprocessar este documento

Este arquivo foi gerado consultando `GET /v1/origins?limit=200` na API da Clint e
aplicando a mesma função `classifyByGroupName()` de `src/lib/pipeline-areas.ts`. Para
atualizar depois que novos pipelines forem criados na Clint, repita a consulta e
reclassifique — ou, de forma equivalente, leia o estado atual direto da tabela
`bi_pipeline_areas` via Supabase.
