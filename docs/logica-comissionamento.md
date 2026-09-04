# Lógica do cálculo de comissões — especificação

> Engenharia reversa da "Planilha Comissão", célula a célula, em 01/09/2026,
> **atualizada em 04/09/2026** com as quatro mudanças de regra confirmadas pela
> Kesia. Esta é a especificação que o código implementa.
>
> Implementação: `src/lib/commission-rules.ts` (regras puras, com testes) e
> `src/lib/commission.ts` (motor do cálculo).

## O que mudou em 04/09/2026

Quatro pontos, e em três deles esta versão **contradiz** a de 01/09. Onde houver
divergência, vale esta.

| | 01/09 (planilha) | 04/09 (vigente) |
|---|---|---|
| Vendas de 01–04/08/2026 | fecho de **julho** | fecho de **agosto** |
| Bônus de meta | níveis N1/N3, cumulativo | faixa única, não cumulativo |
| Giros de roleta | do fechamento manual | das vendas da Hotmart, automático |
| Câmbio sem cotação | valor fixo no código | **aviso na tela**, sem fallback |

---

## 1. Entrada

Export de vendas da Hotmart, uma linha por transação. Entram apenas transações
**Aprovada / Completa** — a lista canônica de status está em
`src/lib/sales-status.ts`.

Campos que o cálculo usa, com o nome que têm na tabela `sales`:

| Campo | Significado |
|---|---|
| `transacao` | chave única da venda |
| `nome_afiliado` | afiliado Hotmart (atribuição) |
| `origem_checkout` | SCK do link (atribuição) |
| `produto_original` / `produto_grupo` | produto e seu agrupamento |
| `preco_total` | valor **cheio** do produto, na moeda da oferta |
| `moeda_original` | moeda da oferta |
| `data_venda` | competência |
| `status` | aprovada / cancelada / reembolso |

> ⚠️ **`numero_parcela` NÃO é o índice da parcela.** Ele guarda a *quantidade* de
> parcelas do parcelamento (`installments_number` da API). Cada transação é UMA
> linha: uma compra em 12x não vira 12 linhas. Filtrar por `numero_parcela <= 1`
> eliminaria toda venda parcelada, que é venda nova legítima.
>
> É por isso que "primeira venda" é definida por **não ser renovação** — ver §4.

---

## 2. Calendário

A **semana de comissionamento vai sempre de quarta-feira a terça-feira**.

O **"mês" é um bloco de 4 ou 5 semanas**, não o mês de calendário. Ele termina
numa terça, por volta do dia 25 ao 1º, e o seguinte começa na quarta.

Grade de 2026:

| Período | Início | Fim | Semanas |
|---|---|---|---:|
| Julho | 01/07 (qua) | 31/07 (**sex**) | 5 |
| Agosto | 01/08 (**sáb**) | 01/09 (ter) | 5 |
| Setembro | 02/09 (qua) | 29/09 (ter) | 4 |
| Outubro | 30/09 (qua) | 03/11 (ter) | 5 |
| Novembro | 04/11 (qua) | 01/12 (ter) | 4 |
| Dezembro | 02/12 (qua) | 05/01/27 (ter) | 5 |

As duas exceções em negrito vêm da decisão de 04/09: **as vendas de 01 a 04/08
pertencem a agosto**. Por isso julho fecha numa sexta e agosto abre com uma
semana curta:

```
S1  01/08 (sáb) → 04/08 (ter)   4 dias   ← curta
S2  05/08 (qua) → 11/08 (ter)   7 dias
S3  12/08 (qua) → 18/08 (ter)   7 dias
S4  19/08 (qua) → 25/08 (ter)   7 dias
S5  26/08 (qua) → 01/09 (ter)   7 dias
```

Regra geral em `weeksOfPeriod`: a primeira semana vai do início do período até a
primeira terça (pode ser curta); as seguintes são blocos qua→ter inteiros; a
última é truncada no fim do período.

---

## 3. Atribuição de vendedor

Duas fontes, em `src/lib/sck-attribution.ts`:

- **Afiliado Hotmart** — casa `nome_afiliado` com o vendedor.
- **SCK / link de checkout** — casa `origem_checkout`.

Em **conflito** (afiliado ≠ SCK): **vale o link/SCK**. O split que a Hotmart
pagou ao afiliado é acertado no fecho. A venda fica marcada com
`conflito_afiliado` para conferência.

Origens de marketing (ads, orgânico) não comissionam ninguém.

Quem é vendedor, e **desde/até quando**, vive em `src/lib/sellers.ts` — o quadro
muda ao longo do tempo e `isMetricSeller` exige a data do fato, para que a saída
de alguém não reescreva meses já fechados.

---

## 4. Elegibilidade

**Produtos principais** (grupos em `src/lib/product-groups.ts`):

`accelerator` · `gtp_au` · `formacao_rs` · `master_scale` · `estrategista`

Renovações (`renov_*`) e Traffic Master **não** são elegíveis.

**Primeira venda** = a venda não é renovação. Ver o aviso do §1 sobre
`numero_parcela`. Se um dia a ingestão passar a criar uma linha por parcela
cobrada, é `isPrimeiraVenda` que muda — e só ela.

---

## 5. Roleta

Uma venda gera **um** giro quando, cumulativamente:

1. o produto é um dos principais (§4);
2. o **valor cheio** do produto é **≥ €200**;
3. é primeira venda.

O tipo é **Y** quando o valor cheio é **≥ €1.000**, senão **X**.

O giro nasce com status `pendente`. O **valor do prêmio é lançado à mão** na
página da Roleta — é o único input manual regular do processo.

A geração roda automaticamente na entrada da venda (webhook e sync da Hotmart) e
pode ser reprocessada por período pelo botão da tela. É **idempotente**:
`source_sale_id` guarda a transação, e reprocessar não duplica.

O "valor cheio em EUR" sai de `preco_total` convertido pela cotação do período
quando a oferta não é em euro (`valorCheioEur`).

---

## 6. Bônus de meta

Sobre o faturamento em **EUR** das vendas **elegíveis** — produtos principais
mais a **ACC Taxa Inicial**, primeira venda.

| Semana | Bônus | | Mês | Bônus |
|---|---:|---|---|---:|
| < €900 | €0 | | < €3.200 | €0 |
| ≥ €900 | €30 | | ≥ €3.200 | €30 |
| ≥ €1.600 | €60 | | ≥ €6.400 | €60 |

**Faixa única e não cumulativa**, igual para todos os vendedores: quem faz
€1.700 numa semana recebe €60, não €90.

Bônus total = soma das semanas + o mensal, convertido pela cotação do período
para quem recebe em BRL.

---

## 7. Comissão por produto

Por vendedor e produto, com `E` = percentual de comissão:

```
C = Σ base   das vendas em que o vendedor é o AFILIADO
D = Σ base   das vendas atribuídas pelo SCK (sem afiliado)
B = Wise     (recebimento fora da Hotmart, lançamento manual)
F = descontos

G  total recebido   = B×E + 0,935×(C×E) + 0,935×(D×E)
H  a pagar          = B×E + 0,935×(D×E) − F
J  comissão gestor  = (B+C+D) × %gestor
```

`H` exclui `C` porque, quando o vendedor é o afiliado, **a Hotmart já paga a
comissão direto** pelo split. O fator `0,935` é o líquido após a taxa da
plataforma.

Total do vendedor = Σ produtos + roleta + bônus (+ fixo, quando acordado).

### Percentuais (ago/26)

| Grupo | Gisele / Rita / João / Nadal | Pamela | Késia |
|---|---:|---:|---:|
| Mentoria / Formação / Estrategista | 16,5% | 10% | 17,5% |
| ACC / MAS / Traffic Master | 10% | 6% | 11% |
| Renovações | 5% | 5% | 6% |

### Késia (gestora + vendedora)

Vendas próprias seguem o modelo acima, sem %gestor sobre si mesma. A comissão de
gestora é a soma dos `J` da equipe, convertendo os de quem recebe em euro.

---

## 8. Moeda

Rita e João recebem em **EUR**; os demais em **BRL**.

A cotação é a `cotacao_eur` do período, e **só ela**. Não há fallback: sem
cotação cadastrada, a tela mostra aviso e não calcula, e o servidor falha alto
(`src/lib/eur-rate.ts`).

O motivo está escrito no módulo: com fallback ninguém percebe que a cotação do
mês não foi cadastrada — o valor sai plausível e errado. Um número de pagamento
errado é pior que um número ausente.

> Não confundir com `DEFAULT_RATE` de `currency-context.tsx`: aquela é a cotação
> de **mercado**, usada só para exibir valores no toggle BRL/EUR da interface.
> Esta é a **contratual** do período, que define quanto a pessoa recebe.

---

## 9. Inputs manuais admitidos

Tudo o mais é automático.

1. **Valor do prêmio da roleta**, por giro — o único input regular.
2. **Cotação do período.**
3. **Recebimentos Wise** (dinheiro fora da Hotmart), com vendedor e produto.
4. **Fixo**, quando acordado com um vendedor.
5. **Ajustes excecionais** — sempre como lançamento de bônus/desconto com
   justificativa, nunca editando fórmula.
6. **Decisão de conflito** afiliado × link, quando fugir do padrão.

---

## 10. Regras anti-erro

- Transação é única — nunca contar duas vezes.
- Semana derivada da data automaticamente. Na planilha era manual e falhou em 13
  vendas de ago/26.
- Tokens de atribuição por vendedor ficam em cadastro, não em fórmula.
- Toda conversão de moeda pela cotação do período, parametrizada.
- Inadimplente (Wise) não comissiona até pagar.
- Log de cada input manual.
- Conferência contra a Hotmart: soma dos "você recebeu" + splits = base
  calculada.
