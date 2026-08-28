import { createServerFn } from "@tanstack/react-start";
import { V3_ORIGIN_NAMES } from "@/lib/origem-v3.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// hash barato para saber se a conversa mudou desde a última leitura da IA
function hashText(t: string): string {
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0;
  return `${t.length}-${h.toString(36)}`;
}

const normalize = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export type ObjecaoEvidencia = {
  conversation_id: string;
  contato: string;
  seller: string;
  trecho: string;
  fonte: "mensagem" | "ligacao";
};

export type ObjecaoRow = {
  objecao: string;
  total: number;
  pct: number;
  avg_score: number | null;
  mensagens: number;
  ligacoes: number;
  sellers: { seller: string; total: number }[];
  funis: { funil: string; total: number }[];
  evidencias: ObjecaoEvidencia[];
};

export type ObjecoesResult = {
  from: string;
  to: string;
  sample_size: number;
  conversas_analisadas: number;
  total_objecoes: number;
  objecoes_mensagens: number;
  objecoes_ligacoes: number;
  ligacoes_analisadas: number;
  avg_score: number | null;
  ranking: ObjecaoRow[];
  evolucao: { mes: string; [k: string]: number | string }[];
  meses: string[];
  sellers: string[];
  funis: string[];
};

/**
 * Sinal de que o vendedor CONDUZIU para o fecho (proposta / valor / matrícula /
 * pós-reunião). As objeções que interessam são as que o lead levanta DEPOIS
 * disso — as dúvidas iniciais ("nunca ouvi falar", "como funciona") são
 * nutrição, não objeção de fecho.
 */
const FECHAMENTO_RE =
  /(investimento|valor d|valores|quanto (custa|fica|é)|pre[cç]o|matr[ií]cula|contrato|pagamento|pix|boleto|cart[aã]o|parcel|entrada de|condi[cç][oõ]es|proposta|desconto|link de pagamento|fechar (hoje|agora|com)|garantir (sua |a )?vaga|reserva(r)? (sua )?vaga|ap[oó]s (a |nossa )?reuni[aã]o|depois d[ao] (call|reuni[aã]o)|como combinamos na (call|reuni[aã]o))/i;

/** Mapa das objeções escritas em texto livre nas ligações → catálogo fechado. */


// Catálogo fechado de objeções — a IA precisa escolher uma destas, sempre com
// trecho literal do lead. Nada é "forçado" para o topo: o ranking é o real.
export const OBJECOES = [
  "Preço / não tem o dinheiro agora",
  "Medo de não conseguir resultado",
  "Falta de tempo para estudar/aplicar",
  "Vai decidir depois (data/motivo concreto)",
  "Desconfiança / medo de golpe",
  "Precisa falar com cônjuge/família",
  "Já tentou antes e não deu certo",
  "Dúvidas sobre o produto ou a entrega",
  "Quer comparar com outro curso/mentoria",
  "Achou que era grátis / não esperava pagar",
  "Sem interesse real / não é o público",
] as const;

const SEM_OBJECAO = "Nenhuma objeção declarada";

/** Objeções das ligações vêm em texto livre → mapeadas para o catálogo. */
const LIGACAO_MAP: { re: RegExp; label: string }[] = [
  { re: /(dinheiro|valor|pre[cç]o|caro|matr[ií]cula|invest|pagar|salario|sal[aá]rio|or[cç]amento|financ)/i, label: "Preço / não tem o dinheiro agora" },
  { re: /(medo de n[aã]o|n[aã]o vou conseguir|inseguran|d[uú]vida se funciona|ser[aá] que d[aá] certo|resultado)/i, label: "Medo de não conseguir resultado" },
  { re: /(tempo|agenda|trabalha|hor[aá]rio|corrido)/i, label: "Falta de tempo para estudar/aplicar" },
  { re: /(pensar|decidir depois|depois|amanh[aã]|semana que vem|viagem|f[eé]rias|analisar)/i, label: "Vai decidir depois (data/motivo concreto)" },
  { re: /(golpe|confian|desconfi|seguran[cç]a|garantia)/i, label: "Desconfiança / medo de golpe" },
  { re: /(esposa|marido|mulher|c[oô]njuge|fam[ií]lia|s[oó]cio|pais)/i, label: "Precisa falar com cônjuge/família" },
  { re: /(j[aá] tentou|j[aá] fiz|outro curso antes|n[aã]o deu certo)/i, label: "Já tentou antes e não deu certo" },
  { re: /(comparar|outra mentoria|outro curso|concorr)/i, label: "Quer comparar com outro curso/mentoria" },
  { re: /(gr[aá]tis|gratuito|n[aã]o sabia que era pago|achou que era)/i, label: "Achou que era grátis / não esperava pagar" },
  { re: /(sem interesse|n[aã]o quer|n[aã]o tem interesse|n[aã]o é para mim|desistiu)/i, label: "Sem interesse real / não é o público" },
  { re: /(d[uú]vida|como funciona|entrega|conte[uú]do|aula|suporte)/i, label: "Dúvidas sobre o produto ou a entrega" },
];

function mapLigacaoObjecao(txt: string): string | null {
  const t = String(txt ?? "").trim();
  if (!t || t.length < 3) return null;
  for (const m of LIGACAO_MAP) if (m.re.test(t)) return m.label;
  return null;
}

// Mensagens de automação / opt-in — não são conversa real do lead.
const AUTOMACAO_PATTERNS = [
  "acabei de inscrever", "acabei de me inscrever", "gostaria de receb", "quero receber o ebook",
  "quero o ebook", "quero receber o minicurso", "quero participar da sessao", "quero minha sessao estrategica",
  "vim pelo anuncio", "vim pelo instagram", "recebi o link", "confirmo minha presenca",
  "quero receber o presente", "quero o presente", "quero participar da imersao", "quero entrar no grupo",
  "quero as aulas", "quero o link", "quero receber os links",
];

function isAutomacao(body: string): boolean {
  const t = normalize(body).replace(/\s+/g, " ");
  if (t.length < 3) return true;
  if (/^(sim|nao|ok|okay|quero|sim quero|sim!|ja|ja entrei|\d{1,2})$/.test(t)) return true;
  if (t.length < 20 && /^(sim|ok|quero|ja|entrei|consegui|combinado|obrigad|bom dia|boa tarde|boa noite)/.test(t))
    return true;
  return AUTOMACAO_PATTERNS.some((p) => t.includes(p));
}

type IAObj = { objecao: string; trecho: string };

// A IA lê o que o LEAD escreveu e devolve as objeções REAIS, cada uma com o
// trecho literal que a comprova. Sem trecho → a objeção é descartada.
async function detectWithAI(
  items: { id: string; text: string }[],
): Promise<Map<string, IAObj[]>> {
  const out = new Map<string, IAObj[]>();
  const key = process.env["LOVABLE_API_KEY"];
  if (!key || items.length === 0) return out;

  const lista = [...OBJECOES, SEM_OBJECAO];
  const sys =
    "Você é analista sênior de vendas de uma empresa de mentorias de tráfego pago (venda por WhatsApp, ticket alto). " +
    "Sua tarefa: identificar as OBJEÇÕES REAIS que cada lead levantou, usando SOMENTE o que o próprio lead escreveu. " +
    "Nunca invente objeção e nunca deduza pelo silêncio do lead.\n\n" +
    "OBJEÇÕES POSSÍVEIS (use exatamente estes rótulos):\n" +
    lista.map((o) => `- ${o}`).join("\n") +
    "\n\nREGRAS:\n" +
    '1. Para cada objeção, inclua "trecho": citação LITERAL do lead (máx. 160 caracteres) que comprova a objeção. Sem citação literal, não inclua a objeção.\n' +
    `2. Se o lead não levantou nenhuma objeção, devolva uma única objeção "${SEM_OBJECAO}" com trecho "".\n` +
    '3. "Vai decidir depois (data/motivo concreto)" só quando o lead cita motivo/data real (férias, viagem, salário no dia X, cirurgia). Adiamento vago sem motivo NÃO é isso — classifique pela razão de fundo (preço, medo, desconfiança) só se houver evidência; senão use "' +
    SEM_OBJECAO +
    '".\n' +
    "4. Máximo 3 objeções por lead, das mais explícitas para as menos.\n" +
    '5. Responda APENAS JSON: {"itens":[{"id":"...","objecoes":[{"objecao":"...","trecho":"..."}]}]} incluindo TODOS os ids recebidos.';

  const batches: { id: string; text: string }[][] = [];
  for (let i = 0; i < items.length; i += 8) batches.push(items.slice(i, i + 8));

  const runBatch = async (batch: { id: string; text: string }[]) => {
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          temperature: 0,
          messages: [
            { role: "system", content: sys },
            {
              role: "user",
              content: batch
                .map((b) => `ID: ${b.id}\nLEAD DISSE: ${b.text.replace(/\s+/g, " ").slice(0, 2200)}`)
                .join("\n---\n"),
            },
          ],
        }),
      });
      if (!res.ok) return;
      const j = (await res.json()) as any;
      const raw = String(j?.choices?.[0]?.message?.content ?? "");
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) return;
      const parsed = JSON.parse(m[0]);
      for (const it of parsed?.itens ?? []) {
        const id = String(it?.id ?? "");
        if (!id) continue;
        const objs: IAObj[] = [];
        for (const o of it?.objecoes ?? []) {
          const label = String(o?.objecao ?? "").trim();
          if (!lista.includes(label as any)) continue;
          const trecho = String(o?.trecho ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
          if (label !== SEM_OBJECAO && !trecho) continue;
          if (objs.some((x) => x.objecao === label)) continue;
          objs.push({ objecao: label, trecho });
        }
        out.set(id, objs.slice(0, 3));
      }
    } catch {
      /* sem veredito: a conversa fica de fora deste ciclo */
    }
  };

  const pend = batches.slice(0, 60);
  for (let i = 0; i < pend.length; i += 6) {
    await Promise.all(pend.slice(i, i + 6).map(runBatch));
  }
  return out;
}

// v2 = só o trecho de fecho da conversa é enviado à IA (invalida cache antigo)
const CACHE_VERSION = "obj-v2-fecho";

export const fetchObjecoesFn = createServerFn({ method: "GET" })
  .inputValidator((d: { from?: string; to?: string; seller?: string; funil?: string } = {}) => d)
  .handler(async ({ data }): Promise<ObjecoesResult> => {
    const db = await admin();
    const hoje = new Date().toISOString().slice(0, 10);
    const to = data.to ?? hoje;
    // Padrão = mês corrente. Para ver mais histórico, basta mudar o "De".
    const from = data.from ?? `${hoje.slice(0, 7)}-01`;

    // 1) Conversas humanas do funil comercial no período
    const { data: convs, error } = await db
      .from("coach_conversations")
      .select("id, seller_name, seller_email, origin_name, contact_name, last_message_at, is_ai_conversation")
      .in("origin_name", V3_ORIGIN_NAMES)
      .eq("is_ai_conversation", false)
      .gte("last_message_at", `${from}T00:00:00Z`)
      .lte("last_message_at", `${to}T23:59:59Z`)
      .order("last_message_at", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);

    const list = ((convs ?? []) as any[]).filter(
      (c) => String(c.seller_name ?? c.seller_email ?? "").trim() !== "",
    );
    const ids = list.map((c) => String(c.id));

    // 2) Mensagens ordenadas por conversa (precisamos da ordem para saber
    //    onde começou a conducão para o fecho).
    const msgsById = new Map<string, { at: string; dir: string; body: string }[]>();
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
    for (let i = 0; i < chunks.length; i += 5) {
      const res = await Promise.all(
        chunks.slice(i, i + 5).map((ch) =>
          db
            .from("coach_messages")
            .select("conversation_id, body, direction, sent_at")
            .in("conversation_id", ch)
            .limit(40000),
        ),
      );
      for (const r of res) {
        for (const m of ((r.data ?? []) as any[])) {
          if (!m.body) continue;
          const cid = String(m.conversation_id);
          let arr = msgsById.get(cid);
          if (!arr) { arr = []; msgsById.set(cid, arr); }
          arr.push({ at: String(m.sent_at ?? ""), dir: String(m.direction), body: String(m.body) });
        }
      }
    }

    // 2b) Recorte da FASE DE FECHO: só o que o lead disse depois de o vendedor
    //     puxar valor/proposta/pós-reunião. Sem esse gatilho, usamos a parte
    //     final da conversa (últimas falas), nunca as perguntas iniciais.
    const textById = new Map<string, string>();
    const inbound = new Map<string, number>();
    const outbound = new Map<string, number>();
    const comFechamento = new Set<string>();

    for (const [cid, arrRaw] of msgsById) {
      const arr = arrRaw.slice().sort((a, b) => a.at.localeCompare(b.at));
      let cut = -1;
      for (let i = 0; i < arr.length; i++) {
        const m = arr[i]!;
        if (m.dir !== "inbound" && FECHAMENTO_RE.test(m.body)) { cut = i; break; }
      }
      if (cut >= 0) comFechamento.add(cid);
      const leadAll = arr.filter((m) => m.dir === "inbound" && !isAutomacao(m.body));
      const out = arr.filter((m) => m.dir !== "inbound");
      outbound.set(cid, out.length);

      let lead = cut >= 0 ? arr.slice(cut).filter((m) => m.dir === "inbound" && !isAutomacao(m.body)) : [];
      if (lead.length === 0) {
        // fallback: metade final das falas do lead (mínimo 3 últimas)
        const keep = Math.max(3, Math.ceil(leadAll.length / 2));
        lead = leadAll.slice(-keep);
      }

      const seen = new Set<string>();
      let text = "";
      let n = 0;
      for (const m of lead) {
        const k = normalize(m.body).replace(/\s+/g, " ").slice(0, 120);
        if (seen.has(k)) continue;
        seen.add(k);
        n++;
        if (text.length > 7000) continue;
        text += ` ${m.body}`;
      }
      inbound.set(cid, n);
      textById.set(cid, text);
    }

    // conversa real: o lead falou e o vendedor respondeu
    const validos = list.filter((c) => {
      const t = textById.get(String(c.id)) ?? "";
      return (inbound.get(String(c.id)) ?? 0) >= 1 && (outbound.get(String(c.id)) ?? 0) >= 1 && t.trim().length >= 25;
    });

    // 3) Notas das análises (para nota média por objeção)
    const scoreById = new Map<string, number>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data: an } = await db
        .from("coach_analyses")
        .select("conversation_id, score_geral")
        .in("conversation_id", ids.slice(i, i + 200))
        .eq("status", "ok");
      for (const a of (an ?? []) as any[]) {
        if (typeof a.score_geral === "number") scoreById.set(String(a.conversation_id), Number(a.score_geral));
      }
    }

    // 4) Cache + IA
    const targets = validos.map((c) => ({
      id: String(c.id),
      text: textById.get(String(c.id)) ?? "",
      hash: `${CACHE_VERSION}|${hashText(textById.get(String(c.id)) ?? "")}`,
    }));
    const objById = new Map<string, IAObj[]>();
    if (targets.length > 0) {
      const tIds = targets.map((t) => t.id);
      const cchunks: string[][] = [];
      for (let i = 0; i < tIds.length; i += 200) cchunks.push(tIds.slice(i, i + 200));
      const cached = await Promise.all(
        cchunks.map((ch) =>
          db.from("lead_objecao_cache").select("conversation_id, text_hash, objecoes").in("conversation_id", ch),
        ),
      );
      const byId = new Map<string, any>();
      for (const r of cached) for (const row of ((r.data ?? []) as any[])) byId.set(String(row.conversation_id), row);
      for (const t of targets) {
        const row = byId.get(t.id);
        if (row && String(row.text_hash) === t.hash) {
          objById.set(t.id, Array.isArray(row.objecoes) ? (row.objecoes as IAObj[]) : []);
        }
      }

      const pendentes = targets.filter((t) => !objById.has(t.id)).slice(0, 480);
      if (pendentes.length > 0) {
        const hits = await detectWithAI(pendentes.map((p) => ({ id: p.id, text: p.text })));
        const rows: any[] = [];
        for (const p of pendentes) {
          const r = hits.get(p.id);
          if (!r) continue;
          objById.set(p.id, r);
          rows.push({
            conversation_id: p.id,
            text_hash: p.hash,
            objecoes: r,
            updated_at: new Date().toISOString(),
          });
        }
        for (let i = 0; i < rows.length; i += 200) {
          await db.from("lead_objecao_cache").upsert(rows.slice(i, i + 200), { onConflict: "conversation_id" });
        }
      }
    }

    // 5) Agregação
    const sellersSet = new Set<string>();
    const funisSet = new Set<string>();
    const agg = new Map<
      string,
      {
        total: number; scores: number[]; sellers: Map<string, number>; funis: Map<string, number>;
        evidencias: ObjecaoEvidencia[];
      }
    >();
    const evoMap = new Map<string, Map<string, number>>();
    let sample = 0;
    let analisadas = 0;
    let totalObj = 0;
    const allScores: number[] = [];

    for (const c of validos) {
      const id = String(c.id);
      const seller = (c.seller_name || c.seller_email || "—").trim();
      const funil = (c.origin_name || "—").trim();
      sellersSet.add(seller);
      funisSet.add(funil);
      if (data.seller && data.seller !== "all" && seller !== data.seller) continue;
      if (data.funil && data.funil !== "all" && funil !== data.funil) continue;

      const objs = objById.get(id);
      if (!objs) continue; // sem veredito da IA neste ciclo
      analisadas++;
      const comObjecao = objs.filter((o) => o.objecao !== SEM_OBJECAO);
      const score = scoreById.get(id);
      const mes = String(c.last_message_at ?? "").slice(0, 7);
      if (comObjecao.length === 0) continue;
      sample++;
      if (typeof score === "number") allScores.push(score);

      for (const o of comObjecao) {
        totalObj++;
        let a = agg.get(o.objecao);
        if (!a) {
          a = { total: 0, scores: [], sellers: new Map(), funis: new Map(), evidencias: [] };
          agg.set(o.objecao, a);
        }
        a.total++;
        if (typeof score === "number") a.scores.push(score);
        a.sellers.set(seller, (a.sellers.get(seller) ?? 0) + 1);
        a.funis.set(funil, (a.funis.get(funil) ?? 0) + 1);
        if (o.trecho && a.evidencias.length < 8) {
          a.evidencias.push({
            conversation_id: id,
            contato: String(c.contact_name ?? "—"),
            seller,
            trecho: o.trecho,
          });
        }
        if (mes) {
          let m = evoMap.get(mes);
          if (!m) { m = new Map(); evoMap.set(mes, m); }
          m.set(o.objecao, (m.get(o.objecao) ?? 0) + 1);
        }
      }
    }

    const ranking: ObjecaoRow[] = Array.from(agg.entries())
      .map(([objecao, a]) => ({
        objecao,
        total: a.total,
        pct: totalObj ? (a.total / totalObj) * 100 : 0,
        avg_score: a.scores.length ? a.scores.reduce((x, y) => x + y, 0) / a.scores.length : null,
        sellers: Array.from(a.sellers.entries())
          .map(([seller, total]) => ({ seller, total }))
          .sort((x, y) => y.total - x.total)
          .slice(0, 6),
        funis: Array.from(a.funis.entries())
          .map(([funil, total]) => ({ funil, total }))
          .sort((x, y) => y.total - x.total)
          .slice(0, 4),
        evidencias: a.evidencias,
      }))
      .sort((a, b) => b.total - a.total);

    const top = ranking.slice(0, 5).map((r) => r.objecao);
    const evolucao = Array.from(evoMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([mes, m]) => {
        const row: any = { mes };
        for (const t of top) row[t] = m.get(t) ?? 0;
        return row;
      });

    return {
      from,
      to,
      sample_size: sample,
      conversas_analisadas: analisadas,
      total_objecoes: totalObj,
      avg_score: allScores.length ? allScores.reduce((a, b) => a + b, 0) / allScores.length : null,
      ranking,
      evolucao,
      meses: top,
      sellers: Array.from(sellersSet).sort((a, b) => a.localeCompare(b)),
      funis: Array.from(funisSet).sort((a, b) => a.localeCompare(b)),
    };
  });

export type ObjecoesPlaybook = {
  generated_at: string;
  resumo: string;
  itens: {
    objecao: string;
    causa_raiz: string;
    contorno: string;
    script: string;
    prevencao: string;
    prioridade: "alta" | "media" | "baixa";
  }[];
  acoes_gestao: string[];
};

export const generateObjecoesPlaybookFn = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      ranking: { objecao: string; total: number; avg_score: number | null; exemplos?: string[] }[];
      contexto?: string;
    }) => d,
  )
  .handler(async ({ data }): Promise<ObjecoesPlaybook> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("LOVABLE_API_KEY não configurada");
    const sys =
      "Você é uma líder comercial sênior da LLMídia (infoprodutos/mentorias de tráfego, ticket alto, venda por WhatsApp e call). " +
      "Recebe o ranking REAL de objeções detectadas nas conversas, com frases literais dos leads. " +
      "Trate a ordem recebida como a realidade do mês — a prioridade alta é a objeção com mais casos e/ou pior nota; não invente hierarquia. " +
      "Para cada objeção, diga a causa raiz provável no atendimento, como contornar, um script pronto em português do Brasil " +
      "(linguagem de WhatsApp, humana, sem parecer robô) e como PREVENIR a objeção antes dela aparecer. " +
      "Responda SOMENTE JSON válido: " +
      `{"resumo":"3-4 frases para a gestão","itens":[{"objecao":"string","causa_raiz":"string","contorno":"string","script":"string","prevencao":"string","prioridade":"alta|media|baixa"}],"acoes_gestao":["string"]}. ` +
      "Máx 8 itens e 5 ações.";
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
            content: `${data.contexto ?? ""}\nRANKING REAL:\n${JSON.stringify(data.ranking.slice(0, 10), null, 2)}`,
          },
        ],
      }),
    });
    if (!resp.ok) throw new Error(`Lovable AI ${resp.status}: ${await resp.text().catch(() => "")}`);
    const j = (await resp.json()) as any;
    let parsed: any = {};
    try { parsed = JSON.parse(j?.choices?.[0]?.message?.content ?? "{}"); } catch { parsed = {}; }
    return {
      generated_at: new Date().toISOString(),
      resumo: parsed.resumo ?? "",
      itens: Array.isArray(parsed.itens) ? parsed.itens.slice(0, 8) : [],
      acoes_gestao: Array.isArray(parsed.acoes_gestao) ? parsed.acoes_gestao.slice(0, 5) : [],
    };
  });
