# Comissionamento — como funciona no dashboard

> Guia escrito em 01/09/2026, no fecho de agosto/26, quando o comissionamento
> migrou da "Planilha Comissão" (Google Sheets) para o dashboard.
> Código: `src/lib/commission.ts` (motor), `src/lib/sck-attribution.ts` (atribuição),
> página `/comissionamento`.

## A ideia geral

O dashboard substitui a planilha mensal de comissões. Tudo que na planilha era
coluna de fórmula ou digitação (bd da Hotmart, atribuição de vendedor, semana,
percentuais, metas) acontece sozinho; sobram três toques humanos por mês
(ver checklist no fim).

## O que entra sozinho

- **Vendas Hotmart**: chegam por webhook (na hora da venda) + sincronização
  horária de segurança (`/api/public/sync/hotmart`, chamada pelo pg_cron).
  A antiga aba "Nova bd de comissionamento" deixa de existir.
- **Produto → grupo**: o nome do produto é mapeado para o grupo de comissão
  (mentoria, ACC, renovações etc.) em `product-groups.ts`.
- **Semana**: calculada pela data da venda dentro do período (S1–S5).

## Atribuição de vendedor (regra única)

1. **Conflito afiliado × link**: se o afiliado Hotmart é um vendedor e o
   link/checkout (SCK) é de OUTRO, **vale o link** (regra definida no fecho
   de agosto/26). A venda fica marcada com badge vermelho de conflito na
   conferência, porque a Hotmart ainda paga o split ao afiliado — conferir
   no fecho.
2. **Afiliado**: venda com "Nome do Afiliado" de um vendedor → é dele; a
   comissão é paga direto pela Hotmart (split), a empresa não paga de novo.
3. **SCK**: sem afiliado, vale o link/checkout (ex.: `mse.joao`, `wgt.rita`).
4. Origens de marketing (mkt, ads, orgânico…) não comissionam ninguém.

Qualquer venda pode ser corrigida manualmente na página (trocar vendedor,
excluir do cálculo, observação) — equivale à antiga aba "Observações".

## Fórmulas

- Base = valor TOTAL do produto na moeda da oferta (mesmo em parcelas),
  convertido pela cotação EUR do período.
- Comissão total = (Hotmart + SCK) × 0,935 × % + Wise × %
- A pagar pela empresa = SCK × 0,935 × % + Wise × % − descontos
  (0,935 = líquido da taxa da plataforma; Wise entra cheio).
- Em cima disso: bônus de meta semanal/mensal (N1/N3), prêmios da roleta
  (1 giro por venda nova; renovação não gira) e bônus/descontos manuais.

## Vendedores e taxas (agosto/26)

Cadastro em `bi_seller_config` / `bi_commission_rates` (editável na página):
Gisele, Rita, João, Nadal (tabela padrão: 16,5% mentoria/formação, 10%
ACC/MAS/TM, 5% renovações), Pamela (tabela N1: 10% / 6% / 5%) e Késia,
que além de gerente também vende (17,5% / 11% / 6%, sem taxa de gerente
sobre as próprias vendas).

## Wise (dinheiro fora da Hotmart)

Recebimento por transferência sempre exige registro humano: lançar na
planilha Wise de recebimentos → botão de sincronizar no dashboard → indicar
o vendedor de cada recebimento. Inadimplente não comissiona até pagar.
Boas práticas aprendidas no fecho de agosto: conferir o e-mail do cliente
(um typo esconde o histórico na Hotmart) e anotar na descrição o que o valor
cobre (ex.: "parcelas 2 e 3 da HP…").

## Checklist mensal (o que ainda é manual)

1. Dia 1: criar o período do mês na página de Comissionamento (datas +
   cotação EUR). O mês nasce calculado e atualiza ao vivo.
2. Durante o mês: lançar/sincronizar os recebimentos Wise e atribuir vendedor.
3. No fecho: revisar os badges de conflito afiliado × link, inadimplências e
   lançar bônus/descontos manuais. Não há mais planilha para preencher.
