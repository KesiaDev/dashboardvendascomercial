import { createServerFn } from "@tanstack/react-start";

export type OrigemRow = {
  origem: string;
  leads: number;
  abertos: number;
  perdidos: number;
  /** Vendas do fechamento manual atribuídas à origem de PRIMEIRO contato do cliente. */
  ganhos: number;
  /** Valor em € das vendas atribuídas. */
  valor: number;
  /** Vendas atribuídas sem conversa registrada com vendedor humano (já contam em "Vendas"). */
  ganhosSemContato: number;
  valorSemContato: number;
  /** Leads que tiveram pelo menos 1 mensagem enviada por um vendedor humano. */
  atendidos: number;
  /** Leads que só tiveram conversa da automação / Agente IA. */
  soIa: number;
  campanhas: { campanha: string; leads: number; ganhos: number; atendidos: number }[];
};

/** Uma linha da auditoria automática: onde o cliente entrou ANTES de comprar. */
export type AuditoriaVendaRow = {
  saleId: string;
  saleDate: string;
  cliente: string;
  email: string | null;
  produto: string;
  vendedor: string;
  valor: number;
  /** Origem classificada do primeiro contato (V3) ou nome do funil de entrada. */
  origem: string;
  /** Funil onde o cliente entrou pela 1ª vez na Clint. */
  funilEntrada: string | null;
  /** Data do primeiro registro do cliente na Clint. */
  primeiroContato: string | null;
  /** Dono do negócio na Clint no primeiro contato. */
  donoClint: string | null;
  tags: string[];
  /** Como o cliente foi encontrado na Clint. */
  match: "email" | "telefone" | "nome" | "sem-match";
  /** Se houve mensagem de vendedor humano com esse cliente. */
  falouComVendedor: boolean;
};

export type OrigemV3Result = { rows: OrigemRow[]; auditoria: AuditoriaVendaRow[] };

const normEmail = (e: unknown) => String(e ?? "").trim().toLowerCase();
const normName = (n: unknown) =>
  String(n ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
const normPhone = (p: unknown) => String(p ?? "").replace(/\D/g, "").slice(-9);

const chunk = <T,>(arr: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/**
 * Detalhamento de origem dos leads do V3 + auditoria automática de vendas.
 *
 * Leads/atendimentos = negócios criados no período nos funis V3 e já delegados
 * a um vendedor. Vendas = fechamento manual do período, atribuído à origem do
 * PRIMEIRO contato do cliente na Clint (o cliente pode ter entrado meses antes),
 * cruzando por e-mail → telefone → nome.
 */
export const fetchOrigemV3Fn = createServerFn({ method: "GET" })
  .inputValidator((d: { from: string; to: string }) => d)
  .handler(async ({ data }): Promise<OrigemV3Result> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { V3_ORIGIN_NAMES, classifyOrigemV3 } = await import("@/lib/origem-v3.server");

    const pageSize = 1000;
    const rows: any[] = [];
    for (let page = 0; page < 20; page++) {
      const { data: c, error } = await supabaseAdmin
        .from("clint_deals")
        .select("id,origin_name,status,value,created_at,contact_email,raw,contact_tags,user_name")
        .in("origin_name", V3_ORIGIN_NAMES)
        // Só entram leads que foram delegados a um vendedor (dono do negócio na Clint).
        .not("user_name", "is", null)
        .gte("created_at", data.from)
        .lte("created_at", `${data.to}T23:59:59`)
        .order("created_at", { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (error) throw new Error(error.message);
      rows.push(...(c ?? []));
      if ((c ?? []).length < pageSize) break;
    }

    // --- Vendas do fechamento manual do período (fonte de verdade de "venda") ---
    const { data: salesRows } = await supabaseAdmin
      .from("manual_sales")
      .select("id,client_name,client_email,value_eur,product,seller_name,sale_date,installment_number")
      .eq("installment_number", 1)
      .gte("sale_date", data.from)
      .lte("sale_date", data.to)
      .order("sale_date", { ascending: true })
      .limit(20000);
    const sales = salesRows ?? [];

    // --- Índice de primeiro contato na Clint (e-mail / telefone / nome) ---
    const saleEmails = Array.from(new Set(sales.map((s: any) => normEmail(s.client_email)).filter(Boolean)));
    const saleNames = Array.from(new Set(sales.map((s: any) => normName(s.client_name)).filter(Boolean)));

    type Touch = {
      origin_name: string | null;
      created_at: string | null;
      raw: any;
      contact_tags: string[] | null;
      user_name: string | null;
    };
    const byEmail = new Map<string, Touch>();
    const byName = new Map<string, Touch>();
    const byPhone = new Map<string, Touch>();
    const keepEarliest = (m: Map<string, Touch>, k: string, t: Touch) => {
      if (!k) return;
      const cur = m.get(k);
      if (!cur || String(t.created_at ?? "") < String(cur.created_at ?? "")) m.set(k, t);
    };

    const ingest = (deals: any[]) => {
      for (const d of deals) {
        const t: Touch = {
          origin_name: d.origin_name,
          created_at: d.created_at,
          raw: d.raw,
          contact_tags: d.contact_tags,
          user_name: d.user_name,
        };
        keepEarliest(byEmail, normEmail(d.contact_email), t);
        keepEarliest(byName, normName(d.contact_name), t);
        keepEarliest(byPhone, normPhone(d.contact_phone), t);
      }
    };

    const dealCols = "origin_name,created_at,raw,contact_tags,user_name,contact_email,contact_name,contact_phone";
    for (const part of chunk(saleEmails, 100)) {
      const { data: c } = await supabaseAdmin.from("clint_deals").select(dealCols).in("contact_email", part);
      ingest(c ?? []);
    }
    for (const part of chunk(saleNames, 100)) {
      const { data: c } = await supabaseAdmin.from("clint_deals").select(dealCols).in("contact_name", part);
      ingest(c ?? []);
    }

    // --- Interação real com vendedor (mensagem enviada por humano) ---
    const convRows: any[] = [];
    for (let page = 0; page < 10; page++) {
      const { data: c } = await supabaseAdmin
        .from("coach_conversations")
        .select("id,contact_email,contact_name,is_ai_conversation")
        .range(page * pageSize, page * pageSize + pageSize - 1);
      convRows.push(...(c ?? []));
      if ((c ?? []).length < pageSize) break;
    }
    const humanConvIds = new Set<string>();
    for (let page = 0; page < 20; page++) {
      const { data: c } = await supabaseAdmin
        .from("coach_messages")
        .select("conversation_id")
        .eq("author", "vendedor")
        .range(page * pageSize, page * pageSize + pageSize - 1);
      for (const m of c ?? []) humanConvIds.add((m as any).conversation_id);
      if ((c ?? []).length < pageSize) break;
    }
    const humanEmails = new Set<string>();
    const humanNames = new Set<string>();
    const anyConvEmails = new Set<string>();
    for (const c of convRows) {
      const e = normEmail(c.contact_email);
      const human = !c.is_ai_conversation && humanConvIds.has(c.id);
      if (e) {
        anyConvEmails.add(e);
        if (human) humanEmails.add(e);
      }
      if (human) humanNames.add(normName(c.contact_name));
    }

    // --- Agregação de leads por origem ---
    type Acc = OrigemRow & { camp: Map<string, { leads: number; ganhos: number; atendidos: number }> };
    const map = new Map<string, Acc>();
    const ensure = (origem: string): Acc => {
      let r = map.get(origem);
      if (!r) {
        r = {
          origem,
          leads: 0,
          abertos: 0,
          perdidos: 0,
          ganhos: 0,
          valor: 0,
          ganhosSemContato: 0,
          valorSemContato: 0,
          atendidos: 0,
          soIa: 0,
          campanhas: [],
          camp: new Map(),
        };
        map.set(origem, r);
      }
      return r;
    };

    for (const d of rows) {
      const { origem, campanha } = classifyOrigemV3(d.origin_name, d.raw, d.contact_tags);
      const r = ensure(origem);
      r.leads++;
      if (d.status === "LOST") r.perdidos++;
      else r.abertos++;

      const email = normEmail(d.contact_email);
      const atendido = email ? humanEmails.has(email) : false;
      if (atendido) r.atendidos++;
      else if (email && anyConvEmails.has(email)) r.soIa++;

      let c = r.camp.get(campanha);
      if (!c) {
        c = { leads: 0, ganhos: 0, atendidos: 0 };
        r.camp.set(campanha, c);
      }
      c.leads++;
      if (atendido) c.atendidos++;
    }

    // --- Auditoria: para cada venda, onde o cliente entrou primeiro ---
    const auditoria: AuditoriaVendaRow[] = [];
    for (const s of sales as any[]) {
      const email = normEmail(s.client_email);
      const nome = normName(s.client_name);
      let touch = email ? byEmail.get(email) : undefined;
      let match: AuditoriaVendaRow["match"] = touch ? "email" : "sem-match";
      if (!touch && nome) {
        touch = byName.get(nome);
        if (touch) match = "nome";
      }

      const origemLabel = touch
        ? V3_ORIGIN_NAMES.includes(touch.origin_name ?? "")
          ? classifyOrigemV3(touch.origin_name, touch.raw, touch.contact_tags).origem
          : (touch.origin_name ?? "Sem origem (entrada manual)")
        : "Sem origem (entrada manual)";
      const falou = (email && humanEmails.has(email)) || (nome && humanNames.has(nome)) || false;

      auditoria.push({
        saleId: String(s.id),
        saleDate: String(s.sale_date),
        cliente: String(s.client_name ?? "—"),
        email: s.client_email ?? null,
        produto: String(s.product ?? "—"),
        vendedor: String(s.seller_name ?? "—"),
        valor: Number(s.value_eur ?? 0),
        origem: origemLabel,
        funilEntrada: touch?.origin_name ?? null,
        primeiroContato: touch?.created_at ?? null,
        donoClint: touch?.user_name ?? null,
        tags: touch?.contact_tags ?? [],
        match,
        falouComVendedor: Boolean(falou),
      });

      // Só entram na tabela de origens as vendas cujo 1º contato é um funil V3.
      if (touch && V3_ORIGIN_NAMES.includes(touch.origin_name ?? "")) {
        const r = ensure(origemLabel);
        r.ganhos++;
        r.valor += Number(s.value_eur ?? 0);
        if (!falou) {
          r.ganhosSemContato++;
          r.valorSemContato += Number(s.value_eur ?? 0);
        }
        const tag = classifyOrigemV3(touch.origin_name, touch.raw, touch.contact_tags).campanha;
        const c = r.camp.get(tag) ?? { leads: 0, ganhos: 0, atendidos: 0 };
        c.ganhos++;
        r.camp.set(tag, c);
      }
    }

    const result = Array.from(map.values())
      .map(({ camp, ...r }) => ({
        ...r,
        campanhas: Array.from(camp.entries())
          .map(([campanha, v]) => ({ campanha, ...v }))
          .sort((a, b) => b.leads - a.leads),
      }))
      .sort((a, b) => b.leads - a.leads);

    return {
      rows: result,
      auditoria: auditoria.sort((a, b) => (a.saleDate < b.saleDate ? 1 : -1)),
    };
  });
