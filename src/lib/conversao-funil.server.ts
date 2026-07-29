import { canonicalSeller } from "@/lib/commission";

export const PAGE = 1000;

/** Nome canônico do funil, unificando Clint (origin_name) e fechamento (funnel). */
export function canonicalFunnel(raw: string | null | undefined): string {
  const k = (raw ?? "").trim();
  if (!k) return "— sem funil —";
  const u = k.toUpperCase();
  if (/^IGT\s*23/.test(u)) return "IGT 23";
  if (/^IGT\s*22/.test(u)) return "IGT 22";
  if (/^WGT/.test(u)) return "WGT - Perpétuo";
  if (u.includes("PIPELINE_COMERCIAL") || u.includes("COMERCIAL-V3") || u.includes("COMERCIAL V3"))
    return "PIPELINE_COMERCIAL-V3";
  if (/SESS[AÃ]O\s+ESTRAT[EÉ]GICA/.test(u)) return "Sessão Estratégica";
  if (u.includes("MASTER AND SCALE") || u.includes("MAS_")) return "Master and Scale";
  if (u.includes("RENOVA")) return "Renovação";
  if (u.includes("FOLLOW")) return "Follow-up Mentoria";
  if (u.includes("MINICURSO")) return "Minicurso";
  if (u.includes("PALESTRA")) return "Funil de Palestras";
  return k;
}

export function canonicalSellerName(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "— sem vendedor —";
  return canonicalSeller(s) ?? s;
}

export async function pagedDeals(db: any, column: string, from: string, to: string) {
  const rows: any[] = [];
  for (let page = 0; page < 30; page++) {
    const { data, error } = await db
      .from("clint_deals")
      .select("id,origin_name,user_name,status,created_at,lost_at")
      .gte(column, `${from}T00:00:00Z`)
      .lte(column, `${to}T23:59:59Z`)
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

export async function fetchManualSales(db: any, from: string, to: string) {
  const { data, error } = await db
    .from("manual_sales")
    .select("id,funnel,seller_name,value_eur,sale_date,installment_number")
    .gte("sale_date", from)
    .lte("sale_date", to)
    .eq("installment_number", 1)
    .limit(20000);
  if (error) throw new Error(error.message);
  return data ?? [];
}
