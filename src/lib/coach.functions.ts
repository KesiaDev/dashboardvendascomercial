import { createServerFn } from "@tanstack/react-start";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// ─── Tipos ────────────────────────────────────────────────────────────────
export type CoachConversation = {
  id: string;
  deal_id: string | null;
  seller_email: string | null;
  seller_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  origin_name: string | null;
  stage: string | null;
  deal_value: number | null;
  source: string;
  first_message_at: string | null;
  last_message_at: string | null;
  message_count: number;
  raw_transcript: string | null;
  created_at: string;
  updated_at: string;
};

export type CoachAnalysis = {
  id: string;
  conversation_id: string;
  score_geral: number | null;
  prob_fecho: number | null;
  sentimento: string | null;
  nivel_interesse: string | null;
  tempo_medio_resposta_min: number | null;
  qualidade: number | null;
  clareza: number | null;
  empatia: number | null;
  rapport: number | null;
  descoberta: number | null;
  conducao: number | null;
  tentou_fechar: boolean | null;
  respondeu_todas_duvidas: boolean | null;
  objecoes: any;
  oportunidades_perdidas: any;
  sugestoes: any;
  proxima_acao: string | null;
  sugestao_resposta: string | null;
  resumo: string | null;
  status: string;
  model: string | null;
  analyzed_at: string;
};

export type CoachAlert = {
  id: string;
  deal_id: string | null;
  conversation_id: string | null;
  seller_email: string | null;
  seller_name: string | null;
  type: string;
  severity: string;
  message: string;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
};

// ─── Parser de transcrição colada ─────────────────────────────────────────
// Aceita formatos comuns de export WhatsApp:
//   [12/07/2026, 14:32] Vendedor: mensagem
//   12/07/2026 14:32 - Vendedor: mensagem
//   Vendedor (14:32): mensagem
function parseTranscript(text: string, sellerName?: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const msgs: { sent_at: string; sender_name: string; body: string; direction: "inbound" | "outbound" }[] = [];
  const sellerNorm = (sellerName ?? "").toLowerCase().trim();

  const patterns = [
    /^\[?(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*[-–]?\s*([^:]+):\s*(.+)$/,
    /^(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\s+(\d{1,2}:\d{2})\s*[-–]\s*([^:]+):\s*(.+)$/,
  ];

  let currentDate = new Date();
  for (const line of lines) {
    let matched = false;
    for (const p of patterns) {
      const m = line.match(p);
      if (m) {
        const [, dateStr, timeStr, sender, body] = m;
        const [dd, mm, yy] = dateStr.split(/[\/-]/).map(Number);
        const year = yy < 100 ? 2000 + yy : yy;
        const [hh, mi] = timeStr.split(":").map(Number);
        const dt = new Date(year, (mm ?? 1) - 1, dd ?? 1, hh ?? 0, mi ?? 0);
        currentDate = dt;
        const senderClean = sender.trim();
        const isSeller = sellerNorm && senderClean.toLowerCase().includes(sellerNorm);
        msgs.push({
          sent_at: dt.toISOString(),
          sender_name: senderClean,
          body: body.trim(),
          direction: isSeller ? "outbound" : "inbound",
        });
        matched = true;
        break;
      }
    }
    if (!matched && msgs.length > 0) {
      // linha de continuação da última mensagem
      msgs[msgs.length - 1].body += "\n" + line;
    } else if (!matched) {
      // sem cabeçalho: trata cada linha como mensagem separada
      msgs.push({
        sent_at: currentDate.toISOString(),
        sender_name: "—",
        body: line,
        direction: "inbound",
      });
    }
  }
  return msgs;
}

function avgResponseTimeMin(msgs: { sent_at: string; direction: string }[]): number | null {
  let sum = 0;
  let n = 0;
  for (let i = 1; i < msgs.length; i++) {
    if (msgs[i].direction === "outbound" && msgs[i - 1].direction === "inbound") {
      const d = new Date(msgs[i].sent_at).getTime() - new Date(msgs[i - 1].sent_at).getTime();
      if (d > 0 && d < 1000 * 60 * 60 * 48) {
        sum += d / 60000;
        n++;
      }
    }
  }
  return n > 0 ? Math.round(sum / n) : null;
}

// ─── Upload / criar conversa manual ───────────────────────────────────────
export const uploadConversationFn = createServerFn({ method: "POST" })
  .inputValidator((d: {
    dealId?: string;
    sellerName?: string;
    sellerEmail?: string;
    contactName?: string;
    contactEmail?: string;
    originName?: string;
    stage?: string;
    dealValue?: number;
    transcript: string;
  }) => d)
  .handler(async ({ data }) => {
    const db = await admin();
    const msgs = parseTranscript(data.transcript, data.sellerName);
    const firstAt = msgs[0]?.sent_at ?? null;
    const lastAt = msgs[msgs.length - 1]?.sent_at ?? null;

    const { data: conv, error } = await db
      .from("coach_conversations")
      .insert({
        deal_id: data.dealId ?? null,
        seller_email: data.sellerEmail ?? null,
        seller_name: data.sellerName ?? null,
        contact_name: data.contactName ?? null,
        contact_email: data.contactEmail ?? null,
        origin_name: data.originName ?? null,
        stage: data.stage ?? null,
        deal_value: data.dealValue ?? null,
        source: "manual_upload",
        first_message_at: firstAt,
        last_message_at: lastAt,
        message_count: msgs.length,
        raw_transcript: data.transcript,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    if (msgs.length) {
      const rows = msgs.map((m) => ({ ...m, conversation_id: conv.id }));
      const { error: e2 } = await db.from("coach_messages").insert(rows);
      if (e2) throw new Error(e2.message);
    }

    return { id: conv.id, message_count: msgs.length };
  });

// ─── Análise IA via Lovable AI Gateway ────────────────────────────────────
const ANALYSIS_SCHEMA_HINT = `Devolve APENAS JSON no formato:
{
  "score_geral": 0-10,
  "prob_fecho": 0-100,
  "sentimento": "positivo"|"neutro"|"negativo",
  "nivel_interesse": "alto"|"medio"|"baixo",
  "qualidade": 0-10,
  "clareza": 0-10,
  "empatia": 0-10,
  "rapport": 0-10,
  "descoberta": 0-10,
  "conducao": 0-10,
  "tentou_fechar": true|false,
  "respondeu_todas_duvidas": true|false,
  "objecoes": ["..."],
  "oportunidades_perdidas": ["..."],
  "sugestoes": ["..."],
  "proxima_acao": "frase curta",
  "sugestao_resposta": "texto de mensagem pronta pro vendedor mandar agora",
  "resumo": "2-3 frases interpretativas — não repete os números"
}`;

export const analyzeConversationFn = createServerFn({ method: "POST" })
  .inputValidator((d: { conversationId: string; force?: boolean }) => d)
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente");
    const db = await admin();

    const { data: conv, error: ce } = await db
      .from("coach_conversations")
      .select("*")
      .eq("id", data.conversationId)
      .single();
    if (ce || !conv) throw new Error(ce?.message ?? "Conversa não encontrada");

    const { data: msgs, error: me } = await db
      .from("coach_messages")
      .select("sent_at,direction,sender_name,body")
      .eq("conversation_id", data.conversationId)
      .order("sent_at", { ascending: true });
    if (me) throw new Error(me.message);
    const messages = msgs ?? [];

    // Reanalisa só se houver msgs novas ou force=true
    if (!data.force) {
      const { data: prev } = await db
        .from("coach_analyses")
        .select("analyzed_at")
        .eq("conversation_id", data.conversationId)
        .maybeSingle();
      if (prev?.analyzed_at && conv.last_message_at && new Date(prev.analyzed_at) > new Date(conv.last_message_at)) {
        return { skipped: true, reason: "up_to_date" };
      }
    }

    if (messages.length < 3) {
      await db.from("coach_analyses").upsert(
        { conversation_id: data.conversationId, status: "insufficient_data", model: null, resumo: "Conversa muito curta para análise significativa (< 3 mensagens)." },
        { onConflict: "conversation_id" },
      );
      return { status: "insufficient_data" };
    }

    const avgResp = avgResponseTimeMin(messages);
    const transcript = messages
      .map((m) => `[${new Date(m.sent_at).toISOString().slice(0, 16).replace("T", " ")}] ${m.direction === "outbound" ? "VENDEDOR" : "CLIENTE"} (${m.sender_name ?? "—"}): ${m.body}`)
      .join("\n");

    const context = {
      vendedor: conv.seller_name,
      cliente: conv.contact_name,
      origem: conv.origin_name,
      etapa: conv.stage,
      valor_negocio: conv.deal_value,
      tempo_medio_resposta_vendedor_min: avgResp,
    };

    const model = "google/gemini-2.5-flash";
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Você é o Coach Comercial da LLMídia. Analisa a conversa entre um VENDEDOR e um CLIENTE e devolve avaliação técnica em JSON.\n\n" +
              "REGRAS:\n" +
              "- Nunca invente dados. Se algo não aparece na conversa, dê nota baixa e explique nas sugestões, não chute.\n" +
              "- Notas de 0 a 10, inteiros. score_geral pode ter uma casa decimal.\n" +
              "- prob_fecho é % (0-100) baseada nos sinais reais de compra.\n" +
              "- objecoes: só as que o cliente REALMENTE levantou.\n" +
              "- proxima_acao: uma frase acionável (ex: 'Ligar ainda hoje e apresentar o plano trimestral').\n" +
              "- sugestao_resposta: mensagem pronta em PT-PT/PT-BR, no tom do vendedor, pra ele mandar agora.\n" +
              "- resumo INTERPRETA. Não diga 'a conversa teve 20 mensagens'; diga 'o cliente demonstrou interesse claro mas o vendedor não avançou para o fecho'.\n\n" +
              ANALYSIS_SCHEMA_HINT,
          },
          {
            role: "user",
            content: `CONTEXTO:\n${JSON.stringify(context, null, 2)}\n\nTRANSCRIÇÃO:\n${transcript}`,
          },
        ],
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Lovable AI ${resp.status}: ${body}`);
    }
    const json = (await resp.json()) as any;
    const raw = json?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    }

    const row = {
      conversation_id: data.conversationId,
      score_geral: parsed.score_geral ?? null,
      prob_fecho: parsed.prob_fecho ?? null,
      sentimento: parsed.sentimento ?? null,
      nivel_interesse: parsed.nivel_interesse ?? null,
      tempo_medio_resposta_min: avgResp,
      qualidade: parsed.qualidade ?? null,
      clareza: parsed.clareza ?? null,
      empatia: parsed.empatia ?? null,
      rapport: parsed.rapport ?? null,
      descoberta: parsed.descoberta ?? null,
      conducao: parsed.conducao ?? null,
      tentou_fechar: parsed.tentou_fechar ?? null,
      respondeu_todas_duvidas: parsed.respondeu_todas_duvidas ?? null,
      objecoes: parsed.objecoes ?? [],
      oportunidades_perdidas: parsed.oportunidades_perdidas ?? [],
      sugestoes: parsed.sugestoes ?? [],
      proxima_acao: parsed.proxima_acao ?? null,
      sugestao_resposta: parsed.sugestao_resposta ?? null,
      resumo: parsed.resumo ?? null,
      status: "ok",
      model,
      analyzed_at: new Date().toISOString(),
    };

    const { error: ue } = await db.from("coach_analyses").upsert(row, { onConflict: "conversation_id" });
    if (ue) throw new Error(ue.message);

    // Dispara alertas derivados desta análise
    await evaluateAlertsForConversation(db, conv, row);

    return { status: "ok", score_geral: row.score_geral };
  });

async function evaluateAlertsForConversation(db: any, conv: CoachConversation, a: any) {
  const { data: cfg } = await db.from("coach_config").select("*").eq("id", 1).maybeSingle();
  const notaMin = cfg?.nota_minima ?? 6;
  const alerts: any[] = [];

  if (a.score_geral !== null && a.score_geral < notaMin) {
    alerts.push({
      deal_id: conv.deal_id,
      conversation_id: conv.id,
      seller_email: conv.seller_email,
      seller_name: conv.seller_name,
      type: "nota_baixa",
      severity: a.score_geral < notaMin - 2 ? "high" : "medium",
      message: `Nota geral ${a.score_geral} (mín. ${notaMin}) — ${a.proxima_acao ?? "revisar atendimento"}.`,
    });
  }
  if (a.prob_fecho !== null && a.prob_fecho >= 70 && a.tentou_fechar === false) {
    alerts.push({
      deal_id: conv.deal_id,
      conversation_id: conv.id,
      seller_email: conv.seller_email,
      seller_name: conv.seller_name,
      type: "intencao_compra",
      severity: "high",
      message: `Cliente com ${a.prob_fecho}% de probabilidade de fecho e vendedor ainda não tentou fechar.`,
    });
  }
  if (Array.isArray(a.oportunidades_perdidas) && a.oportunidades_perdidas.length >= 2) {
    alerts.push({
      deal_id: conv.deal_id,
      conversation_id: conv.id,
      seller_email: conv.seller_email,
      seller_name: conv.seller_name,
      type: "risco_perda",
      severity: "medium",
      message: `${a.oportunidades_perdidas.length} oportunidades perdidas identificadas.`,
    });
  }
  if (alerts.length) await db.from("coach_alerts").insert(alerts);
}

// ─── Alertas de tempo (sem resposta / parada) ────────────────────────────
export const runAlertsScanFn = createServerFn({ method: "POST" }).handler(async () => {
  const db = await admin();
  const { data: cfg } = await db.from("coach_config").select("*").eq("id", 1).maybeSingle();
  const horasLead = cfg?.horas_lead_quente ?? 4;
  const diasParado = cfg?.dias_sem_resposta ?? 3;
  const now = Date.now();

  const { data: convs } = await db
    .from("coach_conversations")
    .select("id,deal_id,seller_email,seller_name,last_message_at")
    .not("last_message_at", "is", null)
    .limit(2000);

  const alerts: any[] = [];
  for (const c of convs ?? []) {
    const lastMs = new Date(c.last_message_at!).getTime();
    const hours = (now - lastMs) / (1000 * 60 * 60);
    if (hours >= horasLead && hours < 24) {
      alerts.push({
        deal_id: c.deal_id, conversation_id: c.id, seller_email: c.seller_email, seller_name: c.seller_name,
        type: "lead_quente_sem_resposta", severity: "high",
        message: `Sem resposta há ${Math.round(hours)}h (mín. ${horasLead}h).`,
      });
    } else if (hours >= diasParado * 24) {
      alerts.push({
        deal_id: c.deal_id, conversation_id: c.id, seller_email: c.seller_email, seller_name: c.seller_name,
        type: "conversa_parada", severity: "medium",
        message: `Conversa parada há ${Math.round(hours / 24)} dias.`,
      });
    }
  }

  if (alerts.length) {
    // dedup simples: não recria se já existe alerta aberto do mesmo tipo pra mesma conversa
    const { data: existing } = await db
      .from("coach_alerts")
      .select("conversation_id,type")
      .eq("resolved", false)
      .in("conversation_id", alerts.map((a) => a.conversation_id));
    const seen = new Set((existing ?? []).map((e: any) => `${e.conversation_id}|${e.type}`));
    const fresh = alerts.filter((a) => !seen.has(`${a.conversation_id}|${a.type}`));
    if (fresh.length) await db.from("coach_alerts").insert(fresh);
    return { created: fresh.length };
  }
  return { created: 0 };
});

// ─── Listagens ────────────────────────────────────────────────────────────
export const listCoachConversationsFn = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data: convs, error } = await db
    .from("coach_conversations")
    .select("*")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(500);
  if (error) throw new Error(error.message);
  const ids = (convs ?? []).map((c) => c.id);
  const { data: analyses } = ids.length
    ? await db.from("coach_analyses").select("*").in("conversation_id", ids)
    : { data: [] as CoachAnalysis[] };
  const byConv = new Map<string, CoachAnalysis>();
  for (const a of (analyses ?? []) as CoachAnalysis[]) byConv.set(a.conversation_id, a);
  return (convs ?? []).map((c) => ({ ...c, analysis: byConv.get(c.id) ?? null }));
});

export const getCoachConversationFn = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const db = await admin();
    const [{ data: conv }, { data: msgs }, { data: analysis }] = await Promise.all([
      db.from("coach_conversations").select("*").eq("id", data.id).single(),
      db.from("coach_messages").select("*").eq("conversation_id", data.id).order("sent_at", { ascending: true }),
      db.from("coach_analyses").select("*").eq("conversation_id", data.id).maybeSingle(),
    ]);
    return { conversation: conv, messages: msgs ?? [], analysis: analysis ?? null };
  });

export const deleteCoachConversationFn = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const db = await admin();
    const { error } = await db.from("coach_conversations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listCoachAlertsFn = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data, error } = await db
    .from("coach_alerts")
    .select("*")
    .order("resolved", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as CoachAlert[];
});

export const resolveCoachAlertFn = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; resolved: boolean }) => d)
  .handler(async ({ data }) => {
    const db = await admin();
    const { error } = await db
      .from("coach_alerts")
      .update({ resolved: data.resolved, resolved_at: data.resolved ? new Date().toISOString() : null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getCoachConfigFn = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data } = await db.from("coach_config").select("*").eq("id", 1).maybeSingle();
  return data ?? { id: 1, nota_minima: 6, horas_lead_quente: 4, dias_sem_resposta: 3 };
});

export const saveCoachConfigFn = createServerFn({ method: "POST" })
  .inputValidator((d: { nota_minima: number; horas_lead_quente: number; dias_sem_resposta: number }) => d)
  .handler(async ({ data }) => {
    const db = await admin();
    const { error } = await db
      .from("coach_config")
      .upsert({ id: 1, ...data, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
