/**
 * GET /api/conversa-prova?id=<conversation_id>
 * Retorna a conversa completa (prova real). Requer usuário autenticado.
 */
import { createFileRoute } from "@tanstack/react-router";

async function handle(request: Request) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { createClient } = await import("@supabase/supabase-js");
  const auth = createClient(
    process.env["SUPABASE_URL"]!,
    process.env["SUPABASE_PUBLISHABLE_KEY"]!,
    {
      auth: { persistSession: false },
    },
  );
  const { data: userData } = await auth.auth.getUser(token);
  if (!userData?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id obrigatório" }, { status: 400 });

  const { loadConversaProva } = await import("@/lib/conversa-prova.server");
  try {
    return Response.json(await loadConversaProva(id));
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "Erro" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/conversa-prova")({
  server: { handlers: { GET: ({ request }) => handle(request) } },
});
