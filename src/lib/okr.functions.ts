import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isAdminEmail } from "@/lib/auth";

export type OkrMetric = "vendas_fe" | "vendas_ht" | "vendas_mas" | "renovacoes" | "faturamento" | null;

export type OkrInitiative = {
  id: string;
  key_result_id: string;
  titulo: string;
  responsavel: string | null;
  status: string;
  prazo: string | null;
  ordem: number;
};

export type OkrKeyResult = {
  id: string;
  objective_id: string;
  titulo: string;
  meta: number | null;
  unidade: string | null;
  metrica: OkrMetric;
  progresso_manual: number | null;
  ordem: number;
  realizado: number | null;
  iniciativas: OkrInitiative[];
};

export type OkrObjective = {
  id: string;
  titulo: string;
  lider: string | null;
  equipes: string | null;
  ano: number;
  trimestre: number;
  ordem: number;
  keyResults: OkrKeyResult[];
  kpis: { fe: number; ht: number; mas: number; renov: number; faturamento: number };
};

const CAT_FE = ["GESTOR_TRAFEGO", "REDES_SOCIAIS"];
const CAT_HT = ["ACCELERATOR"];
const CAT_MAS = ["MASTER_SCALE"];
const CAT_RENOV = ["RENOVACAO"];

function quarterRange(ano: number, trimestre: number) {
  const startMonth = (trimestre - 1) * 3 + 1;
  const start = `${ano}-${String(startMonth).padStart(2, "0")}-01`;
  const endMonth = startMonth + 3;
  const endYear = endMonth > 12 ? ano + 1 : ano;
  const em = endMonth > 12 ? endMonth - 12 : endMonth;
  const endExclusive = `${endYear}-${String(em).padStart(2, "0")}-01`;
  return { start, endExclusive };
}

async function assertAdmin(context: any) {
  const email = (context?.claims?.email ?? "").toString().trim().toLowerCase();
  if (isAdminEmail(email)) return;
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Forbidden");
}

export const getOkrsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ano?: number; trimestre?: number } | undefined) => input ?? {})
  .handler(async ({ data }): Promise<OkrObjective[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin.from("bi_okr_objectives").select("*").order("ordem");
    if (data.ano) q = q.eq("ano", data.ano);
    if (data.trimestre) q = q.eq("trimestre", data.trimestre);
    const { data: objectives, error } = await q;
    if (error) throw new Error(error.message);
    const objs = objectives ?? [];
    if (objs.length === 0) return [];

    const ids = objs.map((o: any) => o.id);
    const { data: krs } = await supabaseAdmin
      .from("bi_okr_key_results")
      .select("*")
      .in("objective_id", ids)
      .order("ordem");
    const krList = krs ?? [];
    const krIds = krList.map((k: any) => k.id);
    const { data: inits } = krIds.length
      ? await supabaseAdmin
          .from("bi_okr_initiatives")
          .select("*")
          .in("key_result_id", krIds)
          .order("ordem")
      : { data: [] as any[] };

    const result: OkrObjective[] = [];
    for (const o of objs as any[]) {
      const { start, endExclusive } = quarterRange(o.ano, o.trimestre);
      const { data: sales } = await supabaseAdmin
        .from("manual_sales")
        .select("categoria_produto,valor_total,installment_number,sale_date")
        .gte("sale_date", start)
        .lt("sale_date", endExclusive)
        .eq("installment_number", 1)
        .limit(20000);

      const kpis = { fe: 0, ht: 0, mas: 0, renov: 0, faturamento: 0 };
      for (const s of (sales ?? []) as any[]) {
        const cat = s.categoria_produto as string | null;
        kpis.faturamento += Number(s.valor_total ?? 0);
        if (!cat) continue;
        if (CAT_FE.includes(cat)) kpis.fe += 1;
        else if (CAT_HT.includes(cat)) kpis.ht += 1;
        else if (CAT_MAS.includes(cat)) kpis.mas += 1;
        else if (CAT_RENOV.includes(cat)) kpis.renov += 1;
      }

      const keyResults: OkrKeyResult[] = (krList as any[])
        .filter((k) => k.objective_id === o.id)
        .map((k) => {
          let realizado: number | null = k.progresso_manual != null ? Number(k.progresso_manual) : null;
          switch (k.metrica as OkrMetric) {
            case "vendas_fe":
              realizado = kpis.fe;
              break;
            case "vendas_ht":
              realizado = kpis.ht;
              break;
            case "vendas_mas":
              realizado = kpis.mas;
              break;
            case "renovacoes":
              realizado = kpis.renov;
              break;
            case "faturamento":
              realizado = kpis.faturamento;
              break;
            default:
              break;
          }
          return {
            id: k.id,
            objective_id: k.objective_id,
            titulo: k.titulo,
            meta: k.meta != null ? Number(k.meta) : null,
            unidade: k.unidade,
            metrica: (k.metrica ?? null) as OkrMetric,
            progresso_manual: k.progresso_manual != null ? Number(k.progresso_manual) : null,
            ordem: k.ordem,
            realizado,
            iniciativas: ((inits ?? []) as any[])
              .filter((i) => i.key_result_id === k.id)
              .map((i) => ({
                id: i.id,
                key_result_id: i.key_result_id,
                titulo: i.titulo,
                responsavel: i.responsavel,
                status: i.status,
                prazo: i.prazo,
                ordem: i.ordem,
              })),
          };
        });

      result.push({
        id: o.id,
        titulo: o.titulo,
        lider: o.lider,
        equipes: o.equipes,
        ano: o.ano,
        trimestre: o.trimestre,
        ordem: o.ordem,
        keyResults,
        kpis,
      });
    }
    return result;
  });

export const saveObjectiveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id?: string;
      titulo: string;
      lider?: string | null;
      equipes?: string | null;
      ano: number;
      trimestre: number;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      titulo: data.titulo,
      lider: data.lider ?? null,
      equipes: data.equipes ?? null,
      ano: data.ano,
      trimestre: data.trimestre,
    };
    if (data.id) {
      const { error } = await supabaseAdmin.from("bi_okr_objectives").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await supabaseAdmin
      .from("bi_okr_objectives")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row!.id };
  });

export const deleteObjectiveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("bi_okr_objectives").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveKeyResultFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id?: string;
      objective_id: string;
      titulo: string;
      meta?: number | null;
      unidade?: string | null;
      metrica?: OkrMetric;
      progresso_manual?: number | null;
      ordem?: number;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      objective_id: data.objective_id,
      titulo: data.titulo,
      meta: data.meta ?? null,
      unidade: data.unidade ?? null,
      metrica: data.metrica ?? null,
      progresso_manual: data.progresso_manual ?? null,
      ...(data.ordem != null ? { ordem: data.ordem } : {}),
    };
    if (data.id) {
      const { error } = await supabaseAdmin.from("bi_okr_key_results").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { error } = await supabaseAdmin.from("bi_okr_key_results").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteKeyResultFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("bi_okr_key_results").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveInitiativeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id?: string;
      key_result_id: string;
      titulo: string;
      responsavel?: string | null;
      status?: string;
      prazo?: string | null;
      ordem?: number;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      key_result_id: data.key_result_id,
      titulo: data.titulo,
      responsavel: data.responsavel ?? null,
      status: data.status ?? "todo",
      prazo: data.prazo ?? null,
      ...(data.ordem != null ? { ordem: data.ordem } : {}),
    };
    if (data.id) {
      const { error } = await supabaseAdmin.from("bi_okr_initiatives").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { error } = await supabaseAdmin.from("bi_okr_initiatives").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteInitiativeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("bi_okr_initiatives").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
