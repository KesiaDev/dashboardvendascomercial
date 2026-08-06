import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CASE_OWNER_EMAILS } from "@/lib/auth";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function assertOwner(email: string | null | undefined) {
  const e = (email ?? "").trim().toLowerCase();
  if (!CASE_OWNER_EMAILS.includes(e)) throw new Error("Sem permissão para acessar os cases de treinamento.");
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
  roteiro: { bloco: string; minutos: number; como_conduzir: string; perguntas_para_equipe: string[] }[];
  roleplay: { cenario: string; papel_cliente: string; objecoes_do_cliente: string[]; criterios_avaliacao: string[] };
  mensagens_modelo: { situacao: string; texto: string }[];
  compromissos: string[];
  indicador_acompanhamento: string;
};

export const listCaseCandidatesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number } = {}) => d)
  .handler(async ({ data, context }): Promise<CaseCandidate[]> => {
    assertOwner((context as any)?.claims?.email);
    const db = await admin();
    const days = Math.max(3, Math.min(180, data.days ?? 30));
    const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

    const { data: analyses, error } = await db
      .from("coach_analyses")
      .select("conversation_id, score_geral, resumo, pontos_melhoria, analyzed_at")
      .gte("analyzed_at", since)
      .eq("status", "ok")
      .order("score_geral", { ascending: true })
      .limit(40);
    if (error) throw new Error(error.message);
    const rows = analyses ?? [];
    if (!rows.length) return [];

    const ids = rows.map((r: any) => r.conversation_id);
    const { data: convs } = await db
      .from("coach_conversations")
      .select("id, seller_name, seller_email, contact_name, message_count, last_message_at")
      .in("id", ids);
    const byId = new Map<string, any>();
    for (const c of convs ?? []) byId.set((c as any).id, c);

    return rows
      .map((r: any) => {
        const c = byId.get(r.conversation_id);
        return {
          conversation_id: r.conversation_id as string,
          seller: (c?.seller_name || c?.seller_email || "—") as string,
          contact_name: c?.contact_name ?? null,
          score: r.score_geral ?? null,
          resumo: r.resumo ?? null,
          pontos_melhoria: Array.isArray(r.pontos_melhoria) ? r.pontos_melhoria.slice(0, 3) : [],
          message_count: c?.message_count ?? null,
          last_message_at: c?.last_message_at ?? null,
        };
      })
      .filter((r) => (r.message_count ?? 0) >= 4);
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
      .select("id, seller_name, seller_email, contact_name, origin_name, stage, deal_value, first_message_at, last_message_at")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!conv) throw new Error("Conversa não encontrada");

    const { data: analysis } = await db
      .from("coach_analyses")
      .select("score_geral, resumo, pontos_fortes, pontos_melhoria, objecoes, oportunidades_perdidas, sugestoes, justificativa_nota")
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
      .map((m: any) => `[${m.direction === "outbound" ? "VENDEDOR" : "CLIENTE"} ${new Date(m.sent_at).toLocaleString("pt-BR")}] ${String(m.body ?? "").slice(0, 600)}`)
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
      if (resp.status === 429) throw new Error("Limite de uso da IA atingido. Tente novamente em instantes.");
      if (resp.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos no workspace.");
      throw new Error(`Lovable AI ${resp.status}: ${await resp.text().catch(() => "")}`);
    }
    const j = (await resp.json()) as any;
    let p: any = {};
    try { p = JSON.parse(j?.choices?.[0]?.message?.content ?? "{}"); } catch { p = {}; }

    return {
      generated_at: new Date().toISOString(),
      conversation_id: data.conversationId,
      seller,
      titulo: p.titulo ?? `Case de treinamento — ${seller}`,
      duracao_min: duracao,
      contexto: p.contexto ?? "",
      objetivo_aprendizagem: Array.isArray(p.objetivo_aprendizagem) ? p.objetivo_aprendizagem.slice(0, 6) : [],
      o_que_a_ia_viu: Array.isArray(p.o_que_a_ia_viu) ? p.o_que_a_ia_viu.slice(0, 8) : [],
      abertura: p.abertura ?? { o_que_foi_feito: "", por_que_nao_funciona: "", modelo_melhor: "" },
      objecoes: Array.isArray(p.objecoes) ? p.objecoes.slice(0, 6) : [],
      trechos: Array.isArray(p.trechos) ? p.trechos.slice(0, 8) : [],
      roteiro: Array.isArray(p.roteiro) ? p.roteiro.slice(0, 8) : [],
      roleplay: p.roleplay ?? { cenario: "", papel_cliente: "", objecoes_do_cliente: [], criterios_avaliacao: [] },
      mensagens_modelo: Array.isArray(p.mensagens_modelo) ? p.mensagens_modelo.slice(0, 8) : [],
      compromissos: Array.isArray(p.compromissos) ? p.compromissos.slice(0, 8) : [],
      indicador_acompanhamento: p.indicador_acompanhamento ?? "",
    };
  });
