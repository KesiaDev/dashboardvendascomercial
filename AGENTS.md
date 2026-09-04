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
| Quem é vendedor, e desde/até quando | `src/lib/sellers.ts` |
| IDs de funil da Clint | `src/lib/pipeline-origins.ts` |
| Paginação de leitura no Supabase | `src/lib/supabase-paging.ts` |
| Taxa de conversão | `src/lib/conversion.ts` |
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

## Quem conta como vendedor

O quadro **muda com o tempo**, e por isso `isMetricSeller(nome, data)` exige uma
data — a do FATO (fechamento do negócio, data da venda), nunca "hoje". Com lista
fixa, tirar alguém do time mudaria retroativamente os meses já fechados, e o
relatório que já foi enviado deixaria de bater.

Hoje: Kesia, Gisele, João, Rita e Pamela. Fabio Nadal conta **até 31/08/2026** e
Luana Guimarães **até 07/08/2026** — ambos saíram, e os meses anteriores
continuam contando com eles. Camila e Aline nunca contam (equipe interna).

Ao ler dados históricos, passe a data da linha. Para preencher um seletor de
"quem vendeu" num formulário novo, use `activeSellers(new Date())`.

## Taxa de conversão

Definição oficial: **ganhos / (ganhos + perdidos), ambos pela data de
fechamento**. Responde "do que fechou neste mês, quanto virou venda?" e o número
para de mudar quando o mês acaba. Negócios em aberto não entram no denominador.

Para medir qualidade de lead ou campanha existe `cohort: "created"` — é outra
pergunta e os dois números **não são comparáveis entre si**.

## Dívida conhecida, ainda aberta

Se você encostar em alguma, unifique em vez de adicionar mais uma cópia:

- **`fetchAllDealsFn` / `fetchAllSalesFn`** devolvem a tabela inteira para o
  navegador, e `/executivo`, `/produtividade` e `/comercial` ainda as usam. O
  certo é agregar no banco (o padrão está em `conversao-funil.server.ts` e
  `leads-dia-semana.functions.ts`). **Não crie novos consumidores delas.**
- **`ADMIN_EMAILS` em código.** A tabela `user_roles` e a função `has_role()` já
  existem no banco e são o mecanismo certo.
- **IDs de funil em código.** `bi_pipeline_areas` existe para isso;
  `pipeline-origins.ts` é só o passo intermediário.
- **Validação de entrada**: ~95 `inputValidator` são funções identidade — a
  tipagem some em runtime. Só `data.functions.ts` usa zod.
- **`seller-aliases.ts`** mantém o mapa de e-mail canônico para agenda e
  permissões. É outro conceito (identidade de login, não métrica), mas vale
  consolidar com `sellers.ts` quando alguém mexer nos dois.
- **SSR**: a sessão do Supabase vive em `localStorage` (`brokeredPreviewStorage`
  em `client.ts`), não em cookie, então o servidor não sabe quem é o usuário e
  `beforeLoad` não pode resolver a autenticação. Migrar para storage em cookie
  destravaria o SSR das 26 rotas — é o maior ganho de performance ainda na mesa.
- **520 `any`**, a maioria `supabaseAdmin as any`, que descarta o tipo
  `Database` gerado logo na porta de entrada.

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
