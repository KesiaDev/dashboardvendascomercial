import { createServerFn } from "@tanstack/react-start";
import { V3_ORIGIN_NAMES } from "@/lib/origem-v3.server";


async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type PerfilConversa = {
  id: string;
  contato: string;
  seller: string;
  is_ai: boolean;
  last_message_at: string | null;
  score: number | null;
  status: "ganho" | "perdido" | "aberto";
  trecho: string;
  profissao: string | null;
};

export type PerfilRow = {
  perfil: string;
  descricao: string;
  total: number;
  pct: number;
  humano: number;
  ia: number;
  vendas: number;
  ganhos: number;
  perdidos: number;
  abertos: number;
  conv: number;
  avg_score: number | null;
  exemplos: string[];
  sellers: { seller: string; total: number }[];
  profissoes: { nome: string; total: number; vendas: number; ganhos: number }[];
  conversas: PerfilConversa[];
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

const NAO_IDENTIFICADO = "Perfil não identificado";


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
    descricao: "Só entra quando o lead DIZ que já trabalha na área (não basta citar o produto)",
    kw: [
      "sou gestor de trafego", "sou gestora de trafego", "trabalho com trafego", "trabalho com trafego pago",
      "ja gerencio", "gerencio campanha", "gerencio anuncio", "rodo campanha", "faco anuncio",
      "tenho clientes", "meus clientes", "atendo clientes", "sou social media", "tenho agencia",
      "trabalho numa agencia", "trabalho com marketing", "sou designer", "sou freelancer",
      "ja trabalho com anuncio", "ja fiz campanha", "tenho experiencia com trafego", "sei mexer no meta ads",
      "ja uso o gerenciador de anuncio",
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

const PROFISSAO_DECLARADA = "Profissão declarada (outros)";

// Frases em que o lead declara ocupação: "sou assistente técnica", "trabalho como auxiliar"...
const OCUPACAO_RE =
  /\b(?:sou|trabalho como|atuo como|trabalho de|trabalho na area de|minha profissao e|minha profissao é|sou formad[ao] em|faco faculdade de)\s+([a-zà-ú][a-zà-ú\s()/-]{2,40})/i;

const OCUPACAO_STOP = [
  "muito", "bem", "so", "só", "de casa", "do lar", "grato", "grata", "aqui", "novo", "nova",
  "interessad", "curios", "iniciante", "sim", "eu", "a favor",
];

function extractOcupacao(text: string): string | null {
  for (const frase of text.split(/[.!?\n]/)) {
    const m = OCUPACAO_RE.exec(frase.trim());
    if (!m) continue;
    const raw = m[1].replace(/\s+/g, " ").trim().replace(/[,;]+$/, "");
    const n = normalize(raw);
    if (n.length < 4) continue;
    if (OCUPACAO_STOP.some((s) => n.startsWith(normalize(s)))) continue;
    return raw.slice(0, 40);
  }
  return null;
}

function classify(text: string): string[] {
  const t = normalize(text);
  const hits: string[] = [];
  for (const p of PERFIS) {
    if (p.kw.some((k) => t.includes(normalize(k)))) hits.push(p.nome);
  }
  return hits;
}

// Classificação conversa por conversa com IA para o que a heurística não pegou.
async function classifyWithAI(
  items: { id: string; text: string }[],
): Promise<Map<string, { perfil: string; evidencia: string }>> {
  const out = new Map<string, { perfil: string; evidencia: string }>();
  const key = process.env.LOVABLE_API_KEY;
  if (!key || items.length === 0) return out;

  const nomes = [...PERFIS.map((p) => p.nome), PROFISSAO_DECLARADA, NAO_IDENTIFICADO];
  const sys =
    "Você classifica o PERFIL DE VIDA/PROFISSÃO de leads a partir do que o próprio lead escreveu no WhatsApp. " +
    `Escolha UM perfil desta lista exata: ${nomes.join(" | ")}. ` +
    `Use "${PROFISSAO_DECLARADA}" quando o lead disser a profissão dele mas ela não couber em nenhum outro perfil (ex.: "sou assistente técnica administrativa"). ` +
    `Use "${NAO_IDENTIFICADO}" só quando não houver nenhuma pista real sobre a vida/trabalho dele. ` +
    'Responda APENAS JSON: {"itens":[{"id":"...","perfil":"...","evidencia":"trecho literal do lead"}]}';

  const batches: { id: string; text: string }[][] = [];
  for (let i = 0; i < items.length; i += 12) batches.push(items.slice(i, i + 12));

  for (const batch of batches.slice(0, 20)) {
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            { role: "system", content: sys },
            {
              role: "user",
              content: batch
                .map((b) => `ID: ${b.id}\nLEAD DISSE: ${b.text.replace(/\s+/g, " ").slice(0, 900)}`)
                .join("\n---\n"),
            },
          ],
        }),
      });
      if (!res.ok) continue;
      const j: any = await res.json();
      const raw = String(j?.choices?.[0]?.message?.content ?? "");
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) continue;
      const parsed = JSON.parse(m[0]);
      for (const it of parsed?.itens ?? []) {
        const perfil = String(it?.perfil ?? "").trim();
        if (!nomes.includes(perfil) || perfil === NAO_IDENTIFICADO) continue;
        out.set(String(it?.id), { perfil, evidencia: String(it?.evidencia ?? "").slice(0, 200) });
      }
    } catch {
      /* segue com heurística */
    }
  }
  return out;
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
  // opt-in da imersão / grupo (não diz nada sobre o perfil do lead)
  "quero receber o presente",
  "quero o presente",
  "presente da imersao",
  "quero participar da imersao",
  "quero entrar na imersao",
  "quero entrar no grupo",
  "ainda nao entrei",
  "agora consegui",
  "consegui entrar",
  "quero as aulas",
  "quero o link",
  "quero receber os links",
  "combinado",
  "obrigad",
  "bom dia",
  "boa tarde",
  "boa noite",
];

function isAutomacao(body: string): boolean {
  const t = normalize(body).replace(/\s+/g, " ").trim();
  if (t.length < 3) return true;
  // respostas de botão: "sim", "sim quero", "ok", "1", "2"
  if (/^(sim|nao|ok|okay|quero|sim quero|sim!|ja|ja entrei|\d{1,2})$/.test(t)) return true;
  // frases curtas de opt-in sem conteúdo real
  if (t.length < 25 && /^(sim|ok|quero|ja|entrei|consegui|combinado|obrigad)/.test(t)) return true;
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
      .select("id, seller_name, seller_email, is_ai_conversation, contact_name, contact_email, deal_id, origin_name, last_message_at")
      .in("origin_name", V3_ORIGIN_NAMES)
      .gte("last_message_at", `${from}T00:00:00Z`)
      .lte("last_message_at", `${to}T23:59:59Z`)
      .order("last_message_at", { ascending: false })
      .limit(2000);
    if (origem === "humano") q = q.eq("is_ai_conversation", false);
    if (origem === "ia") q = q.eq("is_ai_conversation", true);

    const { data: convs, error } = await q;
    if (error) throw new Error(error.message);
    // só leads que foram efetivamente transferidos para o comercial (têm dono/atendente)
    const list = ((convs ?? []) as any[]).filter(
      (c) => String(c.seller_name ?? c.seller_email ?? "").trim() !== "",
    );
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
    const inboundCount = new Map<string, number>();
    const outboundCount = new Map<string, number>();
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const { data: msgs } = await db
        .from("coach_messages")
        .select("conversation_id, body, direction")
        .in("conversation_id", chunk)
        .limit(40000);
      for (const m of (msgs ?? []) as any[]) {
        if (!m.body) continue;
        const body = String(m.body);
        if (String(m.direction) !== "inbound") {
          outboundCount.set(m.conversation_id, (outboundCount.get(m.conversation_id) ?? 0) + 1);
          continue;
        }
        if (isAutomacao(body)) continue;
        const key = normalize(body).replace(/\s+/g, " ").trim().slice(0, 120);
        let seen = seenById.get(m.conversation_id);
        if (!seen) { seen = new Set(); seenById.set(m.conversation_id, seen); }
        if (seen.has(key)) continue;
        seen.add(key);
        inboundCount.set(m.conversation_id, (inboundCount.get(m.conversation_id) ?? 0) + 1);
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
      {
        total: number; humano: number; ia: number; vendas: number;
        ganhos: number; perdidos: number; abertos: number;
        scores: number[]; exemplos: string[]; sellers: Map<string, number>;
        conversas: PerfilConversa[];
      }
    >();
    let classificadas = 0;
    let comTexto = 0;

    // 1ª passada: heurística + profissão declarada; junta o que ficou sem perfil
    const validos: { c: any; text: string }[] = [];
    const hitsById = new Map<string, string[]>();
    const evidenciaById = new Map<string, string>();
    for (const c of list) {
      const text = textById.get(c.id);
      // conversa real: houve troca (lead respondeu de verdade + o comercial/IA respondeu)
      const houveConversa =
        (inboundCount.get(c.id) ?? 0) >= 1 &&
        (outboundCount.get(c.id) ?? 0) >= 1 &&
        !!text &&
        text.trim().length >= 25;
      if (!houveConversa) continue;
      comTexto++;
      validos.push({ c, text });
      const hits = classify(text);
      if (hits.length === 0) {
        const ocup = extractOcupacao(text);
        if (ocup) {
          hits.push(PROFISSAO_DECLARADA);
          evidenciaById.set(c.id, ocup);
        }
      }
      hitsById.set(c.id, hits);
    }

    // 2ª passada: IA lê conversa por conversa o que sobrou sem perfil
    const semPerfil = validos
      .filter((v) => (hitsById.get(v.c.id) ?? []).length === 0)
      .slice(0, 240)
      .map((v) => ({ id: String(v.c.id), text: v.text }));
    const iaHits = await classifyWithAI(semPerfil);
    for (const [id, r] of iaHits) {
      hitsById.set(id, [r.perfil]);
      if (r.evidencia) evidenciaById.set(id, r.evidencia);
    }

    for (const { c, text } of validos) {
      const hits = hitsById.get(c.id) ?? [];
      if (hits.length > 0) classificadas++;
      const buckets = hits.length > 0 ? hits : [NAO_IDENTIFICADO];
      const seller = (c.seller_name || c.seller_email || "—").trim();
      const vendeu = isSold(c);
      const st = statusOf(c, vendeu);
      for (const h of buckets) {



        let a = agg.get(h);
        if (!a) {
          a = { total: 0, humano: 0, ia: 0, vendas: 0, ganhos: 0, perdidos: 0, abertos: 0, scores: [], exemplos: [], sellers: new Map(), conversas: [] };
          agg.set(h, a);
        }
        a.total++;
        if (vendeu) a.vendas++;
        if (st === "ganho") a.ganhos++;
        else if (st === "perdido") a.perdidos++;
        else a.abertos++;
        if (c.is_ai_conversation) a.ia++;
        else a.humano++;
        const s = scoreById.get(c.id);
        if (typeof s === "number") a.scores.push(s);
        a.sellers.set(seller, (a.sellers.get(seller) ?? 0) + 1);
        const ev = evidenciaById.get(c.id);
        const sn = snippet(text, h) ?? (ev ? `...${ev}...` : null);
        if (a.exemplos.length < 3 && sn) a.exemplos.push(sn);

        if (a.conversas.length < 200) {
          a.conversas.push({
            id: c.id,
            contato: c.contact_name || c.contact_email || "—",
            seller,
            is_ai: !!c.is_ai_conversation,
            last_message_at: c.last_message_at ?? null,
            score: typeof s === "number" ? s : null,
            status: st,
            trecho: sn ?? text.slice(0, 160),
          });
        }
      }
    }

    const ranking: PerfilRow[] = Array.from(agg.entries())
      .map(([perfil, a]) => ({
        perfil,
        descricao:
          perfil === NAO_IDENTIFICADO
            ? "Lead conversou, mas não revelou nada sobre a vida/profissão dele — precisa de pergunta de qualificação"
            : perfil === PROFISSAO_DECLARADA
              ? "Lead disse a profissão dele, mas ela não se encaixa nos perfis padrão (ex.: assistente técnica, administrativa)"
              : PERFIS.find((p) => p.nome === perfil)?.descricao ?? "",


        total: a.total,
        pct: comTexto ? (a.total / comTexto) * 100 : 0,
        humano: a.humano,
        ia: a.ia,
        vendas: a.vendas,
        ganhos: a.ganhos,
        perdidos: a.perdidos,
        abertos: a.abertos,
        conv: a.total ? (a.vendas / a.total) * 100 : 0,
        avg_score: a.scores.length ? a.scores.reduce((x, y) => x + y, 0) / a.scores.length : null,
        exemplos: a.exemplos,
        sellers: Array.from(a.sellers.entries())
          .map(([seller, total]) => ({ seller, total }))
          .sort((x, y) => y.total - x.total)
          .slice(0, 4),
        conversas: a.conversas.sort((x, y) => (y.last_message_at ?? "").localeCompare(x.last_message_at ?? "")),
      }))
      .sort((a, b) => {
        if (a.perfil === NAO_IDENTIFICADO) return 1;
        if (b.perfil === NAO_IDENTIFICADO) return -1;
        return b.vendas - a.vendas || b.total - a.total;
      });




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

