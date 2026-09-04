<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Dashcomercial LLMídia — como mexer neste repositório

Dashboard de vendas. React 19 + TanStack Start/Router + Vite + Tailwind v4 +
shadcn/ui + Supabase. Os dados entram por webhook (Hotmart, Clint), sync de API
(Clint, CCPBX) e importação de CSV.

## A regra que mais importa

**Antes de escrever qualquer cálculo de negócio, procure se ele já existe.**

Uma auditoria em 2026-09-03 encontrou a mesma regra implementada em até sete
lugares, com resultados diferentes: quatro cotações EUR/BRL de fallback (o app
exibia 5,85 e pagava 5,86), sete definições de "venda aprovada" (uma venda
`COMPLETE` contava numa tela e sumia da auditoria de comissão), cinco fórmulas
de taxa de conversão. Nada disso foi erro de digitação — foi cada mudança
reimplementando o que já existia dois arquivos ao lado.

Se a regra que você precisa não tem um módulo próprio, **crie o módulo** em
`src/lib/` com um teste, e aponte todos os usos para ele. Não copie.

## Onde mora cada regra

| Regra | Módulo canônico |
|---|---|
| Cotação EUR→BRL de pagamento | `src/lib/eur-rate.ts` |
| "Esta venda conta como aprovada?" | `src/lib/sales-status.ts` |
| Agrupamento e categoria de produto | `src/lib/product-groups.ts` |
| Cálculo de comissão | `src/lib/commission.ts` |
| Atribuição de venda a vendedor (SCK) | `src/lib/sck-attribution.ts` |
| E-mail canônico de vendedor | `src/lib/seller-aliases.ts` |
| Foto de vendedor | `src/lib/seller-photos.ts` |
| Admin / rotas permitidas a não-admin | `src/lib/auth.ts` |
| Autorização de server function | `src/lib/authz.server.ts` |
| Autenticação de rota de API | `src/lib/api-auth.ts` |
| Formatação de número e moeda | `src/lib/format.ts` |

Cuidado com dois pares que parecem a mesma coisa e não são:

- `eur-rate.ts` é a cotação **contratual** do período de comissionamento — define
  quanto a pessoa recebe. `currency-context.tsx` é a cotação de **mercado**, só
  para exibir valores no toggle BRL/EUR da interface. Não misture.
- `--success` / `--warning` são para **preenchimento** (badge, barra, ponto de
  gráfico). Para **texto** use `--success-fg` / `--warning-fg` /
  `--destructive-fg`, que são calibrados para contraste sobre o card.

## Dívida conhecida, ainda aberta

Estas ainda estão duplicadas. Se você encostar em alguma, unifique em vez de
adicionar mais uma cópia:

- **Nome de vendedor**: sete listas hardcoded (`bi.ts`, `performance.functions.ts`,
  `_app.coach.tsx`, `_app.fechamento.tsx`, `_app.resultados.tsx`,
  `manual-sales.functions.ts`, `seller-aliases.ts`) com conteúdo divergente — a de
  `_app.resultados.tsx` não inclui a Kesia, então as vendas dela não aparecem lá.
  A tabela `bi_seller_config` já existe no banco e deveria ser a fonte.
- **Exclusão de vendedor das métricas**: três listas, uma com match exato *com
  cedilha* (`bi.ts:225`), que deixa passar `"Aline Goncalves"` vindo de CSV.
- **Taxa de conversão**: cinco fórmulas. A de `bi.ts:357` conta perdidos por
  `created_at` e ganhos por `won_at` — uma razão entre duas coortes diferentes.
  Antes de unificar, é preciso decidir com o negócio qual é a definição oficial.
- **`PIPELINE_ORIGINS`**: três listas de UUID hardcoded em três arquivos.
  `bi_pipeline_areas` existe para isso.
- **`ADMIN_EMAILS`**: três cópias, uma com typo. A tabela `user_roles` existe.

## Segurança — não negociável

Server function do TanStack Start **é um endpoint HTTP público**: o identificador
dela vai no bundle do browser. E o app fala com o Supabase pelo client de
`service_role`, que **ignora RLS por definição**. O guard de rota em `_app.tsx`
só faz `navigate()` — ele esconde a interface, não protege dado nenhum.

Portanto:

- Toda `createServerFn` leva `.middleware([requireSupabaseAuth])`.
- As que expõem dado financeiro ou administrativo levam também
  `assertAdmin(context.claims)` na primeira linha do handler.
- Identidade vem **sempre** de `context.claims`, nunca do payload do cliente.
- Toda rota em `src/routes/api/**` chama `requireApiKey(request)` antes de
  qualquer trabalho. As duas exceções são os webhooks, que têm o guard próprio
  (`requireClintWebhookToken`, e o `?hottok=` da Hotmart).
- Nada de segredo com prefixo `VITE_` — o Vite grava o valor literal no bundle.
- `.env` está no `.gitignore` e o repositório é **público**.

## Performance — os padrões certos

- **Agregue no banco, não no browser.** `conversao-funil.server.ts` e
  `leads-dia-semana.functions.ts` mostram como: uma RPC ou um `GROUP BY` que
  devolve dezenas de linhas. `fetchAllDealsFn`/`fetchAllSalesFn` fazem o oposto —
  devolvem a tabela inteira e ainda estão em uso por `/executivo`,
  `/produtividade` e `/comercial`. Não crie novos consumidores delas.
- **Todo `select` de lista precisa de `.limit()` explícito** ou do padrão
  `count + Promise.all` de `data.functions.ts:20`. O PostgREST corta em 1000
  linhas **sem erro**: sem limite explícito, o número na tela fica errado em
  silêncio quando o período passa de mil registros.
- **Pagine em paralelo**, nunca com `await` dentro de `for`.
- Nada de chamada de LLM em caminho de render. Isso é trabalho de cron
  (`src/routes/api/public/sync.*`).

## Comandos

```bash
npm run dev         # servidor de desenvolvimento
npm run typecheck   # tsc --noEmit
npm test            # vitest (funções puras de domínio)
npm run build       # build de produção
npm run lint        # eslint
```

O checkout no Windows usa CRLF, então `npm run lint` reporta milhares de erros
`Delete ␍` do prettier em arquivos que você não tocou. É ruído do checkout, não
bug. Para validar de verdade: `npm run typecheck && npm test && npm run build`.

## Migrations

Ficam em `supabase/migrations/`. Duas coisas exigem passo manual e estão
documentadas no topo do próprio arquivo SQL:

- `20260903120000` cria índices com `CONCURRENTLY`, que não roda dentro de
  transação — pode precisar ser aplicada à mão no SQL Editor.
- `20260903120500` reagenda os `pg_cron` com header de autenticação e **depende
  de `INTERNAL_API_KEY` estar guardada no Vault do Supabase**. Sem isso os crons
  passam a receber 401 em silêncio.
