import { createServerFn } from "@tanstack/react-start";

/**
 * Análise de desempenho do Agente IA (SDR COMERCIAL IA) da Clint.
 * Identificação primária: clint_source="AI_CONVERSATION" nas mensagens.
 * Fallback: regex nas conversas antigas sem clint_source.
 */

const V3 = "PIPELINE_COMERCIAL-V3";

// Fallback regex para mensagens antigas sem clint_source
const AI_PATTERNS: RegExp[] = [
  /seja bem[- ]vindo/i,
  /equip[ae] d[eo] luciano larrossa/i,
  /sess(ã|a)o estrat(é|e)gica/i,
  /familiaridade com gest(ã|a)o de tr(á|a)fego/i,
  /sou d[ao] equip[ae]/i,
];

function isAiMessage(body: string | null, clintSource?: string | null): boolean {
  if (clintSource === "AI_CONVERSATION") return true;
  if (!body) return false;
  return AI_PATTERNS.some((re) => re.test(body));
}

// Estágios que representam reunião conquistada pelo trabalho do SDR
const MEETING_STAGES = ["reunião agendada", "reuniao agendada", "proposta enviada", "fechado"];
function isMeetingStage(stage: string | null | undefined): boolean {
  const s = (stage ?? "").trim().toLowerCase();
  return MEETING_STAGES.includes(s);
}

export type AgenteIaResult = {
  periodStart: string;
  periodEnd: string;
  kpis: {
    conversasTotal: number;
    conversasIa: number;
    coberturaPct: number;
    mensagensIa: number;
    leadsResponderam: number;
    taxaRespostaPct: number;
    tempo1aRespostaMin: number | null;
    tempoMedioRespostaMin: number | null;
    respostasAte5min: number;
    velocidadePct: number;
    qualificados: number;
    taxaQualificacaoPct: number;
    reunioes: number;
    conversaoReuniaoPct: number;
    agendaClint: number;
    msgsAteReuniao: number | null;
    passouParaHumano: number;
    semResposta: number;
  };
  daily: { date: string; iniciadas: number; responderam: number; reunioes: number }[];
  funil: { etapa: string; valor: number }[];
  stages: { stage: string; total: number }[];
  respostaBuckets: { faixa: string; total: number }[];
  amostraSemResposta: { contato: string; abertura: string; data: string }[];
  amostraConvertida: { contato: string; mensagens: number; data: string; stage: string }[];
};

function toDate(ts: string | null | undefined): number | null {
  if (!ts) return null;
  const t = new Date(ts).getTime();
  return Number.isFinite(t) ? t : null;
}
function dayISO(ts: string): string {
  return ts.slice(0, 10);
}
function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export const fetchAgenteIaFn = createServerFn({ method: "POST" })
  .inputValidator((d: { startDate: string; endDate: string }) => d)
  .handler(async ({ data }): Promise<AgenteIaResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const startTS = `${data.startDate}T00:00:00.000Z`;
    const endTS = `${data.endDate}T23:59:59.999Z`;

    // Query total V3 conversations (for coverage %) and AI conversations separately
    const [allConvsRes, aiConvsRes, agendaRes] = await Promise.all([
      supabaseAdmin
        .from("coach_conversations")
        .select("id", { count: "exact", head: true })
        .eq("origin_name", V3)
        .gte("last_message_at", startTS)
        .lte("last_message_at", endTS),
      supabaseAdmin
        .from("coach_conversations")
        .select("id,deal_id,contact_name,stage,first_message_at,last_message_at,message_count,is_ai_conversation")
        .eq("origin_name", V3)
        .eq("is_ai_conversation", true)
        .gte("last_message_at", startTS)
        .lte("last_message_at", endTS)
        .limit(5000),
      supabaseAdmin
        .from("seller_agenda")
        .select("id,source,scheduled_at,created_at")
        .gte("scheduled_at", startTS)
        .lte("scheduled_at", endTS)
        .limit(2000),
    ]);
    if (aiConvsRes.error) throw new Error(`coach_conversations: ${aiConvsRes.error.message}`);

    const convs = aiConvsRes.data ?? [];
    // Total V3 conversations (all, not just AI) for coverage percentage
    const totalV3 = allConvsRes.count ?? convs.length;
    const agenda = agendaRes.data ?? [];
    const agendaClint = agenda.filter((a: any) =>
      /clint|ia|agente|autom/i.test(String(a.source ?? "")),
    ).length;

    // Mensagens das conversas (chunked para não estourar a URL do PostgREST)
    const ids = convs.map((c: any) => c.id);
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
    const msgChunks = await Promise.all(
      chunks.map((chunk) =>
        supabaseAdmin
          .from("coach_messages")
          .select("conversation_id,sent_at,direction,body,clint_source")
          .in("conversation_id", chunk)
          .order("sent_at", { ascending: true })
          .limit(50000),
      ),
    );
    const byConv = new Map<
      string,
      { sent_at: string; direction: string; body: string; clint_source?: string | null }[]
    >();
    for (const r of msgChunks) {
      for (const m of r.data ?? []) {
        const arr = byConv.get(m.conversation_id) ?? [];
        arr.push(m as any);
        byConv.set(m.conversation_id, arr);
      }
    }

    // Deals do V3 para saber o estágio real (reunião agendada etc.)
    const dealIds = convs.map((c: any) => c.deal_id).filter(Boolean) as string[];
    const dealChunks: string[][] = [];
    for (let i = 0; i < dealIds.length; i += 100) dealChunks.push(dealIds.slice(i, i + 100));
    const dealRes = await Promise.all(
      dealChunks.map((chunk) =>
        supabaseAdmin.from("clint_deals").select("id,stage,updated_stage_at,status").in("id", chunk),
      ),
    );
    const dealById = new Map<string, { stage: string | null; updated_stage_at: string | null }>();
    for (const r of dealRes) for (const d of r.data ?? []) dealById.set(d.id, d as any);

    const daily = new Map<string, { iniciadas: number; responderam: number; reunioes: number }>();
    const touch = (d: string) => {
      const cur = daily.get(d) ?? { iniciadas: 0, responderam: 0, reunioes: 0 };
      daily.set(d, cur);
      return cur;
    };

    let conversasIa = 0;
    let mensagensIa = 0;
    let leadsResponderam = 0;
    let qualificados = 0;
    let reunioes = 0;
    let passouParaHumano = 0;
    let semResposta = 0;
    let respostasAte5min = 0;
    let totalRespostas = 0;
    const first: number[] = [];
    const allLat: number[] = [];
    const msgsAteReuniaoArr: number[] = [];
    const stageCount = new Map<string, number>();
    const buckets = [
      { faixa: "< 1 min", test: (m: number) => m < 1, total: 0 },
      { faixa: "1–5 min", test: (m: number) => m >= 1 && m < 5, total: 0 },
      { faixa: "5–30 min", test: (m: number) => m >= 5 && m < 30, total: 0 },
      { faixa: "30 min–2h", test: (m: number) => m >= 30 && m < 120, total: 0 },
      { faixa: "> 2h", test: (m: number) => m >= 120, total: 0 },
    ];
    const amostraSemResposta: AgenteIaResult["amostraSemResposta"] = [];
    const amostraConvertida: AgenteIaResult["amostraConvertida"] = [];

    for (const c of convs as any[]) {
      const msgs = (byConv.get(c.id) ?? []).sort((a, b) => a.sent_at.localeCompare(b.sent_at));
      if (!msgs.length) continue;

      // is_ai_conversation already filtered at DB level; detect AI messages within the conversation
      const aiMsgs = msgs.filter(
        (m) => m.direction === "outbound" && isAiMessage(m.body, m.clint_source),
      );
      // Fallback: if no clint_source data yet, treat all outbound as AI (since conv is flagged)
      const effectiveAiMsgs = aiMsgs.length > 0
        ? aiMsgs
        : msgs.filter((m) => m.direction === "outbound");
      if (!effectiveAiMsgs.length) continue;

      conversasIa += 1;
      mensagensIa += effectiveAiMsgs.length;
      const startedAt = effectiveAiMsgs[0].sent_at;
      const dayKey = dayISO(startedAt);
      touch(dayKey).iniciadas += 1;

      const afterStart = msgs.filter((m) => m.sent_at >= startedAt);
      const inbound = afterStart.filter((m) => m.direction === "inbound");
      const respondeu = inbound.length > 0;
      if (respondeu) {
        leadsResponderam += 1;
        touch(dayKey).responderam += 1;
      } else {
        semResposta += 1;
        if (amostraSemResposta.length < 12) {
          amostraSemResposta.push({
            contato: c.contact_name ?? "—",
            abertura: (aiMsgs[0].body ?? "").slice(0, 160),
            data: dayKey,
          });
        }
      }
      // Qualificado = lead trocou 3+ mensagens com a IA
      if (inbound.length >= 3) qualificados += 1;

      // Latências: cada inbound → próximo outbound
      let firstDone = false;
      for (let i = 0; i < afterStart.length - 1; i++) {
        const m = afterStart[i];
        if (m.direction !== "inbound") continue;
        const next = afterStart.slice(i + 1).find((x) => x.direction === "outbound");
        if (!next) break;
        const a = toDate(m.sent_at);
        const b = toDate(next.sent_at);
        if (a === null || b === null || b < a) continue;
        const min = (b - a) / 60000;
        if (min > 60 * 48) continue; // ignora gaps absurdos (lead sumiu dias)
        allLat.push(min);
        totalRespostas += 1;
        if (min < 5) respostasAte5min += 1;
        for (const bk of buckets) if (bk.test(min)) bk.total += 1;
        if (!firstDone) {
          first.push(min);
          firstDone = true;
        }
      }

      // Passou para humano: mensagem outbound com source=CHAT (humano) após lead responder
      const humano = afterStart.some(
        (m) =>
          m.direction === "outbound" &&
          (m.clint_source === "CHAT" ||
            (!m.clint_source && !isAiMessage(m.body, null) && (m.body ?? "").length > 40)),
      );
      if (humano && respondeu) passouParaHumano += 1;

      const deal = c.deal_id ? dealById.get(c.deal_id) : undefined;
      const stage = deal?.stage ?? c.stage ?? "—";
      stageCount.set(stage, (stageCount.get(stage) ?? 0) + 1);
      if (isMeetingStage(stage)) {
        reunioes += 1;
        msgsAteReuniaoArr.push(afterStart.length);
        const d = deal?.updated_stage_at ? dayISO(deal.updated_stage_at) : dayKey;
        touch(d).reunioes += 1;
        if (amostraConvertida.length < 12) {
          amostraConvertida.push({
            contato: c.contact_name ?? "—",
            mensagens: afterStart.length,
            data: d,
            stage,
          });
        }
      }
    }

    const pct = (a: number, b: number) => (b > 0 ? Number(((a / b) * 100).toFixed(1)) : 0);

    return {
      periodStart: data.startDate,
      periodEnd: data.endDate,
      kpis: {
        conversasTotal: totalV3,
        conversasIa,
        coberturaPct: pct(conversasIa, totalV3),
        mensagensIa,
        leadsResponderam,
        taxaRespostaPct: pct(leadsResponderam, conversasIa),
        tempo1aRespostaMin: first.length ? Number((median(first) ?? 0).toFixed(1)) : null,
        tempoMedioRespostaMin: allLat.length ? Number((median(allLat) ?? 0).toFixed(1)) : null,
        respostasAte5min,
        velocidadePct: pct(respostasAte5min, totalRespostas),
        qualificados,
        taxaQualificacaoPct: pct(qualificados, conversasIa),
        reunioes,
        conversaoReuniaoPct: pct(reunioes, conversasIa),
        agendaClint,
        msgsAteReuniao: msgsAteReuniaoArr.length
          ? Number((msgsAteReuniaoArr.reduce((a, b) => a + b, 0) / msgsAteReuniaoArr.length).toFixed(1))
          : null,
        passouParaHumano,
        semResposta,
      },
      daily: Array.from(daily.entries())
        .map(([date, v]) => ({ date, ...v }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      funil: [
        { etapa: "Conversas iniciadas", valor: conversasIa },
        { etapa: "Leads responderam", valor: leadsResponderam },
        { etapa: "Qualificados (3+ msgs)", valor: qualificados },
        { etapa: "Reunião agendada", valor: reunioes },
      ],
      stages: Array.from(stageCount.entries())
        .map(([stage, total]) => ({ stage, total }))
        .sort((a, b) => b.total - a.total),
      respostaBuckets: buckets.map((b) => ({ faixa: b.faixa, total: b.total })),
      amostraSemResposta,
      amostraConvertida,
    };
  });

export const generateAgenteIaInsightsFn = createServerFn({ method: "POST" })
  .inputValidator((d: { startDate: string; endDate: string }) => d)
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY não configurada");
    const res = await fetchAgenteIaFn({ data });

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Você é especialista em SDR com IA no WhatsApp. Analise os dados do agente IA (pré-atendimento no funil comercial) e responda em português de Portugal/Brasil neutro, em markdown curto, com: 1) Diagnóstico (a IA está boa? por quê, citando números), 2) 3 pontos fortes, 3) 3 gargalos com o número que prova, 4) 5 melhorias concretas no prompt/fluxo do agente (bem específicas, ex.: reformular a abertura, follow-up automático em X horas). Nunca invente números.",
          },
          {
            role: "user",
            content: `Período ${res.periodStart} a ${res.periodEnd}:\n${JSON.stringify(
              { kpis: res.kpis, funil: res.funil, stages: res.stages, tempos: res.respostaBuckets, amostra_sem_resposta: res.amostraSemResposta, amostra_convertida: res.amostraConvertida },
              null,
              2,
            )}`,
          },
        ],
      }),
    });
    if (!resp.ok) throw new Error(`Lovable AI ${resp.status}: ${await resp.text()}`);
    const json = (await resp.json()) as any;
    return { text: (json?.choices?.[0]?.message?.content ?? "") as string };
  });
