import { createServerFn } from "@tanstack/react-start";

export type OrigemRow = {
  origem: string;
  leads: number;
  abertos: number;
  perdidos: number;
  ganhos: number;
  valor: number;
  campanhas: { campanha: string; leads: number; ganhos: number }[];
};

/**
 * Detalhamento de origem dos leads do V3 (e funis irmãos da mesma campanha).
 * A Clint não expõe "tags" nos negócios — a origem real vem dos campos UTM
 * gravados no deal (raw.fields: utm_campaign / pagina_origem / utm_content)
 * combinados com o funil de entrada (MINICURSO-V3, EBOOK-V3, etc).
 */
export const fetchOrigemV3Fn = createServerFn({ method: "GET" })
  .inputValidator((d: { from: string; to: string }) => d)
  .handler(async ({ data }): Promise<OrigemRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { V3_ORIGIN_NAMES, classifyOrigemV3 } = await import("@/lib/origem-v3.server");

    const rows: any[] = [];
    const pageSize = 1000;
    for (let page = 0; page < 20; page++) {
      const { data: chunk, error } = await supabaseAdmin
        .from("clint_deals")
        .select("id,origin_name,status,value,created_at,raw")
        .in("origin_name", V3_ORIGIN_NAMES)
        .gte("created_at", data.from)
        .lte("created_at", `${data.to}T23:59:59`)
        .order("created_at", { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (error) throw new Error(error.message);
      rows.push(...(chunk ?? []));
      if ((chunk ?? []).length < pageSize) break;
    }

    const map = new Map<string, OrigemRow & { camp: Map<string, { leads: number; ganhos: number }> }>();
    for (const d of rows) {
      const { origem, campanha } = classifyOrigemV3(d.origin_name, d.raw);
      let r = map.get(origem);
      if (!r) {
        r = { origem, leads: 0, abertos: 0, perdidos: 0, ganhos: 0, valor: 0, campanhas: [], camp: new Map() };
        map.set(origem, r);
      }
      r.leads++;
      if (d.status === "WON") {
        r.ganhos++;
        r.valor += Number(d.value ?? 0);
      } else if (d.status === "LOST") r.perdidos++;
      else r.abertos++;

      let c = r.camp.get(campanha);
      if (!c) {
        c = { leads: 0, ganhos: 0 };
        r.camp.set(campanha, c);
      }
      c.leads++;
      if (d.status === "WON") c.ganhos++;
    }

    return Array.from(map.values())
      .map(({ camp, ...r }) => ({
        ...r,
        campanhas: Array.from(camp.entries())
          .map(([campanha, v]) => ({ campanha, ...v }))
          .sort((a, b) => b.leads - a.leads),
      }))
      .sort((a, b) => b.leads - a.leads);
  });
