/**
 * Guarda de autenticação para as rotas em `src/routes/api/**`.
 *
 * Estas rotas são endpoints HTTP abertos à internet. Seis delas (sync/trigger,
 * sync/hotmart, sync/ccpbx, sync/contact-tags, sync/coach-auto e audit/manual-sales)
 * rodavam sem nenhuma verificação: qualquer pessoa com a URL podia disparar syncs
 * completos em loop (DoS do Postgres e das APIs Clint/Hotmart) e, no caso de
 * coach-auto, queimar créditos de LLM diretamente na fatura da empresa.
 *
 * A verificação já existia copiada em seis outros arquivos; isto é a extração dela.
 *
 * FALHA FECHADA: sem a variável de ambiente configurada, o endpoint responde 500 e
 * não executa nada. Nunca "libera porque não está configurado".
 */

/** Comparação em tempo constante — não vaza o comprimento nem o prefixo do segredo. */
function safeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < Math.max(ab.length, bb.length); i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

function deny(status: number, error: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Valida `x-api-key` (ou `?key=`, para o pg_cron que só monta a URL) contra
 * `INTERNAL_API_KEY`.
 *
 * @returns `null` se autorizado, ou a `Response` de erro a devolver.
 *
 * Uso:
 * ```ts
 * const denied = requireApiKey(request);
 * if (denied) return denied;
 * ```
 */
export function requireApiKey(request: Request): Response | null {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) {
    console.error("[api-auth] REJECTED: INTERNAL_API_KEY não definida no ambiente (fail-closed)");
    return deny(500, "endpoint not configured");
  }
  const fromHeader = request.headers.get("x-api-key");
  const fromQuery = new URL(request.url).searchParams.get("key");
  const got = fromHeader ?? fromQuery ?? "";
  if (!safeEqual(got, expected)) {
    console.error("[api-auth] unauthorized", { path: new URL(request.url).pathname });
    return deny(401, "unauthorized");
  }
  return null;
}

/**
 * Valida o token do webhook da Clint contra `CLINT_WEBHOOK_TOKEN`.
 *
 * A Clint não assina os payloads, então usamos um segredo compartilhado na query
 * string — mesmo esquema do `?hottok=` que o webhook da Hotmart já usa.
 * Configure a URL do webhook na Clint como `.../api/clint/webhook?token=SEGREDO`.
 */
export function requireClintWebhookToken(request: Request): Response | null {
  const expected = process.env.CLINT_WEBHOOK_TOKEN;
  if (!expected) {
    console.error(
      "[Clint webhook] REJECTED: CLINT_WEBHOOK_TOKEN não definida no ambiente (fail-closed)",
    );
    return deny(500, "webhook not configured");
  }
  const url = new URL(request.url);
  const got = url.searchParams.get("token") ?? request.headers.get("x-clint-webhook-token") ?? "";
  if (!safeEqual(got, expected)) {
    console.error("[Clint webhook] unauthorized: token mismatch");
    return deny(401, "unauthorized");
  }
  return null;
}
