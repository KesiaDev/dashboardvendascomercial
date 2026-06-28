# Regras do Agente IA — Dashcomercial LLMídia

Implementação atual: `src/lib/agente.functions.ts`, função `askAgent`. Modelo:
`claude-sonnet-4-6` via `@anthropic-ai/sdk`. Acesso em `/agente`.

## Princípio central

**O Agente nunca deve apenas mostrar números. Ele deve interpretar indicadores.**

| Em vez de... | Dizer... |
|--------------|----------|
| "Conversão: 18%" | "A conversão caiu 6 pontos em relação ao mês anterior." |
| "Receita: R$ 50.000" | "A receita caiu 12% frente à meta do mês." |
| "Tempo de resposta: 4h" | "O tempo de resposta subiu — isso historicamente reduz a conversão." |

## Regras implementadas hoje (system prompt)

1. Nunca listar números sem interpretação — sempre comparar com o período anterior
   quando o dado existir no contexto.
2. Citar a variação explicitamente ("caiu X pontos", "subiu Y%"), não só o valor absoluto.
3. Destacar o vendedor com melhor e pior desempenho, e formular hipótese sobre o porquê
   quando possível a partir dos dados disponíveis.
4. Respostas diretas, em português, sem rodeios nem disclaimers. Frases curtas e factuais.
5. O contexto é restrito à área **COMERCIAL** (via `bi_pipeline_areas`) — não mistura
   com automações de marketing, implantação ou financeiro, que têm dinâmicas diferentes.

## Dados disponíveis ao agente hoje

- Agregado do mês atual vs mês anterior, área COMERCIAL: ganhos, perdidos, faturamento,
  taxa de conversão geral e por vendedor (`won_at`-based, `value > 0` — mesma regra do
  dashboard executivo).
- Variação percentual de faturamento e variação em pontos de conversão entre os dois meses.

## O que falta para a visão completa (depende de Sprints futuras)

A visão final pedida é o agente fazer leitura proativa tipo:

```
Bom dia. Na semana passada a equipe recebeu 486 leads, respondeu 91% dentro do SLA
e fechou 68 vendas. A conversão caiu de 24% para 19%, principalmente na etapa de
Proposta. O produto FGRS superou a meta em 8%, enquanto o IGT está 15% abaixo do
planejado. Existem 42 negócios sem atividade há mais de 3 dias e 11 propostas
aguardando retorno há mais de uma semana. Se nenhuma ação for tomada, a projeção é
encerrar o mês com 92% da meta de faturamento.
```

Isso exige dados que ainda não existem na camada BI:

| Capacidade necessária | Depende de | Sprint |
|------------------------|------------|--------|
| "respondeu 91% dentro do SLA" | timestamps de primeira atividade por etapa | `bi_deal_events` | Sprint 3 |
| "queda na etapa de Proposta" | conversão etapa-a-etapa, não só "alcançou" | `bi_deal_events` | Sprint 3 |
| "42 negócios sem atividade há 3 dias" | última atividade por negócio | `bi_deal_events` | Sprint 3 |
| "FGRS superou a meta em 8%" | meta por produto | `bi_targets` | Sprint 4 |
| "projeção de fechar com 92% da meta" | série histórica diária + meta | `bi_daily_metrics` + `bi_targets` | Sprint 4 |
| Resumo executivo automático (cron, não só chat) | agente rodando proativamente, não só respondendo | Sprint 5 |

Até essas tabelas existirem, o agente deve ser honesto sobre a limitação: **nunca
inventar SLA, gargalo de etapa ou comparação com meta que não existam nos dados
fornecidos no contexto.** Se o usuário perguntar algo que dependa de dado ausente, a
resposta correta é dizer o que falta, não estimar.

## Regras de segurança / escopo

- O agente só lê dados já agregados (não tem acesso direto a SQL livre nem a outras
  tabelas fora do que `askAgent` monta no contexto).
- `ANTHROPIC_API_KEY` vive em variável de ambiente do projeto Lovable, nunca no código.
- O agente não escreve no banco — é somente leitura/análise.
