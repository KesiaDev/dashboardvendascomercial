import { createServerFn } from "@tanstack/react-start";
import { cleanSellerName } from "@/lib/bi";

// CCPBX (letscall.net) — API v2.
// Auth: POST /api/v2/login -> { access_token }
// CDR:  GET  /api/v2/pbx/loadCdr?month=YYYYMM&limit=&page=&filters[date][initDate]=YYYY-MM-DD&filters[date][endDate]=YYYY-MM-DD
// Áudio: GET /api/v2/pbx/recordFile/{YYYYMM}/{cdrId}
// Credenciais em CCPBX_USER / CCPBX_PASS. Base em CCPBX_BASE_URL (default https://ccpbx.letscall.net).

export type CallRow = {
  id: string;
  ccpbx_id: string;
  started_at: string;
  duration_sec: number;
  direction: string | null;
  from_number: string | null;
  to_number: string | null;
  agent_user: string | null;
  agent_name: string | null;
  agent_email: string | null;
  deal_id: string | null;
  contact_name: string | null;
  status: string | null;
  recording_url: string | null;
  transcript: string | null;
  score: number | null;
  analyzed_at: string | null;
  analysis: any | null;
};

// Mapa fixo extensão -> e-mail canônico do vendedor (fonte: painel CCPBX + Clint).
const EXTENSION_TO_EMAIL: Record<string, string> = {
  "200": "ritabandeira@lucianolarrossa.com",
  "201": "joaopessoa@lucianolarrossa.com",
  "202": "giselegagliano@lucianolarrossa.com",
  "203": "fabionadal@lucianolarrossa.com",
  "204": "luanaguimaraes@lucianolarrossa.com",
};

function baseUrl(): string {
  const raw = process.env.CCPBX_BASE_URL || "https://ccpbx.letscall.net";
  return raw.replace(/\/+$/, "");
}

async function login(): Promise<string> {
  const u = process.env.CCPBX_USER;
  const p = process.env.CCPBX_PASS;
  if (!u || !p) throw new Error("CCPBX_USER/CCPBX_PASS não configurados");
  const r = await fetch(`${baseUrl()}/api/v2/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email: u, password: p }),
  });
  if (!r.ok) throw new Error(`CCPBX login falhou: ${r.status} ${await r.text().catch(() => "")}`);
  const j = (await r.json().catch(() => ({}))) as any;
  const token = j?.access_token || j?.token;
  if (!token) throw new Error("CCPBX login: access_token ausente na resposta");
  return token;
}

let cachedToken: { token: string; exp: number } | null = null;
async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now()) return cachedToken.token;
  const t = await login();
  cachedToken = { token: t, exp: Date.now() + 25 * 60 * 1000 };
  return t;
}

function ymKey(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function monthsBetween(from: Date, to: Date): string[] {
  const out: string[] = [];
  const cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
  while (cur <= end) {
    out.push(ymKey(cur));
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
}

async function loadCdrPage(token: string, month: string, page: number, limit: number, initDate: string, endDate: string) {
  const qs = new URLSearchParams({
    month,
    page: String(page),
    limit: String(limit),
    order: "-calldate",
    "filters[date][initDate]": initDate,
    "filters[date][endDate]": endDate,
  });
  const r = await fetch(`${baseUrl()}/api/v2/pbx/loadCdr?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`CCPBX loadCdr ${month} p${page}: ${r.status} ${await r.text().catch(() => "")}`);
  const j = (await r.json().catch(() => ({}))) as any;
  const data: any[] = Array.isArray(j?.data) ? j.data : [];
  const total: number = Number(j?.meta?.total ?? j?.total ?? data.length);
  return { data, total };
}

function toIsoFromCallDate(s: string): string {
  // "2026-07-01 11:00:27" — assume Europe/Lisbon (UTC+1 no verão). Interpretamos como UTC para simplicidade,
  // já que o painel exibe hora local; ao converter, mantém consistência com a base.
  const t = s.includes("T") ? s : s.replace(" ", "T") + "Z";
  const d = new Date(t);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function normalizePhone(p: string | null | undefined): string {
  return (p ?? "").replace(/\D+/g, "").replace(/^0+/, "");
}

export const syncCcpbxCallsFn = createServerFn({ method: "POST" })
  .inputValidator((d: { days?: number } = {}) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const days = Math.max(1, Math.min(180, data.days ?? 30));
    const to = new Date();
    const from = new Date(Date.now() - days * 24 * 3600 * 1000);
    const initDate = from.toISOString().slice(0, 10);
    const endDate = to.toISOString().slice(0, 10);

    const token = await getToken();
    const months = monthsBetween(from, to);
    const all: any[] = [];
    for (const m of months) {
      let page = 1;
      const limit = 200;
      // paginação
      while (true) {
        const { data: rows, total } = await loadCdrPage(token, m, page, limit, initDate, endDate);
        all.push(...rows);
        if (rows.length < limit || all.length >= total || page > 50) break;
        page++;
      }
    }

    // Deals por telefone para vincular contato
    const { data: deals } = await supabaseAdmin
      .from("clint_deals")
      .select("id,contact_phone,contact_name,user_email,user_name")
      .not("contact_phone", "is", null)
      .limit(20000);
    const dealsByPhone = new Map<string, any>();
    for (const d of deals ?? []) {
      const n = normalizePhone(d.contact_phone);
      if (n.length >= 8) dealsByPhone.set(n.slice(-9), d);
    }

    const rows: any[] = [];
    for (const c of all) {
      const ccpbx_id = String(c?.id ?? c?.uuid ?? "");
      if (!ccpbx_id) continue;
      const direction: string = String(c?.direction ?? "").toLowerCase() || null as any;
      const from_number: string = String(c?.callerid ?? "");
      const to_number: string = String(c?.destination ?? "");
      const ext = String(c?.src_extension ?? c?.dst_extension ?? "");
      const agent_email = EXTENSION_TO_EMAIL[ext] ?? null;
      const agent_name = c?.src_name || c?.dst_name || null;
      const started_at = toIsoFromCallDate(String(c?.calldate ?? ""));
      const duration_sec = Number(c?.duration ?? 0);
      const attended = String(c?.attended ?? "") === "1" || c?.attended === true;
      const status = attended ? "answered" : "no-answer";
      const month = started_at.slice(0, 7).replace("-", "");
      const recording_url = c?.record_file ? `${baseUrl()}/api/v2/pbx/recordFile/${month}/${ccpbx_id}` : null;

      const phoneKey = normalizePhone(direction === "outgoing" ? to_number : from_number);
      const deal = phoneKey.length >= 8 ? dealsByPhone.get(phoneKey.slice(-9)) : null;

      rows.push({
        ccpbx_id,
        started_at,
        duration_sec,
        direction,
        from_number: from_number || null,
        to_number: to_number || null,
        agent_user: ext || null,
        agent_name: agent_name ? cleanSellerName(agent_name) : null,
        agent_email: agent_email ?? deal?.user_email ?? null,
        deal_id: deal?.id ?? null,
        contact_name: deal?.contact_name ?? null,
        status,
        recording_url,
        raw: c,
        synced_at: new Date().toISOString(),
      });
    }

    if (rows.length === 0) return { ok: true, upserted: 0, fetched: all.length };
    const { error, count } = await supabaseAdmin
      .from("coach_calls")
      .upsert(rows, { onConflict: "ccpbx_id", count: "exact", ignoreDuplicates: false });
    if (error) throw new Error(error.message);
    return { ok: true, upserted: count ?? rows.length, fetched: all.length };
  });

export const listCcpbxCallsFn = createServerFn({ method: "POST" })
  .inputValidator((d: { limit?: number; agentEmail?: string; from?: string; to?: string } = {}) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("coach_calls")
      .select("id,ccpbx_id,started_at,duration_sec,direction,from_number,to_number,agent_user,agent_name,agent_email,deal_id,contact_name,status,recording_url,transcript,score,analyzed_at,analysis")
      .order("started_at", { ascending: false })
      .limit(Math.min(1000, data.limit ?? 200));
    if (data.agentEmail) q = q.eq("agent_email", data.agentEmail);
    if (data.from) q = q.gte("started_at", data.from);
    if (data.to) q = q.lte("started_at", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows as CallRow[];
  });

export const analyzeCallFn = createServerFn({ method: "POST" })
  .inputValidator((d: { callId: string }) => d)
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY não configurada");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: call, error } = await supabaseAdmin
      .from("coach_calls").select("*").eq("id", data.callId).maybeSingle();
    if (error || !call) throw new Error("Ligação não encontrada");

    // Baixa áudio autenticado no CCPBX
    let audioB64: string | null = null;
    let mime = "audio/mpeg";
    if (call.recording_url) {
      try {
        const token = await getToken();
        const r = await fetch(call.recording_url, { headers: { Authorization: `Bearer ${token}` } });
        if (r.ok) {
          const buf = Buffer.from(await r.arrayBuffer());
          if (buf.length < 20 * 1024 * 1024) {
            audioB64 = buf.toString("base64");
            mime = r.headers.get("content-type")?.split(";")[0] || "audio/mpeg";
          }
        }
      } catch {}
    }

    const sys =
      "Você é o Coach Comercial da LLMídia. Analise esta ligação de vendas e devolva SOMENTE JSON válido com o schema: " +
      `{"resumo":"string","score":0-10,"sentimento":"positivo|neutro|negativo","tentou_fechar":true|false,` +
      `"objecoes":["string"],"pontos_fortes":["string"],"pontos_melhoria":["string"],"proxima_acao":"string"}. ` +
      "Se não houver áudio ou o áudio for muito curto/inaudível, devolva score=null e resumo=\"insufficient_data\".";

    const userParts: any[] = [
      { type: "text", text:
        `Ligação (${call.direction ?? "?"}) de ${call.from_number ?? "?"} → ${call.to_number ?? "?"}, ` +
        `agente=${call.agent_name ?? "?"}, contato=${call.contact_name ?? "?"}, duração=${call.duration_sec}s, status=${call.status ?? "?"}.` },
    ];
    if (audioB64) {
      userParts.push({ type: "input_audio", input_audio: { data: audioB64, format: mime.includes("wav") ? "wav" : "mp3" } });
    }

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: sys }, { role: "user", content: userParts }],
      }),
    });
    if (!resp.ok) throw new Error(`Lovable AI ${resp.status}: ${await resp.text()}`);
    const j = (await resp.json()) as any;
    let parsed: any = {};
    try { parsed = JSON.parse(j?.choices?.[0]?.message?.content ?? "{}"); } catch { parsed = { resumo: "insufficient_data" }; }

    const score = typeof parsed.score === "number" ? parsed.score : null;
    await supabaseAdmin.from("coach_calls").update({
      transcript: parsed.transcricao ?? call.transcript ?? null,
      analysis: parsed,
      score,
      analyzed_at: new Date().toISOString(),
    }).eq("id", data.callId);
    return { ok: true, score, analysis: parsed };
  });
