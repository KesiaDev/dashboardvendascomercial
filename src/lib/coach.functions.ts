import { createServerFn } from "@tanstack/react-start";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// ============ Clint API message sync ============
const CLINT_HOST = "https://api.clint.digital";

async function clintFetch(path: string, token: string) {
  const url = path.startsWith("http") ? path : `${CLINT_HOST}${path}`;
  console.log(`[Clint sync] GET ${url}`);
  const r = await fetch(url, {
    headers: { "api-token": token, Accept: "application/json" },
  });
  console.log(`[Clint sync] ← ${r.status} ${url}`);
  return r;
}

async function findContactId(
  token: string,
  phone: string | null,
  email: string | null,
): Promise<{ contactId: string | null; attempts: string[]; errors: any[] }> {
  const attempts: string[] = [];
  const errors: any[] = [];

  const lookup = async (path: string) => {
    attempts.push(path);
    const r = await clintFetch(path, token);
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      errors.push({ url: path, status: r.status, body: body.slice(0, 200) });
      return null;
    }
    const j: any = await r.json().catch(() => null);
    const list = j?.data ?? j?.contacts ?? j?.results ?? (Array.isArray(j) ? j : null);
    const id = list?.[0]?.id ?? j?.id ?? null;
    console.log(`[Clint sync] contactId via ${path} =`, id);
    return id ? String(id) : null;
  };

  if (phone) {
    const clean = phone.replace(/\D/g, "");
    const id = await lookup(`/v1/contacts?phone=${encodeURIComponent(clean)}`);
    if (id) return { contactId: id, attempts, errors };
  }
  if (email) {
    const id = await lookup(`/v1/contacts?email=${encodeURIComponent(email)}`);
    if (id) return { contactId: id, attempts, errors };
  }
  return { contactId: null, attempts, errors };
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

    console.log(`[Clint sync] conversa ${conv.id}`, {
      deal_id: conv.deal_id,
      contact_email: conv.contact_email,
      clint_contact_id: (conv as any).clint_contact_id,
    });

    // fetch phone from any linked message
    const { data: phoneRow } = await db
      .from("coach_messages")
      .select("lead_phone")
      .eq("conversation_id", conv.id)
      .not("lead_phone", "is", null)
      .limit(1)
      .maybeSingle();
    const phone = (phoneRow as any)?.lead_phone ?? null;
    console.log(`[Clint sync] phone from messages =`, phone);

    const allAttempts: string[] = [];
    const allErrors: any[] = [];

    // Step 1: resolve contactId
    let contactId: string | null = (conv as any).clint_contact_id ?? null;
    if (!contactId) {
      const lookup = await findContactId(token, phone, conv.contact_email);
      allAttempts.push(...lookup.attempts);
      allErrors.push(...lookup.errors);
      contactId = lookup.contactId;
    }
    if (!contactId) {
      console.warn(
        `[Clint sync] contato não encontrado para conv=${conv.id} email=${conv.contact_email} phone=${phone}. Tentativas: ${allAttempts.join(", ")}`,
      );
      return {
        synced: 0,
        skipped: true,
        reason: "contact_not_found",
        email: conv.contact_email,
        attempts: allAttempts,
        errors: allErrors,
      };
    }
    console.log(`[Clint sync] usando contactId=${contactId}`);

    // Step 2: chats do contato
    const chatsPath = `/v2/chats/contact/${encodeURIComponent(contactId)}`;
    allAttempts.push(chatsPath);
    const chatsRes = await clintFetch(chatsPath, token);
    if (!chatsRes.ok) {
      const body = await chatsRes.text().catch(() => "");
      throw new Error(`GET ${chatsPath} → ${chatsRes.status}: ${body.slice(0, 200)}`);
    }
    const chatsJson: any = await chatsRes.json().catch(() => null);
    const chats = chatsJson?.data ?? chatsJson?.chats ?? (Array.isArray(chatsJson) ? chatsJson : []);
    console.log(`[Clint sync] chats encontrados:`, chats?.length ?? 0);
    if (!chats?.length) {
      return { synced: 0, rawSample: chatsJson, endpoint: chatsPath, attempts: allAttempts };
    }
    const chatId = chats[0]?.id;
    if (!chatId) {
      return { synced: 0, rawSample: chats[0], endpoint: chatsPath, attempts: allAttempts };
    }
    console.log(`[Clint sync] chatId mais recente=${chatId}`);

    // Step 3: mensagens do chat
    const msgsPath = `/v2/messages/chat/${encodeURIComponent(chatId)}`;
    allAttempts.push(msgsPath);
    const msgsRes = await clintFetch(msgsPath, token);
    if (!msgsRes.ok) {
      const body = await msgsRes.text().catch(() => "");
      throw new Error(`GET ${msgsPath} → ${msgsRes.status}: ${body.slice(0, 200)}`);
    }
    const msgsJson: any = await msgsRes.json().catch(() => null);
    const rawMessages = extractMessages(msgsJson);
    const rawSample = rawMessages[0] ?? msgsJson;
    console.log(`[Clint sync] mensagens no chat:`, rawMessages.length);

    if (!rawMessages.length) {
      return { synced: 0, rawSample, endpoint: msgsPath, attempts: allAttempts };
    }

    // dedupe
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

    // persist contactId for future syncs
    if (!(conv as any).clint_contact_id) {
      await db.from("coach_conversations").update({ clint_contact_id: contactId }).eq("id", conv.id);
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

    return { synced: rows.length, total: count, rawSample, endpoint: msgsPath, attempts: allAttempts };
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

// ============ Team Insights (coordenador comercial) ============
export type TeamInsights = {
  generated_at: string;
  window_days: number;
  sample_size: number;
  avg_score: number | null;
  top_weaknesses: { theme: string; frequency: number; sellers: string[]; example: string }[];
  top_strengths: { theme: string; frequency: number; sellers: string[]; example: string }[];
  top_objections: { theme: string; frequency: number }[];
  seller_focus: { seller: string; focus: string; suggested_action: string }[];
  training_recommendations: { title: string; why: string; format: string; priority: "alta" | "media" | "baixa" }[];
  shareable_best_practices: { practice: string; from_seller: string }[];
  coordinator_summary: string;
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const generateTeamInsightsFn = createServerFn({ method: "POST" })
  .inputValidator((d: { days?: number } = {}) => d)
  .handler(async ({ data }): Promise<TeamInsights> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY não configurada");
    const db = await admin();
    const days = Math.max(3, Math.min(180, data.days ?? 30));
    const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

    const { data: analyses, error } = await db
      .from("coach_analyses")
      .select("conversation_id, score_geral, pontos_fortes, pontos_melhoria, objecoes, resumo, analyzed_at")
      .gte("analyzed_at", since)
      .eq("status", "ok")
      .limit(500);
    if (error) throw new Error(error.message);
    const rows = analyses ?? [];
    if (rows.length === 0) {
      return {
        generated_at: new Date().toISOString(),
        window_days: days, sample_size: 0, avg_score: null,
        top_weaknesses: [], top_strengths: [], top_objections: [],
        seller_focus: [], training_recommendations: [], shareable_best_practices: [],
        coordinator_summary: "Sem conversas analisadas no período. Analise pelo menos algumas para gerar insights.",
      };
    }

    const ids = rows.map((r: any) => r.conversation_id);
    const { data: convs } = await db.from("coach_conversations")
      .select("id, seller_name, seller_email").in("id", ids);
    const byId = new Map<string, any>();
    for (const c of convs ?? []) byId.set((c as any).id, c);

    const scores = rows.map((r: any) => r.score_geral).filter((n: any) => typeof n === "number");
    const avg = scores.length ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : null;

    const compact = rows.slice(0, 120).map((r: any) => {
      const conv = byId.get(r.conversation_id);
      return {
        seller: conv?.seller_name || conv?.seller_email || "—",
        score: r.score_geral,
        fortes: (r.pontos_fortes ?? []).slice(0, 4),
        melhoria: (r.pontos_melhoria ?? []).slice(0, 4),
        objecoes: (r.objecoes ?? []).slice(0, 3),
      };
    });

    const sys =
      "Você é um COORDENADOR COMERCIAL sênior da LLMídia. Recebe análises de várias conversas de venda de vários vendedores. " +
      "Sua missão é enxergar PADRÕES no time — não repetir por vendedor. Identifique problemas comuns, boas práticas replicáveis, " +
      "objeções recorrentes, treinamentos que resolveriam gargalos e ações práticas por vendedor. " +
      "Responda SOMENTE JSON válido com este schema exato:\n" +
      `{"top_weaknesses":[{"theme":"string curto","frequency":number,"sellers":["nome"],"example":"frase curta"}],` +
      `"top_strengths":[{"theme":"string curto","frequency":number,"sellers":["nome"],"example":"frase curta"}],` +
      `"top_objections":[{"theme":"string curto","frequency":number}],` +
      `"seller_focus":[{"seller":"nome","focus":"o que precisa melhorar","suggested_action":"ação concreta"}],` +
      `"training_recommendations":[{"title":"nome do treino/curso","why":"por quê","format":"workshop|role-play|leitura|call review","priority":"alta|media|baixa"}],` +
      `"shareable_best_practices":[{"practice":"o que replicar","from_seller":"nome"}],` +
      `"coordinator_summary":"3-5 frases direto ao ponto para o gestor"}. ` +
      "Máx 6 itens em cada lista. Português do Brasil. Sem repetir o óbvio.";

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: sys },
          { role: "user", content:
            `Janela: ${days} dias. Conversas analisadas: ${rows.length}. Nota média: ${avg?.toFixed(2) ?? "—"}.\n\n` +
            `DADOS:\n${JSON.stringify(compact, null, 2)}` },
        ],
      }),
    });
    if (!resp.ok) throw new Error(`Lovable AI ${resp.status}: ${await resp.text().catch(() => "")}`);
    const j = (await resp.json()) as any;
    let parsed: any = {};
    try { parsed = JSON.parse(j?.choices?.[0]?.message?.content ?? "{}"); } catch { parsed = {}; }

    return {
      generated_at: new Date().toISOString(),
      window_days: days,
      sample_size: rows.length,
      avg_score: avg,
      top_weaknesses: Array.isArray(parsed.top_weaknesses) ? parsed.top_weaknesses.slice(0, 6) : [],
      top_strengths: Array.isArray(parsed.top_strengths) ? parsed.top_strengths.slice(0, 6) : [],
      top_objections: Array.isArray(parsed.top_objections) ? parsed.top_objections.slice(0, 6) : [],
      seller_focus: Array.isArray(parsed.seller_focus) ? parsed.seller_focus.slice(0, 8) : [],
      training_recommendations: Array.isArray(parsed.training_recommendations) ? parsed.training_recommendations.slice(0, 6) : [],
      shareable_best_practices: Array.isArray(parsed.shareable_best_practices) ? parsed.shareable_best_practices.slice(0, 6) : [],
      coordinator_summary: parsed.coordinator_summary ?? "",
    };
  });

