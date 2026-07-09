import { createServerFn } from "@tanstack/react-start";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type FunilDeal = {
  id: string;
  origin_id: string | null;
  origin_name: string | null;
  stage: string | null;
  stage_id: string | null;
  status: string;
  value: number | null;
  created_at: string | null;
  won_at: string | null;
  lost_at: string | null;
  lost_status_id: string | null;
  won_by_name: string | null;
  user_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
};

export type FunilStage = {
  id: string;
  origin_id: string;
  label: string;
  stage_order: number;
  type: string | null;
};

export type FunilOrigin = {
  id: string;
  name: string;
  group_name: string | null;
};

export type FunilLostStatus = {
  id: string;
  label: string | null;
};

const PAGE_SIZE = 1000;

async function fetchAllDeals(supabase: any): Promise<FunilDeal[]> {
  const { count } = await supabase
    .from("clint_deals")
    .select("*", { count: "exact", head: true });
  const total = count ?? 0;
  if (total === 0) return [];
  const pages = Math.ceil(total / PAGE_SIZE);
  const results = await Promise.all(
    Array.from({ length: pages }, (_, i) =>
      supabase
        .from("clint_deals")
        .select("id,origin_id,origin_name,stage,stage_id,status,value,created_at,won_at,lost_at,lost_status_id,won_by_name,user_name,contact_name,contact_email")
        .order("created_at", { ascending: false })
        .range(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1),
    ),
  );
  const all: FunilDeal[] = [];
  for (const { data } of results) all.push(...(data ?? []));
  return all;
}

export const fetchFunisDataFn = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await admin();
  const [deals, originsRes, stagesRes, lostRes] = await Promise.all([
    fetchAllDeals(supabase),
    supabase.from("clint_origins").select("id,name,group_name").order("name"),
    supabase.from("clint_origin_stages").select("id,origin_id,label,stage_order,type").order("stage_order"),
    supabase.from("clint_lost_statuses").select("id,label"),
  ]);
  return {
    deals,
    origins: (originsRes.data ?? []) as FunilOrigin[],
    stages: (stagesRes.data ?? []) as FunilStage[],
    lostStatuses: (lostRes.data ?? []) as FunilLostStatus[],
  };
});
