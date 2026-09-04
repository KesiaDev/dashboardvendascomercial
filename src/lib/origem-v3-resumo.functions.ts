import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Versão LEVE do detalhamento V3, usada pelos cards de meta (mensal/trimestral).
 *
 * Diferença para fetchOrigemV3Fn: não faz auditoria de venda, não varre
 * coach_conversations/coach_messages nem a Hotmart — só leads por tag e
 * vendas do fechamento manual, já agregados por mês. Uma única chamada
 * cobre o trimestre inteiro (antes eram 3 chamadas pesadas).
 */
export type OrigemV3ResumoRow = {
  /** "YYYY-MM" */
  mes: string;
  origem: string;
  leads: number;
  ganhos: number;
};

const normEmail = (e: unknown) =>
  String(e ?? "")
    .trim()
    .toLowerCase();
const chunk = <T>(arr: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

export const fetchOrigemV3ResumoFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from: string; to: string }) => d)
  .handler(async ({ data }): Promise<OrigemV3ResumoRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { tagBucket } = await import("@/lib/origem-v3.server");

    const pageSize = 1000;

    // --- Leads V3 do período (só as colunas necessárias) ---
    const deals: any[] = [];
    for (let page = 0; page < 20; page++) {
      const { data: c, error } = await supabaseAdmin
        .from("clint_deals")
        .select("created_at,contact_tags,contact_email")
        .eq("origin_name", "PIPELINE_COMERCIAL-V3")
        .gte("created_at", data.from)
        .lte("created_at", `${data.to}T23:59:59`)
        .order("created_at", { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (error) throw new Error(error.message);
      deals.push(...(c ?? []));
      if ((c ?? []).length < pageSize) break;
    }

    const acc = new Map<string, OrigemV3ResumoRow>();
    const ensure = (mes: string, origem: string) => {
      const k = `${mes}||${origem}`;
      let r = acc.get(k);
      if (!r) {
        r = { mes, origem, leads: 0, ganhos: 0 };
        acc.set(k, r);
      }
      return r;
    };

    const bucketByEmail = new Map<string, string>();
    for (const d of deals) {
      const hit = tagBucket(d.contact_tags);
      if (!hit) continue;
      const mes = String(d.created_at).slice(0, 7);
      ensure(mes, hit.bucket).leads++;
      const email = normEmail(d.contact_email);
      if (email) bucketByEmail.set(email, hit.bucket);
    }

    // --- Vendas do fechamento manual (1ª parcela) ---
    const { data: salesRows } = await supabaseAdmin
      .from("manual_sales")
      .select("client_email,client_name,sale_date,funnel")
      .eq("installment_number", 1)
      .gte("sale_date", data.from)
      .lte("sale_date", data.to)
      .limit(20000);
    const sales = salesRows ?? [];

    // Tag do negócio V3 do cliente (pode ter entrado em mês anterior)
    const emailsFaltando = Array.from(
      new Set(
        sales
          .map((s: any) => normEmail(s.client_email))
          .filter((e: string) => e && !bucketByEmail.has(e)),
      ),
    );
    for (const part of chunk(emailsFaltando, 100)) {
      const { data: c } = await supabaseAdmin
        .from("clint_deals")
        .select("contact_email,contact_tags,created_at")
        .eq("origin_name", "PIPELINE_COMERCIAL-V3")
        .in("contact_email", part);
      for (const d of (c ?? []) as any[]) {
        const hit = tagBucket(d.contact_tags);
        const e = normEmail(d.contact_email);
        if (hit && e && !bucketByEmail.has(e)) bucketByEmail.set(e, hit.bucket);
      }
    }

    for (const s of sales as any[]) {
      const funilDecl = String(s.funnel ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      const declaradoV3 = /pipeline[\s_-]*comercial[\s_-]*v3/i.test(funilDecl);
      // Todo funil declarado como "Sessão Estratégica" (funil próprio ou legado)
      // entra na linha Sessão Estratégica, igual ao card "Vendas por Funil".
      const declaradoSessao = /sessao\s*estrateg/i.test(funilDecl);
      const bucketDeclarado = /minicurso/i.test(funilDecl)
        ? "Minicurso V3"
        : /e-?book/i.test(funilDecl)
          ? "Ebook V3"
          : declaradoSessao
            ? "Sessão Estratégica"
            : null;
      if (!declaradoV3 && !bucketDeclarado) continue;
      const email = normEmail(s.client_email);
      const linha =
        bucketDeclarado ?? (email ? bucketByEmail.get(email) : undefined) ?? "Sessão Estratégica";
      ensure(String(s.sale_date).slice(0, 7), linha).ganhos++;
    }

    return Array.from(acc.values());
  });
