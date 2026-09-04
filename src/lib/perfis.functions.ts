import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { V3_ORIGIN_NAMES } from "@/lib/origem-v3.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// hash barato para saber se a conversa mudou desde a última classificação da IA
function hashText(t: string): string {
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0;
  return `${t.length}-${h.toString(36)}`;
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
  perguntou_profissao: boolean;
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
  sem_pergunta: number;
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

// o comercial perguntou sobre trabalho/profissão do lead?
const PERGUNTA_PROF = [
  "com o que voce trabalha",
  "com o que trabalha",
  "no que voce trabalha",
  "onde voce trabalha",
  "qual a sua profissao",
  "qual sua profissao",
  "qual e a sua profissao",
  "sua profissao",
  "o que voce faz",
  "o que faz da vida",
  "o que faz hoje",
  "com o que atua",
  "em que area",
  "qual sua area",
  "qual a sua area",
  "voce trabalha com",
  "trabalha atualmente",
  "esta trabalhando",
  "voce ja trabalha com",
  "atua com o que",
  "qual sua ocupacao",
];
function isPerguntaProfissao(body: string): boolean {
  const t = normalize(body);
  return PERGUNTA_PROF.some((k) => t.includes(k));
}

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

type PerfilDef = { nome: string; descricao: string; kw: string[] };

const NAO_IDENTIFICADO = "Perfil não identificado";

// Heurística de perfil de lead a partir do que o PRÓPRIO lead escreve.
const PERFIS: PerfilDef[] = [
  {
    nome: "Mães com filhos pequenos",
    descricao: "Mães/pais que buscam renda em casa para cuidar dos filhos",
    kw: [
      "sou mae",
      "sou mãe",
      "mae de",
      "maes",
      "minha filha pequena",
      "meu filho pequeno",
      "bebe",
      "bebê",
      "recem nascido",
      "amamenta",
      "gravida",
      "gestante",
      "licenca maternidade",
      "cuidar dos meus filhos",
      "cuidar do meu filho",
      "cuidar da minha filha",
      "filho pequeno",
      "filha pequena",
      "creche",
      "escola dos meus filhos",
      "dona de casa",
      "do lar",
    ],
  },
  {
    nome: "Desempregados",
    descricao: "Sem emprego no momento, buscam recolocação/renda urgente",
    kw: [
      "desempregad",
      "sem emprego",
      "estou sem trabalho",
      "to sem trabalho",
      "perdi meu emprego",
      "fui demitid",
      "demissao",
      "sem renda",
      "estou parad",
      "procurando emprego",
      "nao tenho renda",
      "estou desempregada",
      "seguro desemprego",
    ],
  },
  {
    nome: "Caminhoneiros / motoristas",
    descricao: "Motoristas de caminhão, app, uber, entregadores",
    kw: [
      "caminhoneir",
      "caminhao",
      "carreta",
      "motorista",
      "uber",
      "99",
      "ifood",
      "entregador",
      "estrada",
      "rodovia",
      "frete",
      "motoboy",
      "app de transporte",
    ],
  },
  {
    nome: "CLT / assalariados",
    descricao: "Empregados com carteira que querem renda extra ou transição",
    kw: [
      "clt",
      "carteira assinada",
      "trabalho registrad",
      "meu patrao",
      "meu chefe",
      "expediente",
      "trabalho das 8",
      "horario comercial",
      "meu emprego atual",
      "trabalho fixo",
      "empresa que trabalho",
      "renda extra",
      "sair do emprego",
      "largar o emprego",
      "escala 6x1",
      "turno",
    ],
  },
  {
    nome: "Autônomos / pequenos empresários",
    descricao: "Têm negócio próprio, loja, prestação de serviço",
    kw: [
      "autonom",
      "tenho meu negocio",
      "minha empresa",
      "minha loja",
      "meu comercio",
      "mei",
      "empreendedor",
      "sou dono",
      "sou dona",
      "presto servico",
      "meu salao",
      "barbearia",
      "clinica",
      "consultorio",
      "meu cnpj",
    ],
  },
  {
    nome: "Já atua com tráfego/marketing",
    descricao: "Só entra quando o lead DIZ que já trabalha na área (não basta citar o produto)",
    kw: [
      "sou gestor de trafego",
      "sou gestora de trafego",
      "trabalho com trafego",
      "trabalho com trafego pago",
      "ja gerencio",
      "gerencio campanha",
      "gerencio anuncio",
      "rodo campanha",
      "faco anuncio",
      "tenho clientes",
      "meus clientes",
      "atendo clientes",
      "sou social media",
      "tenho agencia",
      "trabalho numa agencia",
      "trabalho com marketing",
      "sou designer",
      "sou freelancer",
      "ja trabalho com anuncio",
      "ja fiz campanha",
      "tenho experiencia com trafego",
      "sei mexer no meta ads",
      "ja uso o gerenciador de anuncio",
    ],
  },

  {
    nome: "Estudantes / iniciantes",
    descricao: "Estudando, primeiro emprego, começando do zero",
    kw: [
      "estudante",
      "faculdade",
      "cursando",
      "universidade",
      "estagio",
      "primeiro emprego",
      "comecando do zero",
      "sou iniciante",
      "nao sei nada",
      "17 anos",
      "18 anos",
      "19 anos",
      "acabei de terminar o ensino",
    ],
  },
  {
    nome: "Servidores / militares / saúde",
    descricao: "Concursados, militares, enfermagem, professores",
    kw: [
      "servidor",
      "concurs",
      "militar",
      "policia",
      "bombeiro",
      "exercito",
      "enfermeir",
      "tecnico de enfermagem",
      "professor",
      "professora",
      "hospital",
      "plantao",
      "sou funcionario publico",
    ],
  },
  {
    nome: "Aposentados / 50+",
    descricao: "Aposentados ou público mais velho buscando nova fonte de renda",
    kw: [
      "aposentad",
      "inss",
      "pensionista",
      "ja tenho 5",
      "ja tenho 6",
      "60 anos",
      "55 anos",
      "idade avancada",
    ],
  },
  {
    // Os leads são, na sua normalidade, de Portugal — morar em PT/Lisboa/Porto
    // não é um perfil distintivo. Este bucket captura apenas quem É imigrante em
    // Portugal ou mora noutro país (fora de PT): brasileiros, venezuelanos etc.
    nome: "Imigrantes / residentes no exterior",
    descricao: "Leads que imigraram para Portugal ou moram noutro país",
    kw: [
      "imigrante",
      "vim morar em portugal",
      "vim para portugal",
      "mudaram-me para portugal",
      "sou brasileir",
      "sou brasileira",
      "venezuelan",
      "caboverdian",
      "angolan",
      "guineense",
      "moro nos estados unidos",
      "moro na irlanda",
      "moro no japao",
      "moro em londres",
      "moro na espanha",
      "moro na franca",
      "moro na alemanha",
      "morando fora de portugal",
      "moro fora de portugal",
      "vim do brasil",
      "vim da venezuela",
      "vim de angola",
    ],
  },
];

// "Profissão declarada (outros)" deixou de existir como perfil:
// qualquer profissão pode comprar a mentoria, então a profissão declarada
// é só um atributo (badge) dentro do perfil real — não vira um bucket próprio.

// Frases em que o lead declara ocupação: "sou assistente técnica", "trabalho como auxiliar"...
const OCUPACAO_RE =
  /\b(?:sou|trabalho como|atuo como|trabalho de|trabalho na area de|minha profissao e|minha profissao é|sou formad[ao] em|faco faculdade de)\s+([a-zà-ú][a-zà-ú\s()/-]{2,40})/i;

const OCUPACAO_STOP = [
  "muito",
  "bem",
  "so",
  "só",
  "de casa",
  "do lar",
  "grato",
  "grata",
  "aqui",
  "novo",
  "nova",
  "interessad",
  "curios",
  "iniciante",
  "sim",
  "eu",
  "a favor",
];

function extractOcupacao(text: string): string | null {
  for (const frase of text.split(/[.!?\n]/)) {
    const m = OCUPACAO_RE.exec(frase.trim());
    if (!m) continue;
    const raw = m[1]
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[,;]+$/, "");
    const n = normalize(raw);
    if (n.length < 4) continue;
    if (OCUPACAO_STOP.some((s) => n.startsWith(normalize(s)))) continue;
    return raw.slice(0, 40);
  }
  return null;
}

// Tokens curtos perigosos: substring gerava falsos positivos graves
// ("mei" casava com "meio", "uber" com "tuberculose", "99" com qualquer número).
// Esses só casam como PALAVRA INTEIRA; os demais seguem como radicais (substring).
const EXACT_WORD = new Set(["mei", "99", "clt", "uber"]);
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const EXACT_RES = new Map(
  [...EXACT_WORD].map((k) => [k, new RegExp(`(?<![a-z0-9])${escRe(k)}(?![a-z0-9])`)]),
);
function kwMatch(t: string, kw: string): boolean {
  const k = normalize(kw);
  const re = EXACT_RES.get(k);
  return re ? re.test(t) : t.includes(k);
}

function classify(text: string): string[] {
  const t = normalize(text);
  const hits: string[] = [];
  for (const p of PERFIS) {
    if (p.kw.some((k) => kwMatch(t, k))) hits.push(p.nome);
  }
  return hits;
}

// Classificação principal: a IA lê conversa por conversa com regras rígidas de
// evidência. Um erro aqui vira anúncio errado — na dúvida, a IA deve devolver
// "não identificado" em vez de chutar um perfil.
async function classifyWithAI(
  items: { id: string; text: string }[],
): Promise<Map<string, { perfil: string; evidencia: string; profissao: string }>> {
  const out = new Map<string, { perfil: string; evidencia: string; profissao: string }>();
  const key = process.env.LOVABLE_API_KEY;
  if (!key || items.length === 0) return out;

  const nomes = [...PERFIS.map((p) => p.nome), NAO_IDENTIFICADO];
  const sys =
    "Você é um analista sênior de pesquisa de audiência (ICP) de uma empresa de mentorias de tráfego pago. " +
    "Sua classificação alimenta a criação de ANÚNCIOS, então precisão é obrigatória. " +
    "Classifique o PERFIL DE VIDA de cada lead usando APENAS o que o próprio lead escreveu; " +
    "ignore mensagens do vendedor/IA e nunca deduza o perfil pelo interesse no produto.\n\n" +
    "PERFIS (escolha exatamente UM):\n" +
    "- Mães com filhos pequenos — o lead diz que é mãe/pai e menciona filhos, creche ou cuidar de casa.\n" +
    "- Desempregados — diz explicitamente que está sem emprego/sem renda ou que foi demitido.\n" +
    "- Caminhoneiros / motoristas — caminhão, carreta, motorista de app, entregador.\n" +
    "- CLT / assalariados — tem emprego registrado/fixo, patrão, salário, escala; quer renda extra ou sair do emprego. Ter emprego fixo NÃO é ser autônomo.\n" +
    "- Autônomos / pequenos empresários — SÓ quando o lead diz que TEM negócio próprio (loja, salão, empresa, MEI, CNPJ) ou trabalha por conta própria. Nunca use para quem tem emprego CLT.\n" +
    "- Já atua com tráfego/marketing — só quando o lead diz que JÁ trabalha na área (gestor de tráfego, social media, agência, tem clientes na área).\n" +
    "- Estudantes / iniciantes — estuda, busca o primeiro emprego ou está começando do zero.\n" +
    "- Servidores / militares / saúde — concursado, militar, policial, enfermagem, professor, hospital.\n" +
    "- Aposentados / 50+ — aposentado, INSS, idade avançada declarada.\n" +
    "- Imigrantes / residentes no exterior — imigrou para Portugal ou mora fora do país de origem.\n" +
    `- ${NAO_IDENTIFICADO} — nenhuma pista real sobre a vida/trabalho do lead.\n\n` +
    "REGRAS:\n" +
    `1. Evidência obrigatória: cite o trecho LITERAL do lead que justifica o perfil. Sem evidência literal, use "${NAO_IDENTIFICADO}".\n` +
    `2. Na dúvida entre dois perfis, escolha o que tem evidência mais explícita; se nenhum for claro, use "${NAO_IDENTIFICADO}".\n` +
    '3. profissao: ocupação declarada em 1 a 3 palavras no singular (ex.: "auxiliar de cozinha"); "" se não declarada.\n' +
    '4. Responda APENAS JSON no formato {"itens":[{"id":"...","perfil":"...","profissao":"...","evidencia":"..."}]} e inclua TODOS os ids recebidos.';

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
                .map(
                  (b) => `ID: ${b.id}\nLEAD DISSE: ${b.text.replace(/\s+/g, " ").slice(0, 1800)}`,
                )
                .join("\n---\n"),
            },
          ],
        }),
      });
      if (!res.ok) return;
      const j: any = await res.json();
      const raw = String(j?.choices?.[0]?.message?.content ?? "");
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) return;
      const parsed = JSON.parse(m[0]);
      for (const it of parsed?.itens ?? []) {
        const perfil = String(it?.perfil ?? "").trim();
        if (!nomes.includes(perfil)) continue;
        // perfil "" = a IA respondeu "não identificado" (veredito válido, vai pro cache)
        out.set(String(it?.id), {
          perfil: perfil === NAO_IDENTIFICADO ? "" : perfil,
          evidencia: perfil === NAO_IDENTIFICADO ? "" : String(it?.evidencia ?? "").slice(0, 200),
          profissao: String(it?.profissao ?? "")
            .slice(0, 40)
            .trim(),
        });
      }
    } catch {
      /* quem ficar sem resposta da IA cai na heurística */
    }
  };

  // roda em paralelo (6 por vez)
  const pend = batches.slice(0, 54);
  for (let i = 0; i < pend.length; i += 6) {
    await Promise.all(pend.slice(i, i + 6).map(runBatch));
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
      return `...${text
        .slice(start, i + 100)
        .replace(/\s+/g, " ")
        .trim()}...`;
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
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from?: string; to?: string; origem?: "todas" | "humano" | "ia" } = {}) => d)
  .handler(async ({ data }): Promise<PerfisResult> => {
    const db = await admin();
    const to = data.to ?? new Date().toISOString().slice(0, 10);
    const from = data.from ?? new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
    const origem = data.origem ?? "todas";

    let q = db
      .from("coach_conversations")
      .select(
        "id, seller_name, seller_email, is_ai_conversation, contact_name, contact_email, deal_id, origin_name, last_message_at",
      )
      .in("origin_name", V3_ORIGIN_NAMES)
      .gte("last_message_at", `${from}T00:00:00Z`)
      .lte("last_message_at", `${to}T23:59:59Z`)
      .order("last_message_at", { ascending: false })
      .limit(6000);
    if (origem === "humano") q = q.eq("is_ai_conversation", false);
    if (origem === "ia") q = q.eq("is_ai_conversation", true);

    const { data: convs, error } = await q;
    if (error) throw new Error(error.message);
    // só leads que foram efetivamente transferidos para o comercial (têm dono/atendente)
    const list = ((convs ?? []) as any[]).filter(
      (c) => String(c.seller_name ?? c.seller_email ?? "").trim() !== "",
    );
    const ids = list.map((c) => c.id);

    // Vendas registradas no fechamento DENTRO do período (1ª parcela = 1 venda)
    const vendasPeriodo = (
      (
        await db
          .from("manual_sales")
          .select("id, client_name, client_email, seller_name, product, funnel, sale_date")
          .gte("sale_date", from)
          .lte("sale_date", to)
          .eq("installment_number", 1)
          .limit(3000)
      ).data ?? []
    ) as any[];

    const soldEmails = new Set<string>();
    const soldNames = new Set<string>();
    for (const v of vendasPeriodo) {
      if (v.client_email) soldEmails.add(String(v.client_email).trim().toLowerCase());
      if (v.client_name) soldNames.add(normalize(String(v.client_name).trim()));
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
      // Blocos em paralelo — antes era await dentro do for.
      const dealChunks: string[][] = [];
      for (let i = 0; i < dealIds.length; i += 200) dealChunks.push(dealIds.slice(i, i + 200));
      const dealPages = await Promise.all(
        dealChunks.map((c) => db.from("clint_deals").select("id, status").in("id", c).limit(200)),
      );
      for (const { data: ds } of dealPages)
        for (const d of (ds ?? []) as any[])
          dealStatus.set(String(d.id), String(d.status ?? "").toUpperCase());
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
    const perguntouProf = new Set<string>();
    const msgChunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 100) msgChunks.push(ids.slice(i, i + 100));
    for (let i = 0; i < msgChunks.length; i += 5) {
      const res = await Promise.all(
        msgChunks
          .slice(i, i + 5)
          .map((chunk) =>
            db
              .from("coach_messages")
              .select("conversation_id, body, direction")
              .in("conversation_id", chunk)
              .limit(40000),
          ),
      );
      for (const r of res) {
        for (const m of (r.data ?? []) as any[]) {
          if (!m.body) continue;
          const body = String(m.body);
          if (String(m.direction) !== "inbound") {
            outboundCount.set(m.conversation_id, (outboundCount.get(m.conversation_id) ?? 0) + 1);
            if (isPerguntaProfissao(body)) perguntouProf.add(m.conversation_id);
            continue;
          }
          if (isAutomacao(body)) continue;
          const key = normalize(body).replace(/\s+/g, " ").trim().slice(0, 120);
          let seen = seenById.get(m.conversation_id);
          if (!seen) {
            seen = new Set();
            seenById.set(m.conversation_id, seen);
          }
          if (seen.has(key)) continue;
          seen.add(key);
          inboundCount.set(m.conversation_id, (inboundCount.get(m.conversation_id) ?? 0) + 1);
          const prev = textById.get(m.conversation_id) ?? "";
          if (prev.length > 6000) continue;
          textById.set(m.conversation_id, `${prev} ${body}`);
        }
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
        .eq("status", "ok")
        .limit(chunk.length * 2);
      for (const a of (an ?? []) as any[]) {
        if (typeof a.score_geral === "number")
          scoreById.set(a.conversation_id, Number(a.score_geral));
      }
    }

    const agg = new Map<
      string,
      {
        total: number;
        humano: number;
        ia: number;
        vendas: number;
        ganhos: number;
        perdidos: number;
        abertos: number;
        scores: number[];
        exemplos: string[];
        sellers: Map<string, number>;
        profissoes: Map<string, { nome: string; total: number; vendas: number; ganhos: number }>;
        conversas: PerfilConversa[];
        semPergunta: number;
      }
    >();
    let classificadas = 0;
    let comTexto = 0;

    // 1ª passada: filtra conversas reais e extrai profissão declarada (regex simples)
    const validos: { c: any; text: string }[] = [];
    const hitsById = new Map<string, string[]>();
    const evidenciaById = new Map<string, string>();
    const profissaoById = new Map<string, string>();
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
      const ocupacao = extractOcupacao(text);
      if (ocupacao) profissaoById.set(c.id, ocupacao);
    }

    // 2ª passada: a IA classifica TODAS as conversas válidas (com cache versionado
    // no banco). A heurística por palavra-chave virou apenas fallback para quando a
    // IA não responde — era ela a origem das classificações erradas.
    const CACHE_VERSION = "v3";
    const aiTargets = validos.map((v) => ({
      id: String(v.c.id),
      text: v.text,
      hash: `${CACHE_VERSION}|${hashText(v.text)}`,
    }));

    const applyIA = (id: string, r: { perfil: string; evidencia: string; profissao: string }) => {
      if (r.perfil) hitsById.set(id, [r.perfil]);
      if (r.evidencia) evidenciaById.set(id, r.evidencia);
      if (r.profissao && !profissaoById.has(id)) profissaoById.set(id, r.profissao);
    };

    // lê o cache
    const hasVerdict = new Set<string>();
    if (aiTargets.length > 0) {
      const idsAll = aiTargets.map((s) => s.id);
      const chunks: string[][] = [];
      for (let i = 0; i < idsAll.length; i += 200) chunks.push(idsAll.slice(i, i + 200));
      const results = await Promise.all(
        chunks.map((ch) =>
          db
            .from("lead_perfil_cache")
            .select("conversation_id, text_hash, perfil, evidencia, profissao")
            .in("conversation_id", ch),
        ),
      );
      const byId = new Map<string, any>();
      for (const r of results)
        for (const row of (r.data ?? []) as any[]) byId.set(String(row.conversation_id), row);
      for (const s of aiTargets) {
        const row = byId.get(s.id);
        if (row && String(row.text_hash) === s.hash) {
          hasVerdict.add(s.id);
          applyIA(s.id, {
            perfil: String(row.perfil ?? ""),
            evidencia: String(row.evidencia ?? ""),
            profissao: String(row.profissao ?? ""),
          });
        }
      }
    }

    const pendentes = aiTargets.filter((s) => !hasVerdict.has(s.id)).slice(0, 900);
    if (pendentes.length > 0) {
      const iaHits = await classifyWithAI(pendentes.map((p) => ({ id: p.id, text: p.text })));
      for (const [id, r] of iaHits) {
        hasVerdict.add(id);
        applyIA(id, r);
      }
      // grava o cache só de quem a IA respondeu de fato (inclusive "não identificado")
      const rows = pendentes
        .filter((p) => iaHits.has(p.id))
        .map((p) => {
          const r = iaHits.get(p.id)!;
          return {
            conversation_id: p.id,
            text_hash: p.hash,
            perfil: r.perfil || null,
            evidencia: r.evidencia || null,
            profissao: r.profissao || null,
            updated_at: new Date().toISOString(),
          };
        });
      for (let i = 0; i < rows.length; i += 200) {
        await db
          .from("lead_perfil_cache")
          .upsert(rows.slice(i, i + 200), { onConflict: "conversation_id" });
      }
    }

    // Fallback: heurística por palavra-chave só para quem ficou sem veredito da IA
    // (falha no gateway ou acima do limite por execução). Vários matches → fica o
    // de maior prioridade (ordem da lista PERFIS).
    for (const v of validos) {
      const id = String(v.c.id);
      if (hasVerdict.has(id)) continue;
      const hits = classify(v.text);
      if (hits.length > 0) hitsById.set(id, [hits[0]]);
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
          a = {
            total: 0,
            humano: 0,
            ia: 0,
            vendas: 0,
            ganhos: 0,
            perdidos: 0,
            abertos: 0,
            scores: [],
            exemplos: [],
            sellers: new Map(),
            profissoes: new Map(),
            conversas: [],
            semPergunta: 0,
          };
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
        const perguntou = perguntouProf.has(c.id);
        if (!perguntou) a.semPergunta++;
        const prof = profissaoById.get(c.id) ?? null;
        if (prof) {
          const k = normalize(prof).replace(/\s+/g, " ").trim();
          const p = a.profissoes.get(k) ?? { nome: prof, total: 0, vendas: 0, ganhos: 0 };
          p.total++;
          if (vendeu) p.vendas++;
          if (st === "ganho") p.ganhos++;
          a.profissoes.set(k, p);
        }
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
            profissao: prof,
            perguntou_profissao: perguntou,
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
            : (PERFIS.find((p) => p.nome === perfil)?.descricao ?? ""),

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
        sem_pergunta: a.semPergunta,
        profissoes: Array.from(a.profissoes.values()).sort(
          (x, y) => y.vendas - x.vendas || y.ganhos - x.ganhos || y.total - x.total,
        ),
        conversas: a.conversas.sort((x, y) =>
          (y.last_message_at ?? "").localeCompare(x.last_message_at ?? ""),
        ),
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
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      ranking: { perfil: string; total: number; pct: number; avg_score: number | null }[];
      contexto?: string;
    }) => d,
  )
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
          {
            role: "user",
            content: `${data.contexto ?? ""}\nPERFIS:\n${JSON.stringify(data.ranking.slice(0, 10), null, 2)}`,
          },
        ],
      }),
    });
    if (!resp.ok)
      throw new Error(`Lovable AI ${resp.status}: ${await resp.text().catch(() => "")}`);
    const j = (await resp.json()) as any;
    let parsed: any = {};
    try {
      parsed = JSON.parse(j?.choices?.[0]?.message?.content ?? "{}");
    } catch {
      parsed = {};
    }
    return {
      generated_at: new Date().toISOString(),
      resumo: parsed.resumo ?? "",
      icp: parsed.icp ?? "",
      perfis: Array.isArray(parsed.perfis) ? parsed.perfis.slice(0, 6) : [],
      acoes: Array.isArray(parsed.acoes) ? parsed.acoes.slice(0, 5) : [],
    };
  });
