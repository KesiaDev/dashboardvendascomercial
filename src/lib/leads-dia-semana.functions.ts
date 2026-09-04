import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAllRows } from "@/lib/supabase-paging";

export type DowStat = {
  dow: number; // 1=Seg .. 7=Dom
  label: string;
  leads: number;
  dias: number;
  media: number;
  share: number;
  porBucket: Record<string, number>;
  /** leads que responderam/foram trabalhados pelo vendedor */
  atendidos: number;
  /** atendidos / leads */
  taxaAtendimento: number;
};

export type LeadsDiaSemanaResult = {
  from: string;
  to: string;
  total: number;
  /** total de leads que levantaram a mão (viraram responsabilidade do vendedor) */
  totalAtendidos: number;
  /** distribuição dos leads por estágio da Clint */
  porEstagio: { estagio: string; leads: number; atendido: boolean }[];
  dows: DowStat[];
  melhor: { label: string; media: number } | null;
  pior: { label: string; media: number } | null;
  desvio: number;
  /** Série semanal: cada semana × dia da semana (para detectar discrepâncias) */
  semanas: { semana: string; valores: number[]; total: number }[];
  /** Dias com volume atípico (fora de média ± 2σ do próprio dia da semana) */
  outliers: { data: string; dow: string; leads: number; mediaDow: number; desvio: number }[];
  porHora: { hora: number; leads: number }[];
  buckets: string[];
};

const DOW_LABELS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

/** Data/hora em Lisboa (Europe/Lisbon, com horário de verão). */
const LISBON_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Lisbon",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  weekday: "short",
});
const DOW_MAP: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

function lisbonParts(iso: string) {
  const p = LISBON_FMT.formatToParts(new Date(iso));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return {
    dow: DOW_MAP[g("weekday")] ?? 1,
    date: `${g("year")}-${g("month")}-${g("day")}`,
    hour: Number(g("hour")) % 24,
  };
}

/** Segunda-feira da semana daquela data (yyyy-mm-dd). */
function mondayOf(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}


export const fetchLeadsDiaSemanaFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from: string; to: string }) => d)
  .handler(async ({ data }): Promise<LeadsDiaSemanaResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { leadBucket, LEADS_ORIGINS } = await import("@/lib/leads-comercial.server");

    // Só os funis comerciais interessam (leadBucket descarta o resto de qualquer
    // forma). Filtrar no banco tira ~23k linhas da leitura e usa o índice
    // (origin_name, created_at) — antes a query estourava o statement timeout.
    const f = <Q>(q: Q) =>
      (q as any)
        .in("origin_name", LEADS_ORIGINS)
        .gte("created_at", `${data.from}T00:00:00Z`)
        .lte("created_at", `${data.to}T23:59:59Z`);
    const rows = await fetchAllRows<{
      created_at: string;
      origin_name: string | null;
      contact_tags: string[] | null;
    }>(
      ({ from, to }) =>
        f(supabaseAdmin.from("clint_deals").select("created_at,origin_name,contact_tags"))
          .order("created_at", { ascending: true })
          .range(from, to),
      () => f(supabaseAdmin.from("clint_deals").select("*", { count: "exact", head: true })),
    );


    const dias = new Map<string, { dow: number; leads: number }>();
    const porDow = new Map<number, { leads: number; porBucket: Record<string, number> }>();
    const porHora = new Array(24).fill(0);
    const semanas = new Map<string, number[]>();
    const bucketSet = new Set<string>();

    for (const r of rows) {
      const cls = leadBucket(r.origin_name, r.contact_tags ?? null);
      if (!cls) continue;
      bucketSet.add(cls.bucket);
      const { dow, date, hour } = spParts(r.created_at);

      const d = dias.get(date) ?? { dow, leads: 0 };
      d.leads++;
      dias.set(date, d);

      const dd = porDow.get(dow) ?? { leads: 0, porBucket: {} };
      dd.leads++;
      dd.porBucket[cls.bucket] = (dd.porBucket[cls.bucket] ?? 0) + 1;
      porDow.set(dow, dd);

      porHora[hour]++;

      const wk = mondayOf(date);
      const arr = semanas.get(wk) ?? new Array(7).fill(0);
      arr[dow - 1]++;
      semanas.set(wk, arr);
    }

    // quantos dias de calendário de cada dia da semana existem no período
    const diasPorDow = new Array(8).fill(0);
    const cur = new Date(`${data.from}T00:00:00Z`);
    const end = new Date(`${data.to}T00:00:00Z`);
    while (cur <= end) {
      const dow = ((cur.getUTCDay() + 6) % 7) + 1;
      diasPorDow[dow]++;
      cur.setUTCDate(cur.getUTCDate() + 1);
    }

    const total = Array.from(porDow.values()).reduce((s, v) => s + v.leads, 0);
    const dows: DowStat[] = DOW_LABELS.map((label, i) => {
      const dow = i + 1;
      const v = porDow.get(dow) ?? { leads: 0, porBucket: {} };
      const nd = diasPorDow[dow] || 1;
      return {
        dow,
        label,
        leads: v.leads,
        dias: diasPorDow[dow],
        media: v.leads / nd,
        share: total ? (v.leads / total) * 100 : 0,
        porBucket: v.porBucket,
      };
    });

    const uteis = dows.filter((d) => d.dias > 0);
    const melhor = uteis.length ? uteis.reduce((a, b) => (b.media > a.media ? b : a)) : null;
    const pior = uteis.length ? uteis.reduce((a, b) => (b.media < a.media ? b : a)) : null;
    const medias = uteis.map((d) => d.media);
    const mediaGeral = medias.reduce((a, b) => a + b, 0) / (medias.length || 1);
    const desvio = Math.sqrt(
      medias.reduce((s, m) => s + (m - mediaGeral) ** 2, 0) / (medias.length || 1),
    );

    // outliers por dia
    const statsDow = new Map<number, { mean: number; sd: number }>();
    for (let dow = 1; dow <= 7; dow++) {
      const vals = Array.from(dias.entries())
        .filter(([, v]) => v.dow === dow)
        .map(([, v]) => v.leads);
      if (!vals.length) continue;
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
      statsDow.set(dow, { mean, sd });
    }
    const outliers = Array.from(dias.entries())
      .map(([date, v]) => {
        const st = statsDow.get(v.dow)!;
        const z = st.sd > 0 ? (v.leads - st.mean) / st.sd : 0;
        return {
          data: date,
          dow: DOW_LABELS[v.dow - 1],
          leads: v.leads,
          mediaDow: st.mean,
          desvio: z,
        };
      })
      .filter((o) => Math.abs(o.desvio) >= 2)
      .sort((a, b) => Math.abs(b.desvio) - Math.abs(a.desvio))
      .slice(0, 12);

    return {
      from: data.from,
      to: data.to,
      total,
      dows,
      melhor: melhor ? { label: melhor.label, media: melhor.media } : null,
      pior: pior ? { label: pior.label, media: pior.media } : null,
      desvio,
      semanas: Array.from(semanas.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([semana, valores]) => ({
          semana,
          valores,
          total: valores.reduce((a, b) => a + b, 0),
        })),
      outliers,
      porHora: porHora.map((leads, hora) => ({ hora, leads })),
      buckets: Array.from(bucketSet).sort(),
    };
  });
