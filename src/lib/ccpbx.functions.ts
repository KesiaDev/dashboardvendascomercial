import { createServerFn } from "@tanstack/react-start";
import { cleanSellerName } from "@/lib/bi";

// CCPBX (letscall.net) integration.
// API base é lida de CCPBX_BASE_URL. Credenciais em CCPBX_USER / CCPBX_PASS.
// Endpoints tentados (a API expõe várias versões — tentamos em ordem e usamos
// o primeiro que responde 200).

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
};

function baseUrl(): string {
  const raw = process.env.CCPBX_BASE_URL || "https://ccpbx.letscall.net";
  return raw.replace(/\/+$/, "");
}

async function tryFetch(paths: string[], init: RequestInit): Promise<Response | null> {
  const b = baseUrl();
  for (const p of paths) {
    try {
      const r = await fetch(`${b}${p}`, init);
      if (r.status !== 404) return r;
    } catch {}
  }
  return null;
}

async function login(): Promise<string> {
  const u = process.env.CCPBX_USER;
  const p = process.env.CCPBX_PASS;
  if (!u || !p) throw new Error("CCPBX_USER/CCPBX_PASS não configurados");
  const body = JSON.stringify({ username: u, password: p, email: u });
  const r = await tryFetch(
    ["/api/v1/auth/login", "/api/auth/login", "/api/login", "/auth/login"],
    { method: "POST", headers: { "Content-Type": "application/json" }, body },
  );
  if (!r || !r.ok) throw new Error(`CCPBX login falhou: ${r?.status ?? "no-response"}`);
  const j = (await r.json().catch(() => ({}))) as any;
  const token = j?.token || j?.access_token || j?.jwt || j?.data?.token;
  if (!token) throw new Error("CCPBX login: token não retornado");
  return token;
}

let cachedToken: { token: string; exp: number } | null = null;
async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now()) return cachedToken.token;
  const t = await login();
  cachedToken = { token: t, exp: Date.now() + 25 * 60 * 1000 };
  return t;
}

async function listCdrs(fromISO: string, toISO: string): Promise<any[]> {
  const token = await getToken();
  const qs = `?startDate=${encodeURIComponent(fromISO)}&endDate=${encodeURIComponent(toISO)}&limit=1000`;
  const r = await tryFetch(
    [`/api/v1/cdr${qs}`, `/api/cdr${qs}`, `/api/v1/calls${qs}`, `/api/calls${qs}`],
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
  );
  if (!r || !r.ok) throw new Error(`CCPBX CDR falhou: ${r?.status ?? "no-response"}`);
  const j = (await r.json().catch(() => ({}))) as any;
  const items = j?.data ?? j?.items ?? j?.results ?? j?.cdrs ?? j?.calls ?? j;
  return Array.isArray(items) ? items : [];
}

function pick<T = any>(o: any, keys: string[]): T | null {
  for (const k of keys) {
    const v = k.split(".").reduce((a, p) => (a == null ? a : a[p]), o);
    if (v != null && v !== "") return v as T;
  }
  return null;
}

function normalizePhone(p: string | null | undefined): string {
  return (p ?? "").replace(/\D+/g, "").replace(/^0+/, "");
}

export const syncCcpbxCallsFn = createServerFn({ method: "POST" })
  .inputValidator((d: { days?: number } = {}) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const days = Math.max(1, Math.min(90, data.days ?? 7));
    const to = new Date();
    const from = new Date(Date.now() - days * 24 * 3600 * 1000);
    const cdrs = await listCdrs(from.toISOString(), to.toISOString());

    // Mapa de deals por telefone para vincular
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

    // Mapa de usuários CCPBX → email (best effort a partir de clint_users)
    const { data: users } = await supabaseAdmin.from("clint_users").select("email,first_name,last_name").limit(500);
    const userByName = new Map<string, any>();
    for (const u of users ?? []) {
      const nm = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
      if (nm) userByName.set(cleanSellerName(nm).toLowerCase(), u);
    }

    const rows: any[] = [];
    for (const c of cdrs) {
      const ccpbx_id = String(
        pick(c, ["id", "cdr_id", "uuid", "call_id", "uniqueid"]) ?? "",
      );
      if (!ccpbx_id) continue;
      const started_at =
        pick<string>(c, ["start_time", "started_at", "start", "date", "created_at", "calldate"]) ??
        new Date().toISOString();
      const duration_sec = Number(pick(c, ["duration", "billsec", "duration_sec", "talk_time"]) ?? 0);
      const from_number = String(pick(c, ["from", "src", "source", "caller", "from_number"]) ?? "");
      const to_number = String(pick(c, ["to", "dst", "destination", "callee", "to_number"]) ?? "");
      const direction = String(pick(c, ["direction", "type", "call_type"]) ?? "").toLowerCase() || null;
      const agent_user = pick<string>(c, ["agent", "user", "username", "extension", "agent_name"]);
      const agent_name = pick<string>(c, ["agent_name", "user_name", "display_name"]) ?? agent_user;
      const status = pick<string>(c, ["status", "disposition", "hangup_cause"]);
      const recording_url = pick<string>(c, ["recording_url", "record_url", "recording", "audio_url"]);

      const phoneKey = normalizePhone(direction === "outbound" ? to_number : from_number);
      const deal = phoneKey.length >= 8 ? dealsByPhone.get(phoneKey.slice(-9)) : null;
      const agentMatch = agent_name ? userByName.get(cleanSellerName(agent_name).toLowerCase()) : null;

      rows.push({
        ccpbx_id,
        started_at: new Date(started_at).toISOString(),
        duration_sec,
        direction,
        from_number: from_number || null,
        to_number: to_number || null,
        agent_user,
        agent_name: agent_name ? cleanSellerName(agent_name) : null,
        agent_email: agentMatch?.email ?? deal?.user_email ?? null,
        deal_id: deal?.id ?? null,
        contact_name: deal?.contact_name ?? null,
        status,
        recording_url,
        raw: c,
        synced_at: new Date().toISOString(),
      });
    }

    if (rows.length === 0) return { ok: true, upserted: 0, fetched: cdrs.length };
    const { error, count } = await supabaseAdmin
      .from("coach_calls")
      .upsert(rows, { onConflict: "ccpbx_id", count: "exact", ignoreDuplicates: false });
    if (error) throw new Error(error.message);
    return { ok: true, upserted: count ?? rows.length, fetched: cdrs.length };
  });

export const listCcpbxCallsFn = createServerFn({ method: "POST" })
  .inputValidator((d: { limit?: number; agentEmail?: string } = {}) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("coach_calls")
      .select("id,ccpbx_id,started_at,duration_sec,direction,from_number,to_number,agent_user,agent_name,agent_email,deal_id,contact_name,status,recording_url,transcript,score,analyzed_at")
      .order("started_at", { ascending: false })
      .limit(Math.min(500, data.limit ?? 100));
    if (data.agentEmail) q = q.eq("agent_email", data.agentEmail);
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

    // Tenta baixar áudio (com JWT quando o URL é do próprio CCPBX)
    let audioB64: string | null = null;
    let mime = "audio/mpeg";
    if (call.recording_url) {
      const headers: Record<string, string> = {};
      if (call.recording_url.includes("letscall") || call.recording_url.startsWith("/")) {
        try { headers.Authorization = `Bearer ${await getToken()}`; } catch {}
      }
      const url = call.recording_url.startsWith("http") ? call.recording_url : `${baseUrl()}${call.recording_url}`;
      try {
        const r = await fetch(url, { headers });
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
