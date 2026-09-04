import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CASE_OWNER_EMAILS } from "@/lib/auth";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function assertOwner(email: string | null | undefined) {
  const e = (email ?? "").trim().toLowerCase();
  if (!CASE_OWNER_EMAILS.includes(e))
    throw new Error("Sem permissão para acessar os cases de treinamento.");
}

export type CaseCandidate = {
  conversation_id: string;
  seller: string;
  contact_name: string | null;
  score: number | null;
  resumo: string | null;
  pontos_melhoria: string[];
  message_count: number | null;
  last_message_at: string | null;
};

export type TrainingCase = {
  generated_at: string;
  conversation_id: string;
  seller: string;
  titulo: string;
  duracao_min: number;
  contexto: string;
  objetivo_aprendizagem: string[];
  o_que_a_ia_viu: { tema: string; o_que_aconteceu: string; impacto: string; evidencia: string }[];
  abertura: { o_que_foi_feito: string; por_que_nao_funciona: string; modelo_melhor: string };
  objecoes: { objecao: string; resposta_dada: string; resposta_ideal: string; tecnica: string }[];
  trechos: { quem: string; texto: string; comentario_ia: string }[];
  roteiro: {
    bloco: string;
    minutos: number;
    como_conduzir: string;
    perguntas_para_equipe: string[];
  }[];
  roleplay: {
    cenario: string;
    papel_cliente: string;
    objecoes_do_cliente: string[];
    criterios_avaliacao: string[];
  };
  mensagens_modelo: { situacao: string; texto: string }[];
  compromissos: string[];
  indicador_acompanhamento: string;
};

const AI_SOURCES = new Set(["AI_CONVERSATION"]);

function isAutomationBody(b: string) {
  const t = (b ?? "").trim().toLowerCase();
  if (!t || t === "[sem texto]") return true;
  if (t.startsWith("[template:")) return true;
  if (/^\[[a-z_ ]+\]$/.test(t)) return true; // [IMAGE], [AUDIO], etc
  return false;
}

export const listCaseCandidatesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number } = {}) => d)
  .handler(async ({ data, context }): Promise<CaseCandidate[]> => {
    assertOwner((context as any)?.claims?.email);
    const db = await admin();
    const days = Math.max(3, Math.min(365, data.days ?? 60));
    const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

    // 1) Conversas humanas (não-IA) com volume relevante
    const { data: convs, error: convErr } = await db
      .from("coach_conversations")
      .select(
        "id, seller_name, seller_email, contact_name, message_count, last_message_at, is_ai_conversation",
      )
      .gte("last_message_at", since)
      .eq("is_ai_conversation", false)
      .gte("message_count", 10)
      .order("message_count", { ascending: false })
      .limit(120);
    if (convErr) throw new Error(convErr.message);
    const convRows = convs ?? [];
    if (!convRows.length) return [];

    const ids = convRows.map((c: any) => c.id);

    // 2) Só conversas com troca real (humano <-> lead)
    const { data: msgs } = await db
      .from("coach_messages")
      .select("conversation_id, direction, body, clint_source")
      .in("conversation_id", ids)
      .limit(20000);

    const stats = new Map<string, { inb: number; out: number }>();
    for (const m of (msgs ?? []) as any[]) {
      if (AI_SOURCES.has(m.clint_source ?? "")) continue;
      if (isAutomationBody(m.body)) continue;
      const s = stats.get(m.conversation_id) ?? { inb: 0, out: 0 };
      if (m.direction === "inbound") s.inb++;
      else s.out++;
      stats.set(m.conversation_id, s);
    }

    const eligible = ids.filter((id: string) => {
      const s = stats.get(id);
      return !!s && s.inb >= 4 && s.out >= 4;
    });
    if (!eligible.length) return [];

    // 3) Nota da IA (quando existir) para priorizar as piores
    const { data: analyses } = await db
      .from("coach_analyses")
      .select("conversation_id, score_geral, resumo, pontos_melhoria, analyzed_at")
      .in("conversation_id", eligible)
      .eq("status", "ok")
      .order("analyzed_at", { ascending: false })
      // Só a análise mais recente de cada conversa é usada; o teto cobre o caso
      // de haver várias por conversa.
      .limit(eligible.length * 5);
    const byConv = new Map<string, any>();
    for (const a of (analyses ?? []) as any[])
      if (!byConv.has(a.conversation_id)) byConv.set(a.conversation_id, a);

    const convById = new Map<string, any>();
    for (const c of convRows) convById.set((c as any).id, c);

    return eligible
      .map((id: string) => {
        const c = convById.get(id);
        const a = byConv.get(id);
        const s = stats.get(id)!;
        return {
          conversation_id: id,
          seller: (c?.seller_name || c?.seller_email || "—") as string,
          contact_name: c?.contact_name ?? null,
          score: a?.score_geral ?? null,
          resumo: a?.resumo ?? null,
          pontos_melhoria: Array.isArray(a?.pontos_melhoria) ? a.pontos_melhoria.slice(0, 3) : [],
          message_count: s.inb + s.out,
          last_message_at: c?.last_message_at ?? null,
        };
      })
      .sort((x, y) => {
        const sx = x.score ?? 99;
        const sy = y.score ?? 99;
        if (sx !== sy) return sx - sy;
        return (y.message_count ?? 0) - (x.message_count ?? 0);
      })
      .slice(0, 30);
  });

export const generateTrainingCaseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversationId: string; duracao?: number; foco?: string }) => d)
  .handler(async ({ data, context }): Promise<TrainingCase> => {
    assertOwner((context as any)?.claims?.email);
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY não configurada");
    const db = await admin();
    const duracao = Math.max(20, Math.min(60, data.duracao ?? 35));

    const { data: conv, error: cErr } = await db
      .from("coach_conversations")
      .select(
        "id, seller_name, seller_email, contact_name, origin_name, stage, deal_value, first_message_at, last_message_at",
      )
      .eq("id", data.conversationId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!conv) throw new Error("Conversa não encontrada");

    const { data: analysis } = await db
      .from("coach_analyses")
      .select(
        "score_geral, resumo, pontos_fortes, pontos_melhoria, objecoes, oportunidades_perdidas, sugestoes, justificativa_nota",
      )
      .eq("conversation_id", data.conversationId)
      .eq("status", "ok")
      .order("analyzed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: msgs } = await db
      .from("coach_messages")
      .select("sent_at, direction, sender_name, body")
      .eq("conversation_id", data.conversationId)
      .order("sent_at", { ascending: true })
      .limit(200);

    const transcript = (msgs ?? [])
      .map(
        (m: any) =>
          `[${m.direction === "outbound" ? "VENDEDOR" : "CLIENTE"} ${new Date(m.sent_at).toLocaleString("pt-BR")}] ${String(m.body ?? "").slice(0, 600)}`,
      )
      .join("\n");
    if (!transcript.trim()) throw new Error("Conversa sem mensagens para gerar o case");

    const seller = (conv as any).seller_name || (conv as any).seller_email || "Vendedor";

    const sys =
      "Você é uma HEAD COMERCIAL sênior que prepara CASES DE TREINAMENTO em equipe a partir de conversas reais de venda por WhatsApp. " +
      `O case será conduzido ao vivo com o time em ${duracao} minutos. Ele deve ser DETALHADO, prático e baseado APENAS no que está na conversa e na análise fornecidas — nada inventado. ` +
      "Anonimize o cliente (use 'o lead'), mas mantenha o nome do vendedor. Foque em: abertura de conversa, condução/descoberta, tratamento de objeções e tentativa de fechamento — mostrando exatamente o que não ficou bom e como deveria ter sido. " +
      (data.foco ? `Foco pedido pela gestora: ${data.foco}. ` : "") +
      "Responda SOMENTE JSON válido neste schema exato:\n" +
      `{"titulo":"string","contexto":"3-5 frases sobre o lead, produto e momento da conversa",` +
      `"objetivo_aprendizagem":["string"],` +
      `"o_que_a_ia_viu":[{"tema":"string","o_que_aconteceu":"string","impacto":"string","evidencia":"citação curta da conversa"}],` +
      `"abertura":{"o_que_foi_feito":"string","por_que_nao_funciona":"string","modelo_melhor":"mensagem pronta de abertura"},` +
      `"objecoes":[{"objecao":"string","resposta_dada":"string","resposta_ideal":"string","tecnica":"nome da técnica"}],` +
      `"trechos":[{"quem":"vendedor|cliente","texto":"citação real","comentario_ia":"o que ensinar aqui"}],` +
      `"roteiro":[{"bloco":"string","minutos":number,"como_conduzir":"string","perguntas_para_equipe":["string"]}],` +
      `"roleplay":{"cenario":"string","papel_cliente":"string","objecoes_do_cliente":["string"],"criterios_avaliacao":["string"]},` +
      `"mensagens_modelo":[{"situacao":"string","texto":"mensagem pronta para copiar"}],` +
      `"compromissos":["string"],"indicador_acompanhamento":"string"}. ` +
      `A soma dos minutos do roteiro deve dar ${duracao}. Mínimo 4 blocos no roteiro, 4 trechos, 3 objeções, 4 mensagens_modelo. Português do Brasil, tom direto, sem enrolação.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: sys },
          {
            role: "user",
            content:
              `VENDEDOR: ${seller}\nFUNIL: ${(conv as any).origin_name ?? "—"} | ETAPA: ${(conv as any).stage ?? "—"}\n` +
              `ANÁLISE DA IA: ${JSON.stringify(analysis ?? {}, null, 2)}\n\nTRANSCRIÇÃO:\n${transcript.slice(0, 24000)}`,
          },
        ],
      }),
    });
    if (!resp.ok) {
      if (resp.status === 429)
        throw new Error("Limite de uso da IA atingido. Tente novamente em instantes.");
      if (resp.status === 402)
        throw new Error("Créditos de IA esgotados. Adicione créditos no workspace.");
      throw new Error(`Lovable AI ${resp.status}: ${await resp.text().catch(() => "")}`);
    }
    const j = (await resp.json()) as any;
    let p: any = {};
    try {
      p = JSON.parse(j?.choices?.[0]?.message?.content ?? "{}");
    } catch {
      p = {};
    }

    return {
      generated_at: new Date().toISOString(),
      conversation_id: data.conversationId,
      seller,
      titulo: p.titulo ?? `Case de treinamento — ${seller}`,
      duracao_min: duracao,
      contexto: p.contexto ?? "",
      objetivo_aprendizagem: Array.isArray(p.objetivo_aprendizagem)
        ? p.objetivo_aprendizagem.slice(0, 6)
        : [],
      o_que_a_ia_viu: Array.isArray(p.o_que_a_ia_viu) ? p.o_que_a_ia_viu.slice(0, 8) : [],
      abertura: p.abertura ?? { o_que_foi_feito: "", por_que_nao_funciona: "", modelo_melhor: "" },
      objecoes: Array.isArray(p.objecoes) ? p.objecoes.slice(0, 6) : [],
      trechos: Array.isArray(p.trechos) ? p.trechos.slice(0, 8) : [],
      roteiro: Array.isArray(p.roteiro) ? p.roteiro.slice(0, 8) : [],
      roleplay: p.roleplay ?? {
        cenario: "",
        papel_cliente: "",
        objecoes_do_cliente: [],
        criterios_avaliacao: [],
      },
      mensagens_modelo: Array.isArray(p.mensagens_modelo) ? p.mensagens_modelo.slice(0, 8) : [],
      compromissos: Array.isArray(p.compromissos) ? p.compromissos.slice(0, 8) : [],
      indicador_acompanhamento: p.indicador_acompanhamento ?? "",
    };
  });
