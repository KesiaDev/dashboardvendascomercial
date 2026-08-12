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

// Detecção de reunião: primário = conteúdo das mensagens da IA, fallback = estágio do deal.
// "lembrete no dia" aparece em TODAS as confirmações de sessão estratégica.
// [AGENDA:DD/MM:HH:MM] é a tag estruturada gerada pelo agente.
const MEETING_MSG_PATTERNS = [/lembrete no dia/i, /\[AGENDA:/i];
function hasMeetingConfirmation(aiMsgBodies: (string | null)[]): boolean {
  return aiMsgBodies.some((b) => MEETING_MSG_PATTERNS.some((re) => re.test(b ?? "")));
}
// Fallback: deal com estágio explícito de reunião (para casos em que humano fechou a sessão)
function isMeetingStage(stage: string | null | undefined): boolean {
  const s = (stage ?? "").trim().toLowerCase();
  return /reuni(ã|a)o agendada/i.test(s) || /sess(ã|a)o agendada/i.test(s);
}

export type SessaoStatus =
  | "Reunião agendada"
  | "Escalada para humano"
  | "Venda ganha"
  | "Lead descartado"
  | "Aguardando resposta do lead"
  | "Sem resposta"
  | "Em conversa";

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
  sessoes: {
    id: string;
    contato: string;
    inicio: string;
    ultima: string;
    turnos: number;
    msgsIa: number;
    respostasLead: number;
    status: SessaoStatus;
    stage: string;
    tempo1aRespostaMin: number | null;
    iaIniciou: boolean;
    vendeu: boolean;
    ultimaMensagem: string;
  }[];
  statusResumo: { status: SessaoStatus; total: number }[];
  amostraConvertida: { contato: string; mensagens: number; data: string; stage: string }[];
  vendas: {
    ganhosClint: number;
    vendasManuais: number;
    vendasTotal: number;
    valorEur: number;
    taxaConversaoPct: number;
    iniciadasPelaIa: number;
    vendasIaIniciou: number;
    lista: {
      contato: string;
      origem: "Clint (ganho)" | "Fechamento manual";
      vendedor: string;
      produto: string;
      valorEur: number;
      data: string;
      iaIniciou: boolean;
      msgsIa: number;
      match: string;
    }[];
  };
};

function digits(s: string | null | undefined): string {
  const d = (s ?? "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : "";
}
function normName(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

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

    const db = supabaseAdmin as any;

    const [allConvsRes, aiConvsRes, agendaRes] = await Promise.all([
      db
        .from("coach_conversations")
        .select("id", { count: "exact", head: true })
        .eq("origin_name", V3)
        .gte("last_message_at", startTS)
        .lte("last_message_at", endTS),
      db
        .from("coach_conversations")
        .select(
          "id,deal_id,contact_name,contact_email,stage,first_message_at,last_message_at,message_count",
        )
        .eq("origin_name", V3)
        .eq("is_ai_conversation", true)
        .gte("last_message_at", startTS)
        .lte("last_message_at", endTS)
        .limit(5000),
      db
        .from("seller_agenda")
        .select("id,source,scheduled_at,created_at")
        .gte("scheduled_at", startTS)
        .lte("scheduled_at", endTS)
        .limit(2000),
    ]);
    if (aiConvsRes.error) throw new Error(`coach_conversations: ${aiConvsRes.error.message}`);

    const convs = aiConvsRes.data ?? [];
    const totalV3 = (allConvsRes.count as number) ?? convs.length;
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
        db
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
        db
          .from("clint_deals")
          .select(
            "id,stage,updated_stage_at,status,value,currency,won_at,won_by_name,user_name,contact_email,contact_phone,contact_name",
          )
          .in("id", chunk),
      ),
    );
    const dealById = new Map<string, any>();
    for (const r of dealRes) for (const d of r.data ?? []) dealById.set(d.id, d as any);

    // Vendas manuais do período (fechamento dos vendedores) para cruzar com contatos da IA
    const manualRes = await db
      .from("manual_sales")
      .select("id,seller_name,product,value_eur,client_name,client_email,sale_date")
      .gte("sale_date", data.startDate)
      .lte("sale_date", data.endDate)
      .eq("installment_number", 1)
      .limit(3000);
    const manualSales = (manualRes.data ?? []) as any[];
    const manualByEmail = new Map<string, any>();
    const manualByName = new Map<string, any>();
    for (const m of manualSales) {
      if (m.client_email) manualByEmail.set(String(m.client_email).toLowerCase().trim(), m);
      if (m.client_name) manualByName.set(normName(m.client_name), m);
    }
    const vendasLista: AgenteIaResult["vendas"]["lista"] = [];
    const vendasKeys = new Set<string>();
    let iniciadasPelaIa = 0;
    let vendasIaIniciou = 0;


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
    const sessoes: AgenteIaResult["sessoes"] = [];
    const statusCount = new Map<SessaoStatus, number>();

    for (const c of convs as any[]) {
      const msgs = (byConv.get(c.id) ?? []).sort((a, b) => a.sent_at.localeCompare(b.sent_at));
      if (!msgs.length) continue;

      // Detect AI messages: prefer clint_source (exact), fallback to regex for old data
      const hasClintSource = msgs.some((m) => m.clint_source != null);
      const aiMsgs = msgs.filter((m) => {
        if (m.direction !== "outbound") return false;
        if (hasClintSource) return m.clint_source === "AI_CONVERSATION";
        return isAiMessage(m.body, null);
      });
      if (!aiMsgs.length) continue;

      conversasIa += 1;
      mensagensIa += aiMsgs.length;
      // Sessões no mesmo critério da Clint: cada bloco de atendimento da IA
      // separado por mais de 12h sem mensagem do agente conta como nova sessão.
      for (let i = 0; i < aiMsgs.length; i++) {
        if (i === 0) {
          sessoesTotal += 1;
          continue;
        }
        const prev = toDate(aiMsgs[i - 1].sent_at) ?? 0;
        const cur = toDate(aiMsgs[i].sent_at) ?? 0;
        if (cur - prev > 12 * 3_600_000) sessoesTotal += 1;
      }
      const startedAt = aiMsgs[0].sent_at;
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

      // Reunião = IA confirmou sessão ("lembrete no dia") OU deal em estágio de reunião (fallback humano)
      const aiMsgBodies = aiMsgs.map((m) => m.body);
      const isReuniao = hasMeetingConfirmation(aiMsgBodies) || isMeetingStage(stage);
      if (isReuniao) {
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

      // ---- Atribuição de venda à IA ----
      // "IA iniciou" = a 1ª mensagem da conversa é da IA (não houve humano antes)
      const iaIniciou = msgs[0].sent_at === aiMsgs[0].sent_at;
      if (iaIniciou) iniciadasPelaIa += 1;

      const email = String(c.contact_email ?? deal?.contact_email ?? "")
        .toLowerCase()
        .trim();
      const nome = normName(c.contact_name ?? deal?.contact_name);

      const push = (
        origem: "Clint (ganho)" | "Fechamento manual",
        vendedor: string,
        produto: string,
        valorEur: number,
        dataVenda: string,
        match: string,
      ) => {
        const key = `${origem}|${email || nome}|${dataVenda}`;
        if (vendasKeys.has(key)) return;
        vendasKeys.add(key);
        vendasLista.push({
          contato: c.contact_name ?? "—",
          origem,
          vendedor,
          produto,
          valorEur,
          data: dataVenda,
          iaIniciou,
          msgsIa: aiMsgs.length,
          match,
        });
        if (iaIniciou) vendasIaIniciou += 1;
      };

      const ganhou = String(deal?.status ?? "").toUpperCase() === "WON";
      if (ganhou) {
        push(
          "Clint (ganho)",
          deal?.won_by_name ?? deal?.user_name ?? "—",
          stage,
          Number(deal?.value ?? 0),
          deal?.won_at ? dayISO(deal.won_at) : dayKey,
          "deal ganho na Clint",
        );
      }

      const ms = (email && manualByEmail.get(email)) || (nome && manualByName.get(nome)) || null;
      if (ms) {
        push(
          "Fechamento manual",
          ms.seller_name ?? "—",
          ms.product ?? "—",
          Number(ms.value_eur ?? 0),
          String(ms.sale_date),
          email && manualByEmail.get(email) ? "e-mail do contacto" : "nome do contacto",
        );
      }

      // ---- Sessão (visão detalhada estilo Clint) ----
      const vendeu = ganhou || !!ms;
      const stageLow = String(stage).toLowerCase();
      const descartado =
        String(deal?.status ?? "").toUpperCase() === "LOST" ||
        /perdid|descart|sem interesse|n(ã|a)o qualific/i.test(stageLow);
      const last = afterStart[afterStart.length - 1];
      const status: SessaoStatus = vendeu
        ? "Venda ganha"
        : isReuniao
          ? "Reunião agendada"
          : humano && respondeu
            ? "Escalada para humano"
            : descartado
              ? "Lead descartado"
              : !respondeu
                ? "Sem resposta"
                : last?.direction === "outbound"
                  ? "Aguardando resposta do lead"
                  : "Em conversa";
      statusCount.set(status, (statusCount.get(status) ?? 0) + 1);
      sessoes.push({
        id: String(c.id),
        contato: c.contact_name ?? c.contact_email ?? "—",
        inicio: startedAt,
        ultima: last?.sent_at ?? startedAt,
        turnos: afterStart.length,
        msgsIa: aiMsgs.length,
        respostasLead: inbound.length,
        status,
        stage,
        tempo1aRespostaMin: first.length && firstDone ? Number(first[first.length - 1].toFixed(1)) : null,
        iaIniciou,
        vendeu,
        ultimaMensagem: (last?.body ?? "").slice(0, 200),
      });
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
        { etapa: "Venda ganha", valor: vendasLista.length },
      ],
      stages: Array.from(stageCount.entries())
        .map(([stage, total]) => ({ stage, total }))
        .sort((a, b) => b.total - a.total),
      respostaBuckets: buckets.map((b) => ({ faixa: b.faixa, total: b.total })),
      amostraSemResposta,
      amostraConvertida,
      sessoes: sessoes.sort((a, b) => b.inicio.localeCompare(a.inicio)),
      statusResumo: Array.from(statusCount.entries())
        .map(([status, total]) => ({ status, total }))
        .sort((a, b) => b.total - a.total),
      vendas: {
        ganhosClint: vendasLista.filter((v) => v.origem === "Clint (ganho)").length,
        vendasManuais: vendasLista.filter((v) => v.origem === "Fechamento manual").length,
        vendasTotal: vendasLista.length,
        valorEur: Number(vendasLista.reduce((s, v) => s + (v.valorEur || 0), 0).toFixed(2)),
        taxaConversaoPct: pct(vendasLista.length, conversasIa),
        iniciadasPelaIa,
        vendasIaIniciou,
        lista: vendasLista.sort((a, b) => b.data.localeCompare(a.data)),
      },
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
              { kpis: res.kpis, funil: res.funil, stages: res.stages, tempos: res.respostaBuckets, vendas_atribuidas: res.vendas, amostra_sem_resposta: res.amostraSemResposta, amostra_convertida: res.amostraConvertida },
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
