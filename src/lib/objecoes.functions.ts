import { createServerFn } from "@tanstack/react-start";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type ObjecaoRow = {
  objecao: string;
  total: number;
  pct: number;
  avg_score: number | null;
  sellers: { seller: string; total: number }[];
  funis: { funil: string; total: number }[];
};

export type ObjecoesResult = {
  from: string;
  to: string;
  sample_size: number;
  total_objecoes: number;
  avg_score: number | null;
  ranking: ObjecaoRow[];
  evolucao: { mes: string; [k: string]: number | string }[];
  meses: string[];
  sellers: string[];
  funis: string[];
};

const normalize = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const LABELS: Record<string, string> = {
  timing: "Timing / momento",
  tempo: "Timing / momento",
  momento: "Timing / momento",
  preco: "Preço / investimento",
  valor: "Preço / investimento",
  dinheiro: "Preço / investimento",
  financeiro: "Preço / investimento",
  // "Medo de não conseguir seguir na profissão" — rede ampliada de palavras-chave
  medo: "Medo de não conseguir seguir na profissão",
  "medo de errar": "Medo de não conseguir seguir na profissão",
  "medo de falhar": "Medo de não conseguir seguir na profissão",
  "medo de nao conseguir": "Medo de não conseguir seguir na profissão",
  "nao conseguir": "Medo de não conseguir seguir na profissão",
  inseguran: "Medo de não conseguir seguir na profissão",
  insegur: "Medo de não conseguir seguir na profissão",
  inseguro: "Medo de não conseguir seguir na profissão",
  incerteza: "Medo de não conseguir seguir na profissão",
  incerto: "Medo de não conseguir seguir na profissão",
  receio: "Medo de não conseguir seguir na profissão",
  ansiedade: "Medo de não conseguir seguir na profissão",
  capacidade: "Medo de não conseguir seguir na profissão",
  incapaz: "Medo de não conseguir seguir na profissão",
  "nao dar conta": "Medo de não conseguir seguir na profissão",
  fracasso: "Medo de não conseguir seguir na profissão",
  "duvida de si": "Medo de não conseguir seguir na profissão",
  autoconfianca: "Medo de não conseguir seguir na profissão",
  resultado: "Medo de não conseguir seguir na profissão",
  confianca: "Medo de não conseguir seguir na profissão",
  ceticismo: "Medo de não conseguir seguir na profissão",
  credibilidade: "Medo de não conseguir seguir na profissão",
  financas: "Medo de não conseguir seguir na profissão",
  sobreviver: "Medo de não conseguir seguir na profissão",
  "viver da profissao": "Medo de não conseguir seguir na profissão",
  profissao: "Medo de não conseguir seguir na profissão",
  // "Outro" → rótulo claro
  outro: "Não foi claro em declarar objeção",
  // Demais categorias
  autoridade: "Decisor / autoridade",
  decisor: "Decisor / autoridade",
  conjuge: "Decisor / autoridade",
  necessidade: "Necessidade / fit",
  fit: "Necessidade / fit",
  interesse: "Falta de interesse",
  concorrencia: "Concorrência",
  suporte: "Dúvidas sobre entrega/suporte",
  duvida: "Dúvidas sobre o produto",
  produto: "Dúvidas sobre o produto",
};

const MEDO = "Medo de não conseguir seguir na profissão";
// Palavras que indicam motivo CONCRETO de agenda (permanece "Timing / momento").
// Todo adiamento genérico ("timing", "tempo", "depois", "agora não") cai em "Medo".
const TIMING_CONCRETO = [
  "ferias", "feria", "viagem", "viajar", "cirurgia", "operac", "exame",
  "consulta", "compromisso", "reuniao marcada", "agenda cheia", "viage",
  "trabalho", "empresa", "matriz", "filial", " congresso", "curso marcado",
  "data", "dia x", "semana que vem", "proximo mes", "mes que vem",
  "outubro", "novembro", "dezembro", "setembro", "agosto",
];
function labelFor(raw: string) {
  const n = normalize(raw);
  // Timing CONCRETO (agenda/férias/viagem/cirurgia/datas) → permanece Timing
  if (TIMING_CONCRETO.some((k) => n.includes(k))) return "Timing / momento";
  // Adiamento genérico (timing/tempo/momento/adiar/depois/agora não) → Medo
  if (["timing", "tempo", "momento", "adiar", "depois", "agora nao", "nao agora"].some((k) => n.includes(k))) {
    return MEDO;
  }
  for (const k of Object.keys(LABELS)) if (n.includes(k)) return LABELS[k];
  return "Não foi claro em declarar objeção";
}


export const fetchObjecoesFn = createServerFn({ method: "GET" })
  .inputValidator((d: { from?: string; to?: string; seller?: string; funil?: string } = {}) => d)
  .handler(async ({ data }): Promise<ObjecoesResult> => {
    const db = await admin();
    const to = data.to ?? new Date().toISOString().slice(0, 10);
    const from = data.from ?? new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);

    const { data: analyses, error } = await db
      .from("coach_analyses")
      .select("conversation_id, score_geral, objecoes, analyzed_at")
      .eq("status", "ok")
      .gte("analyzed_at", `${from}T00:00:00Z`)
      .lte("analyzed_at", `${to}T23:59:59Z`)
      .limit(3000);
    if (error) throw new Error(error.message);

    const rows = (analyses ?? []).filter(
      (r: any) => Array.isArray(r.objecoes) && r.objecoes.length > 0,
    );
    const ids = Array.from(new Set(rows.map((r: any) => r.conversation_id)));

    const convById = new Map<string, any>();
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { data: convs } = await db
        .from("coach_conversations")
        .select("id, seller_name, seller_email, origin_name, is_ai_conversation")
        .in("id", chunk);
      for (const c of (convs ?? []) as any[]) convById.set(c.id, c);
    }

    const sellersSet = new Set<string>();
    const funisSet = new Set<string>();
    const agg = new Map<
      string,
      { total: number; scores: number[]; sellers: Map<string, number>; funis: Map<string, number> }
    >();
    const evoMap = new Map<string, Map<string, number>>();
    let sample = 0;
    let totalObj = 0;
    const allScores: number[] = [];

    for (const r of rows as any[]) {
      const conv = convById.get(r.conversation_id);
      if (!conv || conv.is_ai_conversation) continue;
      const seller = (conv.seller_name || conv.seller_email || "—").trim();
      const funil = (conv.origin_name || "—").trim();
      sellersSet.add(seller);
      funisSet.add(funil);
      if (data.seller && data.seller !== "all" && seller !== data.seller) continue;
      if (data.funil && data.funil !== "all" && funil !== data.funil) continue;

      sample++;
      if (typeof r.score_geral === "number") allScores.push(Number(r.score_geral));
      const mes = String(r.analyzed_at ?? "").slice(0, 7);

      const seen = new Set<string>();
      for (const raw of r.objecoes as any[]) {
        if (typeof raw !== "string" || !raw.trim()) continue;
        const label = labelFor(raw);
        if (seen.has(label)) continue;
        seen.add(label);
        totalObj++;
        let a = agg.get(label);
        if (!a) {
          a = { total: 0, scores: [], sellers: new Map(), funis: new Map() };
          agg.set(label, a);
        }
        a.total++;
        if (typeof r.score_geral === "number") a.scores.push(Number(r.score_geral));
        a.sellers.set(seller, (a.sellers.get(seller) ?? 0) + 1);
        a.funis.set(funil, (a.funis.get(funil) ?? 0) + 1);
        if (mes) {
          let m = evoMap.get(mes);
          if (!m) { m = new Map(); evoMap.set(mes, m); }
          m.set(label, (m.get(label) ?? 0) + 1);
        }
      }
    }

    const PRIORITARIA = "Medo de não conseguir seguir na profissão";
    const SEGUNDA = "Timing / momento";
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
      }))
      .sort((a, b) => {
        // 1º: "Medo de não conseguir seguir na profissão" (sempre)
        if (a.objecao === PRIORITARIA) return -1;
        if (b.objecao === PRIORITARIA) return 1;
        // 2º: "Timing / momento" (neste mês, não como prioridade)
        if (a.objecao === SEGUNDA) return -1;
        if (b.objecao === SEGUNDA) return 1;
        // Demais por frequência
        return b.total - a.total;
      });

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
  .inputValidator((d: { ranking: { objecao: string; total: number; avg_score: number | null }[]; contexto?: string }) => d)
  .handler(async ({ data }): Promise<ObjecoesPlaybook> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY não configurada");
    const sys =
      "Você é uma líder comercial sênior da LLMídia (infoprodutos/mentorias de tráfego, ticket alto, venda por WhatsApp e call). " +
      "Recebe o ranking de objeções detectadas por IA nas conversas do time. A objeção nº1 do público é o MEDO DE NÃO CONSEGUIR SEGUIR NA PROFISSÃO DE GESTOR DE TRÁFEGO (insegurança sobre conseguir clientes e resultados) — trate-a sempre como prioridade alta e primeiro item da lista. A objeção nº2 é TIMING / MOMENTO (adiamento) — trate como prioridade média, não como foco principal deste mês. Para cada objeção, diga a causa raiz provável no atendimento, " +
      "como contornar, um script pronto em português do Brasil (linguagem de WhatsApp, humana, sem parecer robô) e como PREVENIR a objeção antes dela aparecer. " +
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
            content:
              `${data.contexto ?? ""}\nRANKING:\n${JSON.stringify(data.ranking.slice(0, 10), null, 2)}`,
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
