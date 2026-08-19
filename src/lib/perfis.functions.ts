import { createServerFn } from "@tanstack/react-start";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type PerfilRow = {
  perfil: string;
  descricao: string;
  total: number;
  pct: number;
  humano: number;
  ia: number;
  vendas: number;
  conv: number;
  avg_score: number | null;
  exemplos: string[];
  sellers: { seller: string; total: number }[];
};

export type PerfisResult = {
  from: string;
  to: string;
  total_conversas: number;
  classificadas: number;
  nao_identificados: number;
  origem: "todas" | "humano" | "ia";
  ranking: PerfilRow[];
};

const normalize = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

type PerfilDef = { nome: string; descricao: string; kw: string[] };

// Heurística de perfil de lead a partir do que o PRÓPRIO lead escreve.
const PERFIS: PerfilDef[] = [
  {
    nome: "Mães com filhos pequenos",
    descricao: "Mães/pais que buscam renda em casa para cuidar dos filhos",
    kw: [
      "sou mae", "sou mãe", "mae de", "maes", "minha filha pequena", "meu filho pequeno",
      "bebe", "bebê", "recem nascido", "amamenta", "gravida", "gestante", "licenca maternidade",
      "cuidar dos meus filhos", "cuidar do meu filho", "cuidar da minha filha", "filho pequeno",
      "filha pequena", "creche", "escola dos meus filhos", "dona de casa", "do lar",
    ],
  },
  {
    nome: "Desempregados",
    descricao: "Sem emprego no momento, buscam recolocação/renda urgente",
    kw: [
      "desempregad", "sem emprego", "estou sem trabalho", "to sem trabalho", "perdi meu emprego",
      "fui demitid", "demissao", "sem renda", "estou parad", "procurando emprego",
      "nao tenho renda", "estou desempregada", "seguro desemprego",
    ],
  },
  {
    nome: "Caminhoneiros / motoristas",
    descricao: "Motoristas de caminhão, app, uber, entregadores",
    kw: [
      "caminhoneir", "caminhao", "carreta", "motorista", "uber", "99", "ifood", "entregador",
      "estrada", "rodovia", "frete", "motoboy", "app de transporte",
    ],
  },
  {
    nome: "CLT / assalariados",
    descricao: "Empregados com carteira que querem renda extra ou transição",
    kw: [
      "clt", "carteira assinada", "trabalho registrad", "meu patrao", "meu chefe", "expediente",
      "trabalho das 8", "horario comercial", "meu emprego atual", "trabalho fixo", "empresa que trabalho",
      "renda extra", "sair do emprego", "largar o emprego", "escala 6x1", "turno",
    ],
  },
  {
    nome: "Autônomos / pequenos empresários",
    descricao: "Têm negócio próprio, loja, prestação de serviço",
    kw: [
      "autonom", "tenho meu negocio", "minha empresa", "minha loja", "meu comercio", "mei",
      "empreendedor", "sou dono", "sou dona", "presto servico", "meu salao", "barbearia",
      "clinica", "consultorio", "meu cnpj",
    ],
  },
  {
    nome: "Já atua com tráfego/marketing",
    descricao: "Gestores de tráfego, social media, agências e freelancers da área",
    kw: [
      "gestor de trafego", "gestora de trafego", "ja gerencio", "tenho clientes", "meus clientes",
      "social media", "agencia", "freelancer", "faco anuncio", "rodo campanha", "gerencio campanha",
      "meta ads", "google ads", "trabalho com marketing", "designer",
    ],
  },
  {
    nome: "Estudantes / iniciantes",
    descricao: "Estudando, primeiro emprego, começando do zero",
    kw: [
      "estudante", "faculdade", "cursando", "universidade", "estagio", "primeiro emprego",
      "comecando do zero", "sou iniciante", "nao sei nada", "17 anos", "18 anos", "19 anos",
      "acabei de terminar o ensino",
    ],
  },
  {
    nome: "Servidores / militares / saúde",
    descricao: "Concursados, militares, enfermagem, professores",
    kw: [
      "servidor", "concurs", "militar", "policia", "bombeiro", "exercito", "enfermeir",
      "tecnico de enfermagem", "professor", "professora", "hospital", "plantao", "sou funcionario publico",
    ],
  },
  {
    nome: "Aposentados / 50+",
    descricao: "Aposentados ou público mais velho buscando nova fonte de renda",
    kw: ["aposentad", "inss", "pensionista", "ja tenho 5", "ja tenho 6", "60 anos", "55 anos", "idade avancada"],
  },
  {
    nome: "Fora do Brasil / imigrantes",
    descricao: "Leads morando em Portugal, EUA e outros países",
    kw: [
      "moro em portugal", "aqui em portugal", "lisboa", "porto", "moro nos estados unidos",
      "moro na irlanda", "moro no japao", "imigrante", "morando fora", "moro fora do brasil", "euro",
    ],
  },
];

function classify(text: string): string[] {
  const t = normalize(text);
  const hits: string[] = [];
  for (const p of PERFIS) {
    if (p.kw.some((k) => t.includes(normalize(k)))) hits.push(p.nome);
  }
  return hits;
}

function snippet(text: string, perfil: string): string | null {
  const def = PERFIS.find((p) => p.nome === perfil);
  if (!def) return null;
  const lower = normalize(text);
  for (const k of def.kw) {
    const i = lower.indexOf(normalize(k));
    if (i >= 0) {
      const start = Math.max(0, i - 60);
      return `...${text.slice(start, i + 100).replace(/\s+/g, " ").trim()}...`;
    }
  }
  return null;
}

// Mensagens de automação / opt-in (o lead clicou num botão do funil).
// Não são "conversa real" — poluem os perfis e os trechos.
const AUTOMACAO_PATTERNS = [
  "acabei de inscrever",
  "acabei de me inscrever",
  "gostaria de receb",
  "quero receber o ebook",
  "quero o ebook",
  "quero receber o minicurso",
  "quero participar da sessao",
  "quero minha sessao estrategica",
  "vim pelo anuncio",
  "vim pelo instagram",
  "quero saber mais sobre o minicurso",
  "recebi o link",
  "confirmo minha presenca",
];

function isAutomacao(body: string): boolean {
  const t = normalize(body).replace(/\s+/g, " ").trim();
  if (t.length < 3) return true;
  // respostas de botão: "sim", "sim quero", "ok", "1", "2"
  if (/^(sim|nao|ok|okay|quero|sim quero|sim!|\d{1,2})$/.test(t)) return true;
  return AUTOMACAO_PATTERNS.some((p) => t.includes(p));
}


export const fetchPerfisLeadsFn = createServerFn({ method: "GET" })
  .inputValidator((d: { from?: string; to?: string; origem?: "todas" | "humano" | "ia" } = {}) => d)
  .handler(async ({ data }): Promise<PerfisResult> => {
    const db = await admin();
    const to = data.to ?? new Date().toISOString().slice(0, 10);
    const from = data.from ?? new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
    const origem = data.origem ?? "todas";

    let q = db
      .from("coach_conversations")
      .select("id, seller_name, seller_email, is_ai_conversation, contact_name, contact_email, deal_id, last_message_at")
      .gte("last_message_at", `${from}T00:00:00Z`)
      .lte("last_message_at", `${to}T23:59:59Z`)
      .order("last_message_at", { ascending: false })
      .limit(2000);
    if (origem === "humano") q = q.eq("is_ai_conversation", false);
    if (origem === "ia") q = q.eq("is_ai_conversation", true);

    const { data: convs, error } = await q;
    if (error) throw new Error(error.message);
    const list = (convs ?? []) as any[];
    const ids = list.map((c) => c.id);

    // Clientes que compraram (fechamento manual) — para conversão por perfil
    const soldEmails = new Set<string>();
    const soldNames = new Set<string>();
    {
      const { data: vendas } = await db.from("manual_sales").select("client_name, client_email").limit(5000);
      for (const v of (vendas ?? []) as any[]) {
        if (v.client_email) soldEmails.add(String(v.client_email).trim().toLowerCase());
        if (v.client_name) soldNames.add(normalize(String(v.client_name).trim()));
      }
    }
    const isSold = (c: any) => {
      const em = c.contact_email ? String(c.contact_email).trim().toLowerCase() : "";
      const nm = c.contact_name ? normalize(String(c.contact_name).trim()) : "";
      return (em !== "" && soldEmails.has(em)) || (nm !== "" && soldNames.has(nm));
    };

    // Status do negócio na Clint (ganho / perdido / aberto)
    const dealStatus = new Map<string, string>();
    {
      const dealIds = Array.from(new Set(list.map((c) => c.deal_id).filter(Boolean))) as string[];
      for (let i = 0; i < dealIds.length; i += 200) {
        const { data: ds } = await db
          .from("clint_deals")
          .select("id, status")
          .in("id", dealIds.slice(i, i + 200));
        for (const d of (ds ?? []) as any[]) dealStatus.set(String(d.id), String(d.status ?? "").toUpperCase());
      }
    }
    const statusOf = (c: any, vendeu: boolean): "ganho" | "perdido" | "aberto" => {
      if (vendeu) return "ganho";
      const s = c.deal_id ? dealStatus.get(String(c.deal_id)) : undefined;
      if (s === "WON") return "ganho";
      if (s === "LOST") return "perdido";
      return "aberto";
    };



    // Texto do lead (mensagens inbound reais — sem automação/opt-in, sem repetições)
    const textById = new Map<string, string>();
    const seenById = new Map<string, Set<string>>();
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const { data: msgs } = await db
        .from("coach_messages")
        .select("conversation_id, body, direction")
        .in("conversation_id", chunk)
        .eq("direction", "inbound")
        .limit(20000);
      for (const m of (msgs ?? []) as any[]) {
        if (!m.body) continue;
        const body = String(m.body);
        if (isAutomacao(body)) continue;
        const key = normalize(body).replace(/\s+/g, " ").trim().slice(0, 120);
        let seen = seenById.get(m.conversation_id);
        if (!seen) { seen = new Set(); seenById.set(m.conversation_id, seen); }
        if (seen.has(key)) continue;
        seen.add(key);
        const prev = textById.get(m.conversation_id) ?? "";
        if (prev.length > 6000) continue;
        textById.set(m.conversation_id, `${prev} ${body}`);
      }
    }


    // Notas das análises
    const scoreById = new Map<string, number>();
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { data: an } = await db
        .from("coach_analyses")
        .select("conversation_id, score_geral")
        .in("conversation_id", chunk)
        .eq("status", "ok");
      for (const a of (an ?? []) as any[]) {
        if (typeof a.score_geral === "number") scoreById.set(a.conversation_id, Number(a.score_geral));
      }
    }

    const agg = new Map<
      string,
      { total: number; humano: number; ia: number; vendas: number; scores: number[]; exemplos: string[]; sellers: Map<string, number> }
    >();
    let classificadas = 0;
    let comTexto = 0;

    for (const c of list) {
      const text = textById.get(c.id);
      if (!text || text.trim().length < 15) continue;
      comTexto++;
      const hits = classify(text);
      if (hits.length === 0) continue;
      classificadas++;
      const seller = (c.seller_name || c.seller_email || "—").trim();
      const vendeu = isSold(c);
      for (const h of hits) {
        let a = agg.get(h);
        if (!a) {
          a = { total: 0, humano: 0, ia: 0, vendas: 0, scores: [], exemplos: [], sellers: new Map() };
          agg.set(h, a);
        }
        a.total++;
        if (vendeu) a.vendas++;
        if (c.is_ai_conversation) a.ia++;
        else a.humano++;
        const s = scoreById.get(c.id);
        if (typeof s === "number") a.scores.push(s);
        a.sellers.set(seller, (a.sellers.get(seller) ?? 0) + 1);
        if (a.exemplos.length < 3) {
          const sn = snippet(text, h);
          if (sn) a.exemplos.push(sn);
        }
      }
    }

    const ranking: PerfilRow[] = Array.from(agg.entries())
      .map(([perfil, a]) => ({
        perfil,
        descricao: PERFIS.find((p) => p.nome === perfil)?.descricao ?? "",
        total: a.total,
        pct: comTexto ? (a.total / comTexto) * 100 : 0,
        humano: a.humano,
        ia: a.ia,
        vendas: a.vendas,
        conv: a.total ? (a.vendas / a.total) * 100 : 0,
        avg_score: a.scores.length ? a.scores.reduce((x, y) => x + y, 0) / a.scores.length : null,
        exemplos: a.exemplos,
        sellers: Array.from(a.sellers.entries())
          .map(([seller, total]) => ({ seller, total }))
          .sort((x, y) => y.total - x.total)
          .slice(0, 4),
      }))
      .sort((a, b) => b.vendas - a.vendas || b.total - a.total);


    return {
      from,
      to,
      origem,
      total_conversas: comTexto,
      classificadas,
      nao_identificados: Math.max(0, comTexto - classificadas),
      ranking,
    };
  });

export type PerfisInsight = {
  generated_at: string;
  resumo: string;
  icp: string;
  perfis: { perfil: string; dor: string; gatilho: string; abordagem: string; script: string }[];
  acoes: string[];
};

export const generatePerfisInsightFn = createServerFn({ method: "POST" })
  .inputValidator((d: { ranking: { perfil: string; total: number; pct: number; avg_score: number | null }[]; contexto?: string }) => d)
  .handler(async ({ data }): Promise<PerfisInsight> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY não configurada");
    const sys =
      "Você é uma líder comercial sênior da LLMídia (mentorias de tráfego pago, venda por WhatsApp e call). " +
      "Recebe a distribuição dos PERFIS DE LEADS atendidos pelo time humano e pelo agente de IA. " +
      "Diga qual é o ICP real (perfil que mais aparece e que melhor converte), a dor central de cada perfil, o gatilho que move esse perfil, " +
      "como abordar no WhatsApp e um script curto pronto em português do Brasil, humano, sem parecer robô. " +
      'Responda SOMENTE JSON válido: {"resumo":"3-4 frases","icp":"1-2 frases","perfis":[{"perfil":"string","dor":"string","gatilho":"string","abordagem":"string","script":"string"}],"acoes":["string"]}. ' +
      "Máx 6 perfis e 5 ações.";
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: sys },
          { role: "user", content: `${data.contexto ?? ""}\nPERFIS:\n${JSON.stringify(data.ranking.slice(0, 10), null, 2)}` },
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
      icp: parsed.icp ?? "",
      perfis: Array.isArray(parsed.perfis) ? parsed.perfis.slice(0, 6) : [],
      acoes: Array.isArray(parsed.acoes) ? parsed.acoes.slice(0, 5) : [],
    };
  });
