import { createServerFn } from "@tanstack/react-start";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// ============ Clint API message sync ============
const CLINT_BASE = "https://api.clint.digital/v1";

async function clintFetch(path: string, token: string) {
  const url = path.startsWith("http") ? path : `${CLINT_BASE}${path}`;
  let r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (r.status === 401) {
    r = await fetch(url, { headers: { Authorization: `Token ${token}`, Accept: "application/json" } });
  }
  return r;
}

async function tryEndpointsWithContact(token: string, dealId: string | null, phone: string | null, contactId: string | null) {
  const attempts: string[] = [];
  const errors: Array<{ url: string; status: number; body?: string }> = [];

  const tryUrl = async (path: string): Promise<{ ok: true; data: any; url: string } | null> => {
    attempts.push(path);
    const r = await clintFetch(path, token);
    if (r.ok) {
      const data = await r.json().catch(() => null);
      return { ok: true, data, url: path };
    }
    const body = await r.text().catch(() => "");
    errors.push({ url: path, status: r.status, body: body.slice(0, 200) });
    return null;
  };

  if (dealId) {
    const r1 = await tryUrl(`/chats?deal_id=${encodeURIComponent(dealId)}`);
    if (r1) return { ...r1, attempts, errors };
    const r2 = await tryUrl(`/deals/${encodeURIComponent(dealId)}/chats`);
    if (r2) return { ...r2, attempts, errors };
    const r3 = await tryUrl(`/deals/${encodeURIComponent(dealId)}/messages`);
    if (r3) return { ...r3, attempts, errors };
  }
  if (phone) {
    const cleanPhone = phone.replace(/\D/g, "");
    const rc = await clintFetch(`/contacts?phone=${encodeURIComponent(cleanPhone)}`, token);
    attempts.push(`/contacts?phone=${cleanPhone}`);
    if (rc.ok) {
      const cj: any = await rc.json().catch(() => null);
      const contactId = cj?.data?.[0]?.id ?? cj?.[0]?.id ?? cj?.results?.[0]?.id ?? cj?.id;
      if (contactId) {
        const r4 = await tryUrl(`/contacts/${contactId}/chats`);
        if (r4) return { ...r4, attempts, errors };
        const r5 = await tryUrl(`/contacts/${contactId}/messages`);
        if (r5) return { ...r5, attempts, errors };
      }
    } else {
      errors.push({ url: `/contacts?phone=${cleanPhone}`, status: rc.status });
    }
  }
  return { ok: false as const, attempts, errors };
}

function extractMessages(payload: any): any[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.messages)) return payload.messages;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.chats)) {
    return payload.chats.flatMap((c: any) => c.messages ?? []);
  }
  if (Array.isArray(payload.data?.messages)) return payload.data.messages;
  return [];
}

function normalizeMessage(m: any) {
  const id = String(m.id ?? m.message_id ?? m.uuid ?? m._id ?? "");
  const content = m.content ?? m.body ?? m.text ?? m.message ?? m.caption ?? "";
  const sentAt = m.sent_at ?? m.created_at ?? m.timestamp ?? m.date ?? m.createdAt ?? null;
  const dirRaw = (m.direction ?? m.type ?? m.from ?? "").toString().toLowerCase();
  const isOutgoing =
    dirRaw.includes("out") || dirRaw === "seller" || dirRaw === "agent" || dirRaw === "user" ||
    m.fromMe === true || m.from_me === true || m.is_from_me === true || m.outgoing === true;
  return {
    clint_message_id: id || null,
    body: String(content ?? ""),
    sent_at: sentAt ? new Date(sentAt).toISOString() : new Date().toISOString(),
    direction: isOutgoing ? "outbound" : "inbound",
    author: isOutgoing ? "vendedor" : "cliente",
    sender_name: m.sender_name ?? m.from_name ?? m.author_name ?? null,
  };
}

export const syncClintMessagesFn = createServerFn({ method: "POST" })
  .inputValidator((d: { conversationId: string }) => d)
  .handler(async ({ data }) => {
    const token = process.env.CLINT_API_TOKEN;
    if (!token) throw new Error("CLINT_API_TOKEN ausente");
    const db = await admin();

    const { data: conv, error: ce } = await db
      .from("coach_conversations")
      .select("id, deal_id, contact_email, clint_contact_id")
      .eq("id", data.conversationId)
      .single();
    if (ce || !conv) throw new Error(ce?.message ?? "Conversa não encontrada");

    // Look up a phone number from any linked message
    const { data: phoneRow } = await db
      .from("coach_messages")
      .select("lead_phone")
      .eq("conversation_id", conv.id)
      .not("lead_phone", "is", null)
      .limit(1)
      .maybeSingle();
    const phone = (phoneRow as any)?.lead_phone ?? null;

    const result = await tryEndpointsWithContact(
      token,
      conv.deal_id,
      phone,
      (conv as any).clint_contact_id ?? null,
    );
    if (!result.ok) {
      throw new Error(
        `Nenhum endpoint Clint retornou dados. Tentativas: ${result.attempts.join(", ")}. ` +
        `Erros: ${JSON.stringify(result.errors)}`
      );
    }

    const rawMessages = extractMessages(result.data);
    const rawSample = rawMessages[0] ?? result.data;

    if (!rawMessages.length) {
      return { synced: 0, rawSample, endpoint: result.url, attempts: result.attempts };
    }

    // dedupe against existing clint_message_id
    const { data: existing } = await db
      .from("coach_messages")
      .select("clint_message_id")
      .eq("conversation_id", conv.id)
      .not("clint_message_id", "is", null);
    const seen = new Set((existing ?? []).map((r: any) => r.clint_message_id));

    const rows = rawMessages
      .map(normalizeMessage)
      .filter((m) => m.clint_message_id && !seen.has(m.clint_message_id))
      .map((m) => ({ ...m, conversation_id: conv.id }));

    if (rows.length) {
      const { error: ie } = await db.from("coach_messages").insert(rows);
      if (ie) throw new Error(`Insert falhou: ${ie.message}. Sample: ${JSON.stringify(rawSample)}`);
    }

    // Update aggregate on conversation
    const { data: agg } = await db
      .from("coach_messages")
      .select("sent_at")
      .eq("conversation_id", conv.id)
      .order("sent_at", { ascending: false });
    const count = agg?.length ?? 0;
    const lastAt = agg?.[0]?.sent_at ?? null;
    const firstAt = agg?.[agg.length - 1]?.sent_at ?? null;
    await db.from("coach_conversations")
      .update({ message_count: count, last_message_at: lastAt, first_message_at: firstAt })
      .eq("id", conv.id);

    return { synced: rows.length, total: count, rawSample, endpoint: result.url, attempts: result.attempts };
  });

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
  justificativa_nota: string | null;
  pontos_fortes: any;
  pontos_melhoria: any;
  prompt_version: string;
  triggered_by: string;
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
  state: "aberto" | "visto" | "resolvido";
  created_at: string;
};

export type WeeklyStats = {
  seller_name: string | null;
  seller_email: string | null;
  week_start: string;
  convs_analyzed: number;
  avg_score: number | null;
  avg_resp_min: number | null;
  total_fechamentos: number;
  pct_fechamento: number | null;
};

export type CoachConfig = {
  id: number;
  nota_minima: number;
  horas_lead_quente: number;
  dias_sem_resposta: number;
  auto_analysis: boolean;
  analysis_interval_hours: number;
  seller_phones: Array<{ name: string; phone: string }>;
};

function parseTranscript(text: string, sellerName?: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const msgs: { sent_at: string; sender_name: string; body: string; direction: "inbound" | "outbound"; author: "cliente" | "vendedor" }[] = [];
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
        const isSeller = sellerNorm ? senderClean.toLowerCase().includes(sellerNorm) : false;
        const direction: "inbound" | "outbound" = isSeller ? "outbound" : "inbound";
        msgs.push({ sent_at: dt.toISOString(), sender_name: senderClean, body: body.trim(), direction, author: isSeller ? "vendedor" : "cliente" });
        matched = true;
        break;
      }
    }
    if (!matched && msgs.length > 0) {
      msgs[msgs.length - 1].body += "\n" + line;
    } else if (!matched) {
      msgs.push({ sent_at: currentDate.toISOString(), sender_name: "—", body: line, direction: "inbound", author: "cliente" });
    }
  }
  return msgs;
}

function avgResponseTimeMin(msgs: { sent_at: string; direction: string }[]): number | null {
  let sum = 0; let n = 0;
  for (let i = 1; i < msgs.length; i++) {
    if (msgs[i].direction === "outbound" && msgs[i - 1].direction === "inbound") {
      const d = new Date(msgs[i].sent_at).getTime() - new Date(msgs[i - 1].sent_at).getTime();
      if (d > 0 && d < 1000 * 60 * 60 * 48) { sum += d / 60000; n++; }
    }
  }
  return n > 0 ? Math.round(sum / n) : null;
}

export const uploadConversationFn = createServerFn({ method: "POST" })
  .inputValidator((d: {
    dealId?: string; sellerName?: string; sellerEmail?: string; contactName?: string;
    contactEmail?: string; originName?: string; stage?: string; dealValue?: number; transcript: string;
  }) => d)
  .handler(async ({ data }) => {
    const db = await admin();
    const msgs = parseTranscript(data.transcript, data.sellerName);
    const firstAt = msgs[0]?.sent_at ?? null;
    const lastAt = msgs[msgs.length - 1]?.sent_at ?? null;

    const { data: conv, error } = await db.from("coach_conversations").insert({
      deal_id: data.dealId ?? null, seller_email: data.sellerEmail ?? null,
      seller_name: data.sellerName ?? null, contact_name: data.contactName ?? null,
      contact_email: data.contactEmail ?? null, origin_name: data.originName ?? null,
      stage: data.stage ?? null, deal_value: data.dealValue ?? null,
      source: "manual_upload", first_message_at: firstAt, last_message_at: lastAt,
      message_count: msgs.length, raw_transcript: data.transcript,
    }).select().single();
    if (error) throw new Error(error.message);

    if (msgs.length) {
      const rows = msgs.map((m) => ({ ...m, conversation_id: conv.id }));
      const { error: e2 } = await db.from("coach_messages").insert(rows);
      if (e2) throw new Error(e2.message);
    }
    return { id: conv.id, message_count: msgs.length };
  });

const PROMPT_VERSION = "v2";

const ANALYSIS_SCHEMA_V2 = `Devolve APENAS JSON no formato:
{
  "nota": 0-10 (número, pode ter .5),
  "justificativa_nota": "frase curta explicando a nota",
  "tentativa_fechamento": true|false,
  "objecoes": [] ou lista com zero ou mais dos valores: "preço","prazo","concorrência","confiança","timing","outro",
  "pontos_fortes": ["frase curta", ...] (máx 4),
  "pontos_melhoria": ["frase curta", ...] (máx 4),
  "resumo": "máximo 3 frases interpretativas — interpreta padrões, não repete números"
}`;

export async function analyzeConversationCore(
  db: any,
  conversationId: string,
  force = false,
  triggeredBy: "manual" | "auto_timer" | "stage_change" | "upload" = "manual",
) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY ausente");

  const { data: conv, error: ce } = await db.from("coach_conversations").select("*").eq("id", conversationId).single();
  if (ce || !conv) throw new Error(ce?.message ?? "Conversa não encontrada");

  const { data: msgs, error: me } = await db.from("coach_messages")
    .select("sent_at,direction,author,sender_name,body")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: true });
  if (me) throw new Error(me.message);
  const messages = msgs ?? [];

  if (!force) {
    const { data: prev } = await db.from("coach_analyses")
      .select("analyzed_at, prompt_version").eq("conversation_id", conversationId).maybeSingle();
    if (prev?.analyzed_at && conv.last_message_at &&
        new Date(prev.analyzed_at) > new Date(conv.last_message_at) &&
        prev.prompt_version === PROMPT_VERSION) {
      return { skipped: true, reason: "up_to_date" };
    }
  }

  if (messages.length < 3) {
    await db.from("coach_analyses").upsert(
      { conversation_id: conversationId, status: "insufficient_data", prompt_version: PROMPT_VERSION,
        triggered_by: triggeredBy, model: null, resumo: "Conversa muito curta para análise significativa (< 3 mensagens)." },
      { onConflict: "conversation_id" },
    );
    return { status: "insufficient_data" };
  }

  const avgResp = avgResponseTimeMin(messages);
  const transcript = messages.map((m: any) => {
    const role = m.author === "vendedor" || m.direction === "outbound" ? "Vendedor" : "Cliente";
    const ts = new Date(m.sent_at).toISOString().slice(0, 16).replace("T", " ");
    return `[${ts}] ${role} (${m.sender_name ?? "—"}): ${m.body}`;
  }).join("\n");

  const context = {
    vendedor: conv.seller_name, cliente: conv.contact_name, origem: conv.origin_name,
    etapa: conv.stage, valor_negocio: conv.deal_value,
    tempo_medio_resposta_vendedor_min: avgResp, total_mensagens: messages.length,
  };

  const model = "google/gemini-2.5-flash";
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Você é o Coach Comercial da LLMídia. Analisa a conversa entre um VENDEDOR e um CLIENTE e devolve avaliação técnica em JSON.\n\n" +
            "REGRAS:\n- Nunca invente dados. Se algo não aparece, reflita nos pontos_melhoria, não chute.\n" +
            "- nota de 0 a 10 (uma casa decimal). Seja rigoroso: 10 é conversão perfeita.\n" +
            "- tentativa_fechamento: true se o vendedor pediu explicitamente pela venda/reunião/proposta.\n" +
            "- objecoes: apenas categorias que aparecem de facto na conversa.\n" +
            "- pontos_fortes e pontos_melhoria: frases curtas e accionáveis, não genéricas.\n" +
            "- resumo: interpreta padrões de comportamento em 3 frases máx.\n\n" +
            ANALYSIS_SCHEMA_V2,
        },
        { role: "user", content: `CONTEXTO:\n${JSON.stringify(context, null, 2)}\n\nTRANSCRIÇÃO:\n${transcript}` },
      ],
    }),
  });

  if (!resp.ok) { const b = await resp.text(); throw new Error(`Lovable AI ${resp.status}: ${b}`); }
  const json = (await resp.json()) as any;
  const raw = json?.choices?.[0]?.message?.content ?? "{}";
  let parsed: any = {};
  try { parsed = JSON.parse(raw); } catch { const m = raw.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); }

  const row = {
    conversation_id: conversationId,
    score_geral: parsed.nota ?? null,
    justificativa_nota: parsed.justificativa_nota ?? null,
    tentou_fechar: parsed.tentativa_fechamento ?? null,
    objecoes: Array.isArray(parsed.objecoes) ? parsed.objecoes : [],
    pontos_fortes: Array.isArray(parsed.pontos_fortes) ? parsed.pontos_fortes : [],
    pontos_melhoria: Array.isArray(parsed.pontos_melhoria) ? parsed.pontos_melhoria : [],
    resumo: parsed.resumo ?? null,
    tempo_medio_resposta_min: avgResp,
    prob_fecho: null, sentimento: null, nivel_interesse: null,
    qualidade: null, clareza: null, empatia: null, rapport: null, descoberta: null, conducao: null,
    respondeu_todas_duvidas: null, oportunidades_perdidas: [], sugestoes: [],
    proxima_acao: null, sugestao_resposta: null,
    prompt_version: PROMPT_VERSION, triggered_by: triggeredBy,
    status: "ok", model, analyzed_at: new Date().toISOString(),
  };

  const { error: ue } = await db.from("coach_analyses").upsert(row, { onConflict: "conversation_id" });
  if (ue) throw new Error(ue.message);

  await evaluateAlertsForConversation(db, conv, row);
  return { status: "ok", score_geral: row.score_geral };
}

export const analyzeConversationFn = createServerFn({ method: "POST" })
  .inputValidator((d: { conversationId: string; force?: boolean }) => d)
  .handler(async ({ data }) => {
    const db = await admin();
    return analyzeConversationCore(db, data.conversationId, data.force ?? false, "manual");
  });

async function evaluateAlertsForConversation(db: any, conv: CoachConversation, a: any) {
  const { data: cfg } = await db.from("coach_config").select("*").eq("id", 1).maybeSingle();
  const notaMin = cfg?.nota_minima ?? 6;
  const alerts: any[] = [];

  if (a.score_geral !== null && a.score_geral < notaMin) {
    alerts.push({
      deal_id: conv.deal_id, conversation_id: conv.id,
      seller_email: conv.seller_email, seller_name: conv.seller_name,
      type: "nota_baixa", severity: a.score_geral < notaMin - 2 ? "high" : "medium",
      message: `Nota geral ${a.score_geral} (mín. ${notaMin}) — ${a.justificativa_nota ?? "revisar atendimento"}.`,
      state: "aberto",
    });
  }
  if (a.score_geral !== null && a.score_geral >= 7 && a.tentou_fechar === false &&
      Array.isArray(a.pontos_melhoria) && a.pontos_melhoria.length > 0) {
    alerts.push({
      deal_id: conv.deal_id, conversation_id: conv.id,
      seller_email: conv.seller_email, seller_name: conv.seller_name,
      type: "intencao_compra", severity: "high",
      message: `Conversa com nota ${a.score_geral} mas sem tentativa de fecho.`,
      state: "aberto",
    });
  }

  if (!alerts.length) return;
  const { data: existing } = await db.from("coach_alerts")
    .select("conversation_id,type").eq("conversation_id", conv.id).neq("state", "resolvido");
  const seen = new Set((existing ?? []).map((e: any) => `${e.conversation_id}|${e.type}`));
  const fresh = alerts.filter((al) => !seen.has(`${al.conversation_id}|${al.type}`));
  if (fresh.length) await db.from("coach_alerts").insert(fresh);
}

export const runAutoAnalysisFn = createServerFn({ method: "POST" }).handler(async () => {
  const db = await admin();
  const { data: cfg } = await db.from("coach_config")
    .select("auto_analysis, analysis_interval_hours").eq("id", 1).maybeSingle();

  if (cfg?.auto_analysis === false) return { skipped: true, reason: "disabled" };

  const intervalHours = cfg?.analysis_interval_hours ?? 1;
  const cutoff = new Date(Date.now() - intervalHours * 60 * 60 * 1000).toISOString();

  const { data: convs } = await db.from("coach_conversations")
    .select("id, last_message_at").eq("source", "clint")
    .not("last_message_at", "is", null).lt("last_message_at", cutoff)
    .order("last_message_at", { ascending: false }).limit(10);

  if (!convs?.length) return { analyzed: 0 };

  const ids = convs.map((c: any) => c.id);
  const { data: analyses } = await db.from("coach_analyses")
    .select("conversation_id, analyzed_at, prompt_version").in("conversation_id", ids).eq("status", "ok");

  const analysedMap = new Map((analyses ?? []).map((a: any) => [a.conversation_id, { analyzedAt: a.analyzed_at, version: a.prompt_version }]));

  const needsAnalysis = convs.filter((c: any) => {
    const entry = analysedMap.get(c.id);
    if (!entry) return true;
    return entry.version !== PROMPT_VERSION || new Date(entry.analyzedAt) < new Date(c.last_message_at);
  });

  let analyzed = 0;
  for (const c of needsAnalysis) {
    try {
      const result = await analyzeConversationCore(db, c.id, false, "auto_timer");
      if (result && !(result as any).skipped) analyzed++;
    } catch {}
  }
  return { analyzed };
});

export const runAlertsScanFn = createServerFn({ method: "POST" }).handler(async () => {
  const db = await admin();
  const { data: cfg } = await db.from("coach_config").select("*").eq("id", 1).maybeSingle();
  const horasLead = cfg?.horas_lead_quente ?? 4;
  const diasParado = cfg?.dias_sem_resposta ?? 3;
  const now = Date.now();

  const { data: convs } = await db.from("coach_conversations")
    .select("id,deal_id,seller_email,seller_name,last_message_at")
    .not("last_message_at", "is", null).limit(2000);

  const alerts: any[] = [];
  for (const c of convs ?? []) {
    const lastMs = new Date(c.last_message_at!).getTime();
    const hours = (now - lastMs) / (1000 * 60 * 60);
    if (hours >= horasLead && hours < 24) {
      alerts.push({ deal_id: c.deal_id, conversation_id: c.id, seller_email: c.seller_email,
        seller_name: c.seller_name, type: "lead_quente_sem_resposta", severity: "high",
        message: `Sem resposta há ${Math.round(hours)}h (mín. ${horasLead}h).`, state: "aberto" });
    } else if (hours >= diasParado * 24) {
      alerts.push({ deal_id: c.deal_id, conversation_id: c.id, seller_email: c.seller_email,
        seller_name: c.seller_name, type: "conversa_parada", severity: "medium",
        message: `Conversa parada há ${Math.round(hours / 24)} dias.`, state: "aberto" });
    }
  }

  if (alerts.length) {
    const { data: existing } = await db.from("coach_alerts")
      .select("conversation_id,type")
      .in("conversation_id", alerts.map((a) => a.conversation_id))
      .neq("state", "resolvido");
    const seen = new Set((existing ?? []).map((e: any) => `${e.conversation_id}|${e.type}`));
    const fresh = alerts.filter((a) => !seen.has(`${a.conversation_id}|${a.type}`));
    if (fresh.length) await db.from("coach_alerts").insert(fresh);
    return { created: fresh.length };
  }
  return { created: 0 };
});

export const listCoachConversationsFn = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data: convs, error } = await db.from("coach_conversations")
    .select("*").order("last_message_at", { ascending: false, nullsFirst: false }).limit(500);
  if (error) throw new Error(error.message);
  const ids = (convs ?? []).map((c: any) => c.id);
  const { data: analyses } = ids.length
    ? await db.from("coach_analyses").select("*").in("conversation_id", ids)
    : { data: [] as CoachAnalysis[] };
  const byConv = new Map<string, CoachAnalysis>();
  for (const a of (analyses ?? []) as CoachAnalysis[]) byConv.set(a.conversation_id, a);
  return (convs ?? []).map((c: any) => ({ ...c, analysis: byConv.get(c.id) ?? null }));
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
  const { data, error } = await db.from("coach_alerts")
    .select("*").order("created_at", { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as CoachAlert[];
});

export const resolveCoachAlertFn = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; state: "aberto" | "visto" | "resolvido" }) => d)
  .handler(async ({ data }) => {
    const db = await admin();
    const resolved = data.state === "resolvido";
    const { error } = await db.from("coach_alerts").update({
      state: data.state, resolved, resolved_at: resolved ? new Date().toISOString() : null,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getCoachConfigFn = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data } = await db.from("coach_config").select("*").eq("id", 1).maybeSingle();
  return (data ?? {
    id: 1, nota_minima: 6, horas_lead_quente: 4, dias_sem_resposta: 3,
    auto_analysis: true, analysis_interval_hours: 1, seller_phones: [],
  }) as CoachConfig;
});

export const saveCoachConfigFn = createServerFn({ method: "POST" })
  .inputValidator((d: {
    nota_minima: number; horas_lead_quente: number; dias_sem_resposta: number;
    auto_analysis?: boolean; analysis_interval_hours?: number;
    seller_phones?: Array<{ name: string; phone: string }>;
  }) => d)
  .handler(async ({ data }) => {
    const db = await admin();
    const { error } = await db.from("coach_config").upsert({
      id: 1, nota_minima: data.nota_minima, horas_lead_quente: data.horas_lead_quente,
      dias_sem_resposta: data.dias_sem_resposta, auto_analysis: data.auto_analysis ?? true,
      analysis_interval_hours: data.analysis_interval_hours ?? 1,
      seller_phones: data.seller_phones ?? [], updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const fetchWeeklyStatsFn = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data, error } = await db.from("coach_weekly_summary").select("*").limit(120);
  if (error) throw new Error(error.message);
  return (data ?? []) as WeeklyStats[];
});

export type CoachIntegrationLog = {
  id: number; event_type: string | null; status: string | null; error_msg: string | null; created_at: string;
};

export const fetchClintWebhookStatsFn = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const [convRes, logRes] = await Promise.all([
    (db as any).from("coach_conversations").select("id", { count: "exact", head: true }).eq("source", "clint"),
    (db as any).from("coach_integration_logs").select("created_at, status").order("created_at", { ascending: false }).limit(1),
  ]);
  const lastEvent = logRes.data?.[0] ?? null;
  return {
    webhook_conversation_count: (convRes.count as number) ?? 0,
    last_event_at: lastEvent?.created_at ?? null,
    is_connected: lastEvent ? Date.now() - new Date(lastEvent.created_at).getTime() < 7 * 24 * 60 * 60 * 1000 : false,
  };
});

export const fetchClintIntegrationLogsFn = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data: rows, error } = await (db as any)
    .from("coach_integration_logs").select("id, event_type, status, error_msg, created_at")
    .order("created_at", { ascending: false }).limit(50);
  if (error) throw new Error(error.message);
  return (rows ?? []) as CoachIntegrationLog[];
});

export const runClintMigrationsFn = createServerFn({ method: "POST" }).handler(async () => {
  const db = await admin();
  const { error: tableErr } = await (db as any).from("clint_events_raw").select("id").limit(1);
  if (!tableErr) return { ok: true, already_applied: true };
  throw new Error("MIGRATION_NEEDED:Rode o arquivo supabase/migrations/20260713120000_coach_backend_v2.sql no Supabase SQL Editor");
});
