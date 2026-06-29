import { createServerFn } from "@tanstack/react-start";
import { fetchTeamActivityFn, fetchFollowupActivitiesFn } from "@/lib/data.functions";

export type TeamActivityRow = {
  periodo_inicio: string;
  periodo_fim: string;
  user_name: string;
  ligacoes: number;
  emails: number;
  tarefas: number;
  reunioes_agendadas: number;
  whatsapp: number;
  negocios_trabalhados: number;
};

export type FollowupActivityRow = {
  periodo_inicio: string;
  periodo_fim: string;
  titulo_atividade: string;
  quantidade: number;
};

export async function fetchTeamActivity(): Promise<TeamActivityRow[]> {
  return (await fetchTeamActivityFn()) as TeamActivityRow[];
}

export async function fetchFollowupActivities(): Promise<FollowupActivityRow[]> {
  return (await fetchFollowupActivitiesFn()) as FollowupActivityRow[];
}

type ProdutividadeInput = {
  periodoInicio: string;
  periodoFim: string;
  rows: { userName: string; ligacoes: number; emails: number; tarefas: number; reunioesAgendadas: number; whatsapp: number }[];
};

export const importProdutividade = createServerFn({ method: "POST" })
  .inputValidator((d: ProdutividadeInput) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = data.rows.map((r) => ({
      periodo_inicio: data.periodoInicio,
      periodo_fim: data.periodoFim,
      user_name: r.userName,
      ligacoes: r.ligacoes,
      emails: r.emails,
      tarefas: r.tarefas,
      reunioes_agendadas: r.reunioesAgendadas,
      whatsapp: r.whatsapp,
    }));
    const { error } = await supabaseAdmin
      .from("bi_team_activity")
      .upsert(rows, { onConflict: "periodo_inicio,periodo_fim,user_name" });
    if (error) throw error;
    return { imported: rows.length };
  });

type NegociosTrabalhadosInput = {
  periodoInicio: string;
  periodoFim: string;
  rows: { userName: string; negociosTrabalhados: number }[];
};

export const importNegociosTrabalhados = createServerFn({ method: "POST" })
  .inputValidator((d: NegociosTrabalhadosInput) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = data.rows.map((r) => ({
      periodo_inicio: data.periodoInicio,
      periodo_fim: data.periodoFim,
      user_name: r.userName,
      negocios_trabalhados: r.negociosTrabalhados,
    }));
    const { error } = await supabaseAdmin
      .from("bi_team_activity")
      .upsert(rows, { onConflict: "periodo_inicio,periodo_fim,user_name" });
    if (error) throw error;
    return { imported: rows.length };
  });

type FollowupInput = {
  periodoInicio: string;
  periodoFim: string;
  rows: { titulo: string; quantidade: number }[];
};

export const importFollowup = createServerFn({ method: "POST" })
  .inputValidator((d: FollowupInput) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = data.rows.map((r) => ({
      periodo_inicio: data.periodoInicio,
      periodo_fim: data.periodoFim,
      titulo_atividade: r.titulo,
      quantidade: r.quantidade,
    }));
    const { error } = await supabaseAdmin
      .from("bi_followup_activities")
      .upsert(rows, { onConflict: "periodo_inicio,periodo_fim,titulo_atividade" });
    if (error) throw error;
    return { imported: rows.length };
  });
