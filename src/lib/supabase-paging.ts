/**
 * Paginação de leituras no Supabase.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O PROBLEMA QUE ISTO RESOLVE
 *
 * O PostgREST devolve no máximo 1000 linhas por requisição e **não avisa** que
 * truncou: não há erro, não há flag, a resposta simplesmente vem com 1000 itens.
 * Um `select` sem `.limit()` nem `.range()` parece correto, passa no code review,
 * funciona por meses — e no dia em que o período consultado passa de mil
 * registros, o número na tela fica errado em silêncio.
 *
 * A auditoria de 2026-09-03 encontrou 43 leituras nessa situação, várias delas
 * alimentando cálculo de comissão e faturamento.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * REGRA
 *
 * Toda leitura de lista em tabela transacional faz UMA das três coisas:
 *
 *   1. `fetchAllRows(...)`  — quando precisa mesmo de todas as linhas
 *   2. `.limit(N)` explícito — quando N linhas bastam, com comentário do porquê
 *   3. `.maybeSingle()`      — quando espera uma linha só
 *
 * Nunca deixar implícito.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Teto do PostgREST por requisição. */
export const PAGE_SIZE = 1000;

/**
 * Trava de segurança: acima disto, provavelmente a query está sem filtro e
 * puxaria a tabela inteira para a memória do servidor. Melhor falhar alto do
 * que degradar em silêncio.
 */
const MAX_ROWS = 200_000;

type PostgrestResult<T> = { data: T[] | null; error: { message: string } | null };

/**
 * Lê todas as linhas que casam com o filtro, paginando EM PARALELO.
 *
 * `build` recebe o intervalo e devolve a query já montada — o mesmo filtro
 * precisa ser aplicado em todas as páginas, por isso é uma função e não uma
 * query pronta.
 *
 * ```ts
 * const rows = await fetchAllRows<Deal>(
 *   ({ from, to }) =>
 *     db.from("clint_deals")
 *       .select("id,status,won_at")
 *       .gte("created_at", start)
 *       .order("created_at", { ascending: false })
 *       .range(from, to),
 *   () => db.from("clint_deals").select("*", { count: "exact", head: true }).gte("created_at", start),
 * );
 * ```
 *
 * @param build  monta a query de uma página
 * @param count  monta a query de contagem, com o MESMO filtro. Sem ela, a
 *               função pagina até vir uma página incompleta (serial, mais
 *               lento) — passe sempre que der.
 */
export async function fetchAllRows<T>(
  build: (range: { from: number; to: number }) => PromiseLike<PostgrestResult<T>>,
  count?: () => PromiseLike<{ count: number | null; error: { message: string } | null }>,
): Promise<T[]> {
  if (count) {
    const { count: total, error } = await count();
    if (error) throw new Error(error.message);
    const n = total ?? 0;
    if (n === 0) return [];
    if (n > MAX_ROWS) {
      throw new Error(
        `fetchAllRows: ${n} linhas excede o limite de ${MAX_ROWS}. ` +
          `Filtre por período ou agregue no banco em vez de trazer tudo para a aplicação.`,
      );
    }
    const pages = Math.ceil(n / PAGE_SIZE);
    const results = await Promise.all(
      Array.from({ length: pages }, (_, i) =>
        build({ from: i * PAGE_SIZE, to: i * PAGE_SIZE + PAGE_SIZE - 1 }),
      ),
    );
    const all: T[] = [];
    for (const { data, error: pageError } of results) {
      if (pageError) throw new Error(pageError.message);
      all.push(...((data ?? []) as T[]));
    }
    return all;
  }

  // Sem contagem: pagina em série até vir uma página incompleta.
  const all: T[] = [];
  for (let page = 0; page * PAGE_SIZE < MAX_ROWS; page++) {
    const { data, error } = await build({
      from: page * PAGE_SIZE,
      to: page * PAGE_SIZE + PAGE_SIZE - 1,
    });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) return all;
  }
  throw new Error(
    `fetchAllRows: passou de ${MAX_ROWS} linhas sem terminar. Filtre por período ou agregue no banco.`,
  );
}

/**
 * Executa a mesma query em blocos de ids, em paralelo.
 *
 * `.in("id", [...])` com muitos ids estoura o tamanho da URL e, pior, pode
 * devolver mais de 1000 linhas quando a relação não é 1:1 (uma conversa tem
 * muitas mensagens). Por isso cada bloco é lido com `fetchAllRows`.
 *
 * O padrão anterior no projeto era um `for` com `await` dentro — 30 a 60
 * round-trips em série onde cabiam alguns em paralelo.
 */
export async function fetchByIdChunks<T>(
  ids: string[],
  chunkSize: number,
  build: (chunk: string[], range: { from: number; to: number }) => PromiseLike<PostgrestResult<T>>,
): Promise<T[]> {
  if (!ids.length) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += chunkSize) chunks.push(ids.slice(i, i + chunkSize));
  const results = await Promise.all(
    chunks.map((chunk) => fetchAllRows<T>((range) => build(chunk, range))),
  );
  return results.flat();
}
