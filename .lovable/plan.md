## Objetivo
Deixar o módulo **Comissionamento** pronto para usar a partir de julho/2026, com:
- Késia como gestora (Nadal vira vendedor comum).
- Cálculo do que a **empresa paga** (excluindo a parte já retida pelo Hotmart no split).
- Faturamento por **SCK** atribuído ao vendedor certo.
- **Roleta semanal** automática pela contagem de vendas.
- Vendas do **Hotmart** puxadas automaticamente (sync que já existe).
- **Wise** continua importado manualmente por CSV.

---

## 1) Késia gestora, Nadal vendedor

Só ajustes de dados (o código já trata "Késia" como gestora e Nadal já é vendedor ativo):
- Inserir `Késia` em `bi_seller_config` (não-ativa como vendedora — só existe para receber bônus/roleta como gestora, se preciso).
- Manter as taxas do Nadal iguais aos outros (16,5% front, 10% high-ticket, 5% renovações, 1% de override para Késia sobre as vendas dele) — já está assim, só confirmo.

Nenhuma mudança de UI. A coluna já se chama **"% Késia"**.

---

## 2) Cálculo "A pagar pela empresa"

Regra: no Hotmart, a comissão do vendedor é paga direto pelo Hotmart via split → **a empresa não paga essa parte de novo**. Wise (EUR) e SCK/manual ficam para a empresa pagar.

Novos campos por vendedor no `SellerCommission`:
- `comissao_hotmart_split` — comissão sobre `faturamento_hotmart` (paga pelo Hotmart).
- `comissao_a_pagar_empresa` — comissão sobre `faturamento_fechamento + faturamento_wise` + bônus + roleta.

Na UI, na tabela detalhada por produto, adicionar uma coluna **"Pago via Hotmart"** e uma linha final **"A pagar pela empresa"** destacada.

O `total_a_pagar` global passa a ser `comissao_a_pagar_empresa + bônus + roleta`.

---

## 3) SCK do Hotmart → vendedor

Hoje `bi_channels.sck_prefixes` só tem o produto (`mse`, `igt`, `ldp`, `fgrs`). O nome do vendedor está no **último segmento** do `origem_checkout` (ex.: `mse.gisele`, `igt21.joao`, `mse.nadal`).

Nova função `sellerFromSck(origem_checkout)`:
1. Split por `.` e `-`; pega o último token.
2. Match case-insensitive contra os primeiros nomes dos vendedores ativos (gisele, joão/joao, luana, nadal, rita).
3. Retorna o `seller_name` canônico ou `null`.

No `calculateCommissions`, quando classificar vendas Hotmart:
- Primeiro tenta pelo `nome_afiliado` (como hoje).
- Se sem afiliado ou afiliado ≠ vendedor, tenta pelo SCK.
- Se casar por SCK, entra em `faturamento_hotmart` do vendedor correto (mesma coluna, mesmo tratamento de split).

Painel novo no card do vendedor: pequena legenda mostrando **"X vendas por afiliado · Y vendas por SCK"** para auditoria.

---

## 4) Roleta semanal automática

Regra proposta (confirme se bate com a planilha):
- Pool total do período dividido pelas 5 semanas → `pool_semanal = pool_total / 5`.
- Em cada semana, ganha o vendedor com **mais vendas aprovadas** (Hotmart + manual, todas as fontes).
- Empate → divide igualmente entre empatados.
- Semana sem vendas → pool acumula para a semana seguinte.

Implementação:
- Nova função `calculateRoleta(period, sellers, sales, manualSales)` que retorna `{ sellerName, weekWins: number[], valor_brl, valor_eur }[]`.
- No `SellerCommission`, adicionar `roleta_ganho_brl` e `roleta_ganho_eur`, somados no `total_a_pagar`.
- UI: no bloco Roleta existente, mostrar quem ganhou cada semana com valor, em vez de só listar vendas.

---

## 5) Vendas automáticas Hotmart

O sync já existe (`sync.hotmart`, webhook e endpoint `/api/public/sync.hotmart`). O que falta:
- Rodar um **backfill inicial** de todas as vendas aprovadas do ano (2026) para popular `sales` de forma completa.
- Confirmar que o `pg_cron` diário está ativo (se não estiver, ativo agora).

Nenhuma mudança de credencial — já uso `HOTMART_CLIENT_ID/SECRET` que estão nos secrets.

---

## 6) Wise continua manual

Sem mudanças. Você importa o CSV mensal pelo botão que já existe em Comissionamento → Wise.

---

## Detalhes técnicos

- Arquivos alterados: `src/lib/commission.ts` (cálculo + tipos), `src/lib/commission.functions.ts` (buscas), `src/routes/_app.comissionamento.tsx` (UI colunas + roleta).
- Novo helper `src/lib/sck-attribution.ts` com `sellerFromSck()`.
- Migração para inserir `Késia` em `bi_seller_config` (is_active=false, moeda BRL) — só se você quiser que ela apareça na lista de gestores; sem isso o código atual já funciona.
- Backfill Hotmart: chamada única a `/api/public/sync.hotmart` com range 2026-01-01→hoje.
- Sem quebra do que já está no banco. O histórico de junho continua exibindo do mesmo jeito.

---

## Perguntas antes de codar

1. **Roleta**: regra "vencedor da semana leva tudo, empate divide" está correta? Ou é proporcional às vendas de cada um na semana?
2. **SCK ambíguo**: se o SCK for `mse.joao` mas o `nome_afiliado` for outro (ex.: Rita), quem ganha o crédito — afiliado ou SCK?
3. **Backfill Hotmart**: puxar desde 01/01/2026 ou só desde 01/07/2026 (início do novo ciclo com você como gestora)?
