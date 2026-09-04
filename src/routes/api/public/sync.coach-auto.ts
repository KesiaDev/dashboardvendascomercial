import { createFileRoute } from "@tanstack/react-router";
import { runCoachV3Sync } from "./sync.coach-v3";
import { syncCcpbxCallsCore, analyzeCallCore } from "@/lib/ccpbx.functions";
import { analyzeConversationCore } from "@/lib/coach.functions";
import { requireApiKey } from "@/lib/api-auth";

// Pipeline automático: sincroniza mensagens (Clint) e ligações (CCPBX)
// e re-analisa o que tem novidade desde a última análise.
async function runAutoPipeline(sinceDays: number, maxAnalyses: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  const out: Record<string, unknown> = { ok: true };

  // 1) Sincroniza conversas/mensagens novas
  try {
    out.conversas = await runCoachV3Sync(sinceDays);
  } catch (e) {
    out.conversas = { error: e instanceof Error ? e.message : String(e) };
  }

  // 2) Sincroniza ligações
  try {
    out.ligacoes = await syncCcpbxCallsCore({ days: Math.min(sinceDays, 7) });
  } catch (e) {
    out.ligacoes = { error: e instanceof Error ? e.message : String(e) };
  }

  // 3) Re-analisa conversas com mensagens novas depois da última análise
  let convAnalisadas = 0;
  try {
    const { data: cfg } = await db
      .from("coach_config")
      .select("auto_analysis")
      .eq("id", 1)
      .maybeSingle();

    if (cfg?.auto_analysis !== false) {
      const { data: convs } = await db
        .from("coach_conversations")
        .select("id,last_message_at,message_count")
        .eq("source", "clint")
        .or("is_ai_conversation.is.null,is_ai_conversation.eq.false")
        .not("last_message_at", "is", null)
        .gt("message_count", 1)
        .order("last_message_at", { ascending: false })
        .limit(200);

      const ids = (convs ?? []).map((c: any) => c.id);
      const analysedMap = new Map<string, string>();
      if (ids.length) {
        for (let i = 0; i < ids.length; i += 100) {
          const { data: an } = await db
            .from("coach_analyses")
            .select("conversation_id,analyzed_at")
            .in("conversation_id", ids.slice(i, i + 100))
            .eq("status", "ok")
            .limit(300);
          for (const a of (an ?? []) as any[]) {
            const prev = analysedMap.get(a.conversation_id);
            if (!prev || new Date(a.analyzed_at) > new Date(prev)) {
              analysedMap.set(a.conversation_id, a.analyzed_at);
            }
          }
        }
      }

      const pendentes = (convs ?? []).filter((c: any) => {
        const at = analysedMap.get(c.id);
        return !at || new Date(at) < new Date(c.last_message_at);
      });

      for (const c of pendentes.slice(0, maxAnalyses)) {
        try {
          const r = await analyzeConversationCore(db, c.id, true, "auto_timer");
          if (r && !(r as any).skipped) convAnalisadas++;
        } catch {}
      }
      out.conversas_pendentes = pendentes.length;
    }
  } catch (e) {
    out.analise_conversas_erro = e instanceof Error ? e.message : String(e);
  }
  out.conversas_analisadas = convAnalisadas;

  // 4) Analisa ligações novas ainda sem análise
  let callsAnalisadas = 0;
  try {
    const { data: calls } = await db
      .from("coach_calls")
      .select("id")
      .is("analyzed_at", null)
      .not("recording_url", "is", null)
      .gte("duration_sec", 30)
      .order("started_at", { ascending: false })
      .limit(maxAnalyses);

    for (const c of (calls ?? []) as any[]) {
      try {
        await analyzeCallCore({ callId: c.id });
        callsAnalisadas++;
      } catch {}
    }
  } catch (e) {
    out.analise_ligacoes_erro = e instanceof Error ? e.message : String(e);
  }
  out.ligacoes_analisadas = callsAnalisadas;

  return out;
}

async function handle(request: Request) {
  // Este é o endpoint mais caro do projeto: dispara até 30 análises por LLM por
  // requisição, na fatura da empresa. Nunca deve ficar aberto.
  const denied = requireApiKey(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const sinceDays = parseInt(url.searchParams.get("sinceDays") ?? "3", 10) || 3;
  const maxAnalyses = Math.min(30, parseInt(url.searchParams.get("max") ?? "8", 10) || 8);
  try {
    return Response.json(await runAutoPipeline(sinceDays, maxAnalyses));
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 200 },
    );
  }
}

export const Route = createFileRoute("/api/public/sync/coach-auto")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
