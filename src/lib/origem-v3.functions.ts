import { createServerFn } from "@tanstack/react-start";

export type OrigemRow = {
  origem: string;
  leads: number;
  abertos: number;
  perdidos: number;
  /** Vendas do fechamento manual dos vendedores, cruzadas por e-mail do lead. */
  ganhos: number;
  /** Valor em € das vendas do fechamento manual. */
  valor: number;
  /** Leads que tiveram pelo menos 1 mensagem enviada por um vendedor humano. */
  atendidos: number;
  /** Leads que só tiveram conversa da automação / Agente IA. */
  soIa: number;
  campanhas: { campanha: string; leads: number; ganhos: number; atendidos: number }[];
};

const normEmail = (e: unknown) => String(e ?? "").trim().toLowerCase();

/**
 * Detalhamento de origem dos leads do V3 (e funis irmãos da mesma campanha).
 * A Clint não expõe "tags" nos negócios — a origem real vem dos campos UTM
 * gravados no deal (raw.fields: utm_campaign / pagina_origem / utm_content)
 * combinados com o funil de entrada (MINICURSO-V3, EBOOK-V3, etc).
 *
 * Ganhos = vendas do fechamento manual (manual_sales, 1ª parcela) cruzadas
 * pelo e-mail do cliente — nunca o WON da Clint.
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
        .select("id,origin_name,status,value,created_at,contact_email,raw")
        .in("origin_name", V3_ORIGIN_NAMES)
        .gte("created_at", data.from)
        .lte("created_at", `${data.to}T23:59:59`)
        .order("created_at", { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (error) throw new Error(error.message);
      rows.push(...(chunk ?? []));
      if ((chunk ?? []).length < pageSize) break;
    }

    // --- Vendas do fechamento manual (fonte de verdade de "ganho") ---
    const { data: salesRows } = await supabaseAdmin
      .from("manual_sales")
      .select("client_email,value_eur,installment_number")
      .eq("installment_number", 1)
      .not("client_email", "is", null)
      .limit(20000);
    const salesByEmail = new Map<string, { count: number; valor: number }>();
    for (const s of salesRows ?? []) {
      const e = normEmail((s as any).client_email);
      if (!e) continue;
      const cur = salesByEmail.get(e) ?? { count: 0, valor: 0 };
      cur.count++;
      cur.valor += Number((s as any).value_eur ?? 0);
      salesByEmail.set(e, cur);
    }

    // --- Interação real com vendedor (mensagem enviada por humano) ---
    const convRows: any[] = [];
    for (let page = 0; page < 10; page++) {
      const { data: chunk } = await supabaseAdmin
        .from("coach_conversations")
        .select("id,contact_email,is_ai_conversation")
        .range(page * pageSize, page * pageSize + pageSize - 1);
      convRows.push(...(chunk ?? []));
      if ((chunk ?? []).length < pageSize) break;
    }
    const humanConvIds = new Set<string>();
    for (let page = 0; page < 20; page++) {
      const { data: chunk } = await supabaseAdmin
        .from("coach_messages")
        .select("conversation_id")
        .eq("author", "vendedor")
        .range(page * pageSize, page * pageSize + pageSize - 1);
      for (const m of chunk ?? []) humanConvIds.add((m as any).conversation_id);
      if ((chunk ?? []).length < pageSize) break;
    }
    const humanEmails = new Set<string>();
    const anyConvEmails = new Set<string>();
    for (const c of convRows) {
      const e = normEmail(c.contact_email);
      if (!e) continue;
      anyConvEmails.add(e);
      if (!c.is_ai_conversation && humanConvIds.has(c.id)) humanEmails.add(e);
    }

    type Acc = OrigemRow & { camp: Map<string, { leads: number; ganhos: number; atendidos: number }> };
    const map = new Map<string, Acc>();
    for (const d of rows) {
      const { origem, campanha } = classifyOrigemV3(d.origin_name, d.raw);
      let r = map.get(origem);
      if (!r) {
        r = {
          origem,
          leads: 0,
          abertos: 0,
          perdidos: 0,
          ganhos: 0,
          valor: 0,
          atendidos: 0,
          soIa: 0,
          campanhas: [],
          camp: new Map(),
        };
        map.set(origem, r);
      }
      r.leads++;
      if (d.status === "LOST") r.perdidos++;
      else r.abertos++;

      const email = normEmail(d.contact_email);
      const venda = email ? salesByEmail.get(email) : undefined;
      const atendido = email ? humanEmails.has(email) : false;
      if (atendido) r.atendidos++;
      else if (email && anyConvEmails.has(email)) r.soIa++;
      if (venda) {
        r.ganhos += venda.count;
        r.valor += venda.valor;
      }

      let c = r.camp.get(campanha);
      if (!c) {
        c = { leads: 0, ganhos: 0, atendidos: 0 };
        r.camp.set(campanha, c);
      }
      c.leads++;
      if (atendido) c.atendidos++;
      if (venda) c.ganhos += venda.count;
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

