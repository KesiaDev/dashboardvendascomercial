import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

const DIFFICULTIES = ["Bronze", "Prata", "Ouro", "Diamante", "Elite", "Lenda"] as const;
type Difficulty = (typeof DIFFICULTIES)[number];

const CHANNELS = ["Instagram", "Facebook", "Google", "Indicação", "WhatsApp", "Webinar", "Masterclass", "Renovação", "Lead perdido"] as const;

const EMOTIONS = ["animado", "neutro", "desconfiado", "irritado", "ocupado", "frustrado", "interessado", "seguro"] as const;

function leagueForXp(xp: number): string {
  if (xp >= 20000) return "Lenda";
  if (xp >= 10000) return "Elite";
  if (xp >= 5000) return "Diamante";
  if (xp >= 2000) return "Ouro";
  if (xp >= 500) return "Prata";
  return "Bronze";
}

async function aiJson(system: string, user: string, temperature = 0.9): Promise<any> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY ausente");
  const res = await fetch(AI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      temperature,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`IA falhou: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const txt = data.choices?.[0]?.message?.content ?? "{}";
  try { return JSON.parse(txt); } catch { return {}; }
}

async function aiText(system: string, messages: Array<{ role: "user" | "assistant"; content: string }>, temperature = 0.85): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY ausente");
  const res = await fetch(AI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      temperature,
      messages: [{ role: "system", content: system }, ...messages],
    }),
  });
  if (!res.ok) throw new Error(`IA falhou: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return String(data.choices?.[0]?.message?.content ?? "").trim();
}

// ---------- Dashboard ----------
export const getArenaDashboardFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [progressRes, simsRes, missionRes] = await Promise.all([
      supabase.from("arena_progress").select("*").eq("seller_user_id", userId).maybeSingle(),
      supabase.from("arena_simulations").select("id, started_at, ended_at, score, xp_earned, outcome, status, evaluation, persona_id").eq("seller_user_id", userId).order("started_at", { ascending: false }).limit(20),
      supabase.from("arena_missions").select("*").eq("seller_user_id", userId).eq("mission_date", new Date().toISOString().slice(0, 10)).maybeSingle(),
    ]);

    const sims = simsRes.data ?? [];
    const finished = sims.filter((s: any) => s.status === "finished");
    const wins = finished.filter((s: any) => s.outcome === "venda" || s.outcome === "agendamento").length;
    const avgScore = finished.length ? finished.reduce((a: number, s: any) => a + Number(s.score ?? 0), 0) / finished.length : 0;

    // agregação de competências
    const compSums: Record<string, { sum: number; n: number }> = {};
    for (const s of finished) {
      const ev = (s.evaluation as any) ?? {};
      const comps = ev.competencias ?? {};
      for (const [k, v] of Object.entries(comps)) {
        if (typeof v === "number") {
          compSums[k] ??= { sum: 0, n: 0 };
          compSums[k].sum += v;
          compSums[k].n += 1;
        }
      }
    }
    const compAvg = Object.entries(compSums).map(([k, v]) => ({ k, avg: v.sum / v.n }));
    compAvg.sort((a, b) => b.avg - a.avg);
    const strongest = compAvg.slice(0, 3);
    const weakest = compAvg.slice(-3).reverse();

    const xp = progressRes.data?.xp ?? 0;
    return {
      progress: {
        xp,
        league: leagueForXp(xp),
        streak: progressRes.data?.streak_days ?? 0,
        level: Math.floor(xp / 250) + 1,
      },
      stats: {
        total: finished.length,
        winRate: finished.length ? Math.round((wins / finished.length) * 100) : 0,
        avgScore: Math.round(avgScore * 10) / 10,
      },
      mission: missionRes.data ?? null,
      openSim: sims.find((s: any) => s.status === "open") ?? null,
      recent: sims,
      strongest,
      weakest,
    };
  });

// ---------- Missão diária ----------
export const generateDailyMissionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const today = new Date().toISOString().slice(0, 10);
    const existing = await supabase.from("arena_missions").select("*").eq("seller_user_id", userId).eq("mission_date", today).maybeSingle();
    if (existing.data) return existing.data;

    const spec = await aiJson(
      "Você cria missões de treinamento comercial. Responda JSON.",
      `Crie a MISSÃO DE HOJE para um vendedor treinando em simulador de vendas. Formato JSON:
{"produto": string, "canal": string (Instagram|Facebook|Google|Indicação|WhatsApp|Webinar|Masterclass|Renovação|Lead perdido), "perfil_disc": "Dominante"|"Influente"|"Estável"|"Consciente", "dificuldade": "Bronze"|"Prata"|"Ouro"|"Diamante"|"Elite"|"Lenda", "objetivo": string, "missao_especial": string, "recompensa_xp": number (100 a 500)}
Contexto: produtos possíveis: "Mentoria Gestor de Tráfego", "Accelerator", "Master and Scale", "Traffic Master", "Renovação", "Reset Relacional", "Estrategista de Infoproduto", "Consultoria Gratuita". Varie.`,
      1.1,
    );

    const { data } = await supabase.from("arena_missions").insert({
      seller_user_id: userId,
      mission_date: today,
      spec,
    }).select("*").single();
    return data;
  });

// ---------- Iniciar simulação ----------
export const startSimulationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { missionId?: string | null; difficulty?: Difficulty; product?: string; channel?: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    let product = data.product ?? "Mentoria Gestor de Tráfego";
    let channel = data.channel ?? "WhatsApp";
    let difficulty: Difficulty = (data.difficulty ?? "Ouro") as Difficulty;
    let missionId: string | null = data.missionId ?? null;

    if (missionId) {
      const m = await supabase.from("arena_missions").select("*").eq("id", missionId).eq("seller_user_id", userId).maybeSingle();
      if (m.data) {
        const spec: any = m.data.spec ?? {};
        product = spec.produto ?? product;
        channel = spec.canal ?? channel;
        difficulty = (spec.dificuldade as Difficulty) ?? difficulty;
      }
    }

    // Contexto de produto
    const kn = await supabase.from("arena_knowledge").select("content").eq("product", product).limit(3);
    const productContext = (kn.data ?? []).map((k) => k.content).join("\n\n").slice(0, 4000);

    const persona = await aiJson(
      "Você cria personas realistas de clientes brasileiros/portugueses para simulação comercial. Responda JSON, sem markdown.",
      `Gere um CLIENTE VIRTUAL para conversa via WhatsApp. Nunca use nomes genéricos. JSON completo:
{
  "nome": string, "idade": number, "cidade": string, "pais": "Brasil"|"Portugal",
  "profissao": string, "renda": string, "estado_civil": string, "filhos": string,
  "disc": "Dominante"|"Influente"|"Estável"|"Consciente",
  "temperamento": string, "personalidade": string,
  "experiencia_anterior": string, "conhecimento_produto": "baixo"|"médio"|"alto",
  "interesse": "baixo"|"médio"|"alto", "urgencia": "baixa"|"média"|"alta",
  "confianca": "baixa"|"média"|"alta", "humor_inicial": "animado"|"neutro"|"desconfiado"|"irritado"|"ocupado"|"frustrado"|"interessado"|"seguro",
  "dores": string[], "sonhos": string[], "medos": string[], "objecoes_provaveis": string[],
  "forma_comunicacao": string, "velocidade_resposta": "rápida"|"média"|"lenta"|"errática",
  "probabilidade_compra": number,
  "canal_origem": "${channel}",
  "produto_interesse": "${product}",
  "dificuldade": "${difficulty}",
  "abertura": string (primeira mensagem que ELE envia ao vendedor, em português coloquial coerente com humor e canal)
}
${productContext ? `Contexto real do produto (use para dúvidas realistas):\n${productContext}` : ""}
Difficulty guide:
- Bronze: cliente muito receptivo, poucas objeções, quase pronto para comprar.
- Prata: interessado, algumas objeções fracas.
- Ouro: exigente, várias objeções, precisa de bom rapport.
- Diamante: cético, orçamento apertado, comparando concorrentes.
- Elite: especialista, exige argumentos técnicos.
- Lenda: praticamente impossível, testa o vendedor até o limite.`,
      1.05,
    );

    const personaRow = await supabase.from("arena_personas").insert({
      seller_user_id: userId,
      persona,
      difficulty,
      product,
      channel,
    }).select("*").single();

    if (personaRow.error) throw personaRow.error;

    const sim = await supabase.from("arena_simulations").insert({
      seller_user_id: userId,
      persona_id: personaRow.data.id,
      mission_id: missionId,
      status: "open",
      current_emotion: persona?.humor_inicial ?? "neutro",
    }).select("*").single();

    if (sim.error) throw sim.error;

    // Primeira mensagem do cliente
    const abertura = String(persona?.abertura ?? `Oi, vi sobre ${product} e queria entender melhor.`);
    await supabase.from("arena_messages").insert({
      simulation_id: sim.data.id,
      role: "client",
      body: abertura,
      emotion_after: persona?.humor_inicial ?? "neutro",
    });

    return { simulationId: sim.data.id };
  });

// ---------- Obter simulação ----------
export const getSimulationFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const [sim, msgs] = await Promise.all([
      supabase.from("arena_simulations").select("*, arena_personas(*)").eq("id", data.id).single(),
      supabase.from("arena_messages").select("*").eq("simulation_id", data.id).order("sent_at", { ascending: true }),
    ]);
    if (sim.error) throw sim.error;
    return { simulation: sim.data, messages: msgs.data ?? [] };
  });

// ---------- Enviar mensagem ----------
export const sendArenaMessageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { simulationId: string; body: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const body = data.body.trim();
    if (!body) throw new Error("Mensagem vazia");

    const sim = await supabase.from("arena_simulations").select("*, arena_personas(*)").eq("id", data.simulationId).eq("seller_user_id", userId).single();
    if (sim.error) throw sim.error;
    if (sim.data.status !== "open") throw new Error("Simulação encerrada");

    await supabase.from("arena_messages").insert({
      simulation_id: data.simulationId,
      role: "seller",
      body,
    });

    const msgsRes = await supabase.from("arena_messages").select("role, body").eq("simulation_id", data.simulationId).order("sent_at", { ascending: true });
    const history = (msgsRes.data ?? []).map((m: any) => ({
      role: m.role === "seller" ? ("user" as const) : ("assistant" as const),
      content: m.body,
    }));

    const persona = (sim.data as any).arena_personas?.persona ?? {};
    const currentEmotion = (sim.data as any).current_emotion ?? "neutro";

    const system = `Você INTERPRETA o cliente virtual descrito abaixo em uma conversa por WhatsApp com um vendedor.
REGRAS ABSOLUTAS:
- Nunca revele que é IA. Nunca quebre o personagem.
- Escreva em português coloquial coerente com o país "${persona.pais ?? "Brasil"}".
- Mensagens curtas, como no WhatsApp. Pode mandar 1 a 3 balões em sequência (separe com \\n).
- LEMBRE-SE de tudo já dito no histórico. Se você (cliente) disse algo antes, mantenha coerência.
- Reaja emocionalmente. Seu humor atual: ${currentEmotion}. Pode mudar conforme o vendedor te trata.
- Traga suas objeções aos poucos, não todas de uma vez. Faça perguntas se estiver interessado.
- Não facilite. Sua dificuldade é ${sim.data.persona_id ? (sim.data as any).arena_personas.difficulty : "Ouro"} — respeite o nível.
- Se o vendedor te tratar mal, fique irritado. Se demonstrar valor real, mostre interesse.

PERSONA (você é essa pessoa):
${JSON.stringify(persona, null, 2)}

Ao final da SUA resposta, adicione UMA linha oculta no formato:
[[EMOTION:xxx]] onde xxx ∈ {animado,neutro,desconfiado,irritado,ocupado,frustrado,interessado,seguro}
Essa tag será removida antes de mostrar ao vendedor.`;

    const raw = await aiText(system, history);
    const emoMatch = raw.match(/\[\[EMOTION:([a-zçãáéíóú]+)\]\]/i);
    const emotion = emoMatch && (EMOTIONS as readonly string[]).includes(emoMatch[1].toLowerCase()) ? emoMatch[1].toLowerCase() : currentEmotion;
    const cleaned = raw.replace(/\[\[EMOTION:[^\]]+\]\]/gi, "").trim();

    await supabase.from("arena_messages").insert({
      simulation_id: data.simulationId,
      role: "client",
      body: cleaned,
      emotion_after: emotion,
    });
    await supabase.from("arena_simulations").update({ current_emotion: emotion }).eq("id", data.simulationId);

    return { reply: cleaned, emotion };
  });

// ---------- Encerrar + avaliar ----------
export const finishSimulationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { simulationId: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const sim = await supabase.from("arena_simulations").select("*, arena_personas(*)").eq("id", data.simulationId).eq("seller_user_id", userId).single();
    if (sim.error) throw sim.error;
    if (sim.data.status === "finished") {
      return { evaluation: sim.data.evaluation, score: sim.data.score, xp_earned: sim.data.xp_earned };
    }
    const msgs = await supabase.from("arena_messages").select("id, role, body, sent_at").eq("simulation_id", data.simulationId).order("sent_at", { ascending: true });
    const transcript = (msgs.data ?? []).map((m: any, i: number) => `#${i + 1} [${m.role === "seller" ? "VENDEDOR" : "CLIENTE"}] ${m.body}`).join("\n");
    const persona = (sim.data as any).arena_personas?.persona ?? {};

    const evaluation = await aiJson(
      "Você é um coach comercial rigoroso. Responda JSON válido.",
      `Avalie a conversa abaixo entre um VENDEDOR e um CLIENTE virtual (persona: ${persona.nome ?? "—"}, dificuldade ${((sim.data as any).arena_personas?.difficulty) ?? "Ouro"}, produto ${((sim.data as any).arena_personas?.product) ?? "—"}).

TRANSCRIÇÃO:
${transcript}

Devolva JSON:
{
  "score_geral": number (0-100),
  "outcome": "venda"|"agendamento"|"followup"|"perdido",
  "resumo": string,
  "competencias": {
    "rapport": number (0-10), "empatia": number, "escuta_ativa": number, "descoberta": number,
    "objecoes": number, "fechamento": number, "cta": number, "clareza": number, "tempo_resposta": number
  },
  "pontos_fortes": string[] (3),
  "melhorias": string[] (5),
  "replay": [ { "index": number (referente ao #N da transcrição, só mensagens do VENDEDOR), "tag": "positivo"|"alerta"|"erro", "comentario": string } ]
}`,
      0.4,
    );

    const score = Number(evaluation?.score_geral ?? 0);
    const outcome = String(evaluation?.outcome ?? "followup");
    const xpFromScore = Math.round(score * 3);
    const xpFromOutcome = outcome === "venda" ? 120 : outcome === "agendamento" ? 70 : outcome === "followup" ? 20 : 0;
    const xpEarned = xpFromScore + xpFromOutcome;

    // aplica comentários do replay às mensagens do vendedor
    const sellerMsgs = (msgs.data ?? []).filter((m: any) => m.role === "seller");
    const replayArr: any[] = Array.isArray(evaluation?.replay) ? evaluation.replay : [];
    for (const r of replayArr) {
      // #index refere-se a #N da transcrição inteira; encontrar msg correspondente
      const idx = Number(r.index) - 1;
      const target = (msgs.data ?? [])[idx];
      if (target && target.role === "seller") {
        await supabase.from("arena_messages").update({ ai_comment: { tag: r.tag, comentario: r.comentario } }).eq("id", target.id);
      }
    }

    void sellerMsgs;

    await supabase.from("arena_simulations").update({
      status: "finished",
      ended_at: new Date().toISOString(),
      score,
      outcome,
      xp_earned: xpEarned,
      evaluation,
    }).eq("id", data.simulationId);

    if (sim.data.mission_id) {
      await supabase.from("arena_missions").update({ completed_simulation_id: data.simulationId }).eq("id", sim.data.mission_id);
    }

    // progress
    const today = new Date().toISOString().slice(0, 10);
    const prog = await supabase.from("arena_progress").select("*").eq("seller_user_id", userId).maybeSingle();
    if (prog.data) {
      const last = prog.data.last_played_date;
      let streak = prog.data.streak_days ?? 0;
      if (last === today) {
        // mesmo dia, mantém
      } else {
        const y = new Date(); y.setDate(y.getDate() - 1);
        const yStr = y.toISOString().slice(0, 10);
        streak = last === yStr ? streak + 1 : 1;
      }
      const newXp = (prog.data.xp ?? 0) + xpEarned;
      await supabase.from("arena_progress").update({
        xp: newXp,
        league: leagueForXp(newXp),
        streak_days: streak,
        last_played_date: today,
        updated_at: new Date().toISOString(),
      }).eq("seller_user_id", userId);
    } else {
      await supabase.from("arena_progress").insert({
        seller_user_id: userId,
        xp: xpEarned,
        league: leagueForXp(xpEarned),
        streak_days: 1,
        last_played_date: today,
      });
    }

    return { evaluation, score, xp_earned: xpEarned, outcome };
  });
